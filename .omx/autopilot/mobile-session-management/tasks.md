# Tasks — mobile session management

1. [x] Backend session inventory and local API — `GET /api/remote-access/sessions` returns `{ sessions: [{ id, device, loggedInAt, lastSeenAt, expiresAt }] }`; `POST /api/remote-access/sessions/:id/revoke` with `{}` returns `{ ok: true }` or 404. Cookies/signatures stay private and the remote listener is blocked. Focused tests and typecheck passed.
2. [x] Mobile session panel — consumes the contract, shows device/login/last-activity/expiry, revokes one session, updates by DOM without full page reload, and polls only while panel visible and tunnel active. Typecheck and i18n passed.
3. [x] Lead integration and docs — local-only and revocation guards reviewed; no idle shutdown timer; DEV and Autopilot artifacts updated.
4. [x, bounded] Verification — focused + full app tests, typecheck, i18n, isolated client/server bundles, `git diff --check`, localhost smoke, and isolated visual QA at four widths passed. The installed app was not restarted. Live mobile session QA remains pending.

