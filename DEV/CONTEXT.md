# CONTEXTO — AIOffice

## 1. Visão Geral
O **AIOffice** é uma plataforma integrada de engenharia de software assistida por IA local-first. Ele une cinco iniciativas complementares:
1. **Orquestrador-Maestro** (`IAPro-Community/Orquestrador-Maestro`): protocolo de governança, constituição (`rules.md`, `maestro.md`, `PERSISTENCE.md`), roteamento de skills e ciclo de evidência/handoff.
2. **OpenOrq**: implementação em código TypeScript com broker de escrita (`policy-broker`), proxy de controle RPC B1 (`rpc-proxy`), cofre seguro DPAPI (`credential-store`) e interface Maestro.
3. **Habblaud** (`marmottajr/habblaud`): interface visual de escritório virtual em pixel art retro (web em `localhost:4747`) com salas por projeto, mesas de agentes, animações de status em tempo real, elevador de subagentes e aprovação de permissões com 1 clique. A ingestão de sessões cobre Claude Code CLI, Codex e OMP. Claude Desktop Chat/Cowork só pode reportar presença/atividade por chamadas MCP explícitas; não transmite automaticamente a conversa. Claude.ai e Desktop Code não são fontes diretas integradas.
4. **oh-my-pi (omp)** (`can1357/oh-my-pi`): runtime de execução em terminal de alta velocidade com edições hashline seguras, ferramentas LSP e AST, e subagentes isolados em worktrees git via `task`.
5. **replica-skill** (`Jakeschincariol/replica-skill`): suíte de 11 skills especializadas para engenharia reversa, clonagem e reconstrução de produtos (pesquisa, design system, código, testes, correções e deploy).

## 2. Decisões Arquiteturais Vigentes
- **Topologia de Repositório**: Monorepo unindo aplicações (`apps/`) e pacotes compartilhados (`packages/`).
- **Segurança BYOK**: Chaves mantidas no cofre do SO (DPAPI no Windows) via `credential-store`. Zero proxy de inferência terceiro.
- **Isolamento de Efeitos**: Nenhuma ferramenta escreve no disco sem mediação do `policy-broker` e aprovação humana explícita.
- **Ponte Visual Habblaud**: Desacoplamento da leitura de arquivos do Claude Code; o Habblaud passa a consumir eventos diretos do OpenOrq via API/WebSocket local.
- **Workflow de Clonagem**: Mapeamento das 11 skills do `replica-skill` para papéis de agentes nas mesas do Habblaud.
- **Versões e distribuição**: a release oficial mais recente é [`v2.4.3`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.3), publicada do commit `8393eae` com nove assets Windows, macOS Intel/Apple silicon e Linux x64. Ela inclui a arte oficial completa nos ícones do app e do instalador, gestão opcional dos CLIs oficiais em armazenamento privado e integração de sessões validada; login sempre pertence ao usuário. Apple signing ainda não está configurado, então pacotes macOS são unsigned, exigem instalação manual e não atualizam automaticamente até configurar Developer ID/notarização. Windows valida SHA-256; Linux AppImage usa manifesto, enquanto `.deb` segue o gerenciador de pacotes. Atualizações e instalação recebem eventos por IPC sem reload da página.
- **Orquestrador-Maestro obrigatório**: o AIOffice instala via NPM o pacote oficial `@iapro/orquestrador-maestro-cli@latest` quando ausente e exige verificação da camada central antes de iniciar. A tela **Configurações → Orquestrador-Maestro** consulta o NPM em segundo plano e atualiza somente após clique, sem recarregar a página. Desktop empacota a CLI NPM com as dependências de runtime e persiste o prefixo no userData; Docker inicializa/atualiza o prefixo num volume `/maestro`.
- **Acesso pelo celular**: o painel local inicia/para um Cloudflare Quick Tunnel sob demanda e mostra link + QR. O login usa um código aleatório de uso único, emitido localmente, com validade de cinco minutos; o código fica só em memória, fora do link/QR e do `.env`, e é invalidado após login, parada ou reinício. Nenhuma senha mestra é solicitada ou armazenada. Sem timer de inatividade: o túnel permanece ativo até **Parar**, encerrar o AIOffice ou o processo `cloudflared` sair. A seção local lista sessões ativas por navegador/plataforma, com login, última atividade, validade e revogação individual; registros são voláteis, sem IP, User-Agent bruto ou credenciais. A lista atualiza por fetch em background quando painel e aba estão visíveis, sem recarregar a página. O túnel termina numa porta HTTPS autenticada que escuta só no loopback; a porta local principal nunca é exposta. O hostname `trycloudflare.com` é temporário e pode ser classificado pelo Safe Browsing; o AIOffice não contorna avisos do navegador, que podem persistir mesmo com o login por código. `cloudflared` é instalado pelo operador, e o túnel não inicia junto com o servidor. Docker segue sem esse fluxo.
- **Launcher Windows**: `start-aioffice.bat` faz build e inicia o servidor gerenciado em modo normal; não termina processos Node globais. O desktop Electron reconhece o utilitário da própria instalação ou o launcher `start-managed.mjs`, pede shutdown autenticado quando disponível e nunca mata um processo de outro aplicativo. Se uma instância com handshake recusar por PTYs ativos, ela permanece aberta.
- **Inicialização Electron**: o evento de mensagem do `UtilityProcess` no main contém diretamente o payload pronto; a mensagem do filho em `process.parentPort` é que contém `.data`. O app só cria a janela depois desse handshake e do health check; nenhuma recarga integral automática foi adicionada.

## 14. Mensagens no desktop instalado — 2026-10-14
- A barra superior e a Central de trabalho acomodam larguras móveis; o login remoto tem ação para colar o código, normalização alfanumérica e envio no sexto caractere. A checagem visual cobriu 320–1.440 px sem overflow da página.
- O desktop Electron roda a entrega de mensagens dentro do servidor local supervisionado; não exige manter `npm run codex:bridge` aberto. Esse auxiliar continua reservado ao Habblaud em Docker.
- Codex usa o binário nativo encontrado em `PATH` ou no prefixo global oficial do NPM (incluindo `%APPDATA%/npm` no Windows) e chama `codex queue` diretamente, sem shim de shell. A CLI do Codex precisa estar instalada e autenticada pelo usuário.
- Claude Code recebe instalação/verificação automática do plugin de mensagens; OMP recebe atualização automática da extensão AIOffice quando o perfil `.omp/agent` existe. Só pontes do AIOffice são instaladas; arquivos de terceiros não são substituídos.
- A candidata v2.4.3 acrescenta instalação/atualização opcional dos CLIs oficiais Codex, Claude Code e OMP em `userData/provider-tools`; o login segue no terminal oficial e é feito pelo usuário. A nova integração Antigravity aceita mensagens somente após hook local validado recentemente. Perfis/sessões já abertos podem exigir `/reload-plugins` ou reabertura. O renderer recebe eventos por IPC e mantém os fluxos existentes; não há refresh integral novo.

## 3. Melhorias de produto — 2026-10-13
- A interface inclui Central de trabalho por projeto, fila de atenção, catálogo por capacidade, filtro por ferramenta e biblioteca de seis modelos de workflow.
- Os modelos geram texto para revisão e cópia; não enviam prompts nem iniciam agentes. A fila de atenção seleciona o agente; não aprova pedidos.
- Claude Code, Codex, OMP e Google Antigravity são as fontes de sessão ativas. O envio Antigravity exige hook validado recente. Claude Desktop Chat/Cowork reporta apenas atividade MCP explícita. Gemini CLI, OpenCode, Devin e Freebuf seguem incompletos, sem suporte anunciado.
- O CLI não inicia o executor Maestro por padrão. `--maestro-fallback` é uma ativação explícita de último recurso; o runtime, o policy-broker e o RPC não foram alterados. Esse caminho do CLI mantém o comportamento de demonstração anterior e aprova automaticamente as escritas de artefatos.

## 4. Temas automáticos do Habblaud — 2026-10-13
- O cenário Automático combina um calendário brasileiro/internacional com quatro faixas de hora local configuráveis; eventos comemorativos têm prioridade.
- A agenda e a opção de eventos ficam salvas nas preferências locais do navegador. O cenário fixo continua independente da agenda automática.
- Os doze cenários fixos, inclusive os seis comemorativos, ficam disponíveis no seletor principal.
- Datas móveis de Carnaval e Páscoa são calculadas para cada ano; o horário é reavaliado pelo relógio local e pelo relógio reproduzido no timelapse.

## 5. Diagnóstico do updater e conexão móvel — 2026-10-13
- A interface compara releases exclusivamente com `IAPro-Community/AIOffice`; versões de `marmottajr/habblaud` não são versões do produto AIOffice.
- O serviço observado em `127.0.0.1:4747` ainda responde como Habblaud `0.10.0`, consulta o upstream Habblaud e não informa a nova capacidade `meta.remoteAccess`. O backend gerenciado precisa assumir a porta para atualizar esses dados.
- A decisão inicial por LAN/VPN e instalação de CA no telefone foi substituída em 2026-10-14 pelo Quick Tunnel Cloudflare, controlado no painel do AIOffice. O histórico de capturas e diagnósticos abaixo continua registrando o comportamento anterior.

## 6. Mensagens automáticas para Claude Code — 2026-10-14
- Com mensagens habilitadas, o servidor local e o comando host `npm run docker:up` instalam/verificam o plugin `habblaud-mensagens` nas contas Claude Code detectadas; falhas não impedem o Habblaud de iniciar.
- A instalação automática é limitada ao plugin de mensagens. A instalação completa do mod, captura de uso e respostas a permissões continua disponível em `npm run mod:install`.
- Exige Claude Code 2.1.287 ou mais novo; o resolver respeita `HABBLAUD_CLAUDE_BIN`, tenta `~/.local/bin/claude` (Windows: `claude.exe`) antes do `PATH`, e sessões abertas precisam de `/reload-plugins` após a primeira instalação.
- `HABBLAUD_MENSAGENS=0` mantém o plugin fora da automação e desliga a entrega. Claude Desktop Chat/Cowork não é alvo desta integração.

## 7. Atualização do desktop — política da candidata v2.3.0
- `HABBLAUD_UPDATE_CHECK=0` continua desligando o verificador de instalação Node embutido no servidor; esse estado não desliga o updater do desktop Electron.
- Windows consulta releases estáveis ao iniciar e a cada seis horas, valida setup por digest SHA-256, e pede confirmação antes do download/instalação. O polling passa por IPC sem reload da página.
- AppImage Linux usa `latest-linux.yml`; `.deb` usa o gerenciador de pacotes. macOS só ativa `electron-updater` quando `aiofficeRelease.signed` é verdadeiro e tem `latest-mac.yml`; builds unsigned orientam a instalação manual via GitHub Releases.
- A release pública `v2.2.1` permanece Windows-only até a matriz v2.3.0 concluir os builds nativos; verificar `DEV/HANDOFF.md` para o estado atualizado.
- A tag `v2.2.0` permanece no GitHub sem release por falhas do workflow; não reutilizar nem mover a tag.
