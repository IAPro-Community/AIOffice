# 🏢 AIOffice

> **Virtual AI Software Studio & Office** — Um escritório virtual inteligente local-first que une governança, execução de ferramentas de alta performance, playbook de engenharia reversa e interface visual em pixel art.

---

## 🎯 Visão Geral

O **AIOffice** é um monorepo 100% autossuficiente e independente que consolida cinco grandes iniciativas do ecossistema open-source:

1. **Habblaud (Visual Office)**: Interface web em pixel art retro (`http://localhost:4747`) com salas por projeto, baias por especialidade, elevador animado de subagentes e aprovação 1-click.
2. **OpenOrq (Security & Mediation Core)**: Interceptação canônica de escritas e diffs (`policy-broker`), allowlist RPC B1 para subprocessos (`rpc-proxy`) e cofre de credenciais local BYOK (`credential-store`).
3. **Orquestrador-Maestro**: Governança explicável, roteamento de intenções, limites de orçamento e rastreabilidade durável com contratos de handoff em `DEV/`.
4. **oh-my-pi (Runtime Engine)**: Harness de ferramentas ultra-otimizado com edições hashline seguras (`PUT`/`CUT`), suporte a AST/LSP e subagentes isolados em worktrees via ferramenta `task`.
5. **replica-skill (Playbook de Produto)**: Suíte de 11 skills especializadas para engenharia reversa, clonagem e reconstrução de produtos digitais resolvendo as dores reais dos usuários.

### CLIs conectadas ao escritório

| CLI | Atividade e conversa | Histórico | Mensagens pelo escritório |
|---|---|---|---|
| Claude Code | Sim | Sim | Sim, com o mod do Habblaud |
| Codex | Sim | Sim | Sim; no Docker, requer `npm run codex:bridge` no host |
| oh-my-pi (OMP) | Sim | Sim | Sim, depois de instalar a ponte com `npm --prefix apps/office-web run omp:install` e abrir uma nova sessão |

Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm integração de sessões e mensagens de ponta a ponta.
Uma conexão MCP de IDE ou desktop também não equivale à leitura de uma sessão de CLI.

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

### 3. Preparar ou executar uma tarefa pelo Terminal
```bash
# Por padrão, mostra o roteamento sem iniciar um executor
npm start -- "Extrair design tokens e cores do aplicativo"

# Ativa explicitamente o executor Maestro como último recurso
npm start -- --maestro-fallback "Extrair design tokens e cores do aplicativo"
```
O fallback atual é uma demonstração: ele grava artefatos no workspace e aprova essas escritas automaticamente. Use-o somente quando os executores preferenciais estiverem indisponíveis.

### 4. Rodar a Suíte de Verificação
```bash
npm run verify
```

---

## 🔄 Atualizações do AIOffice e integração do Habblaud

### Para quem usa o AIOffice

O verificador em **Configurações → Sobre** acompanha exclusivamente as releases do repositório AIOffice; a versão do Habblaud upstream nunca aciona o selo. Quando houver uma release nova, o botão **Baixar e atualizar** obtém a tag oficial do AIOffice, instala dependências e compila em uma pasta separada. Para reinício gerenciado, inicie pela raiz com `npm run start:office`; o instalador exige checkout Git oficial e limpo, modo Node, sem opções ou supervisor externo e sem sessões interativas ativas. Ele preserva os artefatos de runtime para recuperação, reinicia o servidor e só remove o aviso quando a instância nova confirma a versão alvo. Docker, modo de desenvolvimento e instalações fora desses critérios recebem o motivo do bloqueio para seguir as instruções manuais da release.

As mudanças do [Habblaud upstream](https://github.com/marmottajr/habblaud) passam primeiro pela equipe do AIOffice. Não adicione esse repositório como remoto para mesclar diretamente no seu AIOffice.

### Para a equipe que mantém o AIOffice

Consulte o upstream com o verificador somente de leitura:

```bash
npm run check:habblaud-upstream
```

O comando consulta a API do GitHub, compara a release upstream mais recente com o marco registrado em `apps/office-web/upstream-habblaud.json` e mostra o link do diff. Ele não executa `git fetch` ou `git merge`, nem baixa código, instala dependências ou altera arquivos. Revise cada mudança em uma branch de integração; porte apenas as partes compatíveis, confira dependências, permissões, segurança e validação, e registre o que foi adotado ou adiado no manifesto. Para preparar uma release AIOffice, `npm run release` mostra as notas sem publicar. `npm run release -- --publish` exige a branch principal limpa e sincronizada e publica somente no repositório AIOffice. Nunca publique uma release do Habblaud como atualização do produto.

### Acesso remoto (opcional)

O acesso remoto usa uma segunda porta HTTPS com usuário e senha; o painel local continua em `http://127.0.0.1:4747`. No modo Node, configure a conta e o certificado com:

```bash
npm run remote:setup
npm run start:office
```

O assistente mostra os endereços da rede local e o caminho da CA pública. Transfira `ca.crt` ao celular por um canal confiável e confira sua impressão digital antes de instalar/confiar no certificado. Na mesma rede Wi‑Fi, abra o endereço HTTPS exibido e entre com as credenciais escolhidas. O padrão remoto é somente leitura. Use `--allow permissions`, `--allow messages` ou `--allow terminal` para liberar cada capacidade explicitamente; mensagens enviam texto às sessões, e `terminal` revela conversas completas. O acesso remoto nunca pode criar ou encerrar processos.

Fora de casa, conecte computador e celular à mesma VPN privada (por exemplo, Tailscale). Rode o assistente enquanto a VPN estiver conectada; para um endereço MagicDNS, informe `--domain <nome-do-computador>` já na primeira configuração. Se a CA existente precisar cobrir um nome novo, repita com `--domain <nome-do-computador> --new-ca`; remova a CA antiga de cada dispositivo e instale a nova. Não encaminhe portas do roteador nem use Funnel. `npm run remote:off` remove a configuração de login; reinicie o AIOffice para aplicar.

---

## 🔒 Segurança e Privacidade
- **BYOK (Bring Your Own Key)**: Chaves de API nunca são enviadas para servidores externos e ficam armazenadas com segurança local no seu sistema (`~/.aioffice/credentials.enc.json`).
- **Zero Vazamento de Dados Pessoais**: Nenhum caminho absoluto ou dado da sua máquina é versionado.
- **Mediação Canônica**: Nenhuma ferramenta altera arquivos no disco sem passar pelo `PolicyBroker` para validação prévia.

---

## 📄 Licença
Distribuído sob licença [MIT](LICENSE).
