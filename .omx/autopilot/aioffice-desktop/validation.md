# Validação — AIOffice Desktop

## Base
- Worktree existente com mudanças protegidas: documentadas em `.omx/context/aioffice-desktop-20261014T115515Z.md`.
- Node/npm acessíveis no Windows; versões e dependências de empacotamento serão registradas ao executar.

## Execuções
- `npm run typecheck`: aprovado.
- `npm --prefix apps/office-web run typecheck`: aprovado.
- `npm run build`: aprovado; aviso Vite do bundle principal acima de 500 kB.
- `npm --prefix apps/office-web run i18n:check`: aprovado, 2.332/2.332 em inglês.
- `npm --prefix apps/office-web run test -- --testTimeout=15000`: aprovado, 102 arquivos; 1.232 testes aprovados e 10 ignorados.
- `npm run desktop:test`: aprovado, 13 testes, incluindo a regressão do import CommonJS `electron-updater`.
- `npm test`: aprovado, 22/22; o teste de heartbeat MCP usa um servidor HTTP efêmero, sem serviço externo.
- `npm run desktop:verify`: aprovado; inclui typechecks, build, suíte raiz, i18n, testes web e testes desktop.
- `npm run desktop:package:win`: aprovado; NSIS x64 `dist/installers/AIOffice-2.1.0-win-x64.exe` (115.750.420 bytes), `latest.yml` e blockmap gerados localmente. Authenticode local: `NotSigned`.
- `AIOffice-Setup.exe` foi publicado como único asset da release existente `v2.1.0`; versão 2.1.0, 115.750.420 bytes. URL estável validada com HTTP 200; SHA-256 local/remoto confere.
- `npm audit --omit=dev --audit-level=moderate`: aprovado, 0 vulnerabilidades.
- `git diff --check`: aprovado; Git mostra apenas avisos de normalização LF/CRLF nos arquivos já alterados.
- `location.reload()` ocorre somente no botão de recarga do banner e na seleção explícita de idioma; não existe reload de página em timer. Estado de atualizações usa SSE/polling.
- Workflow release validado por parsing YAML; não executado no GitHub Actions nem enviado ao repositório. O único asset publicado é um setup estático sem assinatura e sem metadados de auto-update; cada download pelo URL latest recebe esse arquivo até uma publicação futura.

## Limites
- Este runner é Windows. Builds macOS/Linux e validação real de update assinado precisam dos respectivos runners/credenciais; o workflow fica preparado, não declarado testado.
