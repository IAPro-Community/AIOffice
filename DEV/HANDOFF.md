# HANDOFF — AIOffice

## Estado atual — 2026-10-13

- A build de cliente e servidor está ativa no serviço local do Habblaud. Diagnóstico atual: API saudável; 8 sessões Codex, 10 OMP e 0 Claude Code. O terminal OMP mostra atividade e conversa com o selo de provedor correto.
- A conta Claude Code local existe, mas seus dois registros e transcripts são de 22/09/2026 e não têm processo CLI correspondente ativo. O CLI `claude` está instalado na versão 2.1.170. Os processos `claude.exe` em execução pertencem ao Claude Desktop 2.37337.1; também havia uma aba Claude.ai em login.
- O usuário confirmou que a atividade ausente ocorreu em Claude Desktop → Chat/Cowork. A configuração `aioffice` está presente e o processo MCP estava rodando, mas o Habblaud não tinha agente Claude: a bridge só cria atividade quando o modelo chama `aioffice_heartbeat` ou `aioffice_report_activity`.
- MCP no Chat/Cowork não transmite automaticamente cada mensagem ou o transcript para o Habblaud. A bridge disponível é limitada a presença e resumos explícitos; não oferece mensagens de volta nem leitura do histórico.
- A extensão OMP está versionada em `apps/office-web/mod/omp/aioffice-bridge.ts`. Use `npm run omp:install`, `npm run omp:status` e `npm run omp:uninstall` na pasta `apps/office-web` para instalar, conferir e remover a ponte.
- Mensagens para Claude Code e OMP só ficam disponíveis quando a extensão da sessão consulta a caixa de entrada; Codex usa o entregador próprio. O estado `delivered` depende de confirmação do agente.
- Uma sessão OMP que já estava aberta antes da atualização precisa ser reaberta para carregar a extensão. O envio real ainda aguarda confirmação do usuário; nenhum prompt de teste foi enviado nesta preparação da release.
- Fontes de CLI integradas de ponta a ponta: Claude Code, Codex e OMP. Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm cobertura completa. Configuração MCP de Desktop Chat/Cowork disponibiliza ferramentas, sem ingestão automática de sessão.
- A build segue emitindo o aviso do bundle principal acima de 500 kB; a divisão de chunks fica como melhoria futura.

## Próxima ação

Reiniciar o servidor MCP do Claude Desktop para carregar a bridge compilada e suas descrições corrigidas. Depois, pedir explicitamente a Claude que registre a conversa no Habblaud e validar presença/atividade. Não declarar captura passiva de Chat/Cowork sem uma API oficial de eventos. Em outra etapa, reabrir uma sessão OMP e validar composer, prompt e ACK `delivered`.

## Atualização — Central de trabalho (2026-10-13)

- Build concluída com Central de trabalho por projeto, fila de atenção, catálogo de integrações/capacidades e seis modelos reutilizáveis em português.
- Busca e filtros distinguem conta de ferramenta; ajuda e histórico mostram a cobertura disponível. O catálogo deixa explícitos os limites do MCP e os adaptadores ainda incompletos.
- A interface compilada foi aberta em uma aba de QA; para vê-la na sua janela, recarregue o Habblaud. O backend em execução não foi reiniciado, então mudanças de rotas/servidor ainda aguardam uma reinicialização segura.
- Nenhuma mensagem ou aprovação foi enviada, e nenhuma sessão foi interrompida. No CLI, o executor do Orquestrador-Maestro agora exige `--maestro-fallback`; o caminho mantém as escritas automáticas dos artefatos de demonstração. O runtime e o broker não foram alterados.
