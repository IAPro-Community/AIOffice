# Tasks — Habblaud update lifecycle

| ID | Owner | Scope | Depends on | Evidence / verification |
|---|---|---|---|---|
| T1 | Lead | Compare upstream tags v0.10.0 and v0.11.0 against local AIOffice | — | Complete: 95 files; three safe fixes already present; security/feature additions deferred |
| T2 | Lead | Add explicit upstream base metadata and preserve product version ownership | T1 | Complete: root product version/repository, resolver and provenance manifest; tests not run |
| T3 | updater_core + lead review | Implement managed AIOffice tag installer with external staging, runtime backup, coordinated restart and rollback | T2 | Complete in code: syntax/typecheck/build; exact official base-tag guard; real install/rollback not run |
| T4 | remote_access_impl + lead review | Add opt-in HTTPS login for LAN and private VPN with read-only default and capabilities | T2 | Complete in code: typecheck/build; remote stream expiry/revocation and permission viewer gates reviewed; setup was initially unconfigured, then the user ran the compatible CLI setup on 2026-10-14 |
| T5 | update_ui | Add explicit download/install status UI; clear badge only after live target version | T2 | Complete: app typecheck/build and review of target-version polling |
| T6 | release_helper | Add safe dry-run AIOffice release command | T2 | Complete: `node --check` and dry-run; no publish |
| T7 | Lead | Integrate all lanes, managed launcher, docs and safety review | T3-T6 | Code gates passed; service activation remains pending because the host blocked stopping the orphaned old process |
| T8 | remote_backend_v2 | In-process remote-access configure/start/stop/status/CA APIs, persistent disabled state, compatible CLI setup | T7 | Complete in code; local-only controls, private HTTPS, hashed credentials, awaited listener; adversarial fixes for CA copy, VPN Host allowlist, and CLI password validation; no live listener run |
| T9 | ui_mobile | First-time setup and Start/Stop phone-access UI with private URLs, CA fingerprint/download and localized instructions | T7 | Complete; responsive form and state checked in isolated demo UI at 1280/390 px; no runtime credential submission |
| T10 | Lead | Shared type integration, hide non-AIOffice version badge/About metadata, docs and integrated security review | T8-T9 | Complete in code; root/app typecheck and build, app suite, i18n pass; root suite 21/22 due live-bridge dependency; service activation pending user restart |
| T11 | Lead | Replace root dev launcher/shortcut scripts with a normal managed launch that never kills Node globally | T10 | Complete: build+start:office, occupied-port refusal, PowerShell AST parse; no process was stopped |
| T12 | Lead | Generate the active tunnel QR locally and explain Chrome warning on temporary Cloudflare login | T11 | Complete in code: local QR PNG smoke, login-field regression test, i18n/build/app suite passed; real tunnel awaits manual launcher start |
| T13 | Lead | Replace mobile master-password login with a local one-use code; retain Quick Tunnel/QR; harden session-key rotation | T12 | Complete in code: local-only code issuance, 5-minute expiry, one use, per-listener session nonce; root/app typecheck, build, i18n, diff and security review passed; real tunnel/login and automated tests not run |

All tasks are sequential because package metadata, updater behavior, and release docs share one product-version contract.
