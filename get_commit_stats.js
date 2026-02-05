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
 * Valida tipo de data para busca (author-date ou committer-date)
 * author-date: Data em que o commit foi originalmente criado
 * committer-date: Data em que o commit foi aplicado ao branch (merge/rebase)
 */
function validarTipoData(tipoData) {
    const tiposValidos = ['author', 'committer'];
    const valor = tipoData || 'committer'; // Padrão: committer-date
    if (!tiposValidos.includes(valor)) {
        throw new Error(`Tipo de data inválido: "${valor}". Use 'author' ou 'committer'.`);
    }
    return valor;
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
    .option('-t, --tipo-data <tipo>', 'Tipo de data para filtrar: "author" (data de criação do commit) ou "committer" (data de merge/rebase). Padrão: committer', 'committer')
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
const tipoData = validarTipoData(options.tipoData);

/**
 * Constrói query de busca para API do GitHub
 * Usa valores validados e sanitizados
 */
function buildQuery(usuarioValidado, inicio, fim, orgValidada, tipoDataValidado) {
    const dataField = `${tipoDataValidado}-date`;
    let query = `author:${usuarioValidado}+${dataField}:${inicio}..${fim}`;
    if (orgValidada) {
        query += `+org:${orgValidada}`;
    }
    // Ordenar do mais recente para o mais antigo
    query += `+sort:${dataField}-desc`;
    return query;
}

// Constantes de configuração
const API_TIMEOUT = 90000;  // 90 segundos (aumentado para muitos commits)
const MAX_PAGE_SIZE = 100;  // GitHub Search API: max 100 itens por página
const MAX_SEARCH_RESULTS = 1000;  // GitHub Search API: max 1000 resultados totais
const MAX_REPOS_PER_ORG = 1000;  // Limite de segurança para organizações muito grandes
const MAX_COMMITS_PER_PAGE = 100;  // GitHub API: max 100 commits por página

/**
 * Classe para exibir barra de progresso visual
 */
class ProgressBar {
    constructor(total, label = 'Progresso') {
        this.total = total;
        this.current = 0;
        this.label = label;
        this.startTime = Date.now();
        this.width = 40;  // Largura da barra
    }

    update(increment = 1, extraInfo = '') {
        this.current += increment;
        this.render(extraInfo);
    }

    setCurrent(current, extraInfo = '') {
        this.current = current;
        this.render(extraInfo);
    }

    getProgress() {
        return Math.min(100, (this.current / this.total) * 100);
    }

    getElapsed() {
        return (Date.now() - this.startTime) / 1000;  // segundos
    }

    getETA() {
        const elapsed = this.getElapsed();
        if (this.current === 0) return 0;
        const rate = this.current / elapsed;  // itens por segundo
        const remaining = this.total - this.current;
        return remaining / rate;  // segundos restantes
    }

    formatTime(seconds) {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }

    render(extraInfo = '') {
        const progress = this.getProgress();
        const filled = Math.round((progress / 100) * this.width);
        const bar = '='.repeat(filled) + (progress < 100 ? '>' : '') + ' '.repeat(Math.max(0, this.width - filled - (progress < 100 ? 1 : 0)));
        const percentage = progress.toFixed(1).padStart(5);
        const eta = this.formatTime(this.getETA());

        // Limpar linha e imprimir progresso (usa \r para sobrescrever)
        const output = `\r${this.label}: [${bar}] ${percentage}% | ${this.current}/${this.total} | ETA: ${eta}${extraInfo ? ' | ' + extraInfo : ''}`;
        process.stderr.write(output);

        // Nova linha ao completar
        if (this.current >= this.total) {
            process.stderr.write('\n');
        }
    }

    complete(message = '') {
        this.current = this.total;
        const elapsed = this.formatTime(this.getElapsed());
        this.render(`${message || 'Concluído'} | Tempo total: ${elapsed}`);
    }
}

/**
 * Lista todos os repositórios de uma organização
 */
function buscarRepositoriosDaOrganizacao(orgValidada) {
    const repos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && repos.length < MAX_REPOS_PER_ORG) {
        try {
            const cmd = `gh api "orgs/${orgValidada}/repos?per_page=${MAX_PAGE_SIZE}&type=all&page=${page}" --jq ".[].full_name"`;
            const output = execSync(cmd, {
                encoding: 'utf-8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const lines = output.trim().split('\n');
            for (const line of lines) {
                if (line) {
                    const repo = sanitizar(line);
                    if (repo) repos.push(repo);
                }
            }

            hasMore = lines.length === MAX_PAGE_SIZE;
            page++;
        } catch (e) {
            console.error(`Aviso: Erro ao buscar repositórios (página ${page}). Continuando...`);
            hasMore = false;
        }
    }

    return repos;
}

/**
 * Lista branches de um repositório via API do GitHub
 * Prioriza branches principais e busca todas as branches disponíveis
 */
function buscarBranchesDoRepositorio(repo) {
    const branches = [];
    const seenNames = new Set();
    let page = 1;
    let hasMore = true;
    const MAX_BRANCHES = 100;  // Limite de segurança para repositórios muito grandes

    // Padrões de branches principais (para priorização)
    const mainPatterns = [
        'main', 'master',
        'develop', 'development', 'dev',
        'staging', 'stage', 'stg',
        'production', 'prod',
        'release', 'hotfix',
        'test', 'testing', 'qa'
    ];

    try {
        // Primeiro, obter a branch padrão
        const defaultBranchCmd = `gh api "repos/${repo}" --jq ".default_branch"`;
        const defaultBranch = execSync(defaultBranchCmd, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        if (defaultBranch && !seenNames.has(defaultBranch)) {
            branches.push(defaultBranch);
            seenNames.add(defaultBranch);
        }
    } catch (e) {
        // Se falhar ao obter branch padrão, continua sem ela
    }

    // Buscar todas as branches via API
    while (hasMore && branches.length < MAX_BRANCHES) {
        try {
            const cmd = `gh api "repos/${repo}/branches?per_page=${MAX_PAGE_SIZE}&page=${page}" --jq ".[].name"`;
            const output = execSync(cmd, {
                encoding: 'utf-8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const lines = output.trim().split('\n');
            const pageBranches = [];

            // Primeiro, adiciona branches que correspondem aos padrões principais
            for (const line of lines) {
                if (!line) continue;
                const branchName = sanitizar(line);
                if (branchName && !seenNames.has(branchName)) {
                    const lowerName = branchName.toLowerCase();
                    // Verifica se corresponde a algum padrão principal
                    const isMainBranch = mainPatterns.some(pattern => lowerName === pattern || lowerName.startsWith(pattern + '-') || lowerName.endsWith('-' + pattern));
                    if (isMainBranch) {
                        pageBranches.push(branchName);
                        seenNames.add(branchName);
                    }
                }
            }

            // Depois, adiciona as demais branches da página
            for (const line of lines) {
                if (!line) continue;
                const branchName = sanitizar(line);
                if (branchName && !seenNames.has(branchName)) {
                    pageBranches.push(branchName);
                    seenNames.add(branchName);
                }
            }

            // Adiciona as branches desta página à lista principal
            branches.push(...pageBranches);

            hasMore = lines.length === MAX_PAGE_SIZE;
            page++;
        } catch (e) {
            console.error(`Aviso: Erro ao buscar branches (página ${page}) de ${repo}. Continuando...`);
            hasMore = false;
        }
    }

    return branches;
}

/**
 * Busca commits de um usuário em um repositório específico
 */
function buscarCommitsNoRepositorio(repo, usuario, inicio, fim, tipoData) {
    const commits = [];

    // Buscar branches do repositório
    const branches = buscarBranchesDoRepositorio(repo);
    const seenShas = new Set();  // Deduplicar commits por SHA

    for (const branch of branches) {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {  // Limite de páginas por branch
            try {
                // Buscar commits na branch específica
                const cmd = `gh api "repos/${repo}/commits?author=${usuario}&sha=${branch}&since=${inicio}T00:00:00Z&until=${fim}T23:59:59Z&per_page=${MAX_COMMITS_PER_PAGE}&page=${page}" --jq ".[]"`;

                const output = execSync(cmd, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                const lines = output.trim().split('\n');

                for (const line of lines) {
                    if (!line) continue;
                    try {
                        const parsed = JSON.parse(line);
                        const sha = sanitizar(parsed.sha);
                        const dateField = tipoData === 'author' ? parsed.commit.author.date : parsed.commit.commitmitter.date;

                        if (sha && /^[a-f0-9]{40}$/i.test(sha) && dateField && !seenShas.has(sha)) {
                            seenShas.add(sha);
                            commits.push({ repo, sha, date: dateField });
                        }
                    } catch (parseError) {
                        // Ignorar linhas inválidas
                    }
                }

                hasMore = lines.length === MAX_COMMITS_PER_PAGE;
                page++;
            } catch (e) {
                break;  // Sem mais resultados ou erro
            }
        }
    }

    return commits;
}

/**
 * Busca commits de um usuário em todos os repositórios de uma organização
 */
function buscarCommitsPorOrganizacao(usuario, inicio, fim, org, tipoData) {
    console.error(`Listando repositórios da organização ${org}...`);
    const repos = buscarRepositoriosDaOrganizacao(org);
    console.error(`Encontrados ${repos.length} repositório(s).`);

    const allCommits = [];
    const seenShas = new Set();  // Deduplicar por SHA

    // Criar barra de progresso
    const progressBar = new ProgressBar(repos.length, 'Buscando repos');

    for (const repo of repos) {
        const commits = buscarCommitsNoRepositorio(repo, usuario, inicio, fim, tipoData);

        for (const commit of commits) {
            if (!seenShas.has(commit.sha)) {
                seenShas.add(commit.sha);
                allCommits.push(commit);
            }
        }

        // Atualizar progresso com informações extras
        const extraInfo = `${repo} | +${commits.length} commits`;
        progressBar.update(1, extraInfo);
    }

    // Completar progresso
    progressBar.complete(`Total: ${allCommits.length} commits`);

    // Ordenar por data descrescente
    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return allCommits;
}

/**
 * Busca commits via API do GitHub com paginação
 * GitHub Search API limita a 100 resultados por página e 1000 totais
 */
function buscarCommits(usuarioValidado, inicio, fim, orgValidada, tipoDataValidado) {
    // Se há organização, usar estratégia de busca direta em cada repositório
    // (API search não indexa todos os repositórios de uma organização)
    if (orgValidada) {
        return buscarCommitsPorOrganizacao(usuarioValidado, inicio, fim, orgValidada, tipoDataValidado);
    }

    // Caso contrário, usar API de busca (comportamento original)
    try {
        const query = buildQuery(usuarioValidado, inicio, fim, orgValidada, tipoDataValidado);
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

        // Criar barra de progresso (estimado em 10 páginas máximo)
        const maxPages = Math.min(10, Math.ceil(totalCount / MAX_PAGE_SIZE) || 1);
        const progressBar = new ProgressBar(maxPages, 'Buscando páginas');

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

            // Atualizar progresso
            progressBar.update(1, `Página ${page} | +${pageCommits} commits`);

            // Verifica se há mais páginas
            if (pageCommits === 0 || commits.length >= totalCount) {
                hasMore = false;
            }

            page++;
        }

        progressBar.complete(`Total: ${commits.length} commits`);

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
        console.error(`Tipo de data: ${tipoData}-date`);
        if (org) {
            console.error(`Organização: ${org}`);
        }

        // Buscar commits
        const commits = buscarCommits(usuario, dataInicio, dataFim, org, tipoData);

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

        // Criar barra de progresso para processamento
        const progressBar = new ProgressBar(Object.keys(byRepo).length, 'Obtendo stats');

        for (const [repo, shas] of Object.entries(byRepo)) {
            let repoAdditions = 0;
            let repoDeletions = 0;
            const repoCount = shas.length;

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

            // Atualizar progresso
            progressBar.update(1, `${repo}`);
        }

        progressBar.complete();

        // Exibir resultados
        exibirResultados(results, totalCommits, totalAdditions, totalDeletions, usuario, dataInicio, dataFim);

    } catch (error) {
        // Mensagem genérica de erro para não expor informações sensíveis
        console.error(`\nErro: ${error.message}`);
        process.exit(1);
    }
}

main();
