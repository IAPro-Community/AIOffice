# 🏢 AIOffice

<p align="center"><strong>Seu escritório virtual para Claude Code, Codex e oh-my-pi.</strong><br />Projetos, agentes, tarefas e atividade recente em uma interface pixel art, com governança e segurança no mesmo monorepo.</p>

<p align="center">
  <img alt="Última release" src="https://img.shields.io/github/v/release/IAPro-Community/AIOffice?label=release&color=7357d5" />
  <img alt="Node.js 22.12+" src="https://img.shields.io/badge/Node.js-22.12%2B-339933?logo=node.js&logoColor=white" />
  <img alt="Licença MIT" src="https://img.shields.io/github/license/IAPro-Community/AIOffice?color=blue" />
</p>

<p align="center">
  <a href="https://github.com/IAPro-Community/AIOffice/releases/latest">📦 Releases</a> ·
  <a href="CHANGELOG.md">📝 Changelog</a> ·
  <a href="DEV/DESKTOP.md">🖥️ Desktop e distribuição</a> ·
  <a href="apps/office-web/README.pt-BR.md">🎮 Guia do escritório</a>
</p>

![Visão da sala virtual do AIOffice com projetos e agentes de demonstração](apps/office-web/docs/screenshots/readme-office.png)

> Todas as capturas deste README foram feitas com o simulador local do aplicativo. Projetos, agentes, tarefas e contas são fictícios.

## Downloads

A versão da tabela é a **última release publicada**. O código no repositório pode conter mudanças posteriores; confira os artefatos na página de [releases](https://github.com/IAPro-Community/AIOffice/releases/latest).

| Sistema | Pacote | Download | Disponibilidade |
|---|---|---|---|
| Windows x64 | Instalador `.exe` | [Baixar AIOffice-Setup.exe](https://github.com/IAPro-Community/AIOffice/releases/download/v2.1.0/AIOffice-Setup.exe?nocache=987654321) | `v2.1.0` publicado; o instalador atual não tem assinatura Authenticode. |
| macOS | `.dmg` / `.zip` | [Ver releases](https://github.com/IAPro-Community/AIOffice/releases/latest) | Ainda sem compilado publicado. |
| Linux | `.AppImage` / `.deb` | [Ver releases](https://github.com/IAPro-Community/AIOffice/releases/latest) | Ainda sem compilado publicado. |

Os links de macOS e Linux levam à página oficial para evitar downloads quebrados: os arquivos só estarão disponíveis depois que os respectivos jobs de release forem executados e publicados. O instalador Windows disponível é da `v2.1.0`; mudanças posteriores no repositório ainda não fazem parte desse pacote.

O desktop inclui o runtime Node e inicia o servidor e a interface local. Claude Code, Codex e oh-my-pi são ferramentas separadas: instale e autentique cada uma conforme seu próprio fluxo. AIOffice identifica disponibilidade local; não cria nem valida suas contas nesses provedores.

## O que você encontra no AIOffice

- **Escritório visual:** salas por projeto, agentes em pixel art, subagentes, tarefas, esperas por shell e feed de atividade.
- **Acompanhamento de sessões:** lê sessões locais de Claude Code, Codex e OMP; integrações e capacidades variam por ferramenta.
- **Controles pelo escritório:** acompanha pedidos de permissão e permite enviar mensagens conforme a bridge de cada provedor esteja instalada e ativa.
- **Orquestrador-Maestro:** roteamento de intenções, limites e registro de decisões operacionais em `DEV/`.
- **OpenOrq:** mediação de escritas, controle de subprocessos e armazenamento local de credenciais BYOK.
- **Aplicativo desktop:** janela nativa Electron com servidor local integrado, diagnóstico e fluxo de atualização próprio.

![Detalhes de um agente, tarefas, shells e atividade recente](apps/office-web/docs/screenshots/readme-agent.png)

### Configurações e temas

Escolha paleta, cenário, calendário de datas comemorativas, horários e idioma.

![Configurações do AIOffice com paletas, cenários e programação por horário](apps/office-web/docs/screenshots/readme-settings.png)

## Começar

### Usar o aplicativo desktop

Baixe o instalador Windows disponível na tabela acima, instale e abra **AIOffice** pelo menu Iniciar ou atalho. O aplicativo sobe a interface em `http://127.0.0.1:4747` automaticamente. O suporte de distribuição para macOS e Linux depende dos artefatos publicados na página de releases.

### Executar pelo código-fonte

**Requisitos:** Node.js `>=22.12` e npm `>=10`.

```bash
git clone https://github.com/IAPro-Community/AIOffice.git
cd AIOffice
npm run setup
npm run start:office
```

Abra [http://localhost:4747](http://localhost:4747). Para subir pelo Docker, use `npm --prefix apps/office-web run docker:up`.

O setup instala dependências, prepara os pacotes e verifica a camada do Orquestrador-Maestro. Em **Configurações → Orquestrador-Maestro**, a busca por atualização acontece em segundo plano; aplicar uma atualização exige clicar no botão. O atualizador **Sobre** acompanha as releases do AIOffice.

Para preparar uma tarefa no terminal, o padrão mostra apenas o roteamento:

```bash
npm start -- "Extrair design tokens e cores do aplicativo"
```

O executor de fallback do Maestro exige a opção explícita `--maestro-fallback`; esse fluxo é demonstrativo e aprova automaticamente escritas de artefatos no workspace.

## Acesso pelo celular

O painel local pode criar um Cloudflare Quick Tunnel a pedido do usuário em **Configurações → Acesso pelo celular**. Instale [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) e deixe-o disponível no `PATH` do AIOffice. O túnel não inicia automaticamente. Depois de iniciar, abra no telefone o link HTTPS ou o QR atual e digite o código de seis caracteres gerado no painel. O código vale por cinco minutos e um único login; não é incluído no link nem no QR.

O acesso passa pela infraestrutura Cloudflare e fica disponível pela internet enquanto o computador, o AIOffice e o túnel estiverem ativos. Compartilhe link e código com cuidado. Se o Chrome exibir um aviso de site perigoso, não prossiga nem informe o código. A sessão remota tem controles por dispositivo e expira em até 12 horas; parar ou reiniciar o servidor encerra as sessões.

## Compilar e verificar

```bash
npm run desktop:dev
npm run desktop:build
npm run desktop:package:win
npm run desktop:package:mac
npm run desktop:package:linux
npm run desktop:verify
```

Cada instalador deve ser criado no sistema operacional correspondente. O workflow oficial usa runners Windows, macOS e Linux e só publica quando todos os jobs passam. Windows exige certificado Authenticode; macOS exige assinatura Apple e notarização. Consulte [DEV/DESKTOP.md](DEV/DESKTOP.md) para detalhes, requisitos e limites atuais.

## Integrações

| Ferramenta | O que aparece no escritório | Observações |
|---|---|---|
| Claude Code | Sessões, atividade, histórico, uso e recursos de mensagem/permissão | Mod e plugins habilitam recursos adicionais. |
| Codex CLI / app | Sessões, histórico, atividade e uso local | Hooks precisam ser aprovados; no Docker, mensagens exigem `npm run codex:bridge` no host. |
| oh-my-pi (OMP) | Sessões, histórico e atividade | Instale a bridge com `npm --prefix apps/office-web run omp:install` e abra uma nova sessão. |

Devin, Antigravity, OpenCode, Freebuf e Gemini CLI não têm integração de sessões e mensagens de ponta a ponta. Uma conexão MCP também não equivale à leitura de uma sessão de CLI.

## Estrutura

```text
apps/
  office-web/       Habblaud: interface React/Vite e servidor HTTP/SSE
  office-desktop/   Shell Electron e ciclo de atualização
  office-cli/       CLI e host de orquestração
packages/
  maestro-contract/ Contratos e roteamento de intenções
  policy-broker/    Mediação de escritas e diffs
  rpc-proxy/        Controle de subprocessos
  credential-store/ Cofre local de credenciais
  runtime/          Adaptadores de runtime e subagentes
DEV/                Contexto, especificações, decisões e verificações
```

O escritório visual é baseado no [Habblaud](https://github.com/marmottajr/habblaud) (MIT). Outros projetos-base e licenças estão documentados em [`apps/office-web/README.md`](apps/office-web/README.md) e nos avisos de terceiros que acompanham o aplicativo.

## Segurança e privacidade

- O servidor local aceita conexões de loopback por padrão; não exponha a porta HTTP diretamente à rede.
- O acesso remoto é opcional e usa um túnel Cloudflare, com autenticação por código temporário de uso único.
- A integração de cada ferramenta lê dados locais conforme suas capacidades; não confunda disponibilidade no `PATH` com conta autenticada.
- Chaves BYOK ficam armazenadas localmente no cofre do AIOffice. O túnel móvel encaminha tráfego pela infraestrutura Cloudflare.

Veja também [`DEV/CONTEXT.md`](DEV/CONTEXT.md), [`DEV/VERIFY.md`](DEV/VERIFY.md) e [`DEV/DESKTOP.md`](DEV/DESKTOP.md).

## Changelog e licença

Veja as notas em [`CHANGELOG.md`](CHANGELOG.md). O projeto é distribuído sob licença [MIT](LICENSE); projetos-base podem manter licenças próprias.
