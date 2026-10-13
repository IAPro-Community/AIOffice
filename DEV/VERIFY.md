# VERIFY — AIOffice

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
| Claude Code | Integrado | Integrado | Mod instalado na sessão | Acesso local e configuração de mensagens aplicados |
| Codex | Integrado | Integrado | Entregador Codex | No Docker, requer `npm run codex:bridge` no host |
| oh-my-pi (OMP) | Integrado | Parser e histórico ligados | Extensão AIOffice | Reabrir a sessão para carregar; teste real pendente |
| Devin, Antigravity, OpenCode, Freebuf e Gemini CLI | Não integrado de ponta a ponta | Não garantido | Não garantido | Tipos, executáveis locais ou configuração MCP não bastam para declarar suporte |

Conexões MCP de Cursor, Windsurf, Claude Desktop ou Antigravity são uma integração diferente da leitura de sessões de CLI.

## Limites e próximos passos

- Confirmar o ciclo completo de mensagem OMP em uma sessão reaberta.
- Definir quais CLIs entram na próxima etapa; integrar cada uma por capacidade real (descoberta, atividade, terminal, histórico, mensagens, permissões e uso).
- Avaliar divisão do bundle principal para remover o aviso de tamanho.
