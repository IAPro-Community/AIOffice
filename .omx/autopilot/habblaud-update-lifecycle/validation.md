# Validation — Habblaud update lifecycle

## Follow-up: temporary one-use mobile login code — 2026-10-14

| Check | Result |
|---|---|
| Root/app typechecks | Pass: `npm run typecheck` and `npm --prefix apps/office-web run typecheck`. |
| Build | Pass: `npm run build`; Vite still reports the existing main client bundle above 500 kB. |
| i18n | Pass: `npm --prefix apps/office-web run i18n:check`, 2,353/2,353 English, Spanish and French entries. |
| Diff | Pass: `git diff --check`; only LF-to-CRLF normalization notices. |
| Adversarial review | Fixed stale 401 instructions that mentioned a master password. Every listener now adds a fresh 32-byte random nonce to the persistent session secret, so old cookies remain invalid even if writing a rotated secret fails. |
| Automated/browser/tunnel validation | Tests, live visual QA and real Quick Tunnel/login were not run. The active service was not restarted; the code must be loaded by a normal AIOffice restart. |

The browser's **Perigoso** / Safe Browsing classification is independent of the login field. The code prevents password-manager confusion and avoids a reusable password, but it cannot clear a warning for an unfamiliar `trycloudflare.com` hostname. Do not bypass that warning or enter the code while it is shown.

## Follow-up: normal launcher, QR and Chrome warning — 2026-10-14

| Check | Result |
|---|---|
| Root/app typecheck and build | Pass: `npm run build`, `npm --prefix apps/office-web run typecheck`; QR is a separate dynamic `browser` chunk (23.46 kB). Main app chunk remains 747.36 kB with the existing >500 kB Vite warning. |
| i18n | Pass: `npm --prefix apps/office-web run i18n:check`, 2,345/2,345 English translations. |
| Tests | Pass: `npm test` 22/22; app 103 files, 1,233 passed and 10 skipped. New remote-login test asserts masked/enabled password field and the temporary-host safety message. |
| QR smoke | Pass: `qrcode` produced a PNG data URL locally from a sample HTTPS tunnel URL; no external QR endpoint is called. |
| Dependencies | Production audit: 0 vulnerabilities. Full audit: 8 moderate advisories in Electron packaging/build dependencies; no broad dependency upgrade was made. |
| Launcher | PowerShell AST parse passes and file is UTF-8 BOM. Static scan confirms launchers do not call `taskkill`, `Stop-Process` or `npm run dev`. Neither launcher was run because port 4747 belongs to the active user service. |
| Diff | `git diff --check` passes; Git reports only LF-to-CRLF normalization notices on existing modified files. |
| Live activation | Not attempted. The earlier Cloudflare URL still points to the Vite development server until the user closes that old instance and starts the managed launcher. No page reload, active server change, commit, push, release or deploy occurred. |

The login input has `type="password"` and is enabled while typing. Chrome's red **Perigoso** indicator is a browser security classification, not an AIOffice input lock. The login now tells users not to proceed when the browser flags the temporary `trycloudflare.com` host. A stable Cloudflare hostname requires a domain controlled by the operator; the app does not weaken Safe Browsing.

## Follow-up: integrated mobile controls and AIOffice identity — 2026-10-14

| Check | Result |
|---|---|
| Root/app typechecks and build | Pass: `npm run typecheck`, `npm --prefix apps/office-web run typecheck`, `npm run build`; Vite still warns that the main client bundle exceeds 500 kB |
| App test suite | Pass: `npm --prefix apps/office-web test -- --testTimeout=15000`; 101 files, 1,219 passed, 10 skipped |
| Root test suite | 21/22. `packages/mcp-bridge/test/mcp.test.ts:34` expected a successful response from the live API on port 4747; that existing integration test failed and is not part of this change |
| i18n | Pass: `npm --prefix apps/office-web run i18n:check`; 2,336/2,336 entries per language in en/es/fr; legacy unused keys remain |
| Browser/UI inspection | Pass in isolated demo mode at desktop and 390 px mobile widths; the new setup and Start/Stop states were visually inspected. Automated Visual QA could not run because Playwright is unavailable |
| Remote listener and phone trust | Not exercised against the real server. The user already ran `npm run remote:setup`; preserve its account and CA. The old process still needs one normal restart via `npm run start:office`; no active service or listener was restarted here |
| AIOffice updater | Channel identity is restricted to `IAPro-Community/AIOffice`; actual release installation/rollback was not run because it would mutate the managed checkout and restart the server |
| Docs/diff | Pass: `git diff --check`; Git reports only LF/CRLF normalization notices |

Post-fix security review: the management routes require a loopback Host and peer address, and mutating requests require the exact local HTTP Origin. The separate remote listener requires HTTPS, a signed login session, and read-only-by-default route capabilities. The mobile panel exposes private LAN/VPN URLs and the public CA fingerprint/download, never the password or its hash. CA repair preserves a valid existing CA; VPN domains are added to the Host allowlist. No second independent reviewer completed the follow-up review because that agent hit its usage limit.

The screenshot's `ERR_CONNECTION_REFUSED` is consistent with the old backend not having opened port 4748: the CLI printed that a restart was required. The new backend reads the existing `.env` and attempts startup; after the one manual restart, Start/Stop operate in-process. The follow-up UI copy now refers to the office rather than Habblaud and does not expose the internal Habblaud update-check variable.

## Current integrated implementation — 2026-10-13

| Check | Result |
|---|---|
| Root and app typechecks | Pass: `npm run typecheck`; `npm --prefix apps/office-web run typecheck` |
| Build | Pass: `npm run build`; Vite still warns that the main client bundle exceeds 500 kB |
| i18n | Pass: 2,271/2,271 strings per language in en/es/fr; unused legacy keys remain |
| Script syntax | Pass: `node --check` for managed launcher, update worker, and release script |
| Remote setup help | Pass; help only, no password or certificate created |
| Release dry-run | Pass as simulation; no tag/release. Publishing blocked by non-main branch, dirty worktree, and existing local v2.0.0 tag |
| Diff whitespace | Pass; only Git LF/CRLF normalization warnings |
| Automated tests | Not run in this round |
| Updater/rollback | Not executed; requires a published official AIOffice tag and clean managed installation |
| Remote provisioning | Not executed; no `.env`, credentials, CA, firewall, or VPN created/configured |
| Live server | Still Habblaud 0.10.0 at port 4747; health showed `pty:false`, 6 Codex and 10 OMP sessions. Tool policy rejected stopping orphan PID 44148, so new backend build is not active yet. No forced process termination occurred. |
| Browser visual QA | Pending after service restart; the live backend still serves the old Habblaud API, so checking the new frontend against it would give misleading version/update state |

Adversarial findings fixed before the final build: worker nonce was not wired to health/shutdown; shutdown omitted the exact Origin header; remote session history still required a loopback Host; updates could overwrite a clean branch with local commits; permission prompts ignored authenticated remote viewers; long-lived remote streams outlived logout/expiry; and adding a MagicDNS name after first setup had no CA-rotation path. The installer now verifies HEAD against the published tag for its current version before it may reset the checkout. The remote setup has explicit `--new-ca` rotation and documents trust replacement on devices.

## Baseline

- Existing `DEV/VERIFY.md` records successful typecheck, build, i18n, and Git diff checks for AIOffice 1.1.0. Habblaud and root tests were reported green in the latest UI audit, but not in the most recent release-gate block.
- Current worktree contains unrelated, pre-existing user changes; they are excluded from task ownership and must remain intact.

## Task evidence

| Check | Result |
|---|---|
| Upstream source comparison | Complete: v0.10.0 `e3204a6a533089fa9df74970ddc4340ecc1c8cd4` to v0.11.0 `4ccce2537472fe5a8d432f06974494d2e778ff15`; 95 changed files |
| Updater behavior | Pass: read-only GitHub query reports current `v0.11.0`, equal to reviewed-through; no source/Git mutation |
| Typecheck and build | Pass: root `npm run build`; app `npm --prefix apps/office-web run typecheck` |
| Root tests | Pass: 22/22 |
| App tests | Pass with `--testTimeout=15000`: 101 files, 1,219 passed, 10 skipped. Default 5 s timeout had two subprocess tests expire. |
| i18n and diff check | Pass: 2,194/2,194 strings per language; `git diff --check` clean except LF/CRLF normalization warnings |
| Existing user changes preserved | Preserved root v2.0.0 candidate, all unrelated staged/unstaged changes, and did not alter app package version 0.10.0 |
