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
| `DEV/SPECS/ACTIVE.md` | Especificação técnica, roadmap e critérios ativos, incluindo temas V1/V2 do mapa e temas automáticos do Habblaud | Ativo |
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
- Release latest [`v2.4.4`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.4) publicada no commit `6720cc69a7ab34b5b53369e1949bc5c4e4201433`; workflow [38818251334](https://github.com/IAPro-Community/AIOffice/actions/runs/38818251334) passou. São cinco assets Windows/Linux, incluindo ZIP da extensão e sem builds macOS unsigned. Tamanhos/hashes em `DEV/VERIFY.md`.
- Release anterior: [`v2.4.3`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.3), tag mantida no commit `8393eaeb88c9fa658231499695e407ac4d575bb2`. O [refresh Windows/Linux](https://github.com/IAPro-Community/AIOffice/actions/runs/38772157012) removeu os assets macOS unsigned e manteve setup Windows, AppImage/deb Linux e `latest-linux.yml`. A release estável atual é v2.4.4, listada acima.
