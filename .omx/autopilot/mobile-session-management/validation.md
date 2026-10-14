# Validation — mobile session management

## Automated checks

- Focused: `npm --prefix apps/office-web run test -- --run server/http/remote-sessions.test.ts server/http/remote-login.test.ts server/test/remote-runtime.test.ts` — 24/24 passed.
- Full web suite: `npm run test -- --testTimeout=15000` in `apps/office-web` — 104 files; 1,249 passed, 10 skipped.
- `npm --prefix apps/office-web run typecheck` — passed.
- `npm --prefix apps/office-web run i18n:check` — en/es/fr 2,369/2,369; no missing translations, existing stale-key notices remain.
- Client Vite build and server esbuild bundle — passed into `%TEMP%` so the active installed app's served `dist` was not overwritten. Existing Vite >500 kB warning remains.
- `git diff --check` — passed; standard CRLF normalization warnings only.

## Local/operational checks

- `/api/health` — `ok=true`, version `2.1.0`.
- Tunnel status after checks — `disabled`, `configured=false`; no restart or tunnel launch was performed. Earlier in the work the endpoint returned active, but the available application log does not establish why it later became disabled. No cause is attributed to inactivity or user action.
- Runtime source audit — no idle shutdown timer. A 10-second session recheck exists only to close long-lived streams after a revocation; startup and explicit stop have their own bounded waits.
- Endpoint tests confirm remote management is rejected; public session JSON contains no cookie/signature/raw UA/IP; revoking one session leaves another valid.
- Isolated visual smoke with synthetic session API data passed in headless Chrome at 390, 768, 1280, and 1440 px: no horizontal overflow or browser errors; controls named; mock revoke removed one entry. Measurements and screenshot paths are in `visual-check.json`.
- **Not verified live**: login from real devices, idle operation of a real Quick Tunnel, and revoking an actual phone. The open installed v2.1.0 process does not include these workspace edits; preserve it until the user chooses a suitable restart/build window.
