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
- **Versões e distribuição**: a release oficial mais recente é `v2.1.0`; esta árvore prepara a candidata local `v2.2.0`, ainda sem tag/publicação. A release pública contém apenas `AIOffice-Setup.exe` para Windows x64, sem assinatura Authenticode; não há builds macOS/Linux publicados. O README raiz mantém a disponibilidade e os links por sistema. O app Electron Windows consulta releases estáveis no processo principal, valida tamanho/SHA-256 do asset oficial e oferece o instalador interativo; a UI recebe status por IPC sem reload. A versão `2.1.0` instalada não tem ainda essa implementação e exigirá uma instalação manual única após a publicação.
- **Orquestrador-Maestro obrigatório**: o AIOffice instala via NPM o pacote oficial `@iapro/orquestrador-maestro-cli@latest` quando ausente e exige verificação da camada central antes de iniciar. A tela **Configurações → Orquestrador-Maestro** consulta o NPM em segundo plano e atualiza somente após clique, sem recarregar a página. Desktop empacota a CLI NPM com as dependências de runtime e persiste o prefixo no userData; Docker inicializa/atualiza o prefixo num volume `/maestro`.
- **Acesso pelo celular**: o painel local inicia/para um Cloudflare Quick Tunnel sob demanda e mostra link + QR. O login usa um código aleatório de uso único, emitido localmente, com validade de cinco minutos; o código fica só em memória, fora do link/QR e do `.env`, e é invalidado após login, parada ou reinício. Nenhuma senha mestra é solicitada ou armazenada. Sem timer de inatividade: o túnel permanece ativo até **Parar**, encerrar o AIOffice ou o processo `cloudflared` sair. A seção local lista sessões ativas por navegador/plataforma, com login, última atividade, validade e revogação individual; registros são voláteis, sem IP, User-Agent bruto ou credenciais. A lista atualiza por fetch em background quando painel e aba estão visíveis, sem recarregar a página. O túnel termina numa porta HTTPS autenticada que escuta só no loopback; a porta local principal nunca é exposta. O hostname `trycloudflare.com` é temporário e pode ser classificado pelo Safe Browsing; o AIOffice não contorna avisos do navegador, que podem persistir mesmo com o login por código. `cloudflared` é instalado pelo operador, e o túnel não inicia junto com o servidor. Docker segue sem esse fluxo.
- **Launcher Windows**: `start-aioffice.bat` faz build e inicia o servidor gerenciado em modo normal; não termina processos Node globais. O desktop Electron reconhece o utilitário da própria instalação ou o launcher `start-managed.mjs`, pede shutdown autenticado quando disponível e nunca mata um processo de outro aplicativo. Se uma instância com handshake recusar por PTYs ativos, ela permanece aberta.
- **Inicialização Electron**: o evento de mensagem do `UtilityProcess` no main contém diretamente o payload pronto; a mensagem do filho em `process.parentPort` é que contém `.data`. O app só cria a janela depois desse handshake e do health check; nenhuma recarga integral automática foi adicionada.

## 3. Melhorias de produto — 2026-10-13
- A interface inclui Central de trabalho por projeto, fila de atenção, catálogo por capacidade, filtro por ferramenta e biblioteca de seis modelos de workflow.
- Os modelos geram texto para revisão e cópia; não enviam prompts nem iniciam agentes. A fila de atenção seleciona o agente; não aprova pedidos.
- Claude Code, Codex e OMP são as fontes de sessão ativas. Claude Desktop Chat/Cowork reporta apenas atividade MCP explícita. OpenCode, Antigravity, Devin e Freebuf seguem marcados como incompletos, sem suporte anunciado.
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

## 7. Atualização automática do desktop — 2026-10-14
- `serverEnvironment()` fixa `HABBLAUD_UPDATE_CHECK=0`, por isso a linha de versão da interface mostra “Verificação de novas versões desativada”; a API local e o log confirmam esse estado.
- O updater nativo Electron permanece condicionado a uma release assinada no Windows. A release atual `v2.1.0` contém somente `AIOffice-Setup.exe`, não tem `latest.yml`/blockmap, e é a mesma versão já instalada.
- `origin/main` atualizado e checkout limpo: commit `01e59b3`, pacote `2.1.0`, sem `apps/office-desktop` ou workflow desktop. A árvore local contém a candidata `2.2.0` e as mudanças não publicadas; não sobrescrever.
- Ativação completa requer integrar a fonte/workflow e publicar nova release assinada com metadados de atualização. `gh secret list`/`gh variable list` do repositório não mostrou configuração de assinatura em 2026-10-14; secrets de organização não foram inspecionados.
