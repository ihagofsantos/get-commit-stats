#!/usr/bin/env node

const { Command } = require('commander');
const { execSync } = require('child_process');

const program = new Command();

/**
 * Valida nome de usuário do GitHub
 * Permite apenas: alfanuméricos, hífens e underscores (máx 39 caracteres)
 */
function validarUsuario(usuario) {
    if (!usuario || typeof usuario !== 'string') {
        throw new Error('Nome de usuário é obrigatório');
    }
    // GitHub username: max 39 chars, apenas alfanuméricos, hífens e underscore
    // Não pode começar ou terminar com hífen
    const regex = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,37}[a-zA-Z0-9])?$/;
    if (!regex.test(usuario)) {
        throw new Error(`Nome de usuário inválido: "${usuario}". Use apenas letras, números, _ e - (máx 39 caracteres)`);
    }
    return usuario;
}

/**
 * Valida nome de organização do GitHub
 * Permite apenas: alfanuméricos e hífens (máx 39 caracteres)
 */
function validarOrganizacao(org) {
    if (!org || typeof org !== 'string') {
        return null;
    }
    // GitHub organization name: similar a username
    const regex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
    if (!regex.test(org)) {
        throw new Error(`Nome de organização inválido: "${org}". Use apenas letras, números e - (máx 39 caracteres)`);
    }
    return org;
}

/**
 * Valida formato de data YYYY-MM-DD
 * Retorna a string original validada (não o objeto Date)
 */
function validarFormatoData(dataStr) {
    if (!dataStr || typeof dataStr !== 'string') {
        throw new Error('Data é obrigatória');
    }
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dataStr)) {
        throw new Error(`Formato de data inválido: "${dataStr}". Use YYYY-MM-DD.`);
    }
    const data = new Date(dataStr);
    if (isNaN(data.getTime())) {
        throw new Error(`Data inválida: "${dataStr}"`);
    }
    // Retorna a string original, não o objeto Date
    return dataStr;
}

/**
 * Sanitiza string para uso seguro em comandos shell
 * Escapa caracteres especiais que poderiam ser usados para injeção
 */
function sanitizar(input) {
    if (typeof input !== 'string') {
        return '';
    }
    // Remove caracteres perigosos e mantém apenas alfanuméricos, /, ., -, _, @, :
    // Suficiente para nomes de repo e organizações do GitHub
    return input.replace(/[^a-zA-Z0-9/._@:\-+]/g, '');
}

// Configuração do CLI
program
    .name('commit-stats')
    .description('CLI para buscar estatísticas de commits do GitHub')
    .version('1.0.0')
    .argument('<usuario>', 'Nome do usuário do GitHub')
    .requiredOption('-i, --inicio <data>', 'Data de início (YYYY-MM-DD)')
    .option('-f, --fim <data>', 'Data final (YYYY-MM-DD)')
    .option('-o, --org <organizacao>', 'Filtrar por organização')
    .parse();

const options = program.opts();
const args = program.args;

// Validar e sanitizar entradas
const usuario = validarUsuario(args[0]);
const dataInicio = validarFormatoData(options.inicio);

let dataFim = options.fim;
// Se data final não informada, usar data atual
if (!dataFim) {
    const hoje = new Date();
    dataFim = hoje.toISOString().split('T')[0];
}
dataFim = validarFormatoData(dataFim);

const org = options.org ? validarOrganizacao(options.org) : null;

/**
 * Constrói query de busca para API do GitHub
 * Usa valores validados e sanitizados
 */
function buildQuery(usuarioValidado, inicio, fim, orgValidada) {
    let query = `author:${usuarioValidado}+committer-date:${inicio}..${fim}`;
    if (orgValidada) {
        query += `+org:${orgValidada}`;
    }
    return query;
}

// Constantes de configuração
const API_TIMEOUT = 90000;  // 90 segundos (aumentado para muitos commits)
const MAX_PAGE_SIZE = 100;  // GitHub Search API: max 100 itens por página
const MAX_SEARCH_RESULTS = 1000;  // GitHub Search API: max 1000 resultados totais

/**
 * Busca commits via API do GitHub com paginação
 * GitHub Search API limita a 100 resultados por página e 1000 totais
 */
function buscarCommits(usuarioValidado, inicio, fim, orgValidada) {
    try {
        const query = buildQuery(usuarioValidado, inicio, fim, orgValidada);
        const commits = [];
        let page = 1;
        let hasMore = true;
        let totalCount = 0;

        console.error(`Buscando commits (com paginação)...`);

        // Primeiro, busca o total de resultados sem paginação
        try {
            const countCmd = `gh api "search/commits?q=${query}&per_page=1" --jq ".total_count"`;
            const countOutput = execSync(countCmd, {
                encoding: 'utf-8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            totalCount = parseInt(countOutput.trim(), 10);
            console.error(`Total encontrado: ${totalCount} commits na API do GitHub.`);
        } catch (e) {
            // Se falhar ao buscar o total, continua sem o contador
            console.error(`Aviso: Não foi possível obter o total de commits.`);
        }

        // Busca com paginação
        while (hasMore && page <= 10) {  // Max 10 páginas = 1000 resultados (limite da API)
            const cmd = `gh api "search/commits?q=${query}&per_page=${MAX_PAGE_SIZE}&page=${page}" --jq ".items | map({repo: .repository.full_name, sha: .sha}) | .[]"`;

            const output = execSync(cmd, {
                encoding: 'utf-8',
                timeout: API_TIMEOUT,
                stdio: ['pipe', 'pipe', 'pipe'],
                maxBuffer: 10 * 1024 * 1024  // 10MB max buffer
            });

            const lines = output.trim().split('\n');

            // Processa os commits desta página
            let pageCommits = 0;
            for (const line of lines) {
                if (!line || line.length === 0) continue;
                try {
                    const parsed = JSON.parse(line);
                    // Sanitizar repo e sha antes de usar
                    const repo = sanitizar(parsed.repo);
                    const sha = sanitizar(parsed.sha);
                    // Validar formato do SHA (40 caracteres hexadecimais para commits completos)
                    if (repo && sha && /^[a-f0-9]{40}$/i.test(sha)) {
                        commits.push({ repo, sha });
                        pageCommits++;
                    }
                } catch (e) {
                    // Ignorar linhas inválidas silenciosamente
                }
            }

            console.error(`Página ${page}: ${pageCommits} commits recebidos.`);

            // Verifica se há mais páginas
            if (pageCommits === 0 || commits.length >= totalCount) {
                hasMore = false;
            }

            page++;
        }

        console.error(`Total de commits recuperados: ${commits.length}`);

        // Aviso sobre limite da API
        if (commits.length >= MAX_SEARCH_RESULTS) {
            console.error(`Aviso: A API de busca do GitHub limita a ${MAX_SEARCH_RESULTS} resultados.`);
            console.error(`Aviso: Para períodos maiores, considere dividir a busca em intervalos menores.`);
        }

        return commits;
    } catch (e) {
        // Mensagem genérica para não expor detalhes internos
        console.error('Erro ao buscar commits. Verifique sua conexão e autenticação do GitHub CLI.');
        return [];
    }
}

/**
 * Obtém estatísticas de um commit específico
 */
function getCommitStats(repo, sha) {
    try {
        // Repo e sha já estão sanitizados
        const cmd = `gh api "repos/${repo}/commits/${sha}" --jq "{additions: .stats.additions, deletions: .stats.deletions}"`;

        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const parsed = JSON.parse(output);
        // Validar que os valores são números
        return {
            additions: typeof parsed.additions === 'number' ? parsed.additions : 0,
            deletions: typeof parsed.deletions === 'number' ? parsed.deletions : 0
        };
    } catch (e) {
        // Falha silenciosa para commits individuais
        return { additions: 0, deletions: 0 };
    }
}

/**
 * Exibe resultados formatados
 */
function exibirResultados(results, totalCommits, totalAdditions, totalDeletions, usuario, inicio, fim) {
    console.log('\n' + '='.repeat(80));
    console.log(`ESTATÍSTICAS DE COMMITS - ${sanitizar(usuario)} (${inicio} até ${fim})`);
    console.log('='.repeat(80));
    console.log(`\n📊 TOTAL GERAL:`);
    console.log(`   • Commits: ${totalCommits}`);
    console.log(`   • Linhas adicionadas: +${totalAdditions.toLocaleString('pt-BR')}`);
    console.log(`   • Linhas removidas: -${totalDeletions.toLocaleString('pt-BR')}`);
    console.log(`   • Total de linhas alteradas: ${(totalAdditions + totalDeletions).toLocaleString('pt-BR')}`);

    if (Object.keys(results).length > 0) {
        console.log(`\n📁 POR REPOSITÓRIO:`);
        console.log('-'.repeat(80));
        console.log(`${'Repositório'.padEnd(50)} ${'Commits'.padEnd(10)} ${'Adições'.padEnd(15)} ${'Remoções'.padEnd(15)} ${'Total'.padEnd(15)}`);
        console.log('-'.repeat(80));

        const sortedRepos = Object.entries(results).sort((a, b) => b[1].total - a[1].total);
        for (const [repo, stats] of sortedRepos) {
            console.log(`${sanitizar(repo).padEnd(50)} ${stats.commits.toString().padEnd(10)} +${stats.additions.toLocaleString('pt-BR').padEnd(14)} -${stats.deletions.toLocaleString('pt-BR').padEnd(14)} ${stats.total.toLocaleString('pt-BR').padEnd(15)}`);
        }

        console.log('-'.repeat(80));
        console.log(`${'TOTAL'.padEnd(50)} ${totalCommits.toString().padEnd(10)} +${totalAdditions.toLocaleString('pt-BR').padEnd(14)} -${totalDeletions.toLocaleString('pt-BR').padEnd(14)} ${(totalAdditions + totalDeletions).toLocaleString('pt-BR').padEnd(15)}`);
    }
    console.log('='.repeat(80));
}

/**
 * Função principal
 */
function main() {
    try {
        console.error(`Buscando commits de ${usuario}...`);
        console.error(`Período: ${dataInicio} até ${dataFim}`);
        if (org) {
            console.error(`Organização: ${org}`);
        }

        // Buscar commits
        const commits = buscarCommits(usuario, dataInicio, dataFim, org);

        if (commits.length === 0) {
            console.log('\nNenhum commit encontrado para o período especificado.');
            return;
        }

        console.error(`\nProcessando ${commits.length} commits...\n`);

        // Agrupar por repositório
        const byRepo = {};
        for (const c of commits) {
            if (!byRepo[c.repo]) {
                byRepo[c.repo] = [];
            }
            byRepo[c.repo].push(c.sha);
        }

        let totalAdditions = 0;
        let totalDeletions = 0;
        let totalCommits = 0;
        const results = {};

        for (const [repo, shas] of Object.entries(byRepo)) {
            let repoAdditions = 0;
            let repoDeletions = 0;
            const repoCount = shas.length;

            console.error(`Processando ${repo} (${repoCount} commits)...`);

            for (const sha of shas) {
                const stats = getCommitStats(repo, sha);
                repoAdditions += stats.additions;
                repoDeletions += stats.deletions;
                totalCommits++;
            }

            results[repo] = {
                commits: repoCount,
                additions: repoAdditions,
                deletions: repoDeletions,
                total: repoAdditions + repoDeletions
            };
            totalAdditions += repoAdditions;
            totalDeletions += repoDeletions;
        }

        // Exibir resultados
        exibirResultados(results, totalCommits, totalAdditions, totalDeletions, usuario, dataInicio, dataFim);

    } catch (error) {
        // Mensagem genérica de erro para não expor informações sensíveis
        console.error(`\nErro: ${error.message}`);
        process.exit(1);
    }
}

main();
