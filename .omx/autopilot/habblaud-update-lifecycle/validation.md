# Validation — Habblaud update lifecycle

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
