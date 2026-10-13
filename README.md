# 🏢 AIOffice (Beta)

> **Virtual AI Software Studio & Office** — Um escritório virtual inteligente local-first que une governança, execução de ferramentas de alta performance, playbook de engenharia reversa e interface visual em pixel art.

---

## 🎯 Visão Geral

O **AIOffice** é um monorepo 100% autossuficiente e independente que consolida cinco grandes iniciativas do ecossistema open-source:

1. **Habblaud (Visual Office)**: Interface web em pixel art retro (`http://localhost:4747`) com salas por projeto, baias por especialidade, elevador animado de subagentes e aprovação 1-click.
2. **OpenOrq (Security & Mediation Core)**: Interceptação canônica de escritas e diffs (`policy-broker`), allowlist RPC B1 para subprocessos (`rpc-proxy`) e cofre de credenciais local BYOK (`credential-store`).
3. **Orquestrador-Maestro**: Governança explicável, roteamento de intenções, limites de orçamento e rastreabilidade durável com contratos de handoff em `DEV/`.
4. **oh-my-pi (Runtime Engine)**: Harness de ferramentas ultra-otimizado com edições hashline seguras (`PUT`/`CUT`), suporte a AST/LSP e subagentes isolados em worktrees via ferramenta `task`.
5. **replica-skill (Playbook de Produto)**: Suíte de 11 skills especializadas para engenharia reversa, clonagem e reconstrução de produtos digitais resolvendo as dores reais dos usuários.

---

## 🤝 Créditos e Projetos Base (Upstreams)

O AIOffice é construído com base e respeito ao trabalho dos seguintes projetos de código aberto:

| Projeto | Autor / Comunidade | Licença | O que fornece ao AIOffice |
|---|---|---|---|
| [**Habblaud**](https://github.com/marmottajr/habblaud) | [Márcio Junior](https://github.com/marmottajr) | **MIT** | Toda a interface visual do escritório pixel-art, renderização de avatares, salas de projetos, balões de status, animação do elevador e servidor SSE/WebSocket em tempo real. |
| [**OpenOrq**](https://github.com/IAPro-Community/Orquestrador-Maestro) | Comunidade OpenOrq / Fernando Bolzan | **MIT** | Núcleo de governança de segurança: `policy-broker` (mediação de escritas), `rpc-proxy` (gate B1 de subprocessos), `credential-store` (criptografia local DPAPI BYOK) e arquitetura de adaptação de runtime. |
| [**Orquestrador-Maestro**](https://github.com/IAPro-Community/Orquestrador-Maestro) | [IAPro-Community](https://github.com/IAPro-Community) | **Apache-2.0** | A inteligência de orquestração: constituição (`rules.md`, `maestro.md`, `PERSISTENCE.md`), router de skills explicável, limites orçamentários e padrão de evidências em `DEV/`. |
| [**oh-my-pi (omp)**](https://github.com/can1357/oh-my-pi) | [can1357](https://github.com/can1357) / Stencil Labs (fork do Pi por [Mario Zechner](https://github.com/mariozechner)) | **MIT** | O motor de runtime de alta performance: sistema de edição hashline (`PUT`/`CUT`), ferramentas de AST/LSP e arquitetura de subagentes paralelos via ferramenta `task`. |
| [**replica-skill**](https://github.com/Jakeschincariol/replica-skill) | [Jakeschincariol](https://github.com/Jakeschincariol) | **MIT** | As 11 skills de metodologia de produto e engenharia reversa (`replica-recon`, `replica-entrepreneur`, `replica-brand`, `replica-design`, `replica-build`, `replica-test`, `replica-fix`, `replica-deploy`, etc.). |

---

## 📁 Estrutura do Monorepo

```
aioffice/
├── apps/
│   ├── office-web/       # Habblaud (Frontend React/Vite + Servidor Fastify/WS)
│   └── office-cli/       # CLI executável e host de orquestração
├── packages/
│   ├── maestro-contract/ # Schemas e roteador de intenções
│   ├── policy-broker/    # Interceptador de gravações e diffs
│   ├── rpc-proxy/        # Gate B1 de segurança para subprocessos
│   ├── credential-store/ # Cofre seguro local com criptografia AES-256-GCM
│   ├── runtime/          # RuntimeAdapter com engine hashline e subagentes
│   └── habblaud-bridge/  # Ponte de telemetria e aprovação com o Habblaud
├── skills/
│   └── replica/          # As 11 skills especializadas de engenharia reversa
└── DEV/                  # Documentação e persistência viva do projeto
```

---

## 🚀 Como Começar

### Pré-requisitos
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`

### 1. Instalação e Compilação
```bash
npm run setup
```
*(Executa o `npm install`, instala as dependências do servidor web e compila todos os pacotes.)*

### 2. Iniciar o Escritório Virtual
```bash
npm run start:office
```
Abra no navegador: **[http://localhost:4747](http://localhost:4747)**

### 3. Disparar Tarefas pelo Terminal
```bash
# Extração de Design Tokens
npm start -- "Extrair design tokens e cores do aplicativo"

# Pesquisa de Mercado e Dores de Usuários
npm start -- "Analisar reviews e concorrentes do mercado"
```

### 4. Rodar a Suíte de Verificação
```bash
npm run verify
```

---

## 🔄 Como Atualizar o Habblaud Upstream

O AIOffice mantém a base do Habblaud em `apps/office-web/` desacoplada para permitir atualizações frequentes do projeto original de [marmottajr/habblaud](https://github.com/marmottajr/habblaud):

```bash
# 1. Checar se há novas releases do Habblaud no GitHub
npm run update:habblaud

# 2. Puxar as atualizações da branch principal do upstream
git fetch https://github.com/marmottajr/habblaud.git main
git merge FETCH_HEAD --allow-unrelated-histories

# 3. Recompilar a aplicação web
npm run build:office
```

---

## 🔒 Segurança e Privacidade
- **BYOK (Bring Your Own Key)**: Chaves de API nunca são enviadas para servidores externos e ficam armazenadas com segurança local no seu sistema (`~/.aioffice/credentials.enc.json`).
- **Zero Vazamento de Dados Pessoais**: Nenhum caminho absoluto ou dado da sua máquina é versionado.
- **Mediação Canônica**: Nenhuma ferramenta altera arquivos no disco sem passar pelo `PolicyBroker` para validação prévia.

---

## 📄 Licença
Distribuído sob licença [MIT](LICENSE).
