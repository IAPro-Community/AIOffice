# Implementation plan — AIOffice release updater and remote access

| ID | Owner | Scope | Depends on | Parallel | Verification |
|---|---|---|---|---|---|
| P1 | Remote implementation agent | Remote password/env/TLS, listener gate and setup modules under `apps/office-web/server/remote/**`, `server/http/remote.ts`, optional isolated `apps/office-web/scripts/remote-setup.ts`. | — | Yes | Lead integration typecheck/build; static security review |
| P2 | Update UI/API agent | `apps/office-web/client/src/ui/version.ts`, `apps/office-web/server/updates/**` API contracts, `apps/office-web/server/http/app.ts`, `apps/office-web/shared/types.ts`. Route delegates; it must not execute Git. | — | Yes | Lead integration typecheck/build/i18n |
| P3 | Lead | Root release script, stable apply worker and installer service, config/index/package wiring, remote listener integration, status persistence, docs and DEV memory. | P1, P2 interfaces | No | Build, typecheck, i18n, diff check; then local API |
| P4 | Independent review agent | Read-only adversarial review of updater lifecycle, Windows restart, boundaries, and rollback. | P3 | No | Findings adjudicated against final diff |
| P5 | Lead | Fix findings, run final gates, restart local server only if PTY/process state is safe, verify live AIOffice version and updater status. | P4 | No | Fresh command and HTTP evidence |

## Integration contract

- Update API accepts a requested semver only and calls an injected updater manager. It never invokes arbitrary Git commands itself.
- The root owns the official repository identity and clean-worktree/staging/rollback/restart logic.
- Update status is persisted across process restart. Badge removal is derived from `latest <= running AIOffice version`, never from a download response.
- Remote code adds no routes to the existing local listener without auth; lead adds `config.remote`, a second listener, API feature gates, and startup/shutdown lifecycle.
- Existing dirty edits are the rollback boundary; no reset/clean/stash or broad file replacement.
