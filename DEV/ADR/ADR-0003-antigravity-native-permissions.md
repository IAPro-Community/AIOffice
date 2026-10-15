# ADR-0003 — Integração Antigravity com permissões nativas

- **Status:** Aceito pelo usuário em 2026-10-14
- **Escopo:** Descoberta de sessões, transcript, atividade, mensagens e hooks locais do Antigravity no AIOffice

## Contexto

O adaptador anterior procurava um diretório/formato de sessão incorreto e não oferecia um transporte seguro para mensagens. O Antigravity App, IDE e CLI documentam transcripts em `~/.gemini/antigravity*/brain/<conversationId>/.system_generated/logs/transcript.jsonl` e hooks globais em `~/.gemini/config/hooks.json`. `PreInvocation` permite injetar `userMessage` antes da próxima chamada do modelo; não há mecanismo nesses hooks para acordar uma conversa ociosa.

O usuário autorizou espelhar presença, tarefa, atividade e conteúdo, além de enviar mensagens do AIOffice para o Antigravity. Para permissões, escolheu manter as decisões nativas do Antigravity; não autorizou colocar cada ferramenta em uma fila de aprovação manual do AIOffice.

## Decisão

- Ler transcripts em modo somente leitura; descobrir sessões e histórico sem abrir nem alterar bancos SQLite internos.
- Usar hooks globais oficiais para atividade ao vivo e consultar a caixa de entrada do AIOffice em `PreInvocation`. Entregar mensagens por `injectSteps: [{ userMessage }]`, confirmar o ACK depois de emitir a resposta do hook e nunca editar o transcript.
- `PreToolUse` só registra a chamada e retorna `{}`. Não emitir `allow`, `deny`, `ask`, `auto_approve` ou outra decisão de permissão; a política e a interface nativas do Antigravity continuam responsáveis.
- Mostrar chamadas e resultados de ferramentas como atividade. Pedidos/decisões de permissão permanecem no Antigravity.
- Instalar somente a entrada `AIOffice` em `~/.gemini/config/hooks.json`, preservar outros hooks e criar backup antes de alterar arquivo existente. O instalador também oferece `status` e `uninstall` para inspeção/reversão.
- Restringir o endpoint de eventos ao loopback. Validar caminhos canônicos dos transcripts/históricos e limitar/remover campos privados dos eventos públicos.

## Alternativas consideradas

- Aprovação manual de toda chamada de ferramenta pelo AIOffice: rejeitada pelo usuário e não compatível com a política nativa escolhida.
- Escrita direta em `transcript.jsonl` ou SQLite para enviar mensagens: rejeitada por não ser a interface oficial e poder corromper estado mantido pelo Antigravity.
- Somente varredura de arquivos: detecta histórico/conteúdo, mas não fornece contexto ao vivo nem transporte oficial de mensagens.

## Consequências e riscos

- Sessões com transcript disponível aparecem mesmo antes da instalação dos hooks. Atividade ao vivo e envio começam quando o Antigravity carregar a configuração global.
- Mensagens entram antes da próxima invocação do modelo; hooks não acordam uma conversa completamente ociosa.
- O AIOffice acompanha eventos de ferramentas, mas não espelha nem controla o diálogo nativo de permissões.
- Se o contrato oficial dos hooks mudar, revisar o instalador e o parser antes de continuar anunciando compatibilidade.

## Referência e verificação

- Contrato oficial de configuração, eventos e `injectSteps`: [Hooks do Google Antigravity](https://www.antigravity.google/docs/hooks/).
- A integração é coberta por testes de parsing incremental, replay/rotação, contenção de caminho, instalação/migração, privacidade e ciclo de inbox/ACK. A matriz de release também inicia o aplicativo empacotado nos runners nativos.
