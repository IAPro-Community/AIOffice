# AIOffice Desktop

O desktop é uma distribuição Electron do monorepo. O Electron inicia um processo utilitário supervisionado que executa o bundle servidor existente em `apps/office-web/dist/server/index.js`; a janela abre o mesmo cliente de produção servido localmente em `127.0.0.1`. O servidor continua responsável pelo modelo do escritório, APIs, SSE/WebSocket, permissões, descoberta de sessões, mensagens, terminal e PolicyBroker. `npm start`, `npm run start:office`, Docker e os fluxos web/CLI existentes continuam disponíveis.

## Executar e empacotar

Requisitos de desenvolvimento: Node.js 22+ e npm 10+. O usuário do instalador não precisa instalar Node para executar o app; Electron fornece o runtime local. As CLIs de agente não são empacotadas, pois têm seus próprios termos, autenticação e atualizações.

```bash
npm ci
npm run desktop:dev
npm run desktop:doctor
npm run desktop:test
npm run desktop:verify
npm run desktop:build
npm run desktop:package:win
npm run desktop:package:mac
npm run desktop:package:mac:x64
npm run desktop:package:mac:arm64
npm run desktop:package:linux
```

`desktop:dev` compila o cliente/servidor local e inicia Electron. O serviço escuta na porta `HABBLAUD_PORT` (padrão `4747`); o processo utilitário confirma por IPC que ele próprio abriu a porta e o health check confirma a versão AIOffice antes da janela abrir. Antes de iniciar, o desktop identifica processos que escutam nessa porta. Para um processo reconhecido como AIOffice — o utilitário Electron desta instalação ou o launcher `start-managed.mjs` — tenta o encerramento autenticado e aguarda a porta liberar; releases antigos sem handshake recebem um sinal somente no PID reconhecido. Se o servidor responder que há sessões interativas ativas, respeita a recusa. Nunca encerra outro aplicativo: informa nome/PID e como liberar ou mudar a porta. Um valor inválido de `HABBLAUD_PORT` gera erro direto, sem cair silenciosamente na porta padrão. No primeiro início, o AIOffice também instala e verifica a camada obrigatória do Orquestrador-Maestro; essa instalação pode levar até seis minutos. Para testar outra porta, defina `HABBLAUD_PORT` antes de iniciar. `desktop:package` empacota para o sistema/arquitetura local. Alvos: NSIS `.exe` no Windows, `.dmg` e `.zip` no macOS, `.AppImage` e `.deb` no Linux. Os pacotes de outras plataformas devem ser compilados nos respectivos runners.

O instalador também inclui a CLI do NPM e toda a pasta `node_modules` dela em `resources/npm`. A CLI precisa dessas dependências em tempo de execução (por exemplo, `graceful-fs`); `bin/` e `lib/` isolados não bastam. No primeiro início, `npm root --global` pode apontar para uma pasta ainda não criada; o helper aceita esse caminho absoluto e deixa a instalação inicial criá-la. O empacotamento exige uma instalação completa do NPM no ambiente que executa o build.

O pacote inclui e descompacta `.claude-plugin/` e `apps/office-web/mod/` para que o Claude Code, executado fora do processo Electron, consiga ler o marketplace local. Com mensagens habilitadas, o servidor instala/verifica `habblaud-mensagens` nas contas detectadas; sessões já abertas precisam de `/reload-plugins` após a primeira instalação.

### Entrega de mensagens nas integrações instaladas

- Claude Code: o desktop instala/verifica automaticamente o plugin de mensagens no perfil de cada conta detectada. Sessões já abertas podem carregar o plugin com `/reload-plugins` ou ao fechar e reabrir a sessão. Isso não instala todo o mod Habblaud, captura de uso nem plugins de permissão; `npm run mod:install` continua sendo o instalador completo para Node.
- Codex: `codex queue` roda dentro do servidor local. O resolvedor encontra um executável nativo no `PATH` ou a dependência nativa da instalação global oficial do NPM (incluindo o prefixo global do NPM no Windows `codex.cmd`/`codex.ps1`), sem executar wrappers de shell e sem empacotar outra cópia da CLI. A CLI do Codex precisa estar instalada e autenticada pelo usuário; ela não faz parte do AIOffice. Apenas quando o servidor está em Docker, o auxiliar `npm run codex:bridge` precisa rodar no host.
- OMP: se o perfil `~/.omp/agent` existe e mensagens estão habilitadas, a inicialização instala ou atualiza a extensão global do AIOffice e grava a porta local configurada. Uma extensão sem marcador AIOffice nunca é substituída. Sessões OMP que já estavam abertas precisam ser fechadas e abertas para carregar mudanças.
- A instalação/verificação acontece no processo do servidor durante a inicialização, sem polling de renderer e sem recarga automática da página. O status da sessão continua chegando pelo fluxo de eventos já existente.

As CLIs de Claude Code, Codex e OMP continuam instaladas/autenticadas separadamente, pois pertencem a fornecedores e têm contas próprias. O app herda o ambiente do usuário e também procura o prefixo global do NPM onde necessário; observar sessões é possível sem CLI em alguns provedores, mas enviar mensagens requer a CLI/integração correspondente. `npm run desktop:doctor` e **Ajuda → Diagnóstico** verificam disponibilidade, não login/autenticação. Nenhum token ou segredo é incluído nos instaladores.

## Persistência e encerramento

- Preferências/estado Habblaud: `<userData>/habblaud`.
- Configuração de acesso remoto: `<userData>/.env`; diretório TLS novo: `<userData>/remote-tls`.
- Log local rotacionado: `<userData>/aioffice.log` e, quando necessário, `aioffice.log.1`.
- Windows: `%APPDATA%\AIOffice`.
- macOS: `~/Library/Application Support/AIOffice`.
- Linux: `$XDG_CONFIG_HOME/AIOffice` ou `~/.config/AIOffice`.

No primeiro início, se o destino estiver ausente, o desktop copia `~/.habblaud` (ou a pasta legada `~/.codetown`) para `userData/habblaud` e copia um `.env` legado conhecido. A origem nunca é movida, apagada ou sobrescrita. Se os dois destinos já existirem, os arquivos antigos permanecem para recuperação manual. A pasta `~/.habblaud/usage` e os diretórios próprios de Claude, Codex e OMP continuam sendo observados como antes. Credenciais gerenciadas pelo pacote `credential-store` e pelo sistema operacional não são copiadas para o instalador.

O main só cria a janela depois que `/api/health` responde `ok` e a versão coincide. A janela tem `contextIsolation`, sandbox e `webSecurity`; `nodeIntegration` é desligado. O preload só encaminha canais IPC versionados/permitidos e o main rejeita pedidos de frames que não sejam a janela local principal. Navegação remota fica bloqueada; links HTTP(S)/`mailto:` explicitamente abertos vão ao navegador padrão. Ao fechar, Electron pede encerramento ao processo utilitário; o servidor para watchers, streams, gravação, PTYs e listeners antes de sair. Se não responder em 10 s, o utilitário é terminado e isso é registrado.

## Atualizações estáveis

O Windows consulta a API da release estável mais recente de `IAPro-Community/AIOffice` ao abrir e a cada seis horas. O aplicativo baixa `AIOffice-Setup.exe` da tag oficial, aceita redirecionamentos somente para hosts do GitHub, valida tamanho e SHA-256, guarda o pacote no perfil local e pede confirmação antes de abri-lo. O instalador NSIS continua interativo e pode mostrar o aviso normal do SmartScreen enquanto não houver assinatura Authenticode. As credenciais permanecem em `userData`, fora dos arquivos substituídos.

Esse fluxo roda no processo principal do Electron e atualiza o status do painel por IPC; a verificação periódica nunca dá reload na página. O download inicia depois de confirmação; a instalação e o encerramento do app também exigem confirmação. A verificação web `HABBLAUD_UPDATE_CHECK=0` continua desligada no processo embutido porque seu instalador gerenciado opera apenas sobre checkouts Node/Git, não sobre o pacote Electron.

O setup é estático e instala a versão incluída nele. O atualizador Windows busca a release mais recente pela API e baixa a URL da tag específica; o alias `latest/download` é destinado a downloads manuais. O atualizador AppImage Linux lê `latest-linux.yml`. O atualizador macOS usa `latest-mac.yml` e só é habilitado quando o app é assinado. Builds unsigned do macOS direcionam a pessoa à página oficial para instalação manual; `.deb` também é atualizado manualmente pelo gerenciador de pacotes.

### Artefatos atualmente publicados

A release oficial atual é [`v2.3.0`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.3.0), publicada pelo workflow após aprovação dos builds Windows x64, macOS Intel/Apple silicon e Linux x64, dos manifestos e dos nove assets. Os downloads estáveis ficam no [README público](../README.md#downloads) e na página [releases](https://github.com/IAPro-Community/AIOffice/releases/latest). Os pacotes macOS desta release não estão assinados/notarizados; veja a limitação do Gatekeeper abaixo.

`.deb` não usa o atualizador AppImage: **Ajuda → Verificar atualizações** orienta abrir GitHub Releases para baixar o próximo `.deb` e atualizá-lo pelo gerenciador do sistema. Isso respeita a elevação de privilégios e o banco de pacotes da distribuição. A desinstalação NSIS declara que não apaga `userData`.

Uma falha de rede/verificação/instalação mantém a versão ativa e os dados locais. As consultas e erros são escritos no log; a ausência de conexão não impede abrir o aplicativo. O digest SHA-256 confirma que o setup corresponde ao asset informado pela API oficial do GitHub; a assinatura Authenticode ainda é recomendada para identidade do publicador e reputação do Windows.

## Atualização em segundo plano da interface

O cliente mantém o estado do escritório atualizado pelo stream SSE; em Quick Tunnels Cloudflare ele usa polling serial em segundo plano. Uma release web nova mostra um aviso sem substituir a página aberta. A recarga só ocorre se a pessoa clicar em **Recarregar agora**. A troca de idioma também recarrega a página apenas após uma escolha explícita. No app desktop, o main carrega a URL local uma vez ao abrir a janela; verificações nativas periódicas de release não mandam recarregar o renderer. Instalar uma atualização nativa exige confirmação e reinicia o aplicativo para trocar os arquivos.

## Releases e assinatura

O workflow `.github/workflows/release-desktop.yml` tem uma validação manual prévia e roda em tags estáveis `vX.Y.Z`. Ele verifica a aplicação, empacota Windows x64, macOS Intel, macOS Apple silicon e Linux x64 em runners nativos e publica somente se todos os builds e a checagem do conjunto final passarem. Os assets incluem setup Windows, `.dmg`/`.zip` macOS, `.AppImage`/`.deb` Linux e manifestos `latest-mac.yml`/`latest-linux.yml`. `npm run release -- --publish` envia a tag verificada depois da validação dos builds.

Configure estes valores nas configurações do repositório **antes** de enviar uma tag de release:

| Tipo | Nome | Conteúdo |
|---|---|---|
| Secret | `AIOFFICE_WINDOWS_CERTIFICATE_BASE64` | Certificado Authenticode PFX/P12 codificado em Base64 (opcional). |
| Secret | `AIOFFICE_WINDOWS_CERTIFICATE_PASSWORD` | Senha do certificado Windows (opcional). |
| Variable | `AIOFFICE_WINDOWS_PUBLISHER_NAME` | Nome da entidade exatamente como aparece no certificado Authenticode (opcional). |
| Secret | `AIOFFICE_MAC_CERTIFICATE_BASE64` | Certificado Developer ID P12 codificado em Base64 (opcional). |
| Secret | `AIOFFICE_MAC_CERTIFICATE_PASSWORD` | Senha do certificado Developer ID (opcional). |
| Secret | `AIOFFICE_APPLE_API_KEY_P8_BASE64` | Chave App Store Connect P8 codificada em Base64 (opcional). |
| Secret | `AIOFFICE_APPLE_API_KEY_ID` | ID da chave App Store Connect (opcional). |
| Secret | `AIOFFICE_APPLE_API_ISSUER` | Issuer ID da chave App Store Connect (opcional). |

Cada plataforma exige todas as configurações de assinatura correspondentes ou nenhuma; configuração parcial falha. No macOS, assinatura Developer ID e notarização são necessárias para remover a restrição de atualização automática e reduzir avisos do Gatekeeper. Até configurar os cinco segredos Apple, os downloads macOS permanecem unsigned e instalação manual. Não coloque certificados/senhas em arquivos versionados.

Passos do mantenedor:

1. Atualize `version` no `package.json` raiz e escreva as notas de `CHANGELOG.md`.
2. Execute `npm run desktop:verify` e acione manualmente **Actions → AIOffice Desktop Release** na `main` para validar os quatro runners sem publicar uma versão.
3. Depois que todos os jobs nativos passarem, envie a tag correspondente (`vX.Y.Z`) pela rotina `npm run release -- --publish`.
4. Acompanhe **Actions → AIOffice Desktop Release**; a publicação depende do sucesso de todos os builds e manifestos.
5. Confirme os nove assets, checksums e URLs da release; teste atualização Windows e AppImage, além da instalação manual `.dmg`/`.deb`.

Histórico: o primeiro asset foi anexado à release existente `v2.1.0`; nenhuma nova tag ou release foi criada naquela etapa. A release atual foi publicada pelo workflow tag-gated documentado abaixo.

## Diagnóstico e limites de plataforma

- O handshake de `UtilityProcess` chega ao main como payload direto; somente `process.parentPort` no processo filho recebe um evento com `.data`. Se o health local estiver ativo mas a janela não aparecer, confirme o handshake e `Desktop window is ready to show` em `aioffice.log`.
- O PowerShell usado para identificar o processo da porta no Windows deve ser iniciado com janela oculta. Se o renderer falhar ou encerrar, o desktop registra o motivo e oferece abrir a pasta de logs.
- “Porta em uso”: o desktop tenta recuperar uma instância órfã do próprio AIOffice. Se outro aplicativo usar a porta, a mensagem inclui nome e PID; feche-o ou defina outra `HABBLAUD_PORT`. A aplicação não se conecta a um serviço que não iniciou.
- Se uma instância que oferece o shutdown autenticado recusar a parada por sessões interativas, feche essas sessões e abra o desktop de novo. Releases antigos sem esse handshake só podem ser identificados pelo PID antes do encerramento direcionado.
- Processo não inicia ou fecha: a mensagem diferencia conflito de porta, configuração inválida, falha do Maestro, instalação incompleta, permissões, erro de criação do processo e timeout; consulte `aioffice.log` no diretório de dados indicado acima. A interface só abre para uma API com versão correspondente.
- Ausência de agente no escritório: instale/autentique a ferramenta separadamente. Codex e OMP leem os perfis/sessões já conhecidos pelo servidor; o log registra se a CLI que entrega mensagens foi encontrada.
- A consulta e o download exigem HTTPS ao GitHub. Uma instalação `2.1.0` precisa do upgrade manual inicial para receber o atualizador Windows.
- A máquina de desenvolvimento é Windows; builds macOS/Linux só ficam validados após sucesso nos respectivos runners nativos e inspeção dos assets publicados.

## Diagnóstico inicial da atualização automática — 2026-10-14 (superado pela implementação acima)

- A mensagem **Verificação de novas versões desativada** vem do verificador do servidor web: `apps/office-desktop/storage.mjs` define `HABBLAUD_UPDATE_CHECK=0` ao iniciar o servidor. A API local confirmou `version: 2.1.0`, `updates.state: off`; o log registrou `verificação desligada (HABBLAUD_UPDATE_CHECK)`.
- Esse bloqueio evita que o painel web ofereça seu instalador de checkout Node, que recusa corretamente apps empacotados. O desktop tem um atualizador Electron separado, mas o Windows só o habilita quando os metadados da build declaram assinatura Authenticode e o publisher esperado.
- A instalação atual `AIOffice.exe` está sem assinatura. A release GitHub `v2.1.0` contém apenas `AIOffice-Setup.exe`; não há `latest.yml` nem blockmap. Assim, a atualização nativa não tem feed utilizável para consultar e validar uma versão nova.
- A release `v2.1.0` é também a mais recente e igual à versão instalada. A candidata local `2.2.0`, o shell desktop e `.github/workflows/release-desktop.yml` ainda não estão em `origin/main`; a cópia limpa do `main` termina no commit `01e59b3f0e5b7950986859b4ed5d7a9f1f1847be` e não contém `apps/office-desktop`.
- `gh secret list` e `gh variable list` no escopo do repositório não retornaram entradas de assinatura; secrets de organização não foram inspecionados. Para habilitar instalação automática segura, integre e publique o shell/workflow e uma release posterior assinada com os metadados de update necessários. Mantenha o asset estável `AIOffice-Setup.exe` como atalho de download se desejado; ele sozinho não substitui o manifesto do updater.
- Não remova a trava do servidor web isoladamente: isso faria o painel mostrar uma ação de instalação que não suporta o desktop empacotado. A implementação atual usa o atualizador do processo Electron descrito acima.

## Atualizador Windows via digest do GitHub — publicado em v2.2.1

- `apps/office-desktop/github-release-updater.mjs` consulta a API oficial, aceita apenas releases estáveis com `AIOffice-Setup.exe`, URL/tamanho/digest válidos e SHA-256 disponível. O download usa a URL da tag específica, permite redirecionamentos HTTPS somente para hosts oficiais e confirma tamanho e digest antes de executar o NSIS.
- O main verifica ao abrir e a cada seis horas; o menu e Configurações → Sobre permitem consulta manual. IPC comunica estados e progresso ao cliente. Nenhuma checagem ou download recarrega a página.
- O usuário confirma o download e, depois da validação, confirma a abertura do instalador interativo. O app para seus serviços e fecha antes que o usuário complete a instalação. O cache fica no perfil AIOffice; os dados do servidor continuam separados.
- Na publicação `v2.2.1`, o workflow ainda gerava somente `AIOffice-Setup.exe` para Windows x64. A pipeline multi-plataforma atual está descrita na seção **Releases e assinatura** acima.
- A tag `v2.2.0` foi enviada, mas duas execuções de Actions falharam nos testes de registro Claude e ingestão OMP no Windows; nenhuma release/asset foi criada. Ela permanece imutável.
- A correção compara conteúdo de registros Claude e também o tamanho dos transcripts OMP para detectar gravações quando o `mtime` se mantém igual. Há testes que fixam o timestamp e confirmam as duas situações.
- `npm run desktop:verify` passou localmente após `npm ci`: 22 testes do monorepo, 1.257 testes web (10 ignorados), 14 testes desktop, typechecks, build, i18n e sintaxe. O bundle cliente continua acima de 500 kB.
- Actions `38620115438` passou em 2m46s e publicou `v2.2.1` com um asset: `AIOffice-Setup.exe`, 118.890.375 bytes, SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`. Authenticode não está configurado. A versão `2.1.0` instalada precisa de atualização manual única; releases seguintes são detectadas pelo atualizador.

Os avisos de terceiros acompanham o instalador em `resources/THIRD-PARTY-NOTICES.md`; os arquivos de licença das dependências e do Electron/Chromium acompanham o runtime empacotado.
