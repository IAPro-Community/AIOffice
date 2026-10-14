# Specification — AIOffice releases, one-click update, and remote access

## Desired behavior

1. The office checks only the official AIOffice package version and `IAPro-Community/AIOffice` releases. Habblaud upstream tags remain maintainer-only integration metadata.
2. When an AIOffice release is newer, the UI identifies it as an AIOffice update and offers an explicit **Atualizar AIOffice** action. The badge stays until the running server reports the requested AIOffice version.
3. The update action downloads only the exact official AIOffice release. It refuses Docker, dev mode, dirty/unmanaged/non-official checkouts, active managed PTYs, mismatched tags, and concurrent installs. It stages and builds first, retains rollback material, restarts cooperatively, confirms target version, and restores/restarts old version on failure. Unsupported installs link to official release instructions.
4. The AIOffice release command uses the root package version and root changelog; Habblaud standalone release behavior remains separate.
5. Remote phone access supports same-LAN and private away-from-home paths. It runs on a separate HTTPS listener with a password-hash login and cookie session, and never shares the unauthenticated local hooks/PTY surface. It remains off until the user runs setup. No remote spawn or PTY access; no firewall, account, certificate, or Tailscale changes during implementation.
6. Windows setup finds Git for Windows OpenSSL, shows a LAN IP URL, and avoids unsupported mDNS service installation. Tailscale Serve guidance stays private to the tailnet and does not use Funnel or public port forwarding.

## Acceptance evidence

- AIOffice package/repo ownership is used in config and frontend; upstream Habblaud metadata cannot create a user update badge.
- Install route validates local request origin, target version, runtime support, and install lock; failures preserve current version and badge.
- Release installer does not write a dirty checkout or user data; rollback paths include ignored build/dependency output.
- Remote gate separates listeners, hashes/compares password safely, rate-limits login, enforces HTTPS and local-only route blocks, and defaults to view-only.
- Build, typecheck, i18n check and `git diff --check` pass. No release is published and remote access is not enabled.
- Live local server health/update API reports AIOffice metadata after an interruption-safe restart; if active PTYs make restart unsafe, leave process running and report why.

## Non-goals

- Automatically integrating Habblaud releases into users' installations.
- Enabling remote access, configuring credentials or certificates, opening ports, or configuring Tailscale on this host.
- Publishing an AIOffice release, committing, pushing, or merging.
- Updating Docker containers or arbitrary source/development checkouts from the UI.

## Risks and assumptions

- A supported self-update requires an official clean AIOffice Git checkout, Git and Node/npm, and a normal local Node server process. Other install types keep the update badge and use published manual guidance.
- Updating/restarting interrupts the AIOffice dashboard briefly. Install is blocked while AIOffice-owned interactive PTY sessions are open.
- User data remains outside the source checkout in the existing data directory. A custom data directory overlapping the source must block self-update.
- Current working tree contains protected user edits; the updater must report this installation as unsupported and must not alter it.
