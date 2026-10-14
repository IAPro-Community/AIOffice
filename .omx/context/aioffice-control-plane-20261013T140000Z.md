# Intake snapshot — AIOffice control-plane UX
- Request: implement useful Habblaud improvements, add reusable workflow templates, use autopilot/subagents. Keep the Orquestrador-Maestro executor as a last resort.
- Outcome: clearer provider/source health, actionable attention, project overview, provider-aware discovery/history/help, and workflow templates.
- Evidence: live session sources are Claude Code, Codex, OMP. Other provider types exist without full integrations. Global Conectado describes browser-to-Habblaud SSE, not provider health. Existing uncommitted work is limited to MCP bridge clarity/docs; preserve it.
- Constraints: exclude apps/office-cli/src/engine.ts and packages/runtime/src/adapter.ts, executor/policy path, commit/push/publish/deploy; preserve user changes; keep pixel-art UI and Portuguese.
- Assumption: templates mean reusable task/prompt workflows inside Habblaud. Empty session list means no session observed, not disconnected.
- Unknowns deferred: target CLIs for new adapters; no promise of universal support. Historical global text search may be limited by persisted APIs.
- Current phase: intake/grounding complete; expand then plan.
- Next: parallelize isolated UI modules, integrate centrally, validate.
- Validation: npm run build and npm test; visual check if local runtime allows without disruption.
