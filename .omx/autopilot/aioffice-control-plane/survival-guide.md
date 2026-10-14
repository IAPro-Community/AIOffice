# Survival guide
- Status: implementation complete; use this file only to resume follow-up work.
- Repo: C:\Users\fbolz\Documents\Code\AIOfficeBeta, main, PowerShell.
- Protected baseline edits: DEV docs, packages/mcp-bridge/src/mcp-server.ts, scripts/install-mcp-bridges.mjs.
- Preserve protected baseline edits; never reset or overwrite the worktree.
- Owners: workflow-templates.ts/css, attention.ts/css, integrations.ts/css are disjoint agent modules. Root owns app shell, project cockpit, search/history and docs.
- Excluded paths: packages/runtime/src/adapter.ts, policy/runtime/executor. The CLI engine only changed to make Maestro fallback opt-in via `--maestro-fallback`.
- This turn passed root build, Habblaud typecheck and tests (1,217 passed/10 skipped), root tests (22 passed), i18n (2,185 active strings per locale), diff check and visual desktop/narrow review.
- Backend was not restarted because active sessions are running. Server-side changes remain pending a safe restart; no test message was sent.
