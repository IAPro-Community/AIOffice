# VERIFY — AIOffice

## Matriz nativa v2.3.0 — preflight completo, 2026-10-14

| Verificação | Resultado |
|---|---|
| Workflow manual `38654902095` | Aprovado: gate completo, builds Windows x64/macOS Intel/macOS arm64/Linux x64, montagem dos quatro artifacts e notas da release. |
| Manifestos | `latest-mac.yml` e `latest-linux.yml` gerados e validados contra os pacotes correspondentes. |
| Conjunto de release | Aprovação dos nove arquivos esperados: setup Windows, quatro arquivos macOS, dois arquivos Linux e dois manifestos. |
| Publicação | Etapa ignorada corretamente em `workflow_dispatch`. Não há tag `v2.3.0` ainda; executar `npm run release -- --publish` a partir de `main` limpa e sincronizada para publicar. |

## Matriz nativa v2.3.0 — primeira validação manual, 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run desktop:verify` local | Aprovado: typechecks, build, 22 testes monorepo, 1.257 testes web (10 ignorados), 16 testes desktop e verificações de sintaxe. |
| Instalador Windows local | `AIOffice-Setup.exe`, versão 2.3.0, 118.453.440 bytes, SHA-256 `65622CD3AD4F2B39BD6431BD3B0CD5E05A872009EFEBD59C106C4A3F0269F1E2`, assinatura `NotSigned`. |
| Workflow manual `38653090528` | Verificação completa e empacotamento/validação Windows x64, macOS Intel e macOS arm64 aprovados. |
| Linux x64 | AppImage e `.deb` foram compilados, mas o gate detectou que a ferramenta emitia nomes `...x86_64.AppImage` e `...amd64.deb`, diferentes dos aliases estáveis documentados. |
| Publicação | Não houve tag nem release. Configuração Linux corrigida para nomes explícitos x64; repetir matriz antes de `v2.3.0`. |

## Matriz nativa v2.3.0 — builds aprovados, montagem final pendente, 2026-10-14

| Verificação | Resultado |
|---|---|
| Workflow manual `38653586066` | Gate completo e pacotes Windows x64, macOS Intel/arm64 e Linux x64 passaram. Actions de artifacts ainda emitiram aviso de runtime Node 20. |
| Workflow manual `38654072400` | Gate completo e os quatro pacotes passaram novamente. `checkout`/`setup-node` v5 e `upload/download-artifact` v7 usam Node 24; não houve warning de runtime Node 20. |
| Nomes/saída Linux | O log confirmou nomes estáveis `AIOffice-Setup-Linux-x64.AppImage` e `.deb`; associação de launcher sincronizada com `desktopName=aioffice`. |
| Publicação | Essas execuções foram disparadas por `workflow_dispatch`; nenhuma tag/release foi criada. Workflow ajustado para também exercitar download dos quatro artifacts, criação dos dois manifestos, notes e conjunto de nove arquivos no próximo preflight manual; `gh release create` só roda para tags. |

## Publicação v2.2.1 e correção de detecção no Windows — 2026-10-14

| Verificação | Resultado |
|---|---|
| Primeira execução tag `v2.2.0` | Falhou em `watcher.test.ts:145`: após `busy` → `idle`, o cache baseado em mtime/tamanho manteve `working`. |
| Segunda execução da mesma tag | Falhou em `omp/source.test.ts:330`: a varredura ignorou linhas anexadas ao JSONL porque comparava somente `mtime`. A release não foi criada; a tag permanece imutável. |
| Causa | Alguns runners Windows podem manter o mesmo `mtime` em gravações rápidas. O registro Claude também pode mudar `busy` → `idle` com o mesmo tamanho. Ambas as otimizações de cache ignoravam conteúdo novo. |
| Correção | `RegistryReader` compara os pequenos arquivos de estado pelo conteúdo lido a cada poll, preservando a última entrada válida durante gravação parcial. `OmpSource` usa `mtime` e tamanho para detectar novos bytes. |
| Testes de regressão | `registry.test.ts` força status de mesmo tamanho e `mtime`; `omp/source.test.ts` mantém o `mtime` constante enquanto anexa linhas. As três suítes focadas passaram: 47/47. |
| `npm run desktop:verify` local | Aprovado após `npm ci`: 22 testes do monorepo, 105 arquivos web/1.257 aprovados/10 ignorados, 14 testes desktop, typechecks, build, i18n (2.392 por idioma) e sintaxe. |
| Diff/release dry-run | Ambos passaram antes do commit/tag; release publicada pelo helper oficial em árvore limpa. |
| Actions `38620115438` | Aprovado em 2m46s: instalação, suíte completa, build do Windows x64 e criação da release. |
| Release/asset | `v2.2.1` é a resposta de `/releases/latest`; único asset `AIOffice-Setup.exe`, 118.890.375 bytes; SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`. Authenticode não configurado. |
| Resultado | `main`/tag `v2.2.1` em `3ac5d2e`; instalação `2.1.0` requer uma instalação manual única para obter o atualizador. Releases seguintes são verificadas em background sem reload. |

## Atualizador Windows pela release oficial do GitHub — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado. |
| `npm --prefix apps/office-web run typecheck` | Aprovado; cliente e servidor. A rodada inicial encontrou `AgentStats.cost` na fonte OMP; o campo foi corrigido para `costUSD` e a repetição passou. |
| `npm run build` | Aprovado para monorepo, cliente e servidor. Aviso Vite conhecido: bundle principal com 758,73 kB. |
| `npm --prefix apps/office-web run i18n:check` | 2.392/2.392 textos traduzidos em en/es/fr; o relatório lista chaves antigas sem uso. |
| Sintaxe Electron | `node --check` passou para `main.mjs`, `github-release-updater.mjs`, `update-policy.mjs` e `preload.cjs`. |
| NSIS Windows x64 | `AIOffice-2.2.0-win-x64.exe` e cópia `AIOffice-Setup.exe` gerados em `dist/installers-aioffice-updater-final2`; 117.969.885 bytes, SHA-256 `2927ACEFD31A08E26AE9BA4E7100E7906481960E2896C15AFF325BB70F48BA10`, Product/FileVersion `2.2.0`, Authenticode `NotSigned`. |
| ASAR | Inclui main, preload e `github-release-updater.mjs`. |
| Workflow | `.github/workflows/release-desktop.yml` foi parseado com `js-yaml`; há job Windows e etapa que publica apenas `AIOffice-Setup.exe`. Actions não foram executadas. |
| `git diff --check` | Aprovado; permanecem avisos conhecidos de normalização LF/CRLF em arquivos modificados. |
| Atualização de ponta a ponta | Pendente: a release pública ainda é `v2.1.0`, igual à instalação. O binário v2.1 não contém este atualizador; a primeira instalação do v2.2 precisa ser manual. Nenhuma release futura foi baixada/instalada. |
| Testes automatizados | Não executados nesta rodada. |

## README e documentação pública — 2026-10-14

| Verificação | Resultado |
|---|---|
| README raiz | Reescrito com descrição, início rápido, integrações, segurança e tabela que aponta para o asset Windows `v2.1.0` e identifica macOS/Linux como indisponíveis. |
| Capturas | `readme-office.png`, `readme-agent.png` e `readme-settings.png` capturadas em Chromium com a simulação local `?mock=1`; telas da sala, gaveta de agente e Configurações foram inspecionadas. |
| Guias Habblaud | Readmes en/pt-BR/es/fr alinhados para código móvel temporário, Cloudflare Quick Tunnel, sessão/revogação e atualização standalone. Corrigido também o link interno para a seção móvel em pt-BR. |
| Documentação de release | `CHANGELOG.md`, `DEV/DESKTOP.md`, `DEV/HANDOFF.md`, `DEV/INDEX.md`, `DEV/CONTEXT.md` e `DEV/SPECS/ACTIVE.md` registram o estado real: release pública só contém o instalador Windows; candidato `v2.2.0` ainda não publicado. |
| `git diff --check` | Aprovado. Git emite avisos preexistentes de normalização LF/CRLF. |
| Testes de código | Não executados; a alteração desta etapa foi documental e de imagens. |

## Candidata de release AIOffice v2.2.0 — 2026-10-14

| Verificação | Resultado |
|---|---|
| Versão e lockfile | `package.json`, `package-lock.json` e `packages[""].version` conferidos em `2.2.0`. |
| `npm run desktop:verify` | Aprovado: typechecks do monorepo e do app, build, 22 testes do monorepo, 104 arquivos/1.249 testes web aprovados/10 ignorados, i18n, 13 testes desktop e verificações `node --check`. |
| `npm run release -- --dry-run` | Aprovado: seção `v2.2.0` extraída corretamente e notas renderizadas. Sem escrita remota; apontou branch fora da `main` e árvore local suja. |
| Instalador Windows local | NSIS x64 `AIOffice-2.2.0-win-x64.exe` concluído em diretório isolado; 117.961.753 bytes, SHA-256 `E5468B1AD2918D0F8358731E801032AABA55AB95E6E362BC492597087DB8401E`, ProductVersion `2.2.0`. `Get-AuthenticodeSignature` confirmou `NotSigned`; não é artefato elegível para atualização automática. |
| `git diff --check` | Aprovado; Git emitiu apenas avisos de normalização LF/CRLF em arquivos modificados. |
| Estado remoto | Última release `v2.1.0`; `main` remota em `01e59b3`. Listas de secrets/variables de assinatura vazias. Não houve tag, push nem publicação. |
| Limites restantes | macOS/Linux e assinaturas Windows/macOS dependem dos runners e certificados do workflow; a publicação exige integrar as mudanças na `main` limpa e atualizada. |

O build Vite continua avisando que o bundle principal excede 500 kB. Isso não falhou nos gates.

## Janela desktop não abria — 2026-10-14

| Verificação | Resultado |
|---|---|
| Causa | Electron documenta `UtilityProcess` `'message'` no processo pai como o objeto publicado; `process.parentPort` no filho entrega um evento com `.data`. O código lia `.data` também no pai, portanto nunca aceitava o handshake. |
| Sintaxe | `node --check apps/office-desktop/main.mjs` e `node --check apps/office-desktop/startup.mjs` passaram. |
| Build Windows | Cliente/servidor compilaram e o NSIS x64 `2.1.0` concluiu em `dist/installers-handshake-fix`. A saída padrão falhou com `EPERM` na renomeação do Electron temporário. Aviso Vite acima de 500 kB permanece. |
| ASAR | Confirma mensagem direta, ausência da leitura incorreta `event.data`, recuperação da janela em segunda instância, diagnóstico de falha de interface e `-WindowStyle Hidden` no PowerShell. |
| Smoke do desktop empacotado | `aioffice.log` registrou handshake confiável, serviço pronto em `127.0.0.1:4747` e janela pronta. `Get-Process` confirmou `WindowTitle=Habblaud` e handle não nulo. Execução feita pelo `win-unpacked`; o processo permanece aberto enquanto o usuário instala o setup permanente. |
| Release estável | `v2.1.0` tem somente `AIOffice-Setup.exe`; 117.961.903 bytes, SHA-256 local/remoto `d0eb5a9656fb7dc72bcbcdf37ef74a642768008c75303405a6dd1d4dfe113ee7`. Authenticode `NotSigned`. |
| Link de download | O alias `/releases/latest/download/AIOffice-Setup.exe` respondeu com um asset antigo em cache. O caminho direto `/releases/download/v2.1.0/AIOffice-Setup.exe?nocache=987654321` respondeu `200`, 117.961.903 bytes; usar este link para a instalação imediata. |
| Refresh e testes | Renderer/polling não foram alterados; `loadURL` segue no início da janela. Nenhum teste automatizado foi executado. |

## Sessões do túnel móvel — 2026-10-14

| Verificação | Resultado |
|---|---|
| Túnel ocioso | Revisão do gerenciador: nenhum timer de inatividade. Os 120 s são somente o limite para receber a URL inicial; 2 s é a tolerância de encerramento após **Parar**. A revalidação a cada 10 s encerra apenas streams de sessões revogadas. |
| Rotas locais | `GET /api/remote-access/sessions` e `POST /api/remote-access/sessions/:id/revoke`; loopback/host local obrigatórios, gestão negada no listener remoto, origem externa e `cross-site` recusados. Revogação exige Origin local exato e objeto JSON vazio. |
| Privacidade de sessão | ID aleatório opaco independente do token; lista contém somente ID, rótulo aproximado, entrada, última atividade e vencimento. User-Agent bruto, IP, cookie, assinatura e chave não são devolvidos ou persistidos. Sessões ficam em memória e vencem em 12 h. |
| Suíte focada | `npm --prefix apps/office-web run test -- --run server/http/remote-sessions.test.ts server/http/remote-login.test.ts server/test/remote-runtime.test.ts`: 24/24 aprovados. |
| Suíte web | `npm run test -- --testTimeout=15000` no `apps/office-web`: 104 arquivos; 1.249 aprovados, 10 ignorados. |
| Tipos e traduções | `npm --prefix apps/office-web run typecheck` passou. `i18n:check`: 2.369/2.369 textos en/es/fr; ainda lista chaves antigas sem uso, sem ausências de tradução. |
| Bundles sem indisponibilizar o processo | Vite client e esbuild server compilaram em diretório temporário fora do checkout; aviso existente de chunk Vite acima de 500 kB. Evitei `npm run build` no diretório de runtime porque ele substituiria arquivos servidos pela instância aberta. |
| Diff | `git diff --check` passou; apenas avisos normais de LF→CRLF. |
| QA visual isolado | Chrome headless com painel aberto em 390×844, 768×1024, 1280×800 e 1440×900; diálogo dentro da janela, sem overflow horizontal/erros. Dois botões com nomes acessíveis; revogação removeu um item sintético. Capturas em `%TEMP%`. |
| Diagnóstico do timeout antigo | O log registrou o serviço ouvindo às 14:12 UTC e o desktop encerrando-o após 360 s porque não recebeu o handshake esperado. O pacote antigo lia `event.data`; Electron 44 entrega o payload diretamente. Uma execução posterior registrou handshake às 14:24 UTC e health aprovado. O timeout de startup é diferente de um timeout de inatividade do Quick Tunnel. |
| Smoke local | `/api/health`: `ok=true`, versão `2.1.0`; estado remoto `disabled`, `configured=false`. Não reiniciei o serviço nem iniciei túnel. |
| Limite operacional | A fonte do desktop já valida o payload direto do handshake, mas o fluxo de publicação/instalação dessa correção e a validação real de sessão móvel em túnel ocioso ainda precisam ocorrer. QA visual usou mock; login/revogação por dispositivo real também permanecem pendentes. |

## Recuperação de porta do desktop — 2026-10-14

| Verificação | Resultado |
|---|---|
| Sintaxe | `node --check` passou para `main.mjs`, `startup.mjs`, `start-managed.mjs` e `electron-builder.config.cjs`. |
| Porta configurada | Smoke de `configuredServerPort`: porta padrão `4747` e valor válido `4848` aceitos; entradas inválidas geram erro explícito. |
| Build/instalador Windows | Cliente e servidor compilaram; uma execução de `npm run desktop:package:win` falhou com `EPERM` ao renomear a pasta temporária para a saída padrão. `electron-builder` concluiu o NSIS x64 `2.1.0` numa saída limpa `dist/installers-final`; permanece o aviso Vite de bundle acima de 500 kB. |
| Conteúdo do pacote | ASAR inclui `apps/office-desktop/startup.mjs` com identificação do listener, shutdown cooperativo, fallback direcionado e guarda para resposta de sessões ativas; o `main.mjs` passa nonce efêmero ao serviço. |
| Processo ativo no workspace | Porta `4747` estava em uso por `node.exe` executando `apps/office-web/scripts/start-managed.mjs`. Apenas consulta de processo; o agente não encerrou nem reiniciou o serviço. |
| Release | A release existente `v2.1.0` contém só `AIOffice-Setup.exe`: 117.957.737 bytes, SHA-256 remoto/local `aeb0166547d5b578d28e94f9084aa8710003f1152b0a13c8ab7f418d8f65591c`. O link `releases/latest/download/AIOffice-Setup.exe` respondeu 200 com o mesmo tamanho. |
| Assinatura/testes | Authenticode `NotSigned`; testes automatizados não executados. Não foi feita inicialização funcional porque o serviço local está ativo e pode ter sessões. |
| Refresh | Nenhum arquivo renderer/polling foi alterado; o Electron ainda chama `loadURL` uma vez ao abrir a janela. |

## Código temporário de login móvel — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run typecheck`, `npm --prefix apps/office-web run typecheck` | Aprovados após a implementação do código de uso único e do nonce de sessão por listener. |
| `npm run build` | Aprovado; o aviso existente do Vite para bundle principal acima de 500 kB permanece. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.353/2.353 traduções em en/es/fr. |
| `git diff --check` | Aprovado; apenas avisos de normalização LF/CRLF. |
| Autenticação | Código alfanumérico aleatório de seis caracteres, hash SHA-256 apenas em memória, expira em cinco minutos, uso único; novo código invalida o anterior. |
| Exposição/CSRF | Código retornado somente por POST local, protegido por loopback + Origin; nunca segue em status/SSE, URL, QR, `.env` ou logs. Rotas de gerenciamento seguem bloqueadas no listener remoto. |
| Ciclo de vida | Código e sessões removidos ao parar/falhar túnel ou inicializar servidor; nenhuma partida automática. |
| Inicialização do Quick Tunnel | Espera de até dois minutos pela URL; stderr sanitizado é registrado no timeout e junto do código/sinal em saída inesperada. Não há timeout por falta de conexão móvel. |
| Testes focados | `remote-login.test.ts` e `remote-runtime.test.ts`: 10 testes aprovados, incluindo formato/tamanho do código, uso único, expiração e limite de dois minutos. |
| Serviço local | Launcher normal reiniciado; `/api/health` respondeu `ok=true`, versão `2.1.0`. Estado remoto `disabled`, porta 4748 fechada e nenhum `cloudflared` ativo após o reinício. |
| Build, tipos, traduções e diff | `npm run build`, typecheck do app, `i18n:check` (2.353/2.353 por idioma) e `git diff --check` aprovados. Vite mantém o aviso existente para bundle principal acima de 500 kB. |
| Refresh | Sem reload integral: código via fetch pontual; status segue no fluxo existente. |
| Safe Browsing | Campo usa `autocomplete=one-time-code`, mas não contorna a reputação do hostname temporário; interface orienta a não prosseguir diante de aviso. |
| Revisão | Revisão adversarial encontrou mensagem 401 desatualizada e risco de reaproveitar segredo se a rotação em disco falhar; mensagem corrigida e chave passou a incluir nonce aleatório novo por listener. |
| Testes/execução operacional | 10 testes focados aprovados e serviço normal reiniciado pelo launcher; health `ok`, versão `2.1.0`. QR/login via Quick Tunnel real e inspeção visual ao vivo não executados; túnel deixado desligado para início manual pelo painel. |

## Correção do bootstrap global do NPM — 2026-10-14

| Verificação | Resultado |
|---|---|
| Reprodução | Com prefixo global persistente ainda ausente, `npm root --global` respondeu `C:\Users\fbolz\AppData\Roaming\AIOffice\maestro-npm\node_modules`; a verificação antiga falhava porque a pasta ainda não existia antes da instalação inicial. |
| `node --check apps/office-web/scripts/maestro.mjs` | Aprovado após trocar o requisito de existência por validação de caminho absoluto. |
| `npm run desktop:package:win` | Aprovado: NSIS Windows x64 `2.1.0`; permanece o aviso do Vite para o bundle principal acima de 500 kB. |
| NPM dentro do pacote | `AIOffice.exe` iniciou a CLI embutida, que respondeu `11.12.1`; `npm root --global` retornou o prefixo configurado mesmo sem `node_modules` criado. Nenhuma instalação foi executada. |
| Asset de `v2.1.0` | Substituído novamente por `AIOffice-Setup.exe`, ProductVersion `2.1.0`, 117.950.187 bytes, SHA-256 remoto/local `169884c17cde04e61641b95d3ca8478cbf8b264dafce4f6f410401657d07fd4d`. |
| Link estável | Respondeu HTTP 200 com 117.950.187 bytes; release GitHub contém somente `AIOffice-Setup.exe`. |
| Escopo | Suítes automatizadas não executadas. O processo servidor completo não foi iniciado para evitar instalar o pacote Maestro no perfil local. |

## Correção do setup desktop: dependências do NPM — 2026-10-14

| Verificação | Resultado |
|---|---|
| Reprodução mínima | Falhou antes da correção: NPM 11.12.1 iniciado pelo executável do app não encontrou `graceful-fs`; a árvore publicada não continha `resources/npm/node_modules`. |
| `node --check apps/office-desktop/electron-builder.config.cjs` | Aprovado após a alteração. |
| `npm run desktop:package:win` | Aprovado: build do cliente e NSIS Windows x64 `2.1.0`. Permanece o aviso existente do Vite sobre bundle acima de 500 kB. |
| Conteúdo e smoke do recurso empacotado | `resources/npm/bin/npm-cli.js`, `lib/cli.js`, `lib/cli/entry.js`, `node_modules/graceful-fs` e `node_modules/semver` presentes; iniciado por `AIOffice.exe` com `ELECTRON_RUN_AS_NODE=1`, o NPM respondeu `11.12.1`. O servidor completo não foi iniciado para evitar instalação/alteração do perfil local do Maestro. |
| Asset da release `v2.1.0` após a primeira correção | `AIOffice-Setup.exe`, ProductVersion `2.1.0`, 117.950.239 bytes, SHA-256 `f796f82dcbea7d119fbeff30acfac44068eaa31ad4ecad77c23681e15eeb5479`; substituído novamente conforme a seção acima. |
| Link estável nessa primeira correção | `https://github.com/IAPro-Community/AIOffice/releases/latest/download/AIOffice-Setup.exe` respondeu HTTP 200 com 117.950.239 bytes. |
| Assinatura e atualização | Authenticode `NotSigned`; sem `latest.yml` ou blockmap publicado. A instalação é manual e o auto-updater não está ativo. |
| Suítes de teste | Não executadas nesta correção. |

## Instalação automática do plugin de mensagens — 2026-10-14

| Verificação | Resultado |
|---|---|
| Instalação local | `claude update` atualizou a instalação nativa de 2.1.170 para 2.1.299; `npm run mod:install -- --claude C:\Users\fbolz\.local\bin\claude.exe` instalou marketplace e os três plugins em `~/.claude`. |
| `npm run mod:status` | Aprovado: Claude Code 2.1.299; `habblaud`, `habblaud-permissoes` e `habblaud-mensagens` instalados, ligados e versão 0.10.0; saúde local indica mensagens ligadas. |
| `npm run typecheck` e `npm --prefix apps/office-web run typecheck` | Aprovados após a alteração. |
| `npm run build` | Aprovado para workspace, cliente e servidor; aviso existente do Vite para o bundle principal acima de 500 kB. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.345/2.345 textos traduzidos em inglês, espanhol e francês; uma chave antiga sem uso. |
| `npm run desktop:build` | Aprovado para Windows x64 `--dir`; `.claude-plugin/marketplace.json` e `mod/habblaud-mensagens/hooks/register.ts` aparecem em `app.asar.unpacked/apps/office-web`. |
| Testes e inicialização limpa | Testes automatizados não foram executados. A instalação manual/status foi verificada; o fluxo automático não foi observado em uma nova inicialização do servidor. Sessões já abertas precisam de `/reload-plugins`. |
| Segurança/escopo | A automação instala só o plugin de mensagens. `HABBLAUD_MENSAGENS=0` desliga a entrega e evita a instalação automática; nenhum prompt foi enviado. |

## Launcher normal, QR móvel e alerta do navegador — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run build` / `npm run typecheck` | Aprovados. Vite separa o gerador de QR no chunk `browser` (23,46 kB); bundle principal 747,36 kB continua acima do limite de aviso de 500 kB. |
| `npm --prefix apps/office-web run typecheck` | Aprovado após o import dinâmico do QR, a tela de login e o teste focado. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.345/2.345 textos traduzidos em inglês; a ferramenta ainda lista chaves legadas sem uso. |
| `npm test` | Aprovado: 22/22 testes raiz. |
| `npm --prefix apps/office-web run test -- --testTimeout=15000` | Aprovado: 103 arquivos, 1.233 testes aprovados e 10 ignorados. |
| Smoke do QR local | Aprovado: produziu Data URL PNG a partir de link de exemplo, sem chamada externa. O teste de login confirma `type=password`, campo não desativado e aviso visível. |
| Auditoria de dependências | `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilidades em produção. Auditoria completa reporta 8 moderadas em ferramentas de build desktop (`electron-builder`/dependências); não pertencem ao QR e não foram atualizadas nesta tarefa. |
| Launcher PowerShell e `.bat` | `Parser::ParseFile` aprovou `start-aioffice.ps1`; arquivo salvo em UTF-8 com BOM. Revisão confirma que nenhum launcher chama `taskkill`, `Stop-Process` ou `npm run dev`. Os launchers não foram executados para preservar o servidor ativo. |
| `git diff --check` | Aprovado; Git só avisa que normalizará LF para CRLF em arquivos já modificados. |
| QR/reload | URL é convertida em QR no navegador; a dependência fica em chunk dinâmico. Nenhum reload periódico ou automático foi adicionado; a troca de idioma existente segue explícita. |
| Segurança do aviso Chrome | O login aceita digitação mascarada e só autentica no envio. A classificação **Perigoso** é do navegador; o AIOffice não a ignora. Um hostname Quick Tunnel é temporário; não prossiga se o Chrome indicar risco. |
| Serviço ativo | Não reiniciado. O host Vite bloqueado deve desaparecer somente depois de fechar manualmente a instância dev e abrir `start-aioffice.bat`, que usa `start:office` e a porta HTTPS do túnel. |
| Atualizador de releases | Continua bloqueado para esta árvore suja, por proteção do checkout local; modo gerenciado sozinho não transforma desenvolvimento em instalação oficial limpa. |

## AIOffice Desktop — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run typecheck` e `npm --prefix apps/office-web run typecheck` | Aprovados. |
| `npm run build` | Aprovado; Vite mantém aviso de bundle principal acima de 500 kB. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.332/2.332 textos em inglês; catálogo mantém chaves antigas sem uso. |
| `npm --prefix apps/office-web run test -- --testTimeout=15000` | Aprovado: 102 arquivos, 1.232 testes aprovados e 10 ignorados. |
| `npm run desktop:test` | Aprovado: 13 testes do shell Electron, incluindo regressão para a importação CommonJS de `electron-updater`, readiness com nonce, caminhos fora do ASAR e updater assinado. |
| `npm test` (raiz) | Aprovado: 22/22. O teste do heartbeat MCP usa um servidor HTTP efêmero e não depende de uma instância AIOffice externa. |
| `npm run desktop:verify` | Aprovado ponta a ponta após isolar a dependência do teste MCP. |
| `npm run desktop:package:win` (primeiro pacote, antes da correção) | Aprovado: NSIS Windows x64 em `dist/installers/AIOffice-2.1.0-win-x64.exe` (115.750.420 bytes), com `latest.yml` e blockmap gerados localmente. Authenticode local: `NotSigned`. Pacote superado pela verificação no início deste arquivo. |
| URL estável do setup Windows (primeiro envio) | `https://github.com/IAPro-Community/AIOffice/releases/latest/download/AIOffice-Setup.exe` respondeu HTTP 200; SHA-256 inicial: `7dd1d0c8379ac6abf1b927d36e21a0c657cc6fb001c5ad9ab62e2411c987bd4e`. O asset atual está registrado no início deste arquivo. |
| Instalador publicado inicialmente | ProductVersion `2.1.0`, 115.750.420 bytes. Authenticode `NotSigned`; nenhum `latest.yml` ou blockmap enviado, portanto era uma instalação manual, não atualização nativa. |
| Import de `electron-updater` | Reproduzido o erro de import nomeado em Node ESM; import default e regressão de contrato aprovados. |
| Sintaxe/configuração e workflow | `node --check` passou para main, service, preload, config electron-builder e helper de release; YAML carregado e expôs os jobs `build` e `publish`. |
| `npm audit --omit=dev --audit-level=moderate` | Aprovado: 0 vulnerabilidades nas dependências de produção. |
| Atualização da página | Nenhum refresh periódico de página: servidor/cliente atualizam estado por SSE ou polling em background. A nova build mostra banner; `location.reload()` ocorre apenas no clique **Recarregar agora**. A troca de idioma também recarrega somente após escolha explícita. O shell carrega a URL local uma vez ao iniciar; o updater nativo pede confirmação antes de baixar e instalar. |
| Revisão de caminhos e prontidão | A janela aguarda confirmação IPC do processo servidor iniciado nesta execução e health check com a versão esperada; a inicialização usa um diretório real de dados, não o caminho `app.asar`. |
| Limites | Workflow de release validado estaticamente, mas não executado. Builds macOS/Linux, assinatura/notarização, instalação real e atualização de uma release publicada continuam pendentes nos runners e com os certificados correspondentes. |

## Orquestrador-Maestro via NPM — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado após a integração. |
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor. |
| `npm run build` | Aprovado; aviso conhecido do Vite para bundle acima de 500 kB. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: catálogo inglês reportou 2.332/2.332; existem chaves antigas sem uso. |
| `node --check` | Aprovado para helper Maestro, processo desktop, armazenamento desktop e configuração electron-builder; verificação repetida após a última edição do helper. |
| `node apps/office-web/scripts/maestro.mjs status` | Aprovado, somente leitura: CLI global instalada `1.0.1`, latest NPM `1.0.1`, `available: false`. Nenhuma instalação ou atualização foi executada. |
| `npm run desktop:build` | Aprovado para Windows x64 (`--dir`); os artefatos contêm `resources/npm/bin/npm-cli.js` e o helper em `app.asar.unpacked/apps/office-web/scripts/maestro.mjs`. O aplicativo não foi iniciado. |
| Atualização da UI | Busca no novo componente não encontrou recarga de página. A checagem e atualização usam chamadas `fetch` e estado via snapshots/SSE. O reload existente do updater AIOffice só ocorre no clique de **Recarregar agora**; a troca de idioma também é explícita. |
| `git diff --check` | Aprovado, sem erros de whitespace; Git emite avisos de normalização LF/CRLF em arquivos já alterados. |
| Testes automatizados do Maestro | Não executados nesta verificação específica; a suíte de regressão do app web consta na seção de migração móvel abaixo. |
| Docker | Não construído nem executado nesta rodada. A atualização real para uma versão de Maestro mais nova também não foi exercitada, pois o NPM já informa a versão instalada como latest. |

## Histórico: migração inicial para Quick Tunnel e senha mestra — 2026-10-14

| Verificação | Resultado |
|---|---|
| Contrato documental | READMEs, handoff e spec descrevem Configurações → Acesso pelo celular, cadastro de senha mestra, Quick Tunnel Cloudflare e requisito de `cloudflared` no `PATH` |
| CLI legado | Substituído por orientação ao painel; sem operações de arquivos, senha, hash, CA ou rede; `--off` orienta usar **Parar** |
| `npm run remote:setup -- --help` e `npm run remote:off` | Aprovados, exit code 0; imprimem o fluxo de Configurações e a orientação de parada pelo botão, sem provisionar acesso |
| Ciclo de vida documentado | Configuração inicia o túnel; **Iniciar**, **Parar** e **Copiar link** controlam o acesso; partida automática ao ligar o servidor é proibida |
| Identidade AIOffice | Documentação atual não apresenta controles de versão Habblaud como experiência do AIOffice; textos upstream e evidências anteriores são históricos |
| `git diff --check` no escopo documental/CLI | Aprovado; somente avisos de normalização LF/CRLF |
| Typecheck raiz/app | Aprovados, conforme evidência comunicada pelo responsável pela implementação |
| `npm run build` | Aprovado, conforme evidência da implementação; aviso existente Vite de bundle acima de 500 kB |
| i18n | Aprovado: 2.332/2.332 por idioma |
| Suíte app | Aprovada: 102 arquivos, 1.232 testes aprovados e 10 ignorados, conforme evidência da implementação |
| Testes focados de polling/versão/runtime | 37 aprovados, conforme evidência da implementação |
| Estado em segundo plano | Implementação atualiza os dados sem recarga total automática; banner de cliente novo recarrega apenas após clique explícito |
| Disponibilidade do túnel | A interface diferencia servidor em Docker de `cloudflared` ausente; após instalar o executável, orienta reiniciar o AIOffice para recarregar o `PATH` do processo |
| Operação real | Pendente: detectar `cloudflared`/ausência, cadastrar senha, iniciar/copiar link, autenticar no celular, parar/reativar e reiniciar o servidor sem partida automática |

`cloudflared` não foi instalado nem verificado nesta sessão. Nenhum túnel real foi aberto e o serviço em 4747 não foi reiniciado. A validação operacional/publicação do túnel permanece pendente.

> Histórico: as seções abaixo registram verificações anteriores ao contrato Quick Tunnel/senha mestra. Resultados de LAN/VPN/usuário/CA e dos antigos controles de versão não comprovam o fluxo vigente.

## Integração do controle móvel e atualização própria — 2026-10-14

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor |
| `npm run build` | Aprovado; o Vite mantém aviso de bundle principal acima de 500 kB |
| `npm --prefix apps/office-web test -- --testTimeout=15000` | Aprovado: 101 arquivos, 1.219 testes aprovados, 10 ignorados |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.336/2.336 textos por idioma em en/es/fr; há chaves antigas sem uso |
| `npm test` (raiz) | 21/22. `packages/mcp-bridge/test/mcp.test.ts` falha porque não recebeu `result.content` do endpoint local 4747 esperado pelo teste; arquivos da bridge não pertencem a esta alteração |
| UI / responsividade | Instância temporária em perfil isolado; **Acesso pelo celular** e **Sobre** conferidos em 1280 px e 390 px; sem overflow horizontal visível. O harness automatizado `visual-qa.mjs` não pôde rodar porque Playwright não está instalado |
| API remota real | Não exercitada: a porta 4748 da configuração do usuário continua sem listener até a nova build iniciar; o serviço ativo não foi reiniciado |
| `git diff --check` | Aprovado; somente avisos de normalização LF/CRLF |

A cópia de recarga pós-atualização e o estado de verificação desativada não usam mais marca/variável interna do Habblaud na interface.

## Diagnóstico do updater e acesso móvel — 2026-10-13

| Verificação | Resultado |
|---|---|
| Bundle servido em `127.0.0.1:4747/` | `main-DoVwioVj.js` carrega `app-CWocrG6d.js`, que inclui a restrição à origem oficial `IAPro-Community/AIOffice` e a mensagem para backend no canal Habblaud |
| `GET /api/health` | Responde, mas ainda anuncia versão `0.10.0`, repositório `marmottajr/habblaud` e release upstream `0.11.0` |
| `GET /api/snapshot` | Não inclui `meta.remoteAccess` nem capacidade `updates.installation`; o backend na porta é anterior à integração |
| `npm run build` | Aprovado para workspace, cliente e servidor; aviso existente do Vite para bundle principal acima de 500 kB |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.286/2.286 textos por idioma em en/es/fr |
| Ativação do backend gerenciado | Pendente: o processo antigo não foi encerrado porque a ferramenta bloqueou essa ação; nenhum método alternativo foi usado |

Registro histórico de 13/10, anterior às capturas de 14/10: nessa data o painel não tinha credenciais provisionadas. Depois, o usuário executou o CLI legado. O contrato vigente está na seção **Código temporário de login móvel** no início deste documento.

## Atualizador AIOffice e acesso HTTPS remoto — 2026-10-13

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor |
| `npm run build` | Aprovado para workspace, cliente e servidor; o Vite mantém o aviso do bundle principal acima de 500 kB |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.271/2.271 textos por idioma em en/es/fr; somente chaves antigas sem uso |
| `node --check` dos scripts gerenciados | Aprovado para `start-managed.mjs`, `apply-update.mjs` e `release-aioffice.mjs` |
| `npm run remote:setup -- --help` | Aprovado; somente ajuda, sem criar senha ou certificados |
| `npm run release` | Simulação aprovada; nenhuma tag/release criada. Publicação bloqueada: branch fora de `main`, árvore suja e tag local `v2.0.0` já existe |
| `git diff --check` | Aprovado; Git informa apenas normalização LF/CRLF em arquivos já alterados |
| Revisão frontend | Intent FIX / PRESERVE, criatividade baixa; discovery local resolvido (confiança 0,95). Após recarga no Chrome, a badge não aparece, **Verificar agora** fica oculto para o repositório Habblaud e Configurações mostra o aviso do backend antigo e a seção móvel; inspeção com o backend gerenciado segue pendente |
| Health/atividade remota | `127.0.0.1:4747` ainda responde Habblaud `0.10.0`, `pty:false`, 6 sessões Codex e 10 OMP; não há `.env` de acesso remoto nem listener na porta 4748 |
| Ativação da build | Pendente: PID 44148 não tem processo pai; a ferramenta bloqueou o comando de encerramento. Nenhum processo foi parado por força |

O instalador e o rollback real não foram executados, nenhuma release foi publicada e o acesso remoto segue desligado até configuração explícita. Testes automatizados não foram executados nesta rodada. O backend ativo precisa ser encerrado manualmente e reiniciado com `npm run start:office` para carregar a versão `2.0.0` compilada.

## Release v1.1.0 — 2026-10-13

### Gates locais

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm --prefix apps/office-web run typecheck` | Aprovado |
| `npm run build` | Aprovado para cliente e servidor |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2054/2054 textos por idioma; 10 chaves antigas sobram em cada idioma |
| `git diff --check` | Aprovado; Git avisa sobre normalização LF/CRLF em arquivos modificados |
| `npm --prefix apps/office-web run omp:status` | Aprovado; extensão local igual à fonte versionada |
| Importação da extensão com Bun | Aprovado |
| `GET /api/health` no serviço local | Aprovado; Claude Code, Codex e OMP detectados |

O Vite ainda avisa que o bundle principal passa de 500 kB. Testes automatizados não foram executados nesta preparação.

### Validação operacional pendente

- A extensão OMP usa `sendUserMessage`, monitora troca de sessão e só confirma a entrega após o resultado da chamada.
- Sessões OMP abertas antes de instalar ou atualizar a extensão precisam ser reabertas para carregá-la.
- Não foi enviada mensagem de teste nem interrompida uma sessão ativa. O usuário ainda precisa confirmar o envio real e o ACK `delivered`.

## Cobertura atual

| Provedor | Sessões/atividade | Conversa e histórico | Mensagens pelo escritório | Observação |
|---|---|---|---|---|
| Claude Code CLI | Integrado | Integrado | Mod instalado na sessão | Diagnóstico local em 2026-10-13: CLI 2.1.170 instalado, sem processo ativo; registros/transcripts locais antigos |
| Claude Desktop Chat/Cowork | Presença/atividade MCP explícitas | Não integrado | Não integrado | Exige chamadas de ferramenta; transcript e mensagens não são capturados automaticamente |
| Claude Desktop Code e Claude.ai | Não integrado como fonte | Não integrado | Não integrado | Desktop Code separa o histórico do CLI; as sessões não entram no watcher atual |
| Codex | Integrado | Integrado | Entregador Codex | No Docker, requer `npm run codex:bridge` no host |
| oh-my-pi (OMP) | Integrado | Parser e histórico ligados | Extensão AIOffice | Reabrir a sessão para carregar; teste real pendente |
| Devin, Antigravity, OpenCode, Freebuf e Gemini CLI | Não integrado de ponta a ponta | Não garantido | Não garantido | Tipos, executáveis locais ou configuração MCP não bastam para declarar suporte |

Conexões MCP de Cursor, Windsurf, Claude Desktop ou Antigravity são uma integração diferente da leitura de sessões de CLI. No Claude Desktop Chat/Cowork, MCP só gera eventos enviados explicitamente por chamadas de ferramenta; não serve como watcher passivo.

## Limites e próximos passos

- A API local `/api/health` respondeu `ok`; fontes atuais: Claude Code 0, Codex 8 e OMP 10. O escritório refletia agentes Codex e OMP, sem agente Claude.
- Confirmado em 2026-10-13: a atividade ausente veio de Claude Desktop Chat/Cowork. `aioffice` estava configurado e o processo MCP ativo, mas não houve chamada de heartbeat/atividade.
- Confirmar o ciclo completo de mensagem OMP em uma sessão reaberta.
- Definir quais CLIs entram na próxima etapa; integrar cada uma por capacidade real (descoberta, atividade, terminal, histórico, mensagens, permissões e uso).
- Avaliar divisão do bundle principal para remover o aviso de tamanho.

## Melhorias da interface — 2026-10-13

| Verificação | Resultado |
|---|---|
| `npm run build` | Aprovado; cliente e servidor compilados. O Vite ainda avisa que o bundle principal excede 500 kB. |
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor. |
| `npm --prefix apps/office-web test` | 100 arquivos, 1.217 aprovados e 10 ignorados. |
| `npm test` | 22 aprovados em 8 suítes, incluindo a verificação de que o CLI não inicia o executor Maestro sem `--maestro-fallback`. |
| `npm --prefix apps/office-web run i18n:check` | 2.185/2.185 textos por idioma em en/es/fr; há chaves antigas não utilizadas, sem textos ativos sem tradução. |
| `git diff --check` | Aprovado; apenas avisos de normalização LF/CRLF em alterações preexistentes e documentação. |
| QA visual | Central de trabalho e catálogo inspecionados na interface local; layout responsivo conferido em 390 px e desktop. |

**Operação:** a build do cliente está disponível para recarga no serviço local. O processo backend não foi reiniciado e segue na versão em execução, para não interromper sessões ativas. As alterações de terminal/servidor desta rodada ainda precisam de reinício seguro antes de validação operacional; não foram enviados prompts nem mensagens.

## Evolução visual do Habblaud — 2026-10-13

| Verificação | Resultado |
|---|---|
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor. |
| `npm --prefix apps/office-web run build` | Aprovado; cliente e servidor compilados. O aviso existente de bundle acima de 500 kB permanece. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.195/2.195 textos ativos em en/es/fr; somente chaves antigas não utilizadas. |
| `git diff --check` | Aprovado; Git reportou somente avisos de normalização LF/CRLF em arquivos já modificados. |
| QA visual | Simulação carregada e inspecionada em 320, 341, 375, 390, 410, 768, 1280 e 1440 px. Sem overflow horizontal; cabeçalho permaneceu em uma linha sem corte nos tamanhos estreitos. Em 390/768/1280/1440 px: sem erros de console/página ou controles sem nome. Paleta alto contraste, seletor e cenário Aurora conferidos visualmente em desktop; seletor conferido em celular. |

**Operação:** verificação executada em Vite separado na porta 5174 com dados mockados. O serviço 4747 e as sessões ativas não foram reiniciados. Nenhuma mensagem ou ação real foi enviada.

## Canal de atualização do AIOffice — 2026-10-13

| Verificação | Resultado |
|---|---|
| `npm run build` | Aprovado para workspaces, cliente e servidor. Permanece o aviso existente de bundle acima de 500 kB. |
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor. |
| `npm test` | 22 testes aprovados em 8 suítes. |
| `npm --prefix apps/office-web run i18n:check` | Aprovado: 2.194/2.194 textos por idioma em en/es/fr; há chaves antigas sem uso. |
| Testes completos do app (`npx vitest run --testTimeout=15000`) | 101 arquivos; 1.219 aprovados e 10 ignorados. |
| `npm --prefix apps/office-web test` com limite padrão | Dois testes que iniciam subprocessos excederam 5 s (`codex-hook` e `permission-hook`). Com limite de 15 s, a suíte completa passou. |
| Testes específicos do versionamento/configuração | 3 arquivos, 24 testes aprovados. |
| `npm run check:habblaud-upstream` | Aprovado; API do GitHub confirmou que a release upstream mais recente segue em `v0.11.0`, igual ao marco revisado. Consulta somente de leitura. |
| `git diff --check` | Aprovado; Git exibiu apenas avisos de normalização LF/CRLF em arquivos alterados. |

**Operação:** nenhuma release foi publicada, nenhum servidor foi reiniciado e nenhum processo ou sessão ativa foi interrompido.

## Calendário e programação automática de temas — 2026-10-13

| Verificação | Resultado |
|---|---|
| `npm --prefix apps/office-web run typecheck` | Aprovado para cliente e servidor. |
| `npm --prefix apps/office-web run build` | Aprovado; aviso existente do bundle cliente acima de 500 kB permanece. |
| `npm --prefix apps/office-web run i18n:check` | 2.210/2.210 textos ativos em en/es/fr; somente chaves antigas sem uso. |
| `git diff --check` | Aprovado; apenas avisos existentes de normalização LF/CRLF. |
| Frontend visual QA | PASS em 390, 768, 1280 e 1440 px: sem erro de console/página, overflow ou controle sem nome. |
| Popover em 320×568 | Largura 304 px, documento sem overflow; conteúdo de configurações permanece acessível por rolagem vertical. |
| Inspeção de cenários | Carnaval, Páscoa e Ano-Novo conferidos no canvas em pixel-art. |

**Testes automatizados:** não executados nesta etapa.

## Diagnóstico da atualização automática do desktop — 2026-10-14

| Verificação | Resultado |
|---|---|
| `git fetch origin` | Aprovado; `origin/main` aponta para `01e59b3f0e5b7950986859b4ed5d7a9f1f1847be`. |
| Checkout limpo `AIOfficeBeta-release-v2.1.0` | `main...origin/main`, mesmo commit atual do GitHub; pacote `2.1.0`; árvore limpa. |
| `gh release view` | Release estável mais recente `v2.1.0`; único asset `AIOffice-Setup.exe`, sem manifesto `latest.yml` ou blockmap. |
| API local `/api/health` | Aprovado; servidor instalado responde `2.1.0` com `updates.state: off`. |
| `aioffice.log` | Confirma literalmente `Versão nova: verificação desligada (HABBLAUD_UPDATE_CHECK)`. |
| `serverEnvironment()` e `updateStrategy()` | Código força `HABBLAUD_UPDATE_CHECK=0`; updater nativo Windows requer metadados marcados como assinados e publisher configurado. |
| Assinatura PE de `AIOffice.exe` instalado | `NotSigned`. `gh secret list` e `gh variable list` no escopo do repositório não retornaram entradas de signing; secrets de organização não foram inspecionados. |
| Diferença entre candidato local e GitHub | A árvore atual tem pacote `2.2.0` e mudanças locais; `origin/main` v2.1.0 não inclui `apps/office-desktop` nem workflow de release desktop. |

**Testes/build:** não executados; esta rodada foi uma investigação de estado e configuração somente leitura.

**Operação:** build do cliente atualizada no serviço local; backend e sessões não foram reiniciados.

## Seletor manual de cenários comemorativos — 2026-10-13

| Verificação | Resultado |
|---|---|
| Seletor principal após build | 13 opções visíveis: Automático e os 12 cenários fixos, incluindo os seis comemorativos. |
| Seleção de cenário | Carnaval pode ser selecionado diretamente e passa a ser a opção marcada como fixa. |
| Inspeção visual em 390×844 e 320×568 | Todos os nomes aparecem sem corte; rótulos longos quebram linha e o painel mantém rolagem vertical no celular estreito. |
| Frontend visual QA | PASS em 390, 768, 1280 e 1440 px; sem erros de console/página, overflow horizontal, controles sem nome ou achados de contraste. |
| `npm --prefix apps/office-web run typecheck` e `build` | Aprovados; o aviso existente do bundle cliente acima de 500 kB permanece. |
| `npm --prefix apps/office-web run i18n:check` | Exit code 0; as novas opções usam chaves já traduzidas. O relatório também lista textos de servidor já sem tradução. |
| `git diff --check` | Aprovado; somente avisos LF/CRLF nos arquivos modificados. |

**Testes automatizados:** não executados nesta etapa.
