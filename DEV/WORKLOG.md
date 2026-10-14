# WORKLOG — AIOffice

## 2026-10-13 — Preparação da release AIOffice v2.0.0
- **Versões**: pacote raiz `2.0.0`; CLI `0.2.0`. O Habblaud permanece em `0.10.0` nesta release.
- **Compatibilidade**: o CLI deixa de executar o fallback Maestro por padrão; `--maestro-fallback` ativa o executor de demonstração explicitamente. Não há migração de banco de dados.
- **Validação no commit isolado**: `npm run verify` passou (build e 22 testes); typecheck passou; suíte Habblaud passou com 4 workers (1.217 aprovados, 10 ignorados); i18n passou com 2.185/2.185 textos em en/es/fr. A execução padrão da suíte Habblaud com 100 workers atingiu timeout de teste de 5 s; a repetição limitada a 4 workers passou.
- **Operação**: bundle principal continua acima de 500 kB. O serviço local não será reiniciado durante a publicação para preservar sessões ativas.

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
