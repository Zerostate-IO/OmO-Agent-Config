# TODO - Future Enhancements

## Big Features (v0.5.0+)

### Custom Agent Creation
**Status:** Documented, not planned for immediate implementation
**Priority:** Medium
**Effort:** High (2-3 weeks)

Full custom agent support with system prompts, templates, and validation.
See `docs/CUSTOM-AGENTS.md` for complete specification.

### LM Studio Model Support
**Status:** Explicitly deferred - not implemented
**Priority:** Low (de-scoped)
**Effort:** N/A

**Policy:** This tool does **not** implement custom LM Studio detection. All model discovery
flows through `opencode models --verbose` only.

**What this means:**
- No direct probing of `localhost:1234` or LM Studio API
- If LM Studio models don't appear, the issue is in OpenCode CLI configuration
- Users should verify `opencode models --verbose` shows their models
- This tool will not add LM Studio-specific detection code

**Historical note:** Earlier TODO items referenced plugin investigation, but this has
been explicitly de-scoped. The tool's role is configuration UI, not model discovery.


### TUI Framework Upgrade
**Status:** Obsolete - web UI replaced the legacy readline TUI
**Decision:** Not needed; tool scope is narrow and workflow-focused

---

## Completed Releases

### v0.4.0 (Phase 3 - Quality of Life)
- [x] **Bulk Agent Operations** - Auto-optimize all agents, bulk edit multiple agents
- [x] **Persistent Provider Filters** - Default to preferred providers in search, ★ markers
- [x] **Model Comparison** - Side-by-side comparison of up to 4 models
- [x] **Model Bookmarks** - Save and select frequently-used models
- [x] **Agent Reordering** - Custom display order for agents in list
- [x] **Reload Models** - Refresh model list without restart
- [x] **Modular Codebase** - Split into lib/ structure for maintainability

### v0.3.1
- Removed "Add agent" functionality (non-functional without system prompts)
- Added agent information screen [?]
- Created `docs/CUSTOM-AGENTS.md`

### v0.3.0
- Backup restore from UI with preview
- Agent count display in configuration lists
- Stay in Agent Config Menu after edits

### v0.2.x
- CLI argument support (-s, -l, -c, -h)
- Copy from any configuration
- Provider filtering and preferences

### v0.1.0
- Named configuration profiles
- Configuration management (CRUD)
- Export/import functionality
