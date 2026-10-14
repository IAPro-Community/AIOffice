# Tasks — Habblaud update lifecycle

| ID | Owner | Scope | Depends on | Evidence / verification |
|---|---|---|---|---|
| T1 | Lead | Compare upstream tags v0.10.0 and v0.11.0 against local AIOffice | — | Complete: 95 files; three safe fixes already present; security/feature additions deferred |
| T2 | Lead | Add explicit upstream base metadata and preserve product version ownership | T1 | Complete: root product version/repository, resolver and provenance manifest; tests not run |
| T3 | updater_core + lead review | Implement managed AIOffice tag installer with external staging, runtime backup, coordinated restart and rollback | T2 | Complete in code: syntax/typecheck/build; exact official base-tag guard; real install/rollback not run |
| T4 | remote_access_impl + lead review | Add opt-in HTTPS login for LAN and private VPN with read-only default and capabilities | T2 | Complete in code: typecheck/build; remote stream expiry/revocation and permission viewer gates reviewed; setup remains unconfigured |
| T5 | update_ui | Add explicit download/install status UI; clear badge only after live target version | T2 | Complete: app typecheck/build and review of target-version polling |
| T6 | release_helper | Add safe dry-run AIOffice release command | T2 | Complete: `node --check` and dry-run; no publish |
| T7 | Lead | Integrate all lanes, managed launcher, docs and safety review | T3-T6 | Code gates passed; service activation remains pending because the host blocked stopping the orphaned old process |
| T8 | remote_backend_v2 | In-process remote-access configure/start/stop/status/CA APIs, persistent disabled state, compatible CLI setup | T7 | In progress; local-only guards, secret-free status and awaited listener lifecycle required |
| T9 | ui_mobile | First-time setup and Start/Stop phone-access UI with private URLs, CA fingerprint/download and localized instructions | T7 | In progress; responsive and accessible Settings flow |
| T10 | Lead | Shared type integration, hide non-AIOffice version badge/About metadata, docs and integrated security review | T8-T9 | In progress; build, typecheck, i18n, focused version tests and diff checks pending |

All tasks are sequential because package metadata, updater behavior, and release docs share one product-version contract.
