# WORKLOG — AIOffice

## 2026-10-27 — Logos dos provedores no painel
- **Mudança**: substituí os marcadores de conta por letras por logos locais de Claude, Codex, OMP e OpenCode em chips, tags, filtros, histórico, ajuda, integrações, uso e mapa. Registrei as fontes dos vetores e a licença do ícone OMP junto aos assets.
- **Motivo**: identificar cada ferramenta pelo próprio símbolo nas referências do painel.
- **Verificação**: typecheck raiz e web, build, `i18n:check`, diff sem whitespace inválido e inspeção visual da prévia local aprovados. `i18n:check` ainda lista quatro traduções de configurações V2 do mapa ausentes, anteriores a esta mudança. Testes automatizados não executados.
- **Publicação**: atualização versionada em commit e enviada à branch `main` conforme pedido; sem tag ou release de instaladores.

## 2026-10-26 — Tema V2 e organização do mapa
- **Mudança**: tornei V2 o padrão, mantive V1 selecionável e reorganizei recepção, copa, lounge e salas de projeto. Separei o pingue-pongue do sofá e cada posto de trabalho; adicionei 17 variantes de quadros/pôsteres derivadas dos assets originais.
- **Verificação**: gerador das artes, build e typecheck aprovados; comparação visual V1/V2 com bonequinhos ativos. Testes automatizados não executados.
- **Distribuição**: alteração de código; não foi criada uma release.

## 2026-10-15 — Release v2.4.4 publicada: extensão Chrome
- **Pedido:** melhorar a extensão instalada para refletir o escritório AIOffice, separar agentes por projeto, habilitar filtros, personagens 2D, terminal e envio de comandos/instruções; documentar e entregar ZIP pelo GitHub.
- **Produto:** painel lateral com agrupamento por projeto, filtros por projeto/tipo, avatares sem imagens quebradas, feed de atividades, preferências por tipo de notificação, visualização de terminal e envio à fila local do agente.
- **Integração:** Native Messaging host Go incluído pelo instalador Windows, registro por usuário, conexão ao serviço ativo ou inicialização em segundo plano do Desktop. A extensão é distribuída separadamente e requer Chrome aberto para notificações.
- **Documentação/distribuição:** tutorial no AIOffice Configurações; README e `DEV/DESKTOP.md` descrevem instalação, privacidade e limites. Prévia SVG fictícia está rotulada como ilustrativa. ZIP publicado na release; Chrome Web Store não incluída.
- **Versão:** `2.4.4`; `CHANGELOG.md` registra as mudanças. Release v2.4.3 permanece intacta.
- **Verificação local:** `npm run desktop:verify` passou (22 testes raiz, 1.279 web/10 ignorados, 36 desktop, 23 extensão, Go host, typechecks, build e i18n). Empacotamento Windows e smoke do app passaram; ZIP validado com 18 arquivos. Evidências e hashes locais em `DEV/VERIFY.md`.
- **Publicação:** commit `6720cc69` enviado a `main`; tag/release `v2.4.4` publicada como latest. Actions [38818251334](https://github.com/IAPro-Community/AIOffice/actions/runs/38818251334) passou em verificação, builds e smokes nativos, e comparação de nomes/tamanhos/SHA-256 dos cinco assets. Hashes remotos em `DEV/VERIFY.md`.

## 2026-10-15 — Refresh temporário Windows/Linux sem tag
- **Pedido**: retirar os downloads macOS enquanto a conta Apple não permite emitir Developer ID e atualizar a distribuição sem criar tag/versão.
- **Limites**: manter `v2.4.3` intocada; confirmar que fontes empacotadas seguem idênticas à tag; publicar somente `.exe`, `.AppImage`, `.deb` e `latest-linux.yml`; sem assets/macOS ou manifesto Mac.
- **Implementação**: workflow manual `refresh-windows-linux.yml`, manifesto Linux-only, teste focado e notas/documentação atualizadas. Recompila nos runners nativos e valida o conjunto remoto por nomes, tamanho e SHA-256.
- **Risco comunicado**: manter `2.4.3` atualiza os downloads da release, mas não dispara o updater interno, que só oferece versão superior.
- **Publicação concluída**: Actions [run 38772157012](https://github.com/IAPro-Community/AIOffice/actions/runs/38772157012) passou. `v2.4.3` continua apontando para `8393eaeb88c9fa658231499695e407ac4d575bb2`; não houve tag nova. API confirmou os quatro assets Windows/Linux e seus tamanhos/digests em `DEV/VERIFY.md`; os cinco assets macOS estão ausentes. O run preliminar `38772030092` parou no guard de origem antes de alterar a release e foi corrigido antes da publicação bem-sucedida.
- **Próximo contexto**: uma mudança de produto requer nova versão/tag para o updater reconhecer; para voltar a oferecer macOS, configurar assinatura Developer ID/notarização e publicar builds validados.

## 2026-10-15 — Gatekeeper rejeita os pacotes macOS v2.4.3
- **Causa:** job `38676380641` não recebeu credenciais Apple; o Electron Builder reportou zero identidades e pulou assinatura. Os assets foram publicados unsigned, e o Gatekeeper os apresenta como danificados/modificados.
- **Proteção publicada:** commit `944b831` em `main` exige os cinco secrets e valida `codesign`, `spctl` e `stapler` em ambos `.dmg`/`.zip`; README público deixa de oferecer os links macOS até haver uma build assinada.
- **Aviso remoto:** notas da release pública `v2.4.3` atualizadas para orientar que os assets macOS não sejam instalados.
- **Validação/pendência:** `git diff --check`, `bash -n scripts/verify-macos-release.sh` e parse YAML passaram. A checagem funcional exige runner macOS. Não há credenciais Apple disponíveis; geração e publicação de nova versão continuam bloqueadas até cadastrá-las no GitHub.

## 2026-10-15 — Release multiplataforma v2.4.3 publicada
- **Escopo**: consolidar os deltas locais posteriores à v2.3.0 em um clone de publicação limpo, preservando o checkout original com merge aberto.
- **Desktop instalado**: oferecer instalar/atualizar CLIs oficiais Codex, Claude Code e OMP em pasta privada do AIOffice; progresso/cancelamento pela UI; autenticação em terminal oficial e reinício somente após confirmação.
- **Antigravity**: registrar sessões App/IDE/CLI, ler histórico com validação de caminhos e entregar mensagem na próxima invocação via hook local validado, sem sobrepor decisões nativas de permissão.
- **Produto e distribuição**: integrar a arte oficial completa aos ícones do app e do instalador; documentar os CLIs e downloads Windows/macOS/Linux; workflow gera e testa os builds nativos e só publica a release depois de validar os nove assets e seus hashes.
- **Diagnóstico e UX**: bootstrap Electron captura erros anteriores à inicialização do `main.mjs`; estado de atualizações é comunicado em background, sem refresh integral automático. O smoke agora isola perfil/log e configura sandbox e GPU por runner.
- **Falha v2.4.0**: Actions falhou no typecheck por caracteres literais no fim de cinco fontes; nenhuma release foi criada. A tag permanece intacta.
- **Falha v2.4.1**: source verification e builds dos quatro targets passaram, mas os smokes Windows/macOS/Linux falharam por restrições do runner e caminho do log; a release foi cancelada antes da montagem dos assets. Não mover nem reutilizar essa tag.
- **Falha v2.4.2**: origem, quatro builds e quatro smokes passaram. O job final enviou os nove arquivos para um draft; `GET /releases/tags/{tag}` respondeu 404 porque a API não expõe drafts nesse endpoint. A release permaneceu oculta e não foi publicada.
- **Correção v2.4.3**: o workflow seleciona o draft pela lista autenticada de releases, confirma que continua draft e compara nomes, tamanhos e SHA-256 antes de publicar.
- **Verificação de código**: `npm run desktop:verify` passou (22 testes raiz, 1.279 web/10 ignorados, 31 desktop, i18n 2.430/2.430 em en/es/fr, typechecks, build e sintaxe); smoke local Windows v2.4.2 passou com perfil temporário; `git diff --check` e `npm run release -- --dry-run` passaram.
- **Publicação**: tag `v2.4.3` no commit `8393eaeb88c9fa658231499695e407ac4d575bb2`; workflow `38676380641` completou com sucesso. Release API e `/releases/latest` confirmam v2.4.3 como latest, estável e com exatamente nove assets; tamanhos e hashes estão em `DEV/VERIFY.md`.
- **Verificação do instalador publicado**: setup baixado do GitHub, 122.835.769 bytes, SHA-256 `50a3f5337c92b82f13df94c374a87cbd1bd2112c3239de2e5aef1e749f2d90eb`, ProductVersion/FileVersion `2.4.3`, Authenticode `NotSigned`; ícone extraído corresponde à arte atual. Setup local também passou no smoke Windows.
- **Próximo contexto**: release estável atual v2.4.3. O draft oculto v2.4.2 registra uma tentativa anterior que falhou apenas no endpoint de busca por tag; a validação corrigida publicou v2.4.3.

## 2026-10-14 — Publicação v2.3.0 concluída
- **Mudança**: release estável publicada no GitHub a partir de `762a500bbde264f241dabd16c2e40b107ec4c7f8`, com os nove assets Windows, macOS Intel/Apple silicon, Linux x64 e manifestos de atualização.
- **Motivo**: distribuir as melhorias acumuladas desde a `v2.2.1`, incluindo suporte a mensagens no desktop instalado, distribuição multiplataforma e interface móvel.
- **Verificação**: preflight `38659997554` e workflow de tag/publicação `38660712556` concluíram com sucesso. Release API confirmou os nove nomes, tamanhos e SHA-256; valores estão em `DEV/VERIFY.md`.
- **Limites**: macOS unsigned, sem notarização e sem updater automático; CLI e autenticação do provedor continuam externas. Nenhuma mensagem foi enviada a sessões reais do usuário.
- **Próximo contexto**: a v2.3.0 executa `codex queue` pelo serviço local e não exige a ponte npm no desktop; determinar se a próxima alteração deve oferecer instalação dos CLIs oficiais ausentes, além das pontes AIOffice que já são automatizadas.

## 2026-10-14 — Mensagens funcionais no desktop instalado
- **Falha**: a interface orientava manter `npm run codex:bridge` ativo no host quando Habblaud rodava em Docker; no Windows, a CLI Codex também podia ficar invisível atrás dos shims NPM.
- **Correção**: no desktop/Node local, descobrir o executável nativo do Codex nas instalações globais oficiais do NPM para Windows/macOS/Linux e executar sem shell. Instalar/atualizar no boot somente as pontes próprias do AIOffice para Claude Code e OMP em perfis existentes, preservando extensões de terceiros e criando backup ao atualizar. Melhorar erros e instruções; o auxiliar externo continua necessário só no Docker.
- **Por quê**: a distribuição instalada deve entregar suas integrações sem scripts npm/PowerShell à parte em execução; login e CLIs dos fornecedores continuam sendo pré-requisitos próprios.
- **Interface móvel**: melhorias responsivas compatíveis do workspace, login com botão para colar o código e envio automático aos seis caracteres; a página não ganhou reload integral.
- **Verificação**: `npm run desktop:verify` passou (typechecks, build, 22 testes raiz, 1.268 testes web com 10 ignorados, 16 desktop, i18n 2.402/2.402 e sintaxe); 49 testes focados passaram e 6 foram ignorados; a CLI Codex local respondeu a `--help` e `queue --help`. A entrega real não foi disparada para não enviar mensagem a uma conversa do usuário. Nenhum reload integral/polling novo foi adicionado.
- **Preflight atualizado**: execução 38659549147 identificou um teste de matriz que simulava PATH POSIX usando o separador do Windows; o resolvedor agora usa o delimitador do sistema que executa o servidor. Repetir CI após este commit.
- **Release**: concluído em `v2.3.0`; detalhes, IDs dos workflows e assets publicados estão na seção inicial deste arquivo e em `DEV/VERIFY.md`.

## 2026-10-14 — Distribuição nativa macOS/Linux (v2.3.0)
- **Mudança**: matriz de release adiciona macOS Intel/Apple silicon e Linux x64, manifestos para updater, downloads estáveis no README e assinatura Apple opcional.
- **Verificação**: `npm run desktop:verify` aprovado localmente; instalador Windows x64 2.3.0 empacotado localmente (118.453.440 bytes, SHA-256 `65622CD3AD4F2B39BD6431BD3B0CD5E05A872009EFEBD59C106C4A3F0269F1E2`, `NotSigned`). CI manual `38653090528`: verificação, Windows e os dois builds macOS passaram. Build Linux produziu os pacotes, mas a checagem expôs os nomes nativos `x86_64.AppImage` e `amd64.deb` em vez dos aliases x64 do README.
- **Correção**: usar nome de asset x64 explícito para ambos os formatos Linux e definir `desktopName=aioffice` com sincronização do arquivo `.desktop`, alinhando launcher e WM_CLASS.
- **Revalidação**: CI `38653586066` aprovou os quatro builds; `38654072400` repetiu o gate e os quatro builds com ações de artifacts v7/Node 24. O log Linux confirmou os aliases x64.
- **Preflight final**: CI `38654902095` aprovou o gate, os quatro runners, a montagem dos artifacts, `latest-mac.yml`, `latest-linux.yml`, os nove arquivos exigidos e as notas de release. A publicação foi corretamente ignorada por ser `workflow_dispatch`.
- **Estado**: ainda sem tag/release `v2.3.0`; a publicação está pronta para `npm run release -- --publish` em `main` limpa e sincronizada. Os builds macOS continuam sem assinatura/notarização Apple configurada.

## 2026-10-14 — Atualizador Windows pela release oficial do GitHub
- **Mudança**: o Electron consulta releases estáveis da API GitHub, valida `AIOffice-Setup.exe` pelo tamanho e SHA-256, baixa pela URL específica da tag e abre o instalador interativo após confirmações. A seção **Sobre** recebe estado/progresso por IPC e não recarrega a página. O workflow publica um asset estável Windows x64; assinatura Authenticode tornou-se opcional.
- **Correção adicional**: corrigi `AgentStats.cost` para o campo compartilhado correto `costUSD`, o que removia uma falha de typecheck na fonte OMP; acrescentei a expectativa correspondente no teste existente.
- **Verificação**: typecheck root/app, build, i18n, sintaxe desktop, inspeção do ASAR, parse YAML do workflow e `git diff --check` passaram. NSIS `2.2.0` gerado em `dist/installers-aioffice-updater-final2`; 117.969.885 bytes, SHA-256 `2927ACEFD31A08E26AE9BA4E7100E7906481960E2896C15AFF325BB70F48BA10`, `NotSigned`. Suítes automatizadas e update via release futura não foram executados.
- **Estado**: GitHub ainda só publica `v2.1.0`; o app instalado `2.1.0` não contém o atualizador novo e precisa receber a primeira versão posterior manualmente. Sem commit, tag ou push; integração/publicação requer revisão humana. Vite mantém aviso conhecido de bundle acima de 500 kB.

## 2026-10-14 — README e documentação da distribuição
- **Mudança**: reestruturei o README público com galeria de capturas atuais, quick start, integrações, segurança e downloads por sistema; sincronizei os guias Habblaud nos quatro idiomas e a documentação operacional/release.
- **Capturas**: sala, detalhes do agente e Configurações produzidos em Chromium pelo simulador local (`?mock=1`), sem sessões ou contas reais.
- **Precisão de distribuição**: última release pública `v2.1.0` contém somente `AIOffice-Setup.exe` Windows x64. README aponta macOS/Linux para a página de releases e informa que ainda não há binários publicados. A candidata local `v2.2.0` continua sem release.
- **Verificação**: capturas inspecionadas; referências locais conferidas; `git diff --check` aprovado com avisos de normalização LF/CRLF. Sem testes de código nesta etapa documental.

## 2026-10-14 — Preparar candidata de release AIOffice v2.2.0
- **Mudança**: alinhei versão e lockfile em `2.2.0`, organizei as notas completas da release e repus a seção histórica `v2.1.0` a partir das notas oficiais.
- **Motivo**: reunir os updates de acesso móvel, desktop, Maestro, launchers e pipeline sob a próxima versão sem publicar uma árvore incompleta.
- **Verificação**: `npm run desktop:verify` aprovado; `npm run release -- --dry-run` gerou as notas; `git diff --check` aprovado; instalador NSIS x64 local produzido sem assinatura (117.961.753 bytes).
- **Estado/continuação**: candidato não commitado/tagueado/publicado. A branch diverge da `main`, e os secrets/variables remotos de assinatura não estão configurados; integrar em `main`, configurar credenciais e validar macOS/Linux no CI antes de publicar.

## 2026-10-14 — Corrigir janela que não abria após iniciar o servidor
- **Causa**: o evento `message` do Electron `UtilityProcess` entrega o objeto publicado pelo servidor diretamente. O main lia `event.data`, mantinha `backendReady=false` e esperava até seis minutos mesmo com a API saudável; sem `serverUrl`, a janela não era criada e uma segunda abertura batia na trava de instância única.
- **Correção**: o main valida a mensagem direta, registra o handshake e cria/recupera a janela; falhas de carregamento, encerramento do renderer e divergência de versão agora geram diagnóstico. A consulta PowerShell da porta recebe `-WindowStyle Hidden`. Nenhum reload periódico ou mudança no renderer foi introduzido.
- **Verificação local**: `node --check` passou; build do cliente/servidor e NSIS x64 concluíram numa saída limpa após `EPERM` na pasta de saída padrão. O ASAR contém os caminhos corrigidos. O executável empacotado foi iniciado: log confirmou handshake, health na porta `4747` e janela pronta; Windows reportou título `Habblaud` e HWND não nulo.
- **Release**: substituído o único asset `AIOffice-Setup.exe` da release existente `v2.1.0`; 117.961.903 bytes, SHA-256 `d0eb5a9656fb7dc72bcbcdf37ef74a642768008c75303405a6dd1d4dfe113ee7`. `gh release view` confirmou tamanho/hash. O alias `latest/download` ainda servia um redirecionamento em cache durante a verificação; o link direto à tag com query de cache retornou o tamanho atual.
- **Próxima ação**: instalar o setup pelo link direto registrado em `DEV/HANDOFF.md` para substituir os arquivos instalados. Authenticode continua `NotSigned`; testes automatizados não foram executados.

## 2026-10-14 — Persistência do túnel e gestão de sessões móveis
- **Pedido**: manter o túnel ativo enquanto o AIOffice estiver rodando, sem encerramento por inatividade, e mostrar dispositivos autenticados com data/hora e revogação individual.
- **Túnel**: auditoria confirmou que o gerenciador não tem timer de inatividade; seus timers são a espera de até dois minutos pela URL inicial e a tolerância de dois segundos para o processo sair ao ser parado. Há uma revalidação de sessão a cada 10 s para desconectar streams revogados, sem desligar o túnel. Não foi adicionado timer de ociosidade. Parar explicitamente, desligar o servidor ou a saída do `cloudflared` encerram o listener.
- **Servidor**: cada login cria registro efêmero com ID aleatório separado do token, etiqueta aproximada de navegador/plataforma, entrada, última atividade e expiração de 12 horas. Listagem projeta somente esses metadados; logout, revogação e fechamento do listener removem o registro.
- **Proteção**: endpoints exigem loopback local; `isRemoteRequest`, origem externa e `Sec-Fetch-Site: cross-site` são rejeitados. Revogação exige Origin local exato e JSON vazio. O listener público continua recusando `/api/remote-access/*`.
- **Interface**: lista responsiva com horário local, validade, estados de carregamento/vazio/erro e botão por sessão. Faz fetch pontual e atualiza DOM; polling de 15 s roda só com painel aberto, aba visível e túnel ativo. Nenhum `location.reload` foi adicionado.
- **Verificação**: suíte web 1.249 aprovados e 10 ignorados; 24 testes focados; typecheck; i18n 2.369/2.369 por idioma; bundles cliente/servidor produzidos em pasta temporária para preservar a instância instalada; `git diff --check` passou. O aviso de bundle do Vite acima de 500 kB permanece.
- **Operação**: health local `ok`, versão `2.1.0`; túnel estava desligado no encerramento da verificação. Não reiniciei o app nem iniciei um túnel público para preservar a instância. O app instalado não carregou as alterações do workspace; a próxima build/start normal é necessária antes da validação real com dispositivos.
- **Causa do encerramento anterior**: o log mostrou o servidor pronto para ouvir às 14:12 UTC, mas sem handshake confiável recebido pelo desktop; após 360 segundos, `waitForServer` encerrou o processo local. O handler antigo esperava `event.data`, embora o Electron 44 entregue o payload diretamente. A fonte atual valida o payload direto com nonce e versão; uma execução posterior registrou handshake e health aprovados. Esse timeout era de inicialização do desktop, não de inatividade do túnel.
- **Estado ao concluir a checagem operacional**: serviço local respondeu `ok`; acesso remoto reportou `disabled` e `configured=false`. Nenhum túnel foi iniciado. O timeout de 120 segundos continua valendo somente para a partida que não recebeu URL inicial; não há prazo de inatividade após o túnel ficar ativo.

## 2026-10-14 — QA visual isolado da gestão de sessões
- Prévia em Chrome headless com sessões sintéticas e painel aberto em 390×844, 768×1024, 1280×800 e 1440×900; diálogo dentro do viewport, sem overflow horizontal e sem erros do browser.
- Dois botões **Revogar** tinham nomes acessíveis. O mock removeu somente a sessão escolhida, mantendo a segunda. Capturas temporárias em `%TEMP%/aioffice-mobile-session-{390,768,1280,1440}.png`.
- Nenhuma sessão real ou túnel público foi usado; login e revogação reais seguem pendentes da próxima build carregada.

## 2026-10-14 — Recuperação segura da porta no desktop
- **Relato**: o servidor encerrava na abertura porque `4747` já estava ocupada; log confirmou `EADDRINUSE`.
- **Correção**: Electron verifica listeners antes de iniciar. Pode cooperar com o servidor via nonce local; para serviço legado, sinaliza somente o PID identificado como utilitário Electron próprio ou `start-managed.mjs`. Se a API recusar por PTYs ativos, não mata. Outro processo fica intacto e gera diagnóstico com nome/PID. `HABBLAUD_PORT` inválida agora informa faixa e valor aceito.
- **Erros de partida**: mensagens específicas para conflito de porta, sessões abertas, bootstrap do Maestro, instalação incompleta, permissões/bloqueio de processo e timeout, mantendo as últimas mensagens e caminho do log.
- **Verificação/publicação**: Node syntax checks, smoke da porta e leitura do ASAR aprovados. Build do cliente/servidor passou; após `EPERM` ao renomear a pasta temporária para a saída padrão, o NSIS foi concluído numa saída limpa. Setup `AIOffice-Setup.exe` da release `v2.1.0` substituído; 117.957.737 bytes, SHA-256 `aeb0166547d5b578d28e94f9084aa8710003f1152b0a13c8ab7f418d8f65591c`; release continua com um único asset e URL estável HTTP 200.
- **Limites**: sem testes automatizados nem início/parada funcional do servidor, pois `4747` estava ocupada por `start-managed.mjs` e pode haver sessões em andamento. Authenticode permanece `NotSigned`. Nenhum refresh de página foi adicionado; nenhuma fonte foi enviada.

## 2026-10-14 — Login móvel por código temporário
- **Pedido**: manter Quick Tunnel + links aleatórios/QR, substituir senha mestra e ajustar o campo do celular para código.
- **Implementação**: painel local emite código aleatório alfanumérico de seis caracteres, válido por cinco minutos e uma autenticação; segredo só em memória (hash), fora de URL/QR, `.env` e logs. Trocar, usar, parar ou reiniciar invalida o código; parar também derruba sessões. Campo remoto usa `autocomplete=one-time-code` e entrada de texto normalizada.
- **Segurança**: emissão limitada a POST local por loopback + Origin; gerenciamento segue negado pelo listener remoto; throttle de login permanece. Aviso Chrome/Safe Browsing é preservado e não pode ser removido pelo código.
- **Persistência**: `.env` não armazena mais senha de acesso; credenciais antigas são removidas na inicialização configurada.
- **Revisão final**: cada listener agora mistura um nonce efêmero na chave das sessões, então cookies antigos deixam de valer mesmo se não for possível gravar a rotação do segredo em disco. A resposta 401 da API também orienta a usar o código temporário, não a senha antiga.
- **Túnel**: início agora espera até dois minutos pela URL; não há encerramento por ausência de acesso móvel. Saída inesperada registra código/sinal e stderr sanitizado; timeout de início também registra o stderr disponível.
- **Verificação**: build raiz, typecheck do app, i18n 2.353/2.353 por idioma, `git diff --check` e 10 testes focados passaram. Vite ainda avisa que o bundle principal supera 500 kB. Quick Tunnel real e inspeção visual ao vivo não foram testados.
- **Ativação**: launcher normal reiniciou o servidor; health `ok`, versão `2.1.0`. O túnel ficou desligado, porta 4748 fechada e sem processo `cloudflared`; o próximo início manual gera outro link/QR.

## 2026-10-14 — Corrige bootstrap NPM no prefix global vazio
- **Sintoma**: depois da correção que incluiu `graceful-fs`, o primeiro início parava porque `npm root --global` retornava um caminho válido que ainda não tinha sido criado; `globalRoot()` exigia a existência física antes de instalar o pacote.
- **Correção**: validar caminho absoluto e aceitar diretório global ausente, para que a instalação inicial do Maestro possa criá-lo.
- **Artefato**: `AIOffice-Setup.exe` substituído novamente na release `v2.1.0`; 117.950.187 bytes; SHA-256 `169884c17cde04e61641b95d3ca8478cbf8b264dafce4f6f410401657d07fd4d`. A URL estável retornou HTTP 200 e o digest GitHub coincidiu.
- **Verificação**: `node --check`, `npm run desktop:package:win`, CLI NPM interna `11.12.1` e consulta `root --global` com o prefixo ainda inexistente. Não executei instalação global nem suítes automatizadas.
- **Próximo passo**: baixar novamente o setup atualizado e executar. O servidor inteiro não foi iniciado durante a verificação; código-fonte não foi enviado ao GitHub.

## 2026-10-14 — Corrige setup que encerrava no primeiro início
- **Sintoma reproduzido**: o NPM empacotado não encontrava `graceful-fs`; `npm-cli.js` e `lib/cli.js` estavam presentes, mas `resources/npm/node_modules` não foi copiado. O servidor abortava antes de abrir a janela do Electron.
- **Correção**: o Electron Builder agora inclui a pasta de dependências do NPM como conjunto de recursos independente e exige uma instalação NPM completa na máquina de build.
- **Artefato**: `AIOffice-Setup.exe` substituído na release existente `v2.1.0`; 117.950.239 bytes; SHA-256 `f796f82dcbea7d119fbeff30acfac44068eaa31ad4ecad77c23681e15eeb5479`. Link estável respondeu HTTP 200 e digest do GitHub coincide.
- **Verificação**: `node --check`, `npm run desktop:package:win` e inicialização da CLI NPM dentro do pacote (respondeu `11.12.1`); dependências essenciais presentes. Suítes não executadas; servidor completo não iniciado para evitar instalar componentes no perfil local.
- **Próximo passo**: usuário deve baixar novamente e executar o setup atualizado; nenhum dado de `userData` precisa ser apagado. Código-fonte não foi enviado ao GitHub.

## 2026-10-14 — Túnel móvel ainda servia o Vite
- **Causa**: o processo encontrado era `server/index.ts --dev`. O login remoto redirecionava para `/`, onde o middleware do Vite recusava o hostname aleatório do Quick Tunnel.
- **Correção**: túnel bloqueado em modo dev com orientação visível para usar `start-aioffice.bat`; `findCloudflared` reconhece o MSI oficial em `Program Files (x86)` e o launcher inclui essa pasta no `PATH`.
- **Ambiente**: `cloudflared` 2026.10.0 já estava instalado e assinado pela Cloudflare. O `.bat` apontava para `start-aioffice.ps1`, que estava ausente; restaurei o arquivo e o alias legado `start-aioffice-dev.bat`.
- **Validação operacional**: `start-aioffice.bat` compilou e iniciou `start-managed.mjs`. `/` em 4747 e `/login` em HTTPS 4748 responderam 200 sem `/@vite/client`; `/api/remote-access/status` retornou `available=true`, `configured=true`, `state=disabled`.
- **Validação de código**: `npm run build`, i18n (2.346 textos em inglês, espanhol e francês), parse do PowerShell e `git diff --check` passaram. Não foi iniciado Quick Tunnel real; clique em **Iniciar túnel** para gerar o link/QR novo.

## 2026-10-14 — Setup Windows na release desktop atual
- **Erro de inicialização**: `electron-updater` publica CommonJS; o import nomeado `autoUpdater` falhava antes da janela abrir. O main agora importa o módulo pelo default e acessa o getter `autoUpdater`; um teste de regressão verifica esse contrato sem instanciar Electron.
- **Versão**: manifesto e lockfile locais foram alinhados a `2.1.0` para corresponder ao GitHub; nenhuma tag ou commit foi criado.
- **Primeiro instalador**: a build NSIS foi publicada inicialmente como único asset `AIOffice-Setup.exe` na release GitHub `v2.1.0`, com 115.750.420 bytes e SHA-256 `7dd1d0c8379ac6abf1b927d36e21a0c657cc6fb001c5ad9ab62e2411c987bd4e`. O bug e a substituição pelo setup corrigido estão registrados na entrada mais recente acima.
- **Limites da publicação**: o asset atual está sem assinatura Authenticode. Nenhum `latest.yml` ou blockmap foi enviado; é uma instalação manual, e builds existentes não se atualizam por este asset. O código-fonte local e o workflow não foram enviados.
- **Verificação**: `npm run desktop:verify` passou na versão `2.1.0` (raiz 22, web 1.233 aprovados + 10 ignorados em 103 arquivos, desktop 13); o instalador foi empacotado e sua versão, assinatura, hash e URL pública foram conferidos.

## 2026-10-14 — Instalação automática do plugin de mensagens
- **Regra**: quando o recurso estiver habilitado, o servidor local e `docker:up` instalam/verificam somente `habblaud-mensagens` nas contas Claude Code observadas. Falhas são avisos, não bloqueiam a inicialização; `HABBLAUD_MENSAGENS=0` desliga a entrega e a automação.
- **Resolução do CLI**: `HABBLAUD_CLAUDE_BIN`, instalação nativa `~/.local/bin/claude` (`claude.exe` no Windows), depois PATH; Claude Code 2.1.287+ requerido. O pacote desktop inclui e descompacta marketplace e fontes do plugin para leitura pelo CLI externo.
- **Instalação local**: atualizei Claude Code de 2.1.170 para 2.1.299 e rodei `npm run mod:install`; `npm run mod:status` confirmou marketplace e os três plugins ativos em `~/.claude`.
- **Verificação**: typecheck raiz/app, build web, `i18n:check` (2.345/2.345 por idioma), `desktop:build` e `git diff --check` aprovados. Testes automatizados não foram executados.
- **Limite**: sessões abertas antes da instalação exigem `/reload-plugins`. A lógica automática será observada na próxima inicialização limpa do servidor; nenhuma sessão recebeu mensagem de teste.

## 2026-10-14 — Launcher normal, QR e alerta do link móvel
- **Launcher**: novo `start-aioffice.bat` executa build e servidor Node gerenciado; o script recusa a porta 4747 ocupada e não mata processos. Os nomes/atalhos antigos passam a usar modo normal.
- **QR**: Configurações gera o QR do link Cloudflare localmente no navegador e remove o código quando o túnel para; nenhuma recarga completa foi adicionada.
- **Chrome**: o campo de login estava funcionando como `type=password`; o rótulo **Perigoso** vem do navegador e pode aparecer após digitar credenciais num hostname temporário. O login agora avisa para não prosseguir diante desse alerta; a aplicação não tenta desativar a proteção.
- **Limite**: Quick Tunnel usa hostname temporário. Para um endereço estável, é preciso domínio próprio na conta Cloudflare. A instância dev já ativa não foi fechada; o usuário precisará encerrá-la manualmente antes de rodar o launcher normal.
- **Verificação**: root/app typecheck, build, i18n (2.345), root tests 22/22 e app tests 1.233 aprovados + 10 ignorados; smoke do QR local, parse PowerShell, BOM UTF-8 e `git diff --check` aprovados. Audit de produção: 0; auditoria completa reporta 8 moderadas em ferramentas de build Electron já presentes. Nenhum launcher ou serviço foi iniciado/reiniciado.

## 2026-10-14 — Aplicativo desktop Electron
- **Aplicativo**: adicionado shell Electron com servidor supervisionado, janela isolada, preload IPC restrito, migração de dados sem mover a origem, diagnóstico e instalador NSIS x64. O servidor só libera a janela após confirmar por IPC sua própria inicialização e responder health check com a versão esperada.
- **Atualizações**: downloads nativos pedem confirmação; installs locais sem assinatura não ativam atualizações verificáveis no Windows/macOS. AppImage verifica metadados por HTTPS/SHA-512; `.deb` segue o gerenciador do sistema. CI exige artefatos e certificados antes de publicar.
- **Refresh da página**: não há timer que recarregue a página. Estado do escritório e confirmação de release chegam em background por SSE/polling; o banner deixa a recarga a cargo do usuário. `location.reload()` da troca de idioma só ocorre após seleção explícita.
- **Teste MCP**: o teste de heartbeat deixou de depender da porta fixa 4747 e usa um servidor HTTP efêmero, o que mantém a suíte determinística em CI sem serviço externo.
- **Verificação na implementação inicial**: `npm run desktop:verify` aprovado; raiz 22/22, web 1.232 aprovados + 10 ignorados em 102 arquivos, desktop 12/12. O instalador NSIS inicial tinha 115.690.061 bytes. A correção do import e o novo alias estão registrados na entrada de 14/10 acima.
- **Limites**: instalador local está `NotSigned`; macOS/Linux, CI real, assinatura/notarização e update de release publicada não foram exercitados neste host.

## 2026-10-14 — Orquestrador-Maestro obrigatório com instalação NPM
- **Inicialização**: `npm run setup` prepara a CLI oficial `@iapro/orquestrador-maestro-cli@latest`; o servidor também executa `ensure` antes de abrir a porta e não inicia se a camada central não puder ser instalada ou verificada. O escopo usa `--core-only` e preserva perfis de ferramentas.
- **Atualização**: Configurações → **Orquestrador-Maestro** mostra versão instalada e última versão do NPM, consulta automaticamente a cada seis horas e instala/atualiza após clique. A consulta e o trabalho do NPM ocorrem no servidor; a interface recebe snapshots/SSE e não recarrega a página nem reinicia o servidor.
- **Distribuição**: o desktop inclui a CLI do NPM e usa prefixo/cache persistentes em userData. Docker semeia o pacote no build e persiste `/maestro` em volume gravável, inclusive com rootfs read-only. A ponte MCP também exige as três regras centrais instaladas. O updater GitHub do AIOffice segue separado.
- **Verificação**: typechecks raiz/app, build web, i18n, build desktop `--dir`, sintaxe do helper e `git diff --check` aprovados. A checagem NPM somente leitura confirmou CLI `1.0.1` instalada e `1.0.1` como latest. O build desktop incluiu `resources/npm/bin/npm-cli.js` e o helper em `app.asar.unpacked`. Não rodei testes automatizados nem o helper de instalação/atualização. Docker permanece sem build/execução nesta rodada.
- **Recarga**: a busca no componente novo não encontrou `location.reload`; as recargas existentes para troca de idioma e para carregar uma release nova do próprio AIOffice permanecem ações explícitas e independentes.

## 2026-10-14 — Migração das instruções móveis e desativação do CLI legado
- **Contrato vigente**: Configurações → **Acesso pelo celular**, cadastro de senha mestra e início de Quick Tunnel Cloudflare ao concluir a configuração. `cloudflared` instalado no `PATH` é requisito. O painel oferece **Iniciar**, **Parar** e **Copiar link**; o celular autentica com a senha mestra.
- **Ciclo de vida**: o túnel nunca inicia automaticamente ao ligar o servidor. Depois de reiniciar, a ativação é explícita pelo painel; o link pode mudar ao reativar.
- **CLI**: `remote:setup` e `remote:off` agora só imprimem orientações. O script não lê/grava configuração, não recebe senha e não provisiona credenciais, CA ou LAN/VPN. A parada real é pelo botão **Parar**.
- **Documentação**: READMEs, handoff, spec ativa e verify atualizados. Controles de versão Habblaud saem da descrição da experiência AIOffice; instruções upstream e diagnósticos antigos ficam identificados como histórico.
- **Atualização de estado**: dados do escritório atualizados em segundo plano, sem recarga total automática; o banner só recarrega o cliente após clique explícito. A troca de idioma recarrega apenas após escolha da pessoa.
- **Disponibilidade do túnel**: a tela distingue execução em Docker da ausência do `cloudflared`; depois da instalação, orienta reiniciar o AIOffice para atualizar o `PATH` do processo.
- **Gates revalidados**: typecheck raiz/app, build web, i18n (2.332/2.332 por idioma), suíte app (102 arquivos, 1.232 testes aprovados e 10 ignorados) e `git diff --check` aprovados. O Vite mantém o aviso do bundle acima de 500 kB.
- **Verificação documental/CLI**: revisão de ortografia/UTF-8 sem texto quebrado; `git diff --check` aprovado com avisos LF/CRLF. `npm run remote:setup -- --help` e `npm run remote:off` concluíram com exit code 0 e apenas as instruções do painel.
- **Pendente**: validação operacional com `cloudflared`, link real, autenticação no celular, parada/reativação e reinício sem partida automática. `cloudflared` não foi instalado nem verificado nesta sessão; nenhum túnel real foi aberto e o serviço em 4747 não foi reiniciado.

> Os registros abaixo preservam a implementação anterior e seus resultados na data indicada. LAN/VPN, usuário/CA e partida por configuração antiga não representam o contrato móvel vigente.

## 2026-10-14 — Controle móvel integrado e canal AIOffice
- **Leitura das capturas do usuário**: `npm run remote:setup` gravou as credenciais/CA e indicou reinício; a tentativa no celular recebeu conexão recusada porque o backend antigo ainda não abriu a porta 4748. A configuração existente foi preservada, sem recriar senha ou CA.
- **Acesso pelo celular**: Configurações → **Acesso pelo celular** agora tem configuração inicial e ações confirmadas de iniciar/parar, estado consultável, URLs HTTPS privadas, usuário, impressão SHA-256 e download da CA. As ações administrativas só aceitam navegador local; o listener usa HTTPS e leitura por padrão. Docker informa que o fluxo não está disponível.
- **Atualização**: chip e avisos só reconhecem `IAPro-Community/AIOffice`; o About deixa de rotular versão Habblaud/desconhecida como AIOffice. O botão oficial baixa/aplica release no servidor gerenciado, e a badge só some após o snapshot ao vivo confirmar a versão.
- **Texto do produto**: avisos de recarga e estado de verificação desativada não atribuem atualização ao Habblaud nem expõem a variável interna `HABBLAUD_UPDATE_CHECK`.
- **Revisão adversarial**: sincroniza a cópia pública da CA sem trocar a CA válida, permite no guard o domínio VPN anunciado e alinha a validação NFC/surrogates no CLI.
- **Gates**: root/app typecheck e build passaram; app tests passaram (101 arquivos, 1.219 aprovados, 10 ignorados); i18n passou (2.336/2.336 por idioma). A suíte root teve 21/22: `packages/mcp-bridge/test/mcp.test.ts` espera uma resposta bem-sucedida da API ao vivo em 4747; a alteração não foi tocada. A UI foi conferida na instância de demonstração isolada e em 390 px. O harness Visual QA automático não achou Playwright instalado. O build mantém o aviso do bundle acima de 500 kB.
- **Ativação**: nenhuma instância ou listener real foi reiniciado. O usuário já executou `npm run remote:setup`; após iniciar a nova build com `npm run start:office`, o backend lerá essa configuração e tentará abrir a porta HTTPS. Não houve commit, push, release, publicação ou mudança no serviço em 4747.

## 2026-10-13 — Diagnóstico final do canal e do acesso pelo celular
- **API ao vivo em `127.0.0.1:4747`**: ainda informa AIOffice `0.10.0`, consulta `marmottajr/habblaud` e oferece `v0.11.0`; não anuncia estado `remoteAccess` nem capacidade de instalação. Esse processo não é o backend gerenciado atualizado do AIOffice.
- **Correção da interface**: o cliente só considera versão disponível quando `meta.updates.repo` é exatamente `IAPro-Community/AIOffice`; release do Habblaud não deve gerar badge, notificação, verificação ou instalação do AIOffice. O bundle atual (`main-DoVwioVj.js` → `app-CWocrG6d.js`) contém o aviso de canal incorreto.
- **Celular**: Configurações → **Acesso pelo celular** mostra estado, endereços privados e instruções. A conexão segue desligada até configurar usuário e senha com `npm run remote:setup` e iniciar o backend gerenciado; nenhuma credencial, CA, VPN ou regra de firewall foi criada.
- **Ativação pendente**: PID 44148 continua servindo o backend antigo. A ferramenta bloqueou a tentativa anterior de encerrar esse processo; ele não foi terminado nem contornado. Após encerrar a instância antiga, iniciar `npm run start:office` na raiz para a API nova assumir a porta 4747.
- **Validação desta correção**: build, typecheck e i18n (2.286/2.286 por idioma) passaram; `git diff --check` passou após a documentação (somente avisos preexistentes de LF/CRLF). Testes automatizados não foram executados.

## 2026-10-13 — Atualização gerenciada e acesso remoto seguro
- **Versão exibida**: no monorepo, somente releases do AIOffice alimentam badge e botão. O instalador prepara tags oficiais fora do checkout, confirma que HEAD é exatamente a tag oficial da versão instalada, preserva runtime, bloqueia novos PTYs, solicita desligamento cooperativo, reinicia e exige versão/nonce/PID; falhas tentam rollback e não limpam a badge sem confirmação.
- **Limites do instalador**: somente Node gerenciado via `npm run start:office`, checkout oficial limpo na tag publicada e sem sessões PTY. Docker, dev, supervisor/opções de Node, diretórios de dados dentro do checkout, alterações locais, commits/branches fora da tag e submódulos ficam bloqueados. Backups e journal ficam para recuperação manual.
- **Acesso remoto**: segunda porta HTTPS com usuário/senha scrypt e sessão assinada; leitura por padrão; capacidades de permissões, mensagens e transcripts são explícitas. Streams fecham após logout/expiração e aprovações remotas contam só com a capacidade `permissions`. Configuração manual por Wi-Fi ou VPN privada; `--new-ca` permite renovar a CA ao incluir nome novo e exige reinstalá-la nos dispositivos. Não abre portas nem provisiona VPN/firewall. Docker remoto não está suportado.
- **Publicação**: `npm run release` simula por padrão; `--publish` existe para publicação explícita, não foi executado.
- **Documentação**: ADR-0002, changelog, guias em quatro idiomas, handoff, contexto, verificação e artefatos do autopilot atualizados. Nenhum commit, push, release ou senha/certificado remoto foi provisionado.
- **Validação desta rodada**: root e app typecheck passaram; build passou com aviso de bundle acima de 500 kB; i18n passou com 2.271/2.271 textos por idioma; `node --check`, ajuda de setup remoto, simulação de release e `git diff --check` passaram. Testes automatizados não executados.
- **Ativação local**: health identificou PID 44148, Habblaud `0.10.0`, `pty:false`, 6 sessões Codex e 10 OMP. O processo é órfão; o comando de encerramento foi bloqueado pela política da ferramenta, portanto a nova build compilada não foi ativada e não houve tentativa de encerramento forçado. Reinicie manualmente com `npm run start:office` depois de encerrar a instância antiga.

## 2026-10-13 — Canal próprio de atualização do AIOffice
- **Decisão**: mantenedores revisam e integram seletivamente mudanças do Habblaud; usuários acompanham e instalam uma release completa do AIOffice. Registrada em `DEV/ADR/ADR-0002-habblaud-update-policy.md`.
- **Implementação**: o verificador dentro do escritório lê a versão/repositório do pacote raiz AIOffice no monorepo e mantém fallback standalone. A interface aponta para releases AIOffice. O README raiz e as quatro versões linguísticas do README web distinguem atualização do AIOffice e clone standalone do Habblaud.
- **Ferramenta da equipe**: `npm run check:habblaud-upstream` só consulta GitHub e apresenta o diff desde o marco registrado; não baixa nem altera arquivos. `apps/office-web/upstream-habblaud.json` registra a avaliação até Habblaud `v0.11.0`, correções já presentes e recursos adiados.
- **Versões**: preservada a versão candidata `2.0.0` do pacote raiz. O pacote web permanece `0.10.0`, pois não houve adoção completa das funcionalidades upstream `0.11.0`.
- **Validação**: build, typecheck raiz e do app, i18n (2.194/2.194), root tests (22) e verificador upstream passaram. A suíte do app passou com timeout de 15 s (101 arquivos, 1.219 testes, 10 ignorados); no timeout padrão de 5 s, dois testes de subprocesso expiraram. Testes focalizados de configuração/atualização: 24 aprovados. `git diff --check` sem erros; avisos apenas LF/CRLF.
- **Operação**: sem commit, push, publicação, implantação ou reinício de serviço.

## 2026-10-13 — Diagnóstico de sessão Claude ausente no Habblaud
- **Sintoma**: atividade feita com Claude não apareceu no escritório.
- **Evidência**: usuário confirmou Claude Desktop → Chat/Cowork. Config MCP `aioffice` existe e o processo `packages/mcp-bridge/dist/index.js` estava ativo; mesmo assim, snapshot do Habblaud tinha zero agentes Claude. A bridge só registra presença/atividade quando o modelo chama suas ferramentas.
- **Causa**: a configuração disponibiliza ferramentas MCP, mas não inscreve a sessão do Chat/Cowork para captura automática; a descrição anterior do instalador prometia sincronização automática indevidamente.
- **Correção**: descrições MCP agora explicam a chamada explícita e o limite de captura; respostas de sucesso só são retornadas quando o Habblaud confirma o evento. O instalador explica que configuração MCP não equivale a monitoramento e preserva configurações JSON inválidas em vez de sobrescrevê-las.
- **Limite**: esta bridge mostra presença e resumos enviados explicitamente pelo Claude. Não importa transcript completo, não recebe cada mensagem automaticamente e não habilita envio de mensagem de volta para Chat/Cowork. A exportação oficial é manual.
- **Referências/verificação**: snapshot/health locais; build da bridge, `node --check scripts/install-mcp-bridges.mjs` e `git diff --check` passaram. Nenhum teste de integração foi executado, nenhum prompt foi enviado e nenhuma sessão foi interrompida. Referências: [MCP local no Claude Desktop](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) e [exportação de dados Claude](https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-data).
- **Próxima ação**: reiniciar o MCP no Claude Desktop para carregar as descrições corrigidas; então testar solicitando explicitamente registro de presença no Habblaud.

## 2026-10-13 — Preparação da release AIOffice v1.1.0
- **Versão/changelog**: versão raiz preparada para `1.1.0`, com notas em pt-BR sobre OMP, envio de mensagens, leitura do terminal/histórico e limites reais das integrações.
- **Distribuição OMP**: a extensão antes instalada apenas na máquina do usuário foi adicionada ao repositório, junto com `omp:install`, `omp:status` e `omp:uninstall`; documentação de instalação atualizada.
- **Validação**: typecheck raiz e do app, build, i18n, importação Bun, status do instalador e health check passaram. O build mantém o aviso de bundle acima de 500 kB; a checagem i18n lista 10 chaves antigas sobrando por idioma. O envio real ainda depende de reabrir uma sessão OMP.
- **Publicação**: preparar commit, tag e release `v1.1.0` no GitHub após os gates locais. A validação de envio real depende de reabrir uma sessão OMP.

## 2026-10-13 — Robustez da ponte global OMP
- **Causa confirmada**: a sessão ativa começou antes da atualização do arquivo global. Além disso, `followUp` pode deixar a mensagem parada quando o OMP está ocioso.
- **Correção**: timer gerenciado pelo OMP (com fallback protegido), atualização do ID em troca/branch, `sendUserMessage` sem `deliverAs`, fallback `sendMessage` removido e ACKs repetidos em falha de rede.
- **Verificação**: import/transpilação Bun passou; snapshot mantém `canMessage` ausente porque o processo atual precede o arquivo. Sem enviar prompt nem interromper processo OMP ativo.
- **Próximo passo**: reabrir uma sessão OMP e confirmar a entrega real pela interface. Decisão registrada em `DEV/ADR/ADR-0001-omp-message-delivery.md`.

## 2026-10-13 — Correções da auditoria ampla e ativação local
- **Interface**: identidade OMP registrada para busca/filtro, chips e histórico passam a exibir nomes de provedores sem restringir a Codex, ajuda explica OMP e cartões de uso ficam limitados às fontes que têm dados reais.
- **OMP**: scanner de atividade e terminal reconhecem `toolCall`/`toolResult`; histórico de sessões OMP foi integrado; a extensão global chama a API interativa `sendUserMessage` e só confirma a mensagem após o resultado da chamada.
- **Entrega**: mensagens de extensões ficam pendentes até ACK; só agentes com polling recente são mostrados como alcançáveis. Removido o registro duplicado que classificava OMP como Claude.
- **Salas**: caminhos Windows são canonizados para agrupar a mesma pasta sem alterar o caminho exibido.
- **Integrações**: Claude Code, Codex e OMP são as fontes iniciadas. Devin, Antigravity, OpenCode, Freebuf e Gemini CLI continuam sem integração fim a fim; conexões MCP não representam sessões de CLI.
- **Verificação**: `npm run typecheck`, `npm run i18n:check`, `npm run build` e `git diff --check` passaram. Não rodei testes automatizados nem enviei prompt de teste.
- **Ativação**: Habblaud foi reiniciado em `127.0.0.1:4747` após a compilação. A extensão global OMP foi atualizada em `~/.omp/agent/extensions/aioffice-bridge.ts`; sessões OMP já abertas precisam ser reabertas para carregar a versão nova. O envio ao vivo aguarda o teste do usuário.
- **Inspeção ao vivo**: após a build final, a tela confirmou 8 salas, 17 agentes e 9 sessões OMP; o filtro, selo `OMP` na gaveta/terminal e conversa no terminal apareceram. O composer continua desabilitado até a sessão OMP reabrir e fazer polling.

## 2026-10-13 — Auditoria ampla da interface
- **Escopo**: escritório, busca/filtros, gaveta, mensagens, terminal, histórico, feed, Meu dia, timelapse, uso, configurações, ajuda, acessibilidade e responsividade.
- **Resultado**: relatório `DEV/UI-AUDIT-2026-10-13.md` prioriza identidade/filtro OMP, diferença entre parser de atividade e terminal, falta de histórico/ajuda OMP, salas duplicadas/temporárias e necessidade de estado de saúde por provedor.
- **Evidência**: interface desktop observada em `127.0.0.1:4747`, com várias salas e agentes ativos. Não houve envio de mensagem nem testes nesta etapa.
- **Próximo contexto**: ativar a build em janela segura e validar OMP ao vivo; depois fechar o escopo de provedores e aplicar a paridade por capacidades.

## 2026-10-13 — Corrigir disponibilidade de mensagens OMP
- **Problema Reportado**: A interface mostrava uma sessão OMP ativa como apta a receber mensagens, mas o envio expirava sem que a sessão buscasse a caixa de entrada.
- **Causa Raiz**: `canMessage` considerava qualquer agente presente alcançável, sem exigir um polling recente do inbox. Além disso, a implementação antiga do OMP apenas acrescentava linhas ao transcript JSONL, sem entregar o texto como prompt interativo.
- **Correção**: A disponibilidade de Claude/OMP agora depende de polling recente; Codex usa o estado da própria bridge. A escrita passiva no JSONL foi removida. O painel distingue a extensão OMP desconectada e desabilita o envio quando a sessão não está alcançável.
- **Validação**: `npm run build` concluiu. `npm --prefix apps/office-web run i18n:check` terminou com um aviso preexistente de normalização CRLF em um texto longo de `scripts/statusline-install.ts`; as novas mensagens estão traduzidas. `git diff --check` concluiu sem erros.
- **Limite operacional**: O servidor Habblaud em execução não foi reiniciado para evitar interromper sessões ativas. A nova build ainda não está carregada pelo servidor nem foi validada enviando mensagem à sessão OMP.

## 2026-10-13 — Execução Direta de Mensagens no Terminal do OMP (Two-Way Flow)
- **Problema Reportado**: A mensagem enviada pela interface do AIOffice para um agente rodando no OMP mostrava sucesso na web, mas não executava como prompt dentro da janela do terminal onde o `omp` estava rodando.
- **Causa Raiz**: O terminal do `omp` roda como TUI interativo e não observa novas linhas adicionadas passivamente ao arquivo `.jsonl`. Ele espera receber eventos de input pela API de extensão `pi.sendUserMessage(text)`.
- **Solução Implementada**:
  1. Criada a extensão global do OMP em `~/.omp/agent/extensions/aioffice-bridge.ts`. O `omp` carrega automaticamente extensões dessa pasta em todas as sessões.
  2. A extensão escuta `session_start` e consulta `POST /api/mod/inbox` a cada 1.5s buscando novas mensagens enviadas pelo AIOffice para o ID daquela sessão.
  3. Ao receber uma mensagem, a extensão chama `pi.sendUserMessage(msg.text)`, injetando o prompt diretamente no fluxo ativo do terminal do OMP!
  4. A extensão confirma a execução via `POST /api/mod/inbox/ack` e o Habblaud marca a mensagem como `delivered`.
- **Verificação**:
  - Testado o ciclo completo com envio de mensagem, captura pelo inbox da sessão e retorno de confirmação ACK.
  - Suíte `npm run verify` com 21/21 testes passando.

## 2026-10-13 — Auditoria da interface e conversa OMP
- **Problema Reportado**: O terminal ao vivo do OMP abria vazio; outras áreas também davam destaque apenas a Claude e Codex.
- **Causa Raiz**: O leitor comum reconhecia registros `user`/`assistant` do Claude, enquanto o OMP usa `type: message`, `message.role` e blocos `toolCall`/`toolResult`. O rótulo do terminal também tratava qualquer provedor diferente de Codex como Claude.
- **Correção**: Adicionado parser OMP para prompt, resposta, raciocínio, chamada e resultado de ferramenta; o painel reusa os mesmos componentes. O nome do provedor vem do mapa central de provedores.
- **Auditoria**: Claude Code, Codex e OMP são as únicas fontes iniciadas hoje. Devin, Antigravity, OpenCode e Freebuf têm tipos/adaptadores mas não estão ligados; MCP de Cursor/Windsurf/Claude Desktop/Antigravity não é ingestão de CLI. OMP também falta nos filtros, histórico, ajuda e métricas de uso.
- **Validação**: `npm run build` e `git diff --check` passaram. Não foram executados testes. Habblaud não foi reiniciado porque há várias sessões trabalhando; a renderização ao vivo permanece pendente.
- **Próximo passo**: Ativar o build em reinício seguro e definir a lista de CLIs-alvo para fechar a cobertura das outras superfícies.

## 2026-10-13 — Central de trabalho e melhorias transversais
- **Entrega**: adicionados a Central de trabalho por projeto, fila de atenção para esperas/erros recentes, catálogo de integrações por capacidade e biblioteca com seis modelos de workflow (bug, funcionalidade, revisão, testes, release e pesquisa).
- **Navegação**: filtro independente por ferramenta, busca mais clara, histórico por ferramenta e ajuda atualizados; o rótulo superior agora identifica a conexão SSE do servidor, sem sugerir que cada extensão está conectada.
- **Precisão**: estados da bridge MCP do Claude Desktop Chat/Cowork explicam o acionamento explícito; Devin, Antigravity, OpenCode e Freebuf aparecem como incompletos. Não foram ativados porque os módulos existentes presumem um formato comum de transcript e incluem escrita direta nele sem validação por CLI.
- **Autonomia**: os templates só montam e copiam um rascunho revisável; a fila de atenção apenas leva ao agente. Nenhuma mensagem, aprovação ou execução é disparada por esses controles. No CLI, o executor via Orquestrador-Maestro agora exige `--maestro-fallback`; esse caminho explícito mantém as escritas automáticas dos artefatos de demonstração.
- **Traduções**: novas chaves em inglês, espanhol e francês; o catálogo usa pluralização natural nas quatro línguas.
- **Verificação**: build raiz e do cliente/servidor passou; typecheck do Habblaud passou; 100 arquivos de teste do Habblaud (1.217 aprovados, 10 ignorados) e 22 testes do workspace passaram; `i18n:check` não aponta textos sem tradução (2.185 por idioma); `git diff --check` passou, com avisos existentes de normalização LF/CRLF.
- **Limite operacional**: a nova interface foi conferida após recarregar a aba local e em largura desktop/celular. O serviço backend não foi reiniciado nesta rodada para preservar sessões ativas; alterações do servidor só entram em vigor após reinício seguro. Nenhuma mensagem de teste foi enviada.

## 2026-10-13 — Evolução visual do Habblaud
- **Direção aprovada pelo usuário**: manter o pixel-art atual e oferecer variedade tanto nos cenários do escritório quanto nas cores dos painéis.
- **Interface**: adicionadas as paletas Noite, Mata, Âmbar e Alto contraste; os cenários Jardim, Aurora e Pôr do sol juntam-se a Original, Natal e Halloween. Seletor reorganizado em grades legíveis, com amostras de cor, navegação por setas e paletas independentes do cenário.
- **Visibilidade**: painéis mais opacos, linhas e textos auxiliares mais claros, hierarquia e espaçamento refinados; alto contraste disponível sob demanda. A marca do topo agora cabe sem corte em celulares estreitos.
- **Pixel art**: novos props de flores, cristais e sol; paredes, tapetes, luzes e janelas recebem cores/motivos próprios por cenário.
- **Verificação**: `typecheck`, `build`, `i18n:check` e `git diff --check` passaram. QA visual em simulação entre 320 e 1440 px: sem overflow horizontal, erro de console ou controles sem nome. Capturas e relatório foram salvos em `apps/office-web/.frontend-excellence/after/`.
- **Operação**: Vite de QA em porta separada; backend e sessões locais em execução não foram reiniciados ou alterados.

## 2026-10-13 — Calendário e programação automática de temas
- **Mudança**: o cenário automático agora aplica temas para Ano-Novo, Carnaval, Páscoa, Dia dos Namorados, Festa Junina e Independência, além de manter Halloween e Natal. O calendário trata datas móveis e usa o fuso local.
- **Seletor manual**: os seis cenários comemorativos também aparecem na grade principal e podem ser fixados sem depender do calendário automático.
- **Configuração**: preferências persistidas incluem liga/desliga das datas comemorativas e quatro horários configuráveis com um tema por faixa; eventos têm prioridade. Timelapse acompanha a data/hora reproduzida.
- **Visual**: cenários comemorativos receberam paletas e motivos pixel-art próprios; o painel de configurações se adapta e rola em telas menores.
- **Verificação**: typecheck, build, i18n e QA visual passaram em 390/768/1280/1440 px; 320 px conferido sem overflow. Testes automatizados não foram executados.

## 2026-10-14 — Diagnóstico de atualização automática do desktop
- **Causa visível**: `serverEnvironment()` força `HABBLAUD_UPDATE_CHECK=0`; a API da instância instalada confirmou estado `off` e o log explica a mesma configuração.
- **Causa da instalação**: o updater Electron está desativado para builds Windows sem assinatura/publisher; o executável instalado não tem assinatura e a release `v2.1.0` só publica o setup, sem manifesto `latest.yml` ou blockmap.
- **Estado GitHub**: `origin/main` e o checkout limpo separado estão no commit `01e59b3`/`v2.1.0`; o desktop e a candidata `2.2.0` existem apenas na árvore local modificada. Não apareceram secrets/variables de signing no escopo do repositório; secrets de organização não foram inspecionados.
- **Limite da rodada**: investigação somente leitura; nenhum código de updater, release, tag, commit ou publicação foi alterado. Requisitos e evidências em `DEV/DESKTOP.md` e `DEV/VERIFY.md`.

## 2026-10-14 — Atividades e linha do tempo detalhadas para o OMP (oh-my-pi)
- **Problema Reportado**: Nas atividades (feed) e na linha do tempo do agente OMP (Jorge), aparecia repetidamente apenas o nome cru da ferramenta e conclusão genérica ("bash", "bash terminou", "read", "read terminou", "glob", "glob terminou"), sem detalhamento em português como acontece no Claude ou Codex.
- **Causa Raiz**:
  1. `OmpSource.processSessionFile` gerava texto fixo igual ao nome da ferramenta (`c.name`), sem interpretar os argumentos (`command`, `path`, etc.) nem os intents (`i`/`intent`).
  2. Em `toolResult`, gerava forçadamente a mensagem `{toolName} terminou` para todo retorno com sucesso, poluindo a linha do tempo e balão com repetições.
  3. As mensagens de `user` (prompt), `thinking` e `text` do assistente não alimentavam a linha do tempo de forma encadeada e com histórico incremental; apenas a última linha sobrescrevia o estado.
  4. Métricas e estatísticas do OMP (chamadas de ferramenta, tokens in/out, modelo, custos e tarefas do `todo`) não eram repassadas para o `office.applyTranscript`.
- **Correção**:
  - Criada a função `describeOmpTool` mapeando todas as ferramentas do OMP (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `task`, `todo`, `eval`, `web_search`, `ask`, `wait`, além de URIs internas `pr://`, `issue://`, `skill://`, etc.) para atividades legíveis em português, com ícones adequados (`🌿`, `📖`, `✏️`, `📝`, `🔎`, `👥`, `✅`, `🌐`, etc.) e detalhamento via `describeCommand` e `describeTool`.
  - Removida a emissão de `{toolName} terminou` em `toolResult` de sucesso, alinhando com a experiência do Claude Code e Codex. Apenas erros (`isError: true`) emitem atividade de alerta (`⚠️ Erro em {toolName}: {motivo}`).
  - Implementado tracking incremental de sessões OMP (`OmpSessionTracker`), evitando reprocessamento redundante, alimentando `describePrompt`, `SPECIAL.think()`, chamadas de ferramentas e respostas com seus timestamps reais.
  - Carga inicial (`live: false`) popula o histórico e linha do tempo sem disparar spam de avisos no feed ao vivo; eventos subsequentes entram ao vivo.
  - Integração com `office.applyTranscript` para preencher chamadas de ferramenta, tokens de entrada/saída, custo, modelo e tarefas do `todo`.
  - Atualizadas traduções em EN, ES e FR e adicionada suíte de testes unitários dedicada em `apps/office-web/server/sources/omp/source.test.ts`.
- **Verificação**:
  - Suíte completa de testes (`npm --prefix apps/office-web test`): 105 arquivos, 1.256 testes passando (incluindo os 7 testes dedicados do OMP).
  - Validação de i18n (`npm --prefix apps/office-web run i18n:check`): 2.382/2.382 textos traduzidos (100%).
  - Build do cliente e servidor (`npm run build`): concluído com sucesso.

## 2026-10-14 — Corrigir detecção de alterações em arquivos no Windows e preparar v2.2.1
- **Causa**: duas execuções do workflow `v2.2.0` falharam em testes Windows quando registros Claude e transcripts OMP mudaram sem novo `mtime`; a segunda falha ocorreu no append OMP, antes de criar instalador/release.
- **Correção**: `RegistryReader` compara o JSON lido, preservando o último estado válido se o arquivo estiver parcial. `OmpSource` usa tamanho junto ao mtime para detectar bytes novos. Testes de regressão mantêm o mtime fixo.
- **Versão/publicação**: `v2.2.0` permanece como tag sem release; candidata corrigida `v2.2.1`, sem asset público ainda. `main` contém a integração base; este patch aguarda commit, push e workflow estável.
- **Verificação**: três suítes focadas, 47/47; `npm run desktop:verify` aprovado após `npm ci`: 22 root, 1.257 web aprovados/10 ignorados, 14 desktop, typechecks, build e i18n. Restam dry-run/diff check final, envio à `main` e validação Actions de `v2.2.1`.

## 2026-10-14 — Publicar AIOffice v2.2.1
- **Entrega**: commit `3ac5d2e` enviado à `main`; helper oficial publicou a tag `v2.2.1` e Actions criou a release após sucesso no Windows.
- **Asset**: único arquivo `AIOffice-Setup.exe` (118.890.375 bytes), SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`; a API `/releases/latest` aponta para `v2.2.1`. Authenticode não configurado.
- **Verificação**: dry-run e diff check aprovados; `npm run desktop:verify` passou localmente e run `38620115438` concluiu com sucesso em 2m46s. A instalação `2.1.0` ainda precisa de atualização manual única.
