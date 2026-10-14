# Boundaries
## Preserve
- Existing uncommitted MCP bridge/docs changes listed in checkpoint.
- Provider/snapshot wire compatibility; fields additive only.
- Existing live terminal, message, session behavior and pixel-art visual system.
- Keyboard operation, accessible labels, focus/close behavior, reduced motion.
## Excluded
- packages/runtime/src/adapter.ts, policy-broker, RPC proxy, executor internals, process launching. The CLI entry point may be gated so Maestro execution is opt-in as a last resort.
- Do not claim provider support without end-to-end evidence.
- No user session messages, approvals, CLI commands, external calls, deletion, deploy, commit, push, merge, or release.
## Rollback
Revert only task-owned files after reviewing diffs; never reset the worktree or disturb baseline edits.
## Verification
Root TypeScript/build and existing suites; focused pure tests as practical; inspect desktop and narrow layout if runtime allows.
