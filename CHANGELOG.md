# Changelog

All notable changes to AIOffice will be documented in this file.

## [v1.0.0-beta] - 2026-10-13

### Added
- Provider type extended with devin, antigravity, opencode, freebuf (shared/types.ts)
- AgentSource implementations for devin, antigravity, opencode, freebuf
- OMP terminalParser for realtime terminal output
- Statistics weekly/5h window calculation fix in service.ts
- Message routing entries for new providers in registry.ts
- Provider tag display for all 7 providers in UI (provider.ts)
- SKILLS_ROUTER.json updated with provider triggers

### Changed
- ALIAS_TOOLS updated in detect.ts for all new providers
- AgentSource source directories restructured
- Account provider detection logic enhanced
- Fallback short letter generation for all providers
- Provider name and tag rendering consistency

### Fixed
- Statistics weekly percentage display (was showing 16% instead of 80%)
- Provider tag rendering for devin, antigravity, opencode, freebuf
- Message routing for all provider types

### Deprecated
- None

### Removed
- None

### Security
- None