# Plan — Habblaud update lifecycle

1. **Inventory upstream changes.** Fetch the two official tags into an isolated temporary clone; inspect the diff and release notes without running upstream scripts. Map candidates to AIOffice's local session, security, and UI adaptations. Gate: selected/deferred list with rationale.
2. **Record product/upstream versions.** Add explicit machine-readable upstream base metadata; align the app's effective version/repository metadata with AIOffice while keeping the package lock coherent. Gate: package metadata and checker inputs agree.
3. **Own the update channel.** Replace upstream merge guidance with a read-only AIOffice release check and maintainer comparison instructions. Keep end-user updates tied to AIOffice release tags. Gate: command performs no Git/source mutations; focused verification passes.
4. **Document the decision.** Add ADR and correct README plus DEV release/handoff notes. Gate: users and maintainers have distinct, accurate procedures.
5. **Validate/review.** Run tests, typecheck/build, i18n, diff checks, and adversarially review updater trust boundaries and pre-existing edits. Gate: all required checks pass or a precise external blocker is recorded.

Boundary: no commit, push, release, deploy, destructive Git operation, or live server restart.

## Addendum — direct mobile-access controls

1. **Backend lifecycle/API** `[P]`: add persistent configured/enabled state, local-only status/configure/start/stop/CA routes, and in-process listener management with private HTTPS only. Keep env-file CLI setup compatible. Evidence: server typecheck and local-only boundary review.
2. **Settings UI** `[P]`: provide first-time credentials, explicit start/stop controls, busy/error states, Wi-Fi/VPN addresses, public CA download, fingerprint and setup guidance in en/es/fr. Evidence: client typecheck, i18n checker, visual inspection.
3. **Release identity and integration**: hide top-bar version for every repo other than `IAPro-Community/AIOffice`; avoid displaying unrelated numeric versions or repo links in About. Integrate shared types, snapshots and API responses. Evidence: version unit test and app typecheck.
4. **Docs/review**: update DEV records and check API authorization, secret handling, HTTPS listener close behavior, and persistent disabled state. No real account, secret, CA, firewall, VPN, release, or restart is created.
