# ADR-0001 — Entrega de mensagens para oh-my-pi

- **Status:** Aceito
- **Data:** 2026-10-13
- **Escopo:** Extensão global `~/.omp/agent/extensions/aioffice-bridge.ts`

## Contexto

O Habblaud entrega mensagens OMP por `POST /api/mod/inbox` e só confirma a entrega depois do ACK da extensão. A versão anterior usava `setInterval` global e chamava `sendUserMessage(text, { deliverAs: 'followUp' })`; o OMP mantém um `followUp` em espera quando está ocioso, sem iniciar uma rodada. O processo já aberto também não carrega alterações feitas no arquivo da extensão após sua inicialização.

## Decisão

- Usar `ctx.setInterval` gerenciado pelo OMP, com fallback protegido e limpo no shutdown para versões antigas.
- Ler o ID atual da sessão no início, na troca e no branch da sessão.
- Enviar com `pi.sendUserMessage(text)` sem `deliverAs`: inicia a rodada quando ocioso e entra como steer durante uma rodada ativa.
- Não usar `sendMessage` como fallback, pois sua semântica ociosa não garante início de rodada.
- Guardar ACKs pendentes e tentar novamente; marcar sucesso somente quando `sendUserMessage` resolver.

## Alternativas consideradas

- `followUp`: pode permanecer enfileirado sem iniciar o turno quando o OMP está ocioso.
- `sendMessage`: sem `triggerTurn`, não inicia uma rodada ociosa.
- Timer global sem isolamento: uma exceção não tratada em callback pode derrubar a sessão OMP.

## Consequências e riscos

- Uma sessão OMP aberta antes da atualização precisa ser reaberta para carregar a extensão nova.
- O serviço Habblaud não precisa reiniciar para esta alteração da extensão; o inbox e o ACK já existem.
- A entrega em execução real ainda depende de reabrir a sessão e enviar uma mensagem curta pelo painel.

## Verificação e revisão

- Import/transpilação da extensão com Bun: aprovado em 2026-10-13.
- Snapshot ao vivo ainda mostra `canMessage` ausente na sessão atual; o processo foi iniciado às 14:20 e o arquivo atualizado às 14:58.
- Sem envio de mensagem de teste e sem reiniciar processos OMP ativos.
- Rever após o teste real do usuário ou se a API de extensões do OMP mudar.
