# Plano — implementação AIOffice Desktop

| ID | Owner | Módulos | Dependências | Paralelo | Verificação | Evidência |
|---|---|---|---|---|---|---|
| D1 | líder | `apps/office-web/server/index.ts`, `server/config.ts`, `server/log.ts`, lifecycle/tests | — | Não | office-web typecheck/teste | serviço exporta pronto/close; usa caminhos explícitos |
| D2 | líder | `apps/office-desktop/**`, preload, updater, diagnósticos | D1 | Não | tests + main bundle/typecheck | segurança Electron, integração health, update prompts |
| D3 | líder | raiz `package.json`/lock, scripts de stage, electron-builder e assets | D2 | Não | npm ci/build/package win | `.exe`, app contents, dependências nativas |
| D4 | líder | `.github/workflows/release-desktop.yml` | D3 | Não | parse/inspection; execução runner local | matriz por plataforma; publish gated/sign secrets |
| D5 | líder | README e `DEV/*` | D1-D4 | Não | leitura de procedimentos | instalar/desenvolver/diagnosticar/publicar documentados |
| D6 [VERIFY] | líder | diff integrado | D1-D5 | Não | typecheck, build, tests, pacote e `git diff --check` | gates registrados e risco externo explícito |

## Rulings
- Sem agentes: os módulos de serviço, configuração do pacote, updater e release compartilham contratos; execução solo sequencial reduz conflitos.
- Nenhum comando publicará artefatos, criará tag, commit ou push.
- Reusar a segurança e as rotas atuais; não alterar os diffs web updater pré-existentes.
