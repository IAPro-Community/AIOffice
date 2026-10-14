# Checkpoint — Habblaud update lifecycle

- **Phase:** Implementation complete; fresh code gates passed; local-service activation is pending.
- **Accepted direction:** Maintainers integrate and validate upstream Habblaud; end users update the AIOffice release as a whole.
- **Baseline:** Preserved the user's uncommitted AIOffice root version 2.0.0 candidate and all unrelated edits. The current web package still says 0.10.0; do not claim Habblaud 0.11.0 feature parity. Branch `codex/habblaud-011-integration-20261013` starts at the original AIOffice v1.1.0 commit.
- **Comparison:** Upstream v0.10.0..v0.11.0 changes 95 files (~9,722 insertions). Three low-risk fixes are already present. User later explicitly requested automatic AIOffice updates and remote access on LAN/VPN; implement them with local-only managed install and authenticated HTTPS safeguards.
- **Implementation:** Root package owns release identity. About UI offers install and clears badge only after a live snapshot confirms target version. Installer stages official tags externally, blocks unsupported/dirty/session-active installs, preserves runtime and rollback data, and confirms restart with exact version/nonce/PID. Remote access is opt-in HTTPS with password auth, signed sessions and per-capability allowlist.
- **Verification:** Root/app typechecks, build, i18n (2,271/2,271 per language), script syntax checks, setup help, release dry-run, and diff check passed. Automated tests and real installer/rollback were not run. Adversarial review findings and resolutions are recorded in `validation.md`.
- **Boundary:** Preserve pre-existing user changes. No commit, push, release, deploy, or remote credential/CA provisioning. The local service was inspected (`pty:false`, 6 Codex and 10 OMP sessions) but not stopped: the host blocked the process-stop command. It remains on Habblaud 0.10.0 until the orphaned process is ended and restarted with `npm run start:office`.

## Follow-up — operator-owned mobile controls (2026-10-14)

- **Phase:** Execution. The user clarified the mobile feature should have first-time configuration plus in-process Start/Stop buttons and all phone connection details in Settings. The user also reiterated that version UI must never show Habblaud's version as AIOffice.
- **In flight:** Backend lifecycle/API and Settings UI run in separate file lanes; lead owns shared status types, release UI identity, integration, and docs.
- **Contract:** local-only `/api/remote-access/{status,configure,start,stop,ca}` routes; hashed credentials; HTTPS on a separate private LAN/VPN listener; read-only by default; stopping preserves configuration; unknown/non-AIOffice update channels have no numeric version chip or upstream repo link.
- **Boundary:** No actual credentials, CA, listener, firewall/VPN configuration, updater run, service restart, release, commit, or push will be performed. After build, the old process may still need the user to restart it before UI controls can talk to the new backend.
