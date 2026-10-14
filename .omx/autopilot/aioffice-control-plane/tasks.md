# Tasks
- [x] T1 [P] Workflow template library — six Portuguese templates, review/copy flow; en/es/fr UI translations.
- [x] T2 [P] Attention queue — waiting states and recent errors; selecting an item only navigates to its agent.
- [x] T3 [P] Integrations/capabilities center — live sources, explicit MCP limits, and inactive adapters labeled honestly.
- [x] T4 [ROOT] Project cockpit, provider-aware filters/search/history/help and shell integration.
- [x] T5 [VERIFY] Root/app build and suites, i18n, diff review, visual desktop/narrow pass, DEV docs.
Dependencies: T4 integrates T1-T3 after contracts are inspected. Agents must avoid shared store/context/topbar/index/global styles.
Verification: build/typecheck pass; Habblaud 1,217 pass + 10 skipped; root 22 pass (including default-off Maestro fallback); i18n 2,185/2,185 per locale; visual QA complete. Backend restart remains pending for a safe window.
