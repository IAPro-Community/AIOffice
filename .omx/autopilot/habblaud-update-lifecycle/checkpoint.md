# Checkpoint — Habblaud update lifecycle

- **Phase:** Code, integration, UI inspection, and available gates complete; handoff awaits one manual restart of the existing server.
- **Accepted direction:** Maintainers integrate and validate upstream Habblaud; end users update the AIOffice release as a whole.
- **Baseline:** Preserved the user's uncommitted AIOffice root version 2.0.0 candidate and all unrelated edits. The current web package still says 0.10.0; do not claim Habblaud 0.11.0 feature parity. Branch `codex/habblaud-011-integration-20261013` starts at the original AIOffice v1.1.0 commit.
- **Comparison:** Upstream v0.10.0..v0.11.0 changes 95 files (~9,722 insertions). Three low-risk fixes are already present. User later explicitly requested automatic AIOffice updates and remote access on LAN/VPN; implement them with local-only managed install and authenticated HTTPS safeguards.
- **Implementation:** Root package owns release identity. About UI offers install and clears badge only after a live snapshot confirms target version. Installer stages official tags externally, blocks unsupported/dirty/session-active installs, preserves runtime and rollback data, and confirms restart with exact version/nonce/PID. Remote access is opt-in HTTPS with a five-minute, one-use local code, signed sessions, and a per-listener random session nonce.
- **Verification:** The current code follow-up passed root/app typechecks, build, i18n (2,353/2,353 per language), and diff check. Automated tests, live visual QA, and a real tunnel/login were not run. Adversarial review findings and resolutions are recorded in `validation.md`.
- **Boundary:** Preserve pre-existing user changes. No commit, push, release, deploy, or remote credential/CA provisioning. The local service was inspected (`pty:false`, 6 Codex and 10 OMP sessions) but not stopped: the host blocked the process-stop command. It remains on Habblaud 0.10.0 until the orphaned process is ended and restarted with `npm run start:office`.

## Follow-up — operator-owned mobile controls (2026-10-14)

- **Phase:** Execution. The user clarified the mobile feature should have first-time configuration plus in-process Start/Stop buttons and all phone connection details in Settings. The user also reiterated that version UI must never show Habblaud's version as AIOffice.
- **In flight:** All implementation lanes returned. The lead integrated shared status types, exact AIOffice channel identity, docs, and reviewed fixes.
- **Contract:** local-only `/api/remote-access/{status,configure,start,stop,ca}` routes; hashed credentials; HTTPS on a separate private LAN/VPN listener; read-only by default; stopping preserves configuration; unknown/non-AIOffice update channels have no numeric version chip or upstream repo link.
- **Validation:** Root/app typecheck and build pass; app suite 101 files / 1,219 passed / 10 skipped; i18n 2,336 per language. Root suite is 21/22 because one existing MCP bridge test expects the live API on 4747. UI inspected at 1280 and 390 px in isolated demo mode; Visual QA harness could not find Playwright.
- **Boundary:** The user has now configured credentials and a CA using `npm run remote:setup`; preserve them and do not re-run setup or rotate the CA. No active service restart or real listener start was performed. One normal user-controlled restart is needed to activate the new backend, then Start/Stop works in the UI without further restarts. No release, commit, or push.

## Follow-up — normal launcher, QR and Chrome warning (2026-10-14)

- **Phase:** Execution and QA.
- **New evidence:** The screenshot's `Perigoso` label appears in the browser while the user types in the remote login field. The AIOffice field is `type=password`; no client-side blocker runs during typing. Chrome may evaluate credentials on unfamiliar sites. Do not suppress Safe Browsing or tell the user to bypass its warning.
- **Changes:** Root launcher now builds and starts `npm run start:office`, checks port 4747 and preserves any existing process. QR is generated locally from the current Quick Tunnel URL and removed on stop. Settings and remote login explain the temporary hostname warning.
- **Blocker:** Existing port 4747 is still occupied by the old dev instance. Do not stop it. The user must close that instance manually, then run `start-aioffice.bat` to get the production static client and HTTPS tunnel origin.
- **Validation:** Root/app typechecks, build, i18n (2,345), root tests 22/22, app tests 1,233 passed + 10 skipped, QR Data URL smoke, production dependency audit (0), PowerShell AST parse + UTF-8 BOM, and `git diff --check` passed. Full audit reports 8 moderate advisories in Electron build tooling. No launcher/server was executed.
- **Next:** User manually closes the old dev process on 4747, then runs `start-aioffice.bat`; verify the generated link and QR from the managed server. The updater continues to refuse this dirty checkout. No automatic refresh, commit, push, release, or deployment.

## Follow-up — temporary mobile login code (2026-10-14)

- **Contract:** Keep random Quick Tunnel links and local QR. The panel issues a 12-character code, valid for five minutes and one login; code is never placed in URL/QR, persisted to `.env`, or sent through status/SSE. Reissue, use, stop, tunnel exit, and server restart invalidate it.
- **Security review:** Added a fresh random nonce to the session signing key for every listener, so prior cookies cannot become valid again if persistent secret rotation fails. Updated the API's unauthenticated response to direct users to the panel code.
- **Verification:** Root/app typechecks, build, i18n, diff check passed. Automated tests, live browser QA, and real tunnel were not run. Do not bypass Chrome Safe Browsing; a browser warning is not an input lock and remains possible with a temporary host.
- **Boundary:** Preserve all existing changes. Do not restart the active server, start the tunnel, commit, publish, or deploy without a user action. The normal service restart is required for the local checkout changes to load.
