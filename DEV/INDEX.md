# DEV — Índice: AIOffice

Hierarquia de documentação operacional do projeto AIOffice.

## Ordem de Leitura Obrigatória
1. `DEV/INDEX.md` — este mapa
2. `DEV/HANDOFF.md` — estado operacional e próximo passo
3. `DEV/CONTEXT.md` — contexto do produto, arquitetura e decisões vigentes
4. `DEV/SPECS/ACTIVE.md` — contrato vivo da fase ativa
5. `DEV/VERIFY.md` — matriz e evidências de verificação
6. `DEV/WORKLOG.md` — log cronológico de trabalho

## Mapa de Documentação
| Caminho | Papel | Status |
|---|---|---|
| `DEV/INDEX.md` | Índice geral e mapa da pasta `DEV/` | Ativo |
| `DEV/CONTEXT.md` | Arquitetura dos 5 pilares, decisões vigentes e restrições | Ativo |
| `DEV/SPECS/ACTIVE.md` | Especificação técnica, roadmap e critérios ativos, incluindo temas automáticos do Habblaud | Ativo |
| `DEV/ADR/ADR-0001-omp-message-delivery.md` | Decisão sobre polling, envio e ACK da extensão OMP | Atual |
| `DEV/ADR/ADR-0002-habblaud-update-policy.md` | Política para integrar Habblaud upstream, atualizar releases AIOffice e oferecer acesso remoto HTTPS | Atual |
| `DEV/ADR/ADR-0003-antigravity-native-permissions.md` | Integração do Antigravity por hooks oficiais, mantendo as decisões de permissões no próprio produto | Atual |
| `DEV/DESKTOP.md` | Execução, persistência, CLI NPM empacotada, instaladores, atualizações, assinatura e publicação do app Electron | Ativo |
| `DEV/HANDOFF.md` | Estado operacional, evidências recentes e próxima ação segura | Ativo |
| `DEV/UI-AUDIT-2026-10-13.md` | Auditoria da interface Habblaud, cobertura de provedores e roadmap de melhorias | Atual |
| `DEV/VERIFY.md` | Critérios de aceitação, gates e evidências de validação, incluindo QA visual | Ativo |
| `DEV/WORKLOG.md` | Registro conciso de mudanças, motivos e evidências | Ativo |
| `README.md` | Apresentação pública, capturas, início rápido e downloads por sistema | Ativo |
| `apps/office-web/README*.md` | Guias Habblaud em inglês, português, espanhol e francês | Ativo |

## Estado da release
- Release oficial mais recente: [`v2.3.0`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.3.0), publicada a partir do commit `762a500`. Contém nove assets para Windows, macOS Intel/Apple silicon e Linux x64. A candidata `v2.4.2` reúne as mudanças ainda não publicadas, incluindo a arte oficial completa nos ícones do app/instalador, gestão opcional dos CLIs oficiais e integração nativa do Antigravity. Consulte `DEV/HANDOFF.md`, `DEV/DESKTOP.md` e `DEV/VERIFY.md` para status, limites e evidências.
