# docs/

## OVERVIEW

User and developer documentation: UX, design decisions, troubleshooting, and release notes.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| How the tool works (current) | `DESIGN-SUMMARY.md` / `DESIGN-v2.md` | Architecture, routes, caching, UX rationale |
| Troubleshoot model/provider visibility | `TROUBLESHOOTING.md` | Common failure modes for `opencode models --verbose` |
| UI behaviors + flows | `UI-FLOWS.md` | Expected interactions in web UI |
| Custom agents guidance | `CUSTOM-AGENTS.md` | Limits/expectations for user-defined agents |
| Upstream sync workflow | `UPSTREAM-SYNC.md` | Drift check, doc scan, snapshot commands |
| Provider policies | `PROVIDER-POLICIES.md` | Provider ranking and billing model customization |
| Module boundaries | `ARCHITECTURE.md` | Core module dependencies and data flow |
| Release notes | `RELEASE-*.md` | Historical behavior; may be stale |

## ARCHIVED DOCS

Historical docs preserved in `ARCHIVED/`:

| Doc | Reason |
|-----|--------|
| `UX-ANALYSIS.md` | Legacy TUI/CLI UX analysis (pre-web UI redesign) |
## CONVENTIONS

- Prefer updating DESIGN-SUMMARY and TROUBLESHOOTING when behavior changes.
- Call out stale docs explicitly if architecture shifts (e.g., TUI → Web UI).

## ANTI-PATTERNS

- Don’t document removed paths (e.g., `lib/ui/*`) without clearly marking them as legacy.
