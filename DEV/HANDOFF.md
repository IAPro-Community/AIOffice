# HANDOFF — AIOffice

## Logos dos provedores — 2026-10-27
- Claude, Codex, OMP e OpenCode agora usam logos SVG locais nas contas, referências dos painéis e etiquetas do mapa; os rótulos acessíveis continuam disponíveis.
- A cobertura inclui topo, cartões de uso/atividade, ajuda, integrações, histórico e filtros da barra lateral. Fontes dos assets e licença do SVG OMP estão registradas em `apps/office-web/client/public/assets/providers/README.md`.
- Base visual: componentes locais preservados porque a solicitação foi substituir os marcadores por letras no painel existente; não há Design Profile central configurado.
- Typechecks, build e `git diff --check` aprovados; conferência visual da prévia local concluída. `i18n:check` retornou sucesso com quatro traduções ausentes preexistentes na configuração V2 do mapa. Testes automatizados não executados.
- O commit da mudança foi preparado para envio à branch principal conforme solicitado; não foi criada tag/release de instaladores.

## Mapa V2 de escritório — 2026-10-26

- V2 é o cenário padrão e V1 continua disponível em **Configurações → Aparência → Tema do mapa**. O lounge separa pingue-pongue, área do sofá e fliperamas; salas de projeto têm três postos isolados e corredor para reunião.
- Os móveis usam os sprites pixel art existentes. O gerador deriva 17 quadros e pôsteres V2 da arte original, sem alterar a composição dos pixels.
- `npm run build` e o typecheck web passaram na base v2.4.4. A prévia local foi comparada em V1/V2 com os bonequinhos ativos. Testes automatizados não foram executados nesta mudança.
- Não foi criada uma release; esta atualização é código da branch principal e precisa de release posterior para chegar aos instaladores publicados.

## Release v2.4.4 publicada — extensão Chrome — 2026-10-15

- **Pedido:** documentar a extensão, incluir a imagem no README, criar uma atualização versionada e publicar no GitHub.
- **Implementação:** extensão Manifest V3 com ícone oficial, painel por projeto, filtros, personagens, feed/notificações configuráveis, terminal e envio de instrução ao agente; host Native Messaging e inicialização em segundo plano no Desktop Windows; tutorial nas configurações e ZIP de distribuição.
- **Imagem do README:** `apps/office-chrome-extension/docs/readme-preview.svg` é uma ilustração demonstrativa identificada como tal, com projetos e agentes fictícios; não representa uma captura real do app.
- **Gates locais:** `npm run desktop:verify` passou: typechecks, build, 22 testes raiz, 1.279 testes web (10 ignorados), 36 desktop, 23 da extensão, validação das 23 categorias/5 permissões e testes Go do host. `npm run release -- --dry-run` gerou as notas v2.4.4; `git diff --check` passou.
- **Pacotes locais:** setup Windows x64 (124.432.231 bytes; SHA-256 `96bb11316e6325a22bbf2802b8633f13ee153d429d8e070541af240037869563`) compilou e passou framing smoke do host; `node scripts/desktop-smoke.mjs windows` confirmou serviço e interface. ZIP (98.184 bytes; SHA-256 `a73a7191ee6b0b7f5c19aa4dc90501bb54ee32f197abaf092ed148d03f56d65a`) contém 18 arquivos e passou o validador. Esses hashes são dos pacotes locais, não substituem os digests publicados.
- **Publicação:** commit `6720cc69a7ab34b5b53369e1949bc5c4e4201433` em `main`, tag `v2.4.4` e [release latest](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.4). Workflow [38818251334](https://github.com/IAPro-Community/AIOffice/actions/runs/38818251334) passou em 6m25s; verificação, pacotes, smokes e conferência de nomes/tamanhos/SHA-256 aprovados.
- **Assets:** setup Windows (124.580.761 bytes, `95bf5d47728721b874389c80a0ee91c58cf713785824caf545f11ae426fb24c1`); ZIP extensão (98.335 bytes, `49744e4d0cdb0f46a66c82cb210600f5eb533f97df78506558fec121b0f634bd`); AppImage (133.775.728 bytes, `1df155eaa085522f1628616a7b9f457ce3bb772157722f70ad8fa1025e140dcb`); `.deb` (106.572.904 bytes, `fd53e0ee8733b6f332e9575756b3d39acdebd8ead3c59a1b335b9331a301f9a1`); `latest-linux.yml` (371 bytes, `fc23033040107867962d145736a881c7c89d6ef74e84f3d8b0440f1a6d2b6e6e`). Mac continua indisponível até assinatura/notarização Apple verificadas.
- **Continuação:** downloads da extensão e do Desktop estão nas URLs da release; instalação do companion é separada e segue o tutorial de `README.md` e Configurações.

## Atualização temporária Windows/Linux sem tag — 2026-10-15

- Pedido: tirar os arquivos macOS da distribuição e subir atualização na release existente sem criar versão/tag.
- Evidência inicial: `main` estava limpo e sincronizado com `origin/main`; `v2.4.3` é a release estável mais recente e já só continha setup Windows, dois pacotes Linux e `latest-linux.yml`. Nenhum código empacotado mudou depois do commit/tag `8393eae`; os deltas posteriores são documentação e workflow.
- Solução: workflow manual `.github/workflows/refresh-windows-linux.yml` valida que a release continua sendo `v2.4.3`, que o código empacotado não divergiu da tag, compila/testa Windows e Linux, faz backup dos quatro assets atuais, substitui apenas os assets desses sistemas e remove `.dmg`, `.zip` e `latest-mac.yml`. Se a publicação falhar, restaura os binários anteriores. Não cria nem move tag.
- **Publicação concluída:** workflow [38772157012](https://github.com/IAPro-Community/AIOffice/actions/runs/38772157012) passou em `main` (`4a8de6dfccca786fedf561d28ec26e6bc2b7d54f`). A release [v2.4.3](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.3) continua latest/estável e sua tag segue no commit `8393eaeb88c9fa658231499695e407ac4d575bb2`; não foi criada nem movida tag.
- Assets publicados e verificados: Windows setup (122.835.705 bytes, SHA-256 `7eae0c47d74e0bc934e3936c9c33d6876deba70ebf7f5126f1dda473e63c60c6`), Linux AppImage (133.771.511 bytes, `e5f69e33d3a99ac7f10e4f9767972d41985414d13a94e7d529284e1456166dec`), Linux `.deb` (106.569.168 bytes, `3b0bc83fc9e228e5b275fd242a66c20e7ef075af85bf1cbdf3a2f1d09cab9f4d`) e `latest-linux.yml` (371 bytes, `015365dc91e2c853711dc88b830c398c7fe53c41cc5c880a253fca5473547506`). Os cinco assets macOS estão ausentes.
- Compatibilidade: a versão continua `2.4.3`; os links de download foram atualizados, mas o updater interno não oferece a mesma versão como update. Uma versão superior e tag nova serão necessárias para o update no app.
- **Estado:** concluído. O run preliminar `38772030092` falhou apenas no guard de origem antes de qualquer alteração na release; o guard foi corrigido antes do run bem-sucedido. Próximo contexto: novos ajustes de produto exigem bump/changelog/tag; reintroduzir macOS exige credenciais Apple e compilação assinada/notarizada.

## Bloqueio macOS da release v2.4.3 — 2026-10-15

- Causa confirmada pelo log `38676380641`: o job macOS recebeu zero credenciais Apple; Electron Builder reportou `0 identities found` e pulou assinatura. Os quatro assets macOS publicados estão sem Developer ID/notarização e o Gatekeeper os rejeita como danificados/modificados.
- Não recomende abrir Mesmo Assim nem remover quarantine. A README local marca macOS temporariamente indisponível.
- Pipeline endurecido e publicado em `main` no commit `944b831`: exige os cinco secrets Apple e verifica assinatura Developer ID, aceitação `spctl` e ticket `stapler` dentro do `.dmg` e `.zip` antes de anexar assets. A README pública agora marca macOS temporariamente indisponível.
- Diagnóstico original: na primeira inspeção a release ainda listava os assets macOS; eles foram removidos em etapa posterior, registrada acima. A README pública os marca indisponíveis. O painel de secrets confirma que o repositório não tem secrets e nenhum secret da organização está disponível para ele.
- **Próxima ação:** cadastrar no GitHub Actions os secrets `AIOFFICE_MAC_CERTIFICATE_BASE64`, `AIOFFICE_MAC_CERTIFICATE_PASSWORD`, `AIOFFICE_APPLE_API_KEY_P8_BASE64`, `AIOFFICE_APPLE_API_KEY_ID` e `AIOFFICE_APPLE_API_ISSUER`; então validar os jobs macOS e publicar uma nova versão (não mover `v2.4.3`). Não enviar valores privados pelo chat.

## Release v2.4.3 publicada — 2026-10-15

- Tag `v2.4.3` aponta para `8393eaeb88c9fa658231499695e407ac4d575bb2`; release estável latest: https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.3.
- No lançamento original, workflow `38676380641` concluiu com `success`: gate de origem, builds e smokes Windows x64, macOS Intel/Apple silicon e Linux x64, montagem, validação do draft e dos nove digests. O refresh posterior removeu os assets macOS e substituiu os binários Windows/Linux; estado atual acima.
- A release inclui todas as mudanças acumuladas desde a `v2.3.0`: layout e identidade visual, CLIs oficiais opcionais no app instalado, integração Antigravity, diagnóstico desktop, atualizador sem refresh integral, documentação e instaladores multiplataforma. Os nove tamanhos/digests do lançamento original estão preservados como histórico em `DEV/VERIFY.md`; os ativos atuais constam na seção do refresh.
- O setup Windows público foi baixado e conferido: 122.835.769 bytes, SHA-256 `50a3f5337c92b82f13df94c374a87cbd1bd2112c3239de2e5aef1e749f2d90eb`, versão `2.4.3`, `NotSigned`; o ícone extraído mostra a nova arte oficial. Build e smoke local também passaram.
- `npm run desktop:verify` passou para o código da candidata `v2.4.2` (mesmo código-fonte da `v2.4.3`, que altera versão e pipeline): 22 testes raiz, 1.279 testes web (10 ignorados), 31 desktop, typechecks, build, i18n 2.430/2.430 em en/es/fr e sintaxe.
- A tentativa `v2.4.2` deixou um draft oculto com nove assets; a API de busca por tag falhou ao retornar drafts. O workflow v2.4.3 consulta a lista de releases, verificou o conjunto e publicou corretamente. Os tags `v2.4.0`/`v2.4.1` continuam sem release e não foram movidos.
- Atualização em background continua por IPC. Não há refresh automático da página; a recarga após atualização do servidor Node é manual.
- **Próximo contexto:** partir da release estável `v2.4.3`. Para distribuir mudanças de produto, incrementar versão, atualizar changelog, validar os sistemas disponíveis e publicar uma tag nova; o refresh sem tag serve somente para substituir downloads da mesma versão.

## Release v2.3.0 publicada — 2026-10-14

- Tag `v2.3.0` aponta para o commit `762a500bbde264f241dabd16c2e40b107ec4c7f8`. A release está em https://github.com/IAPro-Community/AIOffice/releases/tag/v2.3.0.
- Preflight `38659997554` e workflow de publicação `38660712556` concluíram com sucesso a partir do commit da tag.
- A release contém nove assets: setup Windows x64; `.dmg` e `.zip` macOS x64/arm64; `.AppImage` e `.deb` Linux x64; `latest-mac.yml` e `latest-linux.yml`. Tamanhos e SHA-256 estão em `DEV/VERIFY.md`.
- No desktop instalado, Codex envia pelo serviço local usando a CLI nativa instalada/autenticada do usuário, sem `npm run codex:bridge`; o auxiliar ainda é necessário no Docker. O servidor instala/verifica as pontes próprias de Claude Code e OMP. Sessões existentes podem precisar ser recarregadas/reabertas. Os CLIs oficiais e os logins dos fornecedores não estão dentro do instalador.
- A entrega real não foi disparada para uma sessão do usuário. Testes sintéticos cobrem o caminho do Codex; `codex --help` e `codex queue --help` confirmaram a CLI local.
- Nenhum reload integral ou polling novo do renderer foi adicionado. O setup e as integrações usam o estado/eventos existentes.
- macOS permanece sem assinatura/notarização Apple; o Gatekeeper pode exigir abertura manual e o updater nativo macOS fica desabilitado.
- **Próxima ação:** concluir o pedido atual sobre o funcionamento independente do modo Node. Já está coberta a instalação automática das pontes AIOffice; aguarda-se definir se o instalador também deve oferecer instalar os CLIs oficiais ausentes. Não anunciar suporte de mensagens a provedores sem adaptador implementado.

## Histórico do preflight nativo v2.3.0 — 2026-10-14

- As primeiras matrizes `38653090528`, `38653586066`, `38654072400` e `38654902095` validaram progressivamente os runners e os nomes estáveis dos assets Linux; `38654902095` passou a montagem dos nove assets antes da integração final.
- Após a integração das mensagens e o ajuste do delimitador de `PATH` do host, o preflight completo `38659997554` passou e antecedeu a publicação por tag.
- Builds macOS foram publicados sem assinatura Apple; veja a limitação acima.

## Publicação AIOffice v2.2.1 — concluída, 2026-10-14

- A tag/release `v2.2.1` foi criada a partir do commit `3ac5d2e` em `main`; este commit registra a publicação em https://github.com/IAPro-Community/AIOffice/releases/tag/v2.2.1.
- Actions `38620115438` passou em 2m46s. A release contém exatamente um asset Windows x64, `AIOffice-Setup.exe` (118.890.375 bytes), SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`. Assinatura Authenticode não configurada; o updater valida o digest oficial do GitHub.
- A tag anterior `v2.2.0` permanece sem release após duas falhas de teste Windows; não mover nem reutilizar essa tag.
- `npm run desktop:verify` passou localmente e o workflow repetiu as verificações com sucesso. As correções fazem o registro Claude comparar conteúdo e o scanner OMP detectar bytes novos mesmo com `mtime` fixo.
- `2.1.0` precisa de instalação manual única; atualizações posteriores são verificadas em background pelo Electron sem atualizar toda a página.

## Atualizador Windows para a release estável — 2026-10-14

- O shell desktop agora consulta `/releases/latest` da API oficial, compara versões estáveis e baixa o asset `AIOffice-Setup.exe` da tag específica, com tamanho e SHA-256 conferidos pelo digest publicado pelo GitHub. A verificação inicial ocorre após a abertura e repete-se a cada seis horas.
- A seção **Sobre** recebe o estado via IPC e deixa de mostrar `updates.state: off` no app Electron. Download e abertura do instalador têm confirmações próprias; atualizações não recarregam o renderer. O instalador NSIS permanece interativo.
- O workflow local agora publica somente o asset estável `AIOffice-Setup.exe` para Windows x64. A assinatura Authenticode é opcional; o digest do GitHub é obrigatório para o atualizador. SmartScreen ainda pode exibir aviso em arquivos sem assinatura.
- A instalação `2.1.0` não contém esse código e precisa de instalação manual única. A partir da `2.2.1`, o updater pode detectar releases seguintes.
- A API do GitHub aponta agora para `v2.2.1/AIOffice-Setup.exe` (118.890.375 bytes; SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`).
- Verificação local aprovada: typecheck root/app, build, i18n (2.392 por idioma), sintaxe desktop, ASAR, YAML do workflow e `git diff --check`. NSIS `2.2.0` está em `dist/installers-aioffice-updater-final2/AIOffice-Setup.exe` (117.969.885 bytes; SHA-256 `2927ACEFD31A08E26AE9BA4E7100E7906481960E2896C15AFF325BB70F48BA10`; `NotSigned`). Suites automatizadas não foram executadas.
- A release estável `v2.2.1` foi publicada; o instalador `2.1.0` atual precisa de atualização manual única antes de receber updates pelo novo fluxo.

## Candidata de release AIOffice v2.2.0 — 2026-10-14

- `package.json`, `package-lock.json` e `CHANGELOG.md` agora descrevem a candidata `2.2.0`; o changelog também recupera as notas oficiais da `2.1.0`.
- A release remota mais recente é `v2.1.0` (`origin/main` em `01e59b3`). A branch atual está duas revisões atrás e uma à frente de `main`, além de conter mudanças locais; `npm run release -- --dry-run` valida as notas, mas aponta esses bloqueios para publicação.
- O workflow da candidata publica Windows x64 e aceita signing Authenticode opcional, com falha se houver configuração parcial. macOS/Linux seguem fora dos artefatos publicados por falta de validação em runners próprios.
- `npm run desktop:verify` passou: typechecks, build, 22 testes do monorepo, 1.249 testes web (10 ignorados), 13 testes desktop, i18n e verificações de sintaxe. O bundle principal ainda supera 500 kB.
- O instalador Windows local foi gerado em `dist/installers-candidate-v2.2.0-unsigned/AIOffice-2.2.0-win-x64.exe` (117.961.753 bytes; SHA-256 `E5468B1AD2918D0F8358731E801032AABA55AB95E6E362BC492597087DB8401E`); ProductVersion/FileVersion são `2.2.0`, assinatura `NotSigned`.
- `git diff --check` passou com avisos conhecidos de normalização LF/CRLF. Nenhuma alteração foi commitada, tagueada ou enviada.
- **Compatibilidade/rollback**: não há migração de banco; o desktop copia dados legados somente quando o destino ainda não existe. Uma falha de instalação mantém a versão e os dados atuais; o workflow só cria a release depois de aprovar todos os runners. Monitorar Actions e conferir os instaladores e metadados publicados.
- Próxima ação: concluir a verificação local do atualizador; depois integrar a candidata à `main` por revisão humana e publicar uma tag estável nova para habilitar o primeiro update da versão `2.1.0` instalada.

## README e guias públicos — 2026-10-14

- README raiz reorganizado com apresentação do produto, quick start, galeria do escritório/detalhes/configurações, integrações, segurança e matriz de downloads por sistema.
- Capturas `readme-office.png`, `readme-agent.png` e `readme-settings.png` foram feitas com `?mock=1`; nenhum dado de sessão local aparece nelas.
- Guias Habblaud em inglês, português, espanhol e francês agora descrevem o código móvel de uso único, revogação de dispositivos e limites do Quick Tunnel. `apps/office-web/server/README.md`, `DEV/DESKTOP.md`, changelog e índice DEV foram alinhados.
- Só a release `v2.1.0` tem instalador público, para Windows x64. Os pacotes macOS/Linux seguem indisponíveis até builds reais nos runners e publicação do workflow. A candidata `v2.2.0` local continua sem tag/release.
- `git diff --check` aprovado; links locais e capturas conferidos. Nenhum teste de código foi executado para esta alteração documental.

## Inicialização sem janela — 2026-10-14

- **Causa confirmada**: `UtilityProcess` emite no processo pai a mensagem passada a `process.parentPort.postMessage()` como valor direto. O main tentava validar `event.data`; o health podia responder, mas a espera pelo handshake nunca liberava `createMainWindow()`. O processo escondido ainda detinha a trava de instância única.
- **Correção**: validar o payload direto; registrar handshake e janela; mostrar diagnóstico se o renderer falhar; detectar cedo a divergência de versão; permitir que a segunda abertura crie/focalize a janela se os serviços já estiverem prontos. PowerShell de inspeção da porta usa `-WindowStyle Hidden`. A página continua sem reload automático novo.
- **Prova de execução**: fechei a instância invisível antiga (PID 1364) e iniciei o executável `win-unpacked` do build novo. O log registrou handshake, serviços prontos em `4747` e janela pronta; Windows confirmou título `Habblaud` e HWND não nulo. O processo de validação está aberto enquanto o usuário instala o pacote definitivo.
- **Setup no GitHub**: substituído o único asset de `v2.1.0`, `AIOffice-Setup.exe` — 117.961.903 bytes, ProductVersion `2.1.0`, SHA-256 `d0eb5a9656fb7dc72bcbcdf37ef74a642768008c75303405a6dd1d4dfe113ee7`. O alias `latest/download` ainda redirecionou para um asset antigo em cache. Para baixar o binário atual agora, use [AIOffice-Setup.exe](https://github.com/IAPro-Community/AIOffice/releases/download/v2.1.0/AIOffice-Setup.exe?nocache=987654321). A release não tem outro asset.
- **Validação/limites**: build e inspeção ASAR passaram; `node --check` passou; testes automatizados não foram executados. Authenticode continua `NotSigned`. O caminho de saída padrão teve `EPERM`; o build final usou diretório limpo.
- **Próximo passo**: instalar o setup pelo link acima para atualizar `%LOCALAPPDATA%\Programs\AIOffice`; os dados em `%APPDATA%\AIOffice` permanecem preservados.

## Dispositivos do túnel móvel — 2026-10-14

- O Quick Tunnel não tem temporizador de inatividade: fica ativo enquanto o processo do AIOffice e o `cloudflared` permanecerem ativos. Pode ser parado pelo botão **Parar** ou pelo encerramento do servidor; uma saída inesperada do `cloudflared` encerra o listener e aparece como erro. A checagem de sessão de 10 s só fecha streams de um dispositivo revogado; não desliga o túnel.
- **Configurações → Acesso pelo celular** agora inclui uma lista local das sessões: navegador/plataforma aproximados, entrada, última atividade e validade no horário local, além de **Revogar** por dispositivo. A lista existe somente em memória e cada revogação invalida apenas aquele login. Parar ou reiniciar remove todas as sessões; a validade máxima continua em 12 horas.
- O painel busca os dados em segundo plano a cada 15 segundos somente quando está aberto, a aba está visível e o túnel está ativo. A listagem e a revogação são locais, protegidas por loopback/origem e não são encaminhadas pelo listener público. Respostas não contêm cookie, assinatura, chave, User-Agent bruto ou IP.
- Verificação do código: 24 testes focados e a suíte web completa (1.249 aprovados, 10 ignorados), typecheck, traduções (2.369/2.369 por idioma), bundle isolado do cliente e do servidor, e `git diff --check` passaram. O bundle ainda emite o aviso existente acima de 500 kB.
- **Diagnóstico do encerramento automático**: o Quick Tunnel não tem timer de inatividade. Em uma execução anterior, o servidor ouviu na porta `4747` às 14:12 UTC, mas o desktop instalado não reconheceu o handshake do `UtilityProcess`; após exatamente 360 segundos, o supervisor encerrou o serviço. Uma execução posterior recebeu o handshake, confirmou o health e abriu a janela. A fonte atual valida o payload direto do evento, como exige o Electron 44, e mantém nonce e versão. Isso explica o encerramento observado sem atribuí-lo à falta de acesso pelo celular.
- **Estado operacional**: no fim da checagem, `/api/health` respondeu `ok`, versão `2.1.0`, mas o túnel estava `disabled` e `configured=false`. Não reiniciei o AIOffice nem iniciei túnel. A UI/rotas novas do workspace ainda exigem a build normal correspondente antes de serem usadas; o início real e o teste ocioso pelo Quick Tunnel continuam pendentes.
- **Próxima validação**: depois de iniciar a build que contém estas mudanças, iniciar o túnel pelo painel, entrar de dois navegadores/dispositivos, confirmar horários e revogação individual e deixá-lo ocioso para confirmar que permanece ativo. Não usar o link antigo após reinício; o Quick Tunnel gera outro endereço.

## QA visual da gestão de sessões — 2026-10-14

- Prévia local com estado de túnel e dois dispositivos sintéticos, Chrome headless; painel aberto e conferido em 390×844, 768×1024, 1280×800 e 1440×900. Diálogo sempre dentro do viewport, sem overflow horizontal nem erros de console/página. Os botões de revogação tinham nomes acessíveis; revogar um item deixou só o outro no mock.
- Capturas ficam em `%TEMP%/aioffice-mobile-session-{390,768,1280,1440}.png`. Não há dados de usuário, telefone real ou túnel público nesta prévia.

## Porta ocupada e diagnóstico desktop — 2026-10-14

- **Falha confirmada**: o log registrou `A porta 4747 já está em uso`; no momento da investigação a porta estava com um processo Node do launcher gerenciado local.
- **Recuperação**: antes de iniciar o serviço, o desktop identifica o dono TCP. Encerra somente processos reconhecidos como utilitário Electron desta instalação/perfil ou `start-managed.mjs` do AIOffice; usa nonce + endpoint de shutdown quando disponível e envia sinal apenas ao PID identificado como fallback. Resposta 409 por PTYs ativos preserva o processo. Outros aplicativos nunca são encerrados; a mensagem informa nome/PID e opções para liberar/trocar a porta.
- **Mensagens**: porta inválida, conflito persistente, recusa por sessões interativas, erro de instalação do Maestro, pacote incompleto, permissões do sistema, falha ao criar o processo e timeout recebem instruções próprias e apontam para `aioffice.log`. Nenhuma mudança foi feita no renderer, polling ou recarga da página.
- **Build e publicação**: cliente e servidor compilaram. Uma execução do empacotamento bateu em `EPERM` ao renomear o diretório temporário para a saída padrão; o NSIS final foi concluído numa saída limpa `dist/installers-final`. O único asset `AIOffice-Setup.exe` de `v2.1.0` foi substituído: 117.957.737 bytes, ProductVersion `2.1.0`, SHA-256 `aeb0166547d5b578d28e94f9084aa8710003f1152b0a13c8ab7f418d8f65591c`. A release tem somente esse asset; o link estável respondeu HTTP 200 com o mesmo tamanho e digest remoto.
- **Verificação e limite**: sintaxe Node e inspeção do conteúdo ASAR passaram. Testes automatizados não foram executados. Não iniciei nem encerrei o serviço local da porta 4747, para preservar o processo ativo. O asset segue sem assinatura Authenticode.
- **Próximo passo**: baixar novamente pelo link estável `https://github.com/IAPro-Community/AIOffice/releases/latest/download/AIOffice-Setup.exe` e instalar. Se houver sessões ativas numa instância que aceite o handshake, feche-as antes de abrir o desktop.

## Login móvel com código de uso único — 2026-10-14

- **Contrato atual**: Quick Tunnel aleatório e QR continuam iguais. O painel local emite um código aleatório de seis caracteres alfanuméricos, válido por cinco minutos e para um único login. O código é entregue somente pela API local protegida, mostrado/copíado no painel e digitado na página do celular; não vai na URL nem no QR.
- **Armazenamento e ciclo**: somente o SHA-256 do código e seu vencimento ficam em memória. O código é invalidado após uso, substituição, parada, falha/fim do túnel ou reinício do servidor. `configure` não pede senha; credenciais legadas são removidas do `.env` durante a inicialização Quick Tunnel.
- **Safe Browsing**: `autocomplete=one-time-code` evita preenchimento de senha, mas não altera a reputação do Quick Tunnel. Se Chrome mostrar **Perigoso**, não prossiga nem informe o código.
- **Túnel**: o início espera até dois minutos pelo URL do Quick Tunnel. Não existe encerramento por falta de acesso do celular; o processo encerra ao parar explicitamente, desligar o servidor ou quando `cloudflared` sai. Código/sinal e diagnóstico sanitizado do `cloudflared` são registrados em saída inesperada; o timeout registra o stderr disponível.
- **Refresh**: emissão é um POST local; nenhum polling ou reload integral novo foi adicionado. Status e QR continuam usando o fluxo existente em background.
- **Revisão de segurança**: chave de sessão inclui nonce aleatório efêmero por listener, invalidando cookies antigos mesmo se falhar a rotação do segredo persistente. A resposta 401 da API também orienta a informar o código temporário.
- **Validação desta mudança**: build raiz, typecheck do app, i18n (2.353 chaves por idioma), `git diff --check` e 10 testes focados passaram. O launcher normal reiniciou o AIOffice; health respondeu `ok`, versão `2.1.0`. O Quick Tunnel ficou parado após o reinício, sem listener em 4748 ou processo `cloudflared`; nenhum túnel real foi iniciado. O Vite mantém o aviso de bundle acima de 500 kB.
- **Próxima ação**: iniciar o túnel pelo painel para gerar outro link/QR e testar o código novo. Se Chrome marcar o domínio temporário como perigoso, não prosseguir nem digitar o código.

## Instalador desktop: bootstrap do NPM em prefixo novo — 2026-10-14

- **Falha**: após incluir `resources/npm/node_modules`, a primeira inicialização ainda abortava porque `npm root --global` retorna o caminho global antes de criá-lo e `globalRoot()` exigia que a pasta já existisse.
- **Correção**: `globalRoot()` agora valida que o resultado do NPM seja um caminho absoluto e permite o diretório ainda ausente; assim a instalação global inicial pode criá-lo.
- **Instalador atualizado novamente**: o único asset `AIOffice-Setup.exe` de `v2.1.0` foi substituído. ProductVersion `2.1.0`, 117.950.187 bytes, SHA-256 `169884c17cde04e61641b95d3ca8478cbf8b264dafce4f6f410401657d07fd4d`. O link estável respondeu HTTP 200 e o digest da release coincide.
- **Verificação**: `node --check apps/office-web/scripts/maestro.mjs`, `npm run desktop:package:win` e NPM embutido (`11.12.1`) passaram. Com o prefixo real ainda sem `node_modules`, `npm root --global` retornou o caminho absoluto esperado. Nenhuma instalação global foi executada durante a verificação.
- **Próxima ação**: baixar novamente o setup no link estável e executar. O servidor completo não foi iniciado pelo agente; não apague dados de usuário. O setup é manual e continua sem assinatura Authenticode.

## Correção inicial do instalador: dependências NPM — 2026-10-14

- **Falha**: a versão publicada iniciava o NPM embutido sem `resources/npm/node_modules`; o primeiro `require('graceful-fs')` falhava e o serviço encerrava antes de abrir a janela.
- **Correção**: `electron-builder.config.cjs` agora copia a pasta `node_modules` do NPM em um conjunto de recursos separado e falha o build se o NPM do ambiente estiver incompleto.
- **Instalador após a primeira correção**: o único asset `AIOffice-Setup.exe` da release `v2.1.0` ficou com 117.950.239 bytes e SHA-256 `f796f82dcbea7d119fbeff30acfac44068eaa31ad4ecad77c23681e15eeb5479`; ele foi substituído novamente pela correção de bootstrap registrada acima.
- **Verificação**: `npm run desktop:package:win` e `node --check` passaram; o NPM empacotado iniciou pelo Electron e respondeu `11.12.1`, com `graceful-fs` e `semver` presentes. A assinatura continua `NotSigned`; o auto-updater permanece indisponível para esse asset manual.
- **Próxima ação**: baixar novamente o setup no link estável e executá-lo para substituir os arquivos da instalação. Nenhum arquivo de usuário precisa ser removido; o setup preserva `userData`. Código-fonte e workflow continuam apenas no checkout local.

## Auto instalação de mensagens Claude Code — 2026-10-14

- Com `HABBLAUD_MENSAGENS` habilitado, o servidor Node/Desktop instala ou confere `habblaud-mensagens` nas contas Claude Code detectadas sem bloquear o boot; `npm run docker:up` faz a instalação no host.
- A automação instala somente o plugin de mensagens. `npm run mod:install` continua instalando o mod completo, captura de uso e respostas a permissões.
- O resolvedor respeita `HABBLAUD_CLAUDE_BIN`, tenta `~/.local/bin/claude` (`claude.exe` no Windows) antes do `PATH` e exige Claude Code 2.1.287+. `HABBLAUD_MENSAGENS=0` desliga a entrega e evita a instalação automática.
- Instalação local concluída: Claude Code atualizado de 2.1.170 para 2.1.299; `npm run mod:status` confirmou marketplace e plugins `habblaud`, `habblaud-permissoes` e `habblaud-mensagens` na conta `~/.claude`.
- `npm run build`, typechecks, `i18n:check` e `desktop:build` passaram; o pacote Windows contém marketplace e fontes do plugin fora do ASAR. Testes automatizados não foram executados.
- Sessões Claude já abertas precisam de `/reload-plugins` para carregar o plugin. A automação ainda não foi confirmada por uma inicialização limpa do servidor; a próxima ação de validação operacional é abrir/reiniciar o AIOffice com segurança e conferir o log de instalação automática.

## Launcher normal, QR móvel e aviso do Chrome — 2026-10-14

- `start-aioffice.bat` recompila o projeto e inicia `npm run start:office`, com checagem de saúde antes de abrir o navegador. O launcher recusa a porta 4747 ocupada; não encerra processos Node. `start-aioffice-dev.bat` permanece como alias de compatibilidade para o modo normal, e o PowerShell do atalho também foi migrado.
- A interface gera localmente um QR PNG para o link HTTPS ativo, atualiza-o quando o endereço muda e remove-o ao parar o túnel. Não chama serviço externo de QR nem recarrega a página.
- A tela do link e o login explicam que o hostname `trycloudflare.com` é temporário. Se Chrome mostrar **Perigoso**, não prossiga nem informe o código. A autenticação por código não desativa alertas Safe Browsing.
- **Causa confirmada do host bloqueado:** o link anterior entrou no listener `server/index.ts --dev`; depois do login, `/` caía no middleware do Vite, que recusa o host `trycloudflare.com`. O modo dev agora informa que o túnel móvel só está disponível pelo servidor normal e não deixa gerar outro link quebrado.
- `cloudflared` 2026.10.0 já estava instalado em `C:\Program Files (x86)\cloudflared`, com assinatura Authenticode válida, mas não estava no `PATH`. O runtime agora detecta essa instalação e o launcher inclui a pasta ao iniciar o servidor.
- **Launcher corrigido e ativado:** `start-aioffice.ps1` estava ausente, então o `.bat` chamava um arquivo inexistente. O script foi restaurado; agora abre a instância normal já ativa ou inicia uma nova, e mantém a janela de erro visível quando falha. `start-aioffice-dev.bat` foi restaurado como alias.
- **Estado operacional:** `start-aioffice.bat` compilou e iniciou `start-managed.mjs`; `/` em `4747` e `/login` em HTTPS `4748` responderam 200 sem `@vite/client`. O status remoto está `available=true`, `configured=true`, `state=disabled`. O usuário pode clicar **Iniciar túnel** para obter link/QR novo; o endereço antigo não deve ser usado. Não iniciar túnel automaticamente.
- A árvore de trabalho segue modificada; o updater de releases continua recusando instalação automática em checkout local sujo, mesmo no modo gerenciado.

## Desktop Electron — 2026-10-14

- O shell desktop supervisiona o servidor local e só cria a janela depois do sinal de prontidão desta execução e do health check da versão correta. Dados são copiados para `userData` sem mover nem apagar o legado.
- Atualizações nativas pedem confirmação para download e instalação; build sem assinatura não instala atualizações verificáveis de Windows/macOS. O pipeline só publica após typecheck, testes, artefatos e assinatura/notarização.
- A página não faz reload automático periódico: snapshots chegam em background via SSE/polling. O banner permite recarregar por clique; idioma recarrega somente depois de seleção explícita. O Electron chama `loadURL` uma vez no início.
- Correção subsequente: o erro de import nomeado do CommonJS `electron-updater` foi corrigido por import default, com teste de regressão; desktop agora 13/13. `npm run desktop:verify` continuou aprovado: raiz 22/22, web 1.232 aprovados + 10 ignorados em 102 arquivos.
- O NSIS local foi regenerado em `dist/installers/AIOffice-2.0.0-win-x64.exe` (115.700.402 bytes); assinatura local `NotSigned`. O workflow também prepara `AIOffice-Setup.exe` como cópia idêntica do instalador Windows x64 versionado para o link estável da release mais recente.
- O manifesto e lockfile locais foram alinhados à versão GitHub `2.1.0`. O asset inicial `AIOffice-Setup.exe` (115.750.420 bytes, ProductVersion 2.1.0) foi anexado à release existente `v2.1.0`; a falha de dependências e a substituição do arquivo estão registradas na seção mais recente no topo deste handoff.
- O setup atual continua sem assinatura Authenticode e sem `latest.yml`/blockmap; use como download manual. O auto-updater do app não está ativo com essa publicação. O código-fonte da branch e o workflow local não foram enviados, e não foi criada tag ou release.
- macOS/Linux, release CI, assinatura/notarização e auto-update publicado dependem dos respectivos runners/credenciais e não foram validados localmente.

## Orquestrador-Maestro pelo NPM — 2026-10-14

- `npm run setup` instala pelo NPM o pacote oficial `@iapro/orquestrador-maestro-cli@latest` se necessário; o servidor também exige/verifica a camada central antes de aceitar tráfego.
- **Configurações → Orquestrador-Maestro** separa versão instalada da latest do NPM, consulta a cada seis horas e aplica somente após clique. O status chega pelo SSE; esse fluxo não recarrega a página nem reinicia o servidor.
- O instalador desktop inclui NPM e instala o pacote no prefixo persistente do userData no primeiro início. Docker semeia e persiste NPM + camada Maestro no volume `/maestro`, mantendo o rootfs somente leitura.
- A ponte MCP agora lê as regras centrais instaladas e falha claramente se estiverem ausentes. O updater GitHub do AIOffice permanece independente.
- Typechecks raiz/app, build, i18n, sintaxe do helper e `git diff --check` passaram; testes automatizados não foram solicitados. O status NPM somente leitura confirmou CLI global `1.0.1`, igual à versão latest.
- Nenhuma instalação/atualização real foi iniciada. O build desktop `--dir` para Windows x64 confirmou a CLI NPM e o helper no pacote; o app não foi aberto. Docker ainda precisa de validação por build/execução. A operação com uma versão futura do pacote também não foi exercitada.

## Ativação do túnel — registro anterior de 2026-10-14

- Contrato então vigente: **Configurações → Acesso pelo celular**, senha mestra e Quick Tunnel. `cloudflared` precisa estar instalado e disponível no `PATH`; essa autenticação foi substituída pelo código temporário descrito no início deste handoff.
- A interface oferece **Iniciar**, **Parar** e **Copiar link**; o endereço pode mudar ao reativar. O login atual usa código gerado no painel.
- O túnel nunca inicia automaticamente ao ligar o servidor. Após reiniciar, use **Iniciar** explicitamente no painel.
- `npm run remote:setup` e `npm run remote:off` só mostram orientações; não alteram credenciais ou arquivos e não provisionam LAN/VPN/CA. Para encerrar o túnel, use **Parar** no painel.
- A experiência AIOffice deixa de apresentar controles de versão do Habblaud. As referências de upstream abaixo são registros históricos de integração e diagnóstico.
- A atualização de estado do escritório ocorre em segundo plano, sem recarga total automática. O aviso de cliente novo só recarrega a página quando o usuário clica.
- Evidências comunicadas pelo responsável pela implementação: typecheck raiz/app e build aprovados; i18n 2.331/2.331; suíte app com 102 arquivos, 1.232 testes aprovados e 10 ignorados; 37 testes focados de polling/versão/runtime aprovados. O Vite mantém o aviso do bundle acima de 500 kB.
- **Validação operacional pendente**: a documentação e o CLI foram migrados, mas não confirmam que o serviço ativo tenha carregado a implementação nova. `cloudflared` não foi instalado nem verificado nesta sessão; nenhum túnel real foi aberto ou serviço em 4747 reiniciado.
- **Próxima ação registrada na época**: reiniciar a build normal e validar o link; a autenticação por senha descrita aqui foi substituída pelo código temporário no início deste handoff.

## Histórico operacional anterior à migração móvel

> As seções abaixo preservam evidências anteriores de atualização e acesso LAN/VPN com usuário/CA. Elas não são instruções atuais de acesso móvel; prevalece **Login móvel com código de uso único** acima.

## Canal ativo e conexão móvel — 2026-10-13

> Registro histórico anterior à execução do CLI legado em 14/10 e à migração para Quick Tunnel; consulte **Login móvel com código de uso único** acima para o contrato atual.

- A API em `127.0.0.1:4747` ainda é o backend Habblaud `0.10.0`: informa `marmottajr/habblaud` e `v0.11.0`, sem `meta.remoteAccess` ou instalador. Por isso, essa release não é uma atualização do AIOffice e o processo não expõe o estado móvel novo.
- O cliente compilado reconhece atualização somente com `meta.updates.repo === IAPro-Community/AIOffice`; o HTML servido carrega o bundle atual. Se a aba ainda mostrar **Verificar agora** para o Habblaud, force uma recarga com `Ctrl+F5` para trocar a cópia antiga do cliente.
- Para ativar a integração, encerre a instância antiga manualmente e execute `npm run start:office` na raiz deste repositório. A ferramenta bloqueou o encerramento do PID antigo, então ele permaneceu intacto.
- Acesse **Configurações → Acesso pelo celular**. Configure a conta no computador do AIOffice com `npm run remote:setup`, reinicie o servidor gerenciado e conecte o celular pela URL HTTPS privada anunciada (mesma LAN ou VPN privada). Ainda não há usuário, senha, certificado, VPN ou firewall provisionado.

## Atualização do canal de releases — 2026-10-13

- O número/repositório da release do escritório agora vêm do pacote raiz AIOffice quando roda no monorepo; Habblaud standalone continua usando seu próprio `package.json`.
- O verificador em **Sobre** acompanha releases AIOffice exclusivamente. O botão baixa e compila a tag oficial em pasta separada, aplica apenas em instalação Node gerenciada com checkout limpo, preserva artefatos de runtime, reinicia e exige confirmação da versão para retirar a badge.
- A instalação automática fica bloqueada em Docker/dev, supervisor ou opções de Node, checkout com alterações locais ou commits fora da tag oficial, submódulos, dados dentro da raiz ou PTYs ativos. Backups/journal de operações interrompidas ficam preservados para recuperação manual.
- Acesso remoto opcional usa HTTPS autenticado em uma segunda porta, com leitura por padrão e permissões explícitas; cobre Wi-Fi e VPN privada. Streams respeitam logout/expiração. `--new-ca` renova a CA ao adicionar um domínio que ela não cobre; cada dispositivo precisa remover a antiga e instalar a nova. Continua desligado até configuração com `npm run remote:setup`; nenhuma senha, CA, regra de firewall ou VPN foi provisionada.
- A integração Habblaud é seletiva. `npm run check:habblaud-upstream` consulta a release e exibe o diff sem baixar código ou modificar a árvore.
- A comparação até Habblaud `v0.11.0` está registrada em `apps/office-web/upstream-habblaud.json`. Não declarar paridade total: o manifesto lista correções já presentes e recursos adiados.
- Validação desta rodada: root/app typecheck, build, i18n (2.271/2.271 por idioma), `node --check`, ajuda de setup remoto e `git diff --check` passaram. Testes automatizados não foram executados. A simulação `npm run release` não publicou nada e apontou branch fora de `main`, árvore suja e tag local `v2.0.0` existente.
- Ativação pendente: serviço em `127.0.0.1:4747` continuou na versão `0.10.0`; health indicou `pty:false`, 6 sessões Codex e 10 OMP. O processo não tem pai ativo e a ferramenta bloqueou a tentativa de encerrá-lo, portanto não houve encerramento forçado. Para carregar a build, encerre a instância antiga e rode `npm run start:office` na raiz.
- Nenhuma release, credencial/certificado remoto, commit, push ou implantação foi criada.

## Estado atual — 2026-10-13

- A build de cliente está disponível no serviço local; o processo Node ainda serve o backend Habblaud `0.10.0` e não foi reiniciado. A API mais recente retornou 6 sessões Codex, 10 OMP e 0 Claude Code. O terminal OMP mostra atividade e conversa com o selo de provedor correto.
- A conta Claude Code local existe, mas seus dois registros e transcripts são de 22/09/2026 e não têm processo CLI correspondente ativo. O CLI `claude` está instalado na versão 2.1.170. Os processos `claude.exe` em execução pertencem ao Claude Desktop 2.37337.1; também havia uma aba Claude.ai em login.
- O usuário confirmou que a atividade ausente ocorreu em Claude Desktop → Chat/Cowork. A configuração `aioffice` está presente e o processo MCP estava rodando, mas o Habblaud não tinha agente Claude: a bridge só cria atividade quando o modelo chama `aioffice_heartbeat` ou `aioffice_report_activity`.
- MCP no Chat/Cowork não transmite automaticamente cada mensagem ou o transcript para o Habblaud. A bridge disponível é limitada a presença e resumos explícitos; não oferece mensagens de volta nem leitura do histórico.
- A extensão OMP está versionada em `apps/office-web/mod/omp/aioffice-bridge.ts`. Use `npm run omp:install`, `npm run omp:status` e `npm run omp:uninstall` na pasta `apps/office-web` para instalar, conferir e remover a ponte.
- Mensagens para Claude Code e OMP só ficam disponíveis quando a extensão da sessão consulta a caixa de entrada; Codex usa o entregador próprio. O estado `delivered` depende de confirmação do agente.
- Uma sessão OMP que já estava aberta antes da atualização precisa ser reaberta para carregar a extensão. O envio real ainda aguarda confirmação do usuário; nenhum prompt de teste foi enviado nesta preparação da release.
- Fontes de CLI integradas de ponta a ponta: Claude Code, Codex e OMP. Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm cobertura completa. Configuração MCP de Desktop Chat/Cowork disponibiliza ferramentas, sem ingestão automática de sessão.
- A build segue emitindo o aviso do bundle principal acima de 500 kB; a divisão de chunks fica como melhoria futura.

## Próxima ação registrada em 2026-10-13 (histórico)

Reiniciar o servidor MCP do Claude Desktop para carregar a bridge compilada e suas descrições corrigidas. Depois, pedir explicitamente a Claude que registre a conversa no Habblaud e validar presença/atividade. Não declarar captura passiva de Chat/Cowork sem uma API oficial de eventos. Em outra etapa, reabrir uma sessão OMP e validar composer, prompt e ACK `delivered`.

## Atualização — Central de trabalho (2026-10-13)

- Build concluída com Central de trabalho por projeto, fila de atenção, catálogo de integrações/capacidades e seis modelos reutilizáveis em português.
- Busca e filtros distinguem conta de ferramenta; ajuda e histórico mostram a cobertura disponível. O catálogo deixa explícitos os limites do MCP e os adaptadores ainda incompletos.
- A interface compilada foi aberta em uma aba de QA; para vê-la na sua janela, recarregue o Habblaud. O backend em execução não foi reiniciado, então mudanças de rotas/servidor ainda aguardam uma reinicialização segura.
- Nenhuma mensagem ou aprovação foi enviada, e nenhuma sessão foi interrompida. No CLI, o executor do Orquestrador-Maestro agora exige `--maestro-fallback`; o caminho mantém as escritas automáticas dos artefatos de demonstração. O runtime e o broker não foram alterados.

## Atualização — Layout, visibilidade e temas (2026-10-13)

- Preferência visual confirmada: preservar o pixel-art do Habblaud; adicionar variações de cenário e de paleta da interface.
- Quatro paletas disponíveis: Noite (padrão), Mata, Âmbar e Alto contraste. Doze cenários selecionáveis: Original, Natal, Halloween, Jardim, Aurora, Pôr do sol, Ano-Novo, Carnaval, Páscoa, Dia dos Namorados, Festa Junina e Independência; Automático mantém o calendário sazonal.
- Painéis e textos secundários ganharam mais contraste e legibilidade. Os seletores de tema foram reorganizados para desktop/celular, com foco e navegação por teclado. O cabeçalho compacto evita cortar a marca em telas de 320–410 px.
- Cenários novos incluem elementos pixel-art próprios (flores, cristais, sol, folhagem, céu e tapetes), mantendo os sprites e a identidade existentes.
- Typecheck, build, i18n e QA visual passaram. Capturas ficam em `apps/office-web/.frontend-excellence/after/` (diretório ignorado pelo Git).
- Para ver a alteração no Habblaud local, recarregue a página servida em `127.0.0.1:4747`; a build local já foi atualizada. Nenhum backend foi reiniciado e nenhuma sessão ativa foi interrompida.

## Atualização — Automação de temas por datas e horários (2026-10-13)

- No modo Automático, datas comemorativas brasileiras/internacionais têm prioridade e, nos outros dias, quatro faixas locais escolhem o cenário por horário. O calendário está ativado por padrão e pode ser desligado.
- Carnaval (sexta a terça antes da Quaresma) e Páscoa (sexta a domingo) são calculados anualmente; Dia dos Namorados considera 14/02 e 12/06, além de Festa Junina, Independência, Halloween, Natal e Ano-Novo.
- Os horários e cenários de cada faixa são editáveis nas Configurações e ficam salvos no navegador. Entradas inválidas ou fora de ordem são rejeitadas. A agenda usa o fuso do dispositivo; timelapse segue o instante reproduzido.
- Os seis temas de datas comemorativas também podem ser escolhidos diretamente na grade principal e mantidos fixos.
- Cenários de eventos receberam paletas, tapetes, adornos e decoração de janela em pixel-art. QA visual passou em 390/768/1280/1440 px; em 320 px o popover cabe na largura e usa rolagem vertical.
- A build atual está disponível ao recarregar `127.0.0.1:4747`; o servidor não foi reiniciado. Próximo passo seguro: testar com o usuário se desejar outra lista de eventos ou outros horários padrão.

## Atualizações automáticas do desktop — diagnóstico 2026-10-14

- A cópia limpa do `main` está atualizada no commit `01e59b3f0e5b7950986859b4ed5d7a9f1f1847be` (`v2.1.0`). A árvore principal continua em branch de integração, com alterações locais e versão candidata `2.2.0`; preserve-a, sem reset/pull.
- A instância instalada responde `2.1.0`, igual à release GitHub mais recente. O log e `/api/health` confirmam que a checagem da UI está desligada pelo `HABBLAUD_UPDATE_CHECK=0` fixado no ambiente desktop.
- O updater Electron também não pode instalar a release atual: executável sem Authenticode, asset único sem `latest.yml` e nenhuma entrada de assinatura nas listagens de secrets/variables do repositório (secrets de organização não foram inspecionados).
- O shell desktop e workflow de release estão somente na árvore local; `origin/main` ainda não os contém. A publicação segura exige integrar e publicar uma release nova com assinatura e metadados do updater. Não tente ativar apenas o `UpdateInstaller` Node para o app empacotado.
- Nenhum código foi alterado nem release/commit/tag foi publicado nesta investigação. Referência detalhada e evidências estão em `DEV/DESKTOP.md` e `DEV/VERIFY.md`.
