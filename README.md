# Get Commit Stats

CLI em Node.js para buscar e exibir estatísticas de commits do GitHub, incluindo linhas adicionadas e removidas, agrupadas por repositório.

## Funcionalidades

- Busca commits de um usuário do GitHub em um período específico
- Filtra commits por organização (opcional)
- Exibe estatísticas de linhas adicionadas/removidas por repositório
- Mostra totais gerais do período
- Formatação em português brasileiro (pt-BR)

## Pré-requisitos

Antes de começar, você precisa ter instalado:

- **Node.js** (v18 ou superior) - [Download aqui](https://nodejs.org/)
- **GitHub CLI (`gh`)** - [Instruções de instalação](https://cli.github.com/)
- **jq** - Processador de JSON para linha de comando
  - Windows: `choco install jq`
  - Linux/Mac: `sudo apt-get install jq` ou `brew install jq`

### Autenticar no GitHub

Após instalar o GitHub CLI, autentique-se:

```bash
gh auth login
```

Siga as instruções para completar o login.

## Instalação

1. Clone ou baixe este projeto

2. Navegue até o diretório do projeto:

```bash
cd get-commit-stats
```

3. Instale as dependências:

```bash
npm install
```

## Uso

### Sintaxe

```bash
node get_commit_stats.js <usuario> -i <data_inicio> [opcoes]
```

### Argumentos

| Argumento | Descrição | Obrigatório |
|-----------|-----------|-------------|
| `usuario` | Nome do usuário do GitHub | Sim |

### Opções

| Opção | Curta | Descrição | Obrigatório |
|-------|-------|-----------|-------------|
| `--inicio` | `-i` | Data de início (YYYY-MM-DD) | Sim |
| `--fim` | `-f` | Data final (YYYY-MM-DD) | Não |
| `--org` | `-o` | Filtrar por organização | Não |
| `--version` | `-V` | Mostrar versão | Não |
| `--help` | `-h` | Mostrar ajuda | Não |

### Comportamento Padrão

- Se `--fim` não for informado, a **data atual** será usada automaticamente
- As datas devem estar no formato **YYYY-MM-DD** (ISO 8601)

## Exemplos

### Buscar commits com período específico

```bash
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01 --fim 2026-01-31
```

### Buscar do início até hoje (data atual como padrão)

```bash
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01
```

### Buscar filtrando por organização

```bash
node get_commit_stats.js usuario-exemplo --inicio 2026-01-01 --org minha-organizacao
```

### Usar formas abreviadas das opções

```bash
node get_commit_stats.js usuario-exemplo -i 2026-01-01 -o minha-organizacao
```

### Combinar todas as opções

```bash
node get_commit_stats.js usuario-exemplo -i 2026-01-01 -f 2026-03-31 -o minha-organizacao
```

## Formato de Data

As datas devem seguir obrigatoriamente o formato **YYYY-MM-DD**:

- ✅ Válido: `2026-01-15`, `2026-12-31`
- ❌ Inválido: `01/01/2026`, `15-01-2026`, `2026/01/15`

## Exemplo de Output

```
Buscando commits de usuario-exemplo...
Período: 2026-01-01 até 2026-02-04
Organização: minha-organizacao

Processando 45 commits...

Processando minha-organizacao/front-end (15 commits)...
Processando minha-organizacao/back-end (20 commits)...
Processando minha-organizacao/docs (10 commits)...

================================================================================
ESTATÍSTICAS DE COMMITS - usuario-exemplo (2026-01-01 até 2026-02-04)
================================================================================

📊 TOTAL GERAL:
   • Commits: 45
   • Linhas adicionadas: +2.345
   • Linhas removidas: -892
   • Total de linhas alteradas: 3.237

📁 POR REPOSITÓRIO:
--------------------------------------------------------------------------------
Repositório                                          Commits    Adições        Remoções        Total
--------------------------------------------------------------------------------
minha-organizacao/back-end                            20         +1.500          -450            1.950
minha-organizacao/front-end                           15         +800            -400            1.200
minha-organizacao/docs                                10         +45             -42             87
--------------------------------------------------------------------------------
TOTAL                                                45         +2.345          -892            3.237
================================================================================
```

## Solução de Problemas

### Erro: "gh: command not found"

**Solução:** Instale o GitHub CLI em https://cli.github.com/

### Erro: "Formato de data inválido"

**Solução:** Verifique se a data está no formato YYYY-MM-DD (ex: 2026-01-15)

### Erro: "Erro ao buscar commits"

**Possíveis causas:**
- GitHub CLI não está autenticado → Execute `gh auth login`
- Usuário não existe → Verifique o nome do usuário
- Período sem commits → Tente um intervalo de datas diferente

### Nenhum commit encontrado

**Possíveis causas:**
- Não há commits no período especificado
- O usuário não tem commits públicos
- Filtro de organização muito restritivo

### Erro de autenticação do GitHub

```bash
# Faça login novamente
gh auth logout
gh auth login
```

## Desenvolvimento

### Estrutura do Projeto

```
get-commit-stats/
├── package.json           # Dependências do projeto
├── get_commit_stats.js    # Script principal da CLI
├── README.md             # Esta documentação
└── CLAUDE.md             # Documentação para desenvolvedores
```

### Dependências

- **commander** (^12.0.0) - Parser de argumentos CLI

## Licença

ISC

## Autor

Desenvolvido para uso interno corporativo
