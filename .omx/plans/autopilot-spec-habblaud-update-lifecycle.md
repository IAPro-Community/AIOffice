# Spec — Habblaud update lifecycle

## Intent

Prevent an upstream Habblaud release from breaking AIOffice custom integrations by making maintainers—not end users—responsible for adopting and validating upstream changes.

## Desired outcome

Maintainers record the integrated Habblaud base, selectively integrate compatible changes, and publish them as an AIOffice release. End users see and follow AIOffice's own update channel.

## In scope

- Compare upstream 0.10.0 to 0.11.0 against AIOffice's local customizations.
- Keep product version and upstream base version explicit and separate.
- Make the local update command read-only and describe the maintainer integration process accurately.
- Point the in-app version checker at AIOffice releases and align package metadata.
- Update operator docs and record the architectural decision.

## Out of scope

- Publishing a release, pushing changes, deploying, restarting the live office, or automatically downloading/applying code.
- Enabling upstream mobile remote access, Claude process spawning, microphone capture, or changing OpenOrq permission mediation.
- Rewriting Habblaud from scratch or maintaining a permanent full fork without evidence that selective integration is unsustainable.

## Acceptance criteria

1. The exact upstream tag/commit used by AIOffice is recorded separately from AIOffice's product version.
2. Selected v0.11.0 changes are justified by an explicit comparison; incompatible or boundary-expanding changes are deferred.
3. `npm run update:habblaud` does not fetch, merge, install, or overwrite source; its output gives maintainers a safe comparison workflow.
4. The in-app checker targets AIOffice releases and compares the AIOffice version, not Habblaud's upstream release.
5. Docs explain that end users update AIOffice as a complete release.
6. Build, typecheck, tests, i18n, updater behavior, and diff checks pass; no live service is restarted.

## Evidence vs inference

- Evidence: workspace packages AIOffice 1.1.0 and Habblaud 0.10.0; upstream v0.11.0 release exists; current updater prints commands rather than applying updates.
- Inference accepted by the user: only the maintainer should adopt upstream code; the user-facing update target is the AIOffice product.

## Addendum — AIOffice release identity and mobile access controls

The user clarified that AIOffice must never present the Habblaud upstream version as an AIOffice release. The top bar must show a version/update badge only when the server reports the exact AIOffice release repository; an unrelated or unknown channel must not display its numeric version or a Habblaud repository link.

The user also expects mobile access to be operated directly from **Settings → Acesso pelo celular**. On first use, the owner sets a username and password; the server stores only a password hash and private HTTPS certificate material. The screen then starts and stops the HTTPS listener without a shell command or server restart, and when active it shows LAN/VPN addresses, username, public CA download, and SHA-256 fingerprint verification steps. Stop preserves configuration for the next start. The listener remains opt-in, private-network-only, and read-only by default; no firewall rule, VPN, port forwarding, credential, or production listener may be provisioned during implementation.

Acceptance evidence: exact repository gating; old/unknown channel renders no Habblaud version badge; local-only guarded configure/start/stop/status/CA APIs; actual listener opens/closes in-process; secret-free status; responsive localized UI; build, typecheck, i18n, focused tests, and diff checks pass. A running legacy server may require a user-controlled restart before the new APIs are available.
