# HANDOFF — AIOffice

## Estado atual — 2026-10-13

- A build de cliente e servidor foi ativada no serviço local do Habblaud. O terminal OMP mostra atividade e conversa com o selo de provedor correto.
- A extensão OMP está versionada em `apps/office-web/mod/omp/aioffice-bridge.ts`. Use `npm run omp:install`, `npm run omp:status` e `npm run omp:uninstall` na pasta `apps/office-web` para instalar, conferir e remover a ponte.
- Mensagens para Claude Code e OMP só ficam disponíveis quando a extensão da sessão consulta a caixa de entrada; Codex usa o entregador próprio. O estado `delivered` depende de confirmação do agente.
- Uma sessão OMP que já estava aberta antes da atualização precisa ser reaberta para carregar a extensão. O envio real ainda aguarda confirmação do usuário; nenhum prompt de teste foi enviado nesta preparação da release.
- Fontes de CLI integradas de ponta a ponta: Claude Code, Codex e OMP. Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm cobertura completa. Configuração MCP de IDE não equivale a ingestão de sessão de CLI.
- A build segue emitindo o aviso do bundle principal acima de 500 kB; a divisão de chunks fica como melhoria futura.

## Próxima ação

Reabrir uma sessão OMP, confirmar que o composer fica disponível e enviar uma mensagem curta pelo escritório; verificar o prompt no OMP e o ACK `delivered`.
