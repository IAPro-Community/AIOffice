# WORKLOG — AIOffice

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
