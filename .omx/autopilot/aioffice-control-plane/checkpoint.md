# Checkpoint
- Phase: complete.
- Baseline branch main. Protected changes: DEV/CONTEXT.md, DEV/HANDOFF.md, DEV/SPECS/ACTIVE.md, DEV/VERIFY.md, DEV/WORKLOG.md, packages/mcp-bridge/src/mcp-server.ts, scripts/install-mcp-bridges.mjs.
- Root cause: users cannot distinguish server connectivity from provider/session health; capabilities are scattered and incomplete.
- Scope: capability catalog/integrations center; attention queue; project cockpit; workflow template library; provider-aware search/history/help and accurate replay state.
- Excluded: OpenOrq runtime/adapter/policy internals; new adapters for unsupported tools; release/deploy/Git publication. The CLI now requires explicit `--maestro-fallback` before entering its existing Maestro demo path.
- Implementation: template library, attention queue, integration catalog, project cockpit, provider filters, shell/help/history updates and CLI fallback gate completed. Locales en/es/fr translated.
- Decision: keep unsupported CLI adapters inactive; existing source modules share unvalidated transcript assumptions. Executor/runtime/adapter/policy path remains unchanged and is last resort per user.
- Validation: root build, app typecheck, app suite (1,217 pass; 10 skipped), root tests (22 pass), i18n (2,185/2,185 per locale), diff check, and desktop/narrow visual review passed.
- Operational limit: backend service was not restarted to protect active sessions. No test messages or approvals were sent. No release, push, or commit.
