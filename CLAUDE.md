# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sobre este Projeto

CLI Node.js para calcular estatísticas de commits do GitHub. Busca commits diretamente via API do GitHub usando a CLI `gh` e exibe métricas de adições/deleções.

## Pré-requisitos

- **Node.js** (v18+)
- **GitHub CLI (`gh`)** - deve estar instalado e autenticado (`gh auth login`)
- **jq** - usado para parsing de JSON na CLI do GitHub

## Comandos

### Instalar dependências
```bash
npm install
```

### Executar o CLI
```bash
node get_commit_stats.js <usuario> -i <data_inicio> [opcoes]
```

**Argumentos:**
- `usuario` (obrigatório): Nome do usuário do GitHub

**Opções:**
- `-i, --inicio <data>` (obrigatório): Data de início no formato YYYY-MM-DD
- `-f, --fim <data>` (opcional): Data final no formato YYYY-MM-DD (padrão: data atual)
- `-o, --org <organizacao>` (opcional): Filtrar busca por organização
- `-V, --version`: Mostrar versão
- `-h, --help`: Mostrar ajuda

### Exemplos de uso

```bash
# Buscar commits com período específico
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01 --fim 2026-01-31

# Buscar até hoje (data atual como padrão)
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01

# Buscar filtrando por organização
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01 --org minha-organizacao

# Usar formas abreviadas
node get_commit_stats.js usuario-exemplo -i 2026-01-01 -o minha-organizacao
```

## Arquitetura

- **`get_commit_stats.js`**: Script CLI principal usando Commander.js
  - `validarFormatoData(dataStr)`: Valida formato YYYY-MM-DD
  - `buildQuery(usuario, inicio, fim, org)`: Constrói query de busca para API
  - `buscarCommits(usuario, inicio, fim, org)`: Busca commits via `gh api search/commits`
  - `getCommitStats(repo, sha)`: Busca estatísticas de um commit específico via `gh api`
  - `exibirResultados(...)`: Imprime relatório formatado com totais
  - `main()`: Orquestra o fluxo: parse args → buscar commits → processar → exibir

## Fluxo de Execução

1. Parse argumentos via Commander.js (valida datas, define padrões)
2. Busca commits via `gh api search/commits` com filtros (usuário, datas, org)
3. Agrupa commits por repositório
4. Para cada commit, chama `gh api` para obter `stats.additions` e `stats.deletions`
5. Agrega totais por repositório e geral
6. Imprime relatório com formatação de tabela (pt-BR)

## Dependências

- **Node.js** (built-in modules: `child_process`)
- **commander** (^12.0.0): Parser de argumentos CLI
- **GitHub CLI (`gh`)**: deve estar instalado e autenticado
- **`jq`**: usado para parsing de JSON na CLI do GitHub

## Notas

- Erros na chamada da API de estatísticas retornam `{ additions: 0, deletions: 0 }` (falha silenciosa por commit)
- Logs de progresso são escritos em `stderr` para não interferir no output (pode redirecionar com `2>/dev/null`)
- Output usa formatação pt-BR (números com separador de milhar)
- Validação de datas usa formato YYYY-MM-DD (ISO 8601)
