# Boundaries — mobile session management

- Preserve all pre-existing modifications and untracked files in the shared checkout.
- Do not commit, push, publish, install/update external packages, or interact with the Cloudflare account.
- Do not start a live public tunnel or create another externally reachable URL during implementation.
- Tunnel must not gain an inactivity timer. Stop only through explicit UI action, app/process shutdown, or `cloudflared` process exit.
- Never expose or persist remote cookies, session signatures, signing keys, login codes, or raw client IPs in the local session list.
- Keep session listing/revocation inaccessible through the public tunnel; allow only local loopback + same-origin control.
- Rollback boundary is limited to the new owned code and docs. No destructive Git operations; no process restart during validation because current service could have active tunnel users.
- Validation uses unit tests/build and the existing local health endpoint. Do not claim real mobile login verified.
