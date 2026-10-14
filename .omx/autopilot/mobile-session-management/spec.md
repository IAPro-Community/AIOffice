# Autopilot Spec — mobile session management

## Outcome
Keep the optional Cloudflare Quick Tunnel alive until the AIOffice process exits, the user explicitly stops it, or `cloudflared` itself exits. Add a local-only session/device manager so the user can see who logged in and revoke a specific device.

## Acceptance criteria
- No idle timer, failed-phone-connection timer, or visibility-based shutdown stops the tunnel. Existing explicit Stop and process shutdown remain valid; unexpected child exit is surfaced.
- A successful remote login records a random opaque session ID, derived device/browser label, login time, last activity, and expiry in memory. Never store or return the cookie, token, signing key, or signature.
- Local AIOffice settings list active sessions, show login and last-activity dates/times in the browser's locale, and offer per-session revocation.
- Session list and revocation endpoints are loopback/local-origin only and are rejected by the remote listener. IDs are validated; revoking one session invalidates only that session immediately.
- List refresh happens through a small background/local fetch and DOM update; no full-page refresh. Poll only while the local settings panel is visible and the tunnel is active, or refresh through the existing status action.
- Stop/restart invalidates remote sessions as the existing nonce contract requires. The panel explains that active devices must log in again after the process restarts or tunnel stops.
- Update `DEV/WORKLOG.md`, `DEV/VERIFY.md`, and `DEV/HANDOFF.md`; update the active spec with current requirements and remaining live-tunnel validation.

## Non-goals
- No persistent session inventory across restart, IP tracking/geolocation, link/token sharing, or automated tunnel startup.
- Do not alter the current six-character login code's five-minute expiry/one-use semantics.
- Do not start a public tunnel, publish a URL, commit, or push.

## Boundaries and assumptions
- Existing dirty working tree and user changes are protected; never reset or revert unrelated edits.
- Remote devices are represented only by a coarse browser/platform label from their User-Agent; do not store raw IP or return cookie material.
- Current session maximum age remains 12 hours; tunnel availability is independent of whether any device is active.
- Device list is only available while the remote listener/session manager exists; stopping/restarting the tunnel ends all sessions.

## Evidence
- Focused unit tests cover issuance, metadata, last-seen update, list redaction, targeted revoke, and expiry.
- Route tests prove local-only access and that remote requests cannot list/revoke sessions.
- UI typecheck, i18n, production build, diff check, and localhost production health smoke pass.
- No live tunnel test; user validates link/device login manually after pressing Start.
