# Survival Guide — mobile session management

- Read the context snapshot, this checkpoint, and `DEV/HANDOFF.md` before continuing.
- User expects the tunnel to stay running until process shutdown or explicit Stop; there must be no idle timeout.
- User wants currently logged-in devices, exact login date/time, and a way to revoke each one. Keep session management local-only; never reveal cookie/signature.
- Backend/frontend lanes own disjoint files per `tasks.md`; lead owns integration/docs and may inspect all diffs.
- Don't start a public tunnel or restart the live server; verify with local tests/build and health only.
- The production client/server bundles were built into `%TEMP%`; regular `dist` was intentionally left unchanged because the installed service is open. The installed app still runs v2.1.0 and does not have the workspace API/UI yet.
- Final local health was healthy; remote status was disabled/unconfigured. A previous status sample during this turn was active, but available logs do not explain its later transition. Do not attribute it to idle time without evidence or claim a live keepalive test. Isolated synthetic visual smoke passed; see `visual-check.json`.
- Current feature implementation preserves the 12-hour session maximum and six-character/five-minute/one-use login code. Poll is 15 s only while the settings panel and browser tab are visible and the tunnel is active.
