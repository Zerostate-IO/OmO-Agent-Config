# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Upstream contract centralization**: All upstream repo/branch/schema coordinates now flow through `lib/upstream-constants.js` (single source of truth). Active runtime fetches no longer contain scattered owner/repo strings.
- **Schema compatibility**: Schema validation now supports both legacy (`definitions` object) and current (draft-07 inline `properties`) upstream schema layouts. Three-layout detection handles format transitions gracefully.
- **Model requirements sync**: `lib/core/model-requirements.js` synced to pinned upstream SHA `216283e2` from `dev` branch. Includes new providers (`vercel`, `opencode-go`, `moonshotai`, `firmware`, `aihubmix`) and updated fallback chains for all 11 agents and 9 categories.
- **Fallback model objects**: `fallback_models` entries can now be rich objects (`{ model, variant, ... }`) alongside plain strings. The UI preserves object entries and displays formatted labels with variant/reasoning metadata instead of `[object Object]`.
- **Upstream sync hardened**: Apply mode disabled in both `provider-aware-sync.js` script and `/api/upstream/sync` route until source-file backup/write-lock guard exists. Dry-run returns structured JSON with `sourceRef`, per-provider diffs, and change counts.
- **Documentation updated**: Canonical upstream repo documented as `code-yeongyu/oh-my-openagent`. Config file (`oh-my-opencode.jsonc`), schema filename (`oh-my-opencode.schema.json`), and package identifiers remain unchanged for backward compatibility.

### Added
- **Config split diagnostics**: Read-only detection of sibling `oh-my-openagent.jsonc`, stale `$schema` URLs, and old plugin names. Surfaces as advisory warnings in provider diagnostics modal and `/api/config/diagnostics` endpoint. No automatic migration.
- **Provider diagnostics integration**: Config-split warnings surface in the existing provider diagnostics flow with `[CODE]` prefixed hints.
- **Pinned SHA tracking**: `.omo-upstream-sha` pins the exact upstream commit. `drift-check.js` and `upstream-snapshot.js` output `sourceRef` with repo, branch, commit SHA, and model requirements URL for traceability.
- **Model parser header whitespace fix**: `parseModels()` now trims header lines before regex matching, preventing silent skip of indented model entries.
- **UI formatting fixes**: Long model IDs wrap correctly (no horizontal overflow), fallback editor scrolls within bounds on 10+ entries, diagnostics banner works in dark theme, model selection uses `data-action` delegation instead of fragile inline `onclick` handlers.
- **Playwright UI audit**: Desktop, tablet, and mobile viewport screenshots as visual regression evidence for releases.

### Fixed
- `checkAndUpdateOhMyOpenCodeSchema` missing `valid: true` in success return, causing false "schema check failed" in health reports
- `getCurrentModelForAgent` undefined in agent detail modal
- Duplicate delegated click handlers causing double-fire on model assignment
- Model header lines not trimmed before regex matching, causing indented model entries to be silently skipped

## [0.10.0] - 2026-03-24

### Changed
- **Upstream Sync**: Aligned with `oh-my-openagent` v3.11+ repository rename and model migrations
- Updated `lib/core/model-requirements.js` with current upstream fallback chains and SHA pin
- Updated `lib/constants.js` defaults to match current upstream recommendations while preserving legacy provider aliases
- Refreshed regression test fixtures to remove stale legacy IDs (`kimi-k2.5-free`, outdated GPT/Claude versions) and align with current upstream model names
- Updated documentation references from `code-yeongyu/oh-my-opencode` to `code-yeongyu/oh-my-openagent`
- Preserved backward-compatible filenames (`oh-my-opencode.jsonc`, `oh-my-opencode.schema.json`) per plan guardrails

### Added
- Config round-trip test coverage for `disabled_tools` and unknown upstream keys
- Upstream metadata tracking in health check reports (repo, branch, GitHub URL)

### Fixed
- Stale default model versions in `DEFAULTS` object
- Outdated fallback chains for multiple agents
- Broken upstream URLs in runtime comments and operator documentation

## [0.9.2] - 2026-02-25

### Fixed
- **Emergency cache fallback**: If `opencode models --verbose` CLI hangs/times out, cached models are now used automatically (even if stale).
- Increased cache TTL from 5 minutes to 30 minutes (models don't change that often).
- Added `loadCachedModelsIgnoreExpiry()` helper for emergency fallback scenarios.

## [0.9.1] - 2026-02-25

### Fixed
- Increased `opencode models --verbose` timeout from 30s to 2 minutes to prevent ETIMEDOUT errors when providers are slow to respond.
- Timeout is now configurable via `OMO_MODELS_TIMEOUT` environment variable (milliseconds).

## [0.9.0] - 2026-02-25

### Changed
- **Removed Models view**: Streamlined UI to focus on agent configuration only.
- The full model catalog browser has been removed; models are still accessible via the model selector modal when changing agent assignments.
- Removed filter section (search, provider, context, capability chips) from main view.
- Cleaned up unused JavaScript functions and CSS styles for a smaller footprint.
- Simplified header by removing view switcher buttons.

### Removed
- Models view switcher (🔍 Models / 🤖 Agents tabs)
- Filter bar with search, provider filter, context filter, sort options
- Capability and billing filter chips
- Models grid display
- Related JS functions: `filterAndRenderModels`, `renderModels`, `populateProviderFilter`, `clearAllFilters`, `switchView`, `updateActiveFilters`
- Related CSS styles for filters section and models grid

## [0.8.1] - 2026-02-24
## [0.8.0] - 2026-02-20

### Added
- Backup management APIs under `/api/backups` with list/create/restore/delete/purge operations.
- Profile Management Backups UI with restore actions and purge preview flow.
- Backup retention helpers in core backup module: soft-delete to `.trash/` and policy-based purge support.
- Upstream doc scanner script (`scripts/omo-doc-scan.js`) for discouraged-model signal extraction.
- Normalized upstream snapshot generator (`scripts/upstream-snapshot.js`) with cache support.
- Deterministic Playwright coverage for backup management and discouraged-model warning badges.
- Unit coverage for backup purge safety and drift-check comparison behavior.
- Operator documentation for upstream synchronization workflow (`docs/UPSTREAM-SYNC.md`).

### Changed
- Drift checker now compares full fallback chains plus gating metadata (not only first fallback entry).
- Drift checker supports machine-readable JSON output and sync-oriented flags (`--refresh`, `--pin`).
- Recommendation engine now applies soft penalties for discouraged models and surfaces warning metadata to UI.
- Agent discovery API now marks newly discovered agents with `isProfiled` status.
- CLI quick-switch backup creation now reuses shared core backup implementation.

### Fixed
- Agent model selector now shows immediate pending-change indicators before save.
- Purge UX guardrails now require explicit confirmation and communicate soft-delete safety.

## [0.7.0] - 2026-02-12

### Added
- Pending model change visibility in Agents view, including card highlighting and per-agent from -> to model indicators before save.
- Styled "Review Model Changes" modal for save/apply showing all agent model transitions.
- Richer agent context in agent cards and detail modals, including best-utilization guidance and prompt-derived role/behavior excerpts.
- Explicit release discipline policy in project docs requiring version bump, changelog update, tagging, push, and GitHub release for bug fixes/features.

### Changed
- Save-state tracking now compares against last saved config baseline so unsaved state and pending markers reflect real diffs.
- Save flow now confirms/apply operations through in-app modal actions instead of browser confirm dialogs.

## [0.6.0] - 2026-02-12

### Added
- **Web-first UI**: local HTTP server + static SPA for browsing models and editing agent assignments
- **Model comparison**: compare a model across providers (value-ranked)
- **Agent documentation**: fetch and display upstream agent docs (GitHub)
- **Smoke runner**: `./run-tests.sh api|ui|all`

### Changed
- CLI now defaults to launching the web UI; CLI mode is primarily quick profile switching
- Active config is `~/.config/opencode/oh-my-opencode.jsonc` (JSONC)
- Core logic organized under `lib/core/` (models, agents, backups)

### Fixed
- Model/provider list now refreshes immediately after `~/.config/opencode/opencode.json` changes (cache invalidation)
- More robust parsing of `opencode models --verbose` header lines (supports underscores/dots)

### Removed
- Legacy TUI implementation under `lib/ui/` (replaced by web UI)

## [0.5.0] - 2025-12-30

### Added
- Project scope support via `.opencode/oh-my-opencode.json` (git root) with clear scope/repo/path display
- Project opt-in prompt (interactive only) with per-repo "don't ask again" cache
- Copy a saved profile into a project config
- Save current global/project config back into a named profile
- Startup check for latest Oh My OpenCode schema release (cached under `~/.config/opencode/cache/`)
- Provider preference policies by model family prefix (e.g. `claude-`, `gpt-`, `grok-`) and an interactive editor
- MCP portability tooling:
  - Exa key helper
  - Migrate OpenCode `opencode.json` MCP `environment` secrets into `~/.config/opencode/secrets/*` with `{file:...}` placeholders
  - Migrate Oh My OpenCode MCP URL query secrets into `~/.config/opencode/secrets/*` with `{file:...}` placeholders
  - Secrets report (inline vs env vs file + missing/orphan secret files)

### Changed
- Installer now links command into `~/.local/bin` and ensures PATH points there
- Tool can continue when model catalog fails to load (manual model-id entry fallback)

### Fixed
- ProviderModelNotFoundError due to bare model ids: normalize agent model ids to fully-qualified `provider/model`
- Model catalog parsing bug where JSON `id` overwrote the qualified `provider/model` id
- Snapshot profile creation on schema update now uses valid config names (no dots)
- Repo-root `./opencode-agent-config` now forwards to `./bin/opencode-agent-config` to avoid running legacy script

## [0.4.0] - 2025-12-29

### Added
- **Bulk Agent Operations** - New options in Agent Config Menu:
  - [A] Auto-optimize all - Apply top recommended model to each agent based on profile
  - [L] Bulk edit - Apply same model to multiple selected agents at once
- **Persistent Provider Filters** - Search/filter now shows preferred providers option:
  - [P] Use preferred providers only in search
  - ★ markers show preferred providers in provider lists
- **Model Comparison** - [K] Compare up to 4 models side-by-side:
  - Shows provider, context size, capabilities (reasoning, thinking, image, PDF)
  - Cost comparison (input/output pricing)
  - Fast model indicator
- **Model Bookmarks** - [*] Save frequently-used models for quick access:
  - Add/remove bookmarks from any model selection
  - Quick select from bookmarks when assigning models
- **Agent Reordering** - [O] Customize agent display order:
  - Swap agent positions with simple "# #" command
  - Order persists across sessions (JS object insertion order)
- **Reload Models** - [L] Refresh model list without restarting tool:
  - Useful when providers add new models
  - Shows count of loaded models and providers

### Changed
- **Modular Architecture** - Codebase split into `lib/` structure:
  - `lib/constants.js` - Colors, paths, defaults, agent profiles
  - `lib/config-manager.js` - ConfigurationManager class
  - `lib/model-loader.js` - Model parsing, scoring, recommendations
  - `lib/validation.js` - Config validation, sync logic
  - `lib/ui/menus.js` - Main AgentConfigTool class, TUI menus
  - `lib/ui/prompts.js` - Input helpers, formatModel
- Entry point moved to `bin/opencode-agent-config`
- `install.sh` updated to copy modular structure

### Improved
- Better workflow for power users managing multiple agents
- Faster model selection with bookmarks and persistent filters
- Easier comparison when choosing between similar models

## [0.3.1] - 2025-12-24

### Removed
- **"Add agent" functionality** - Removed non-functional agent creation feature
- User-added agents without system prompts don't work in OpenCode/OmO ecosystem

### Added
- **Agent information screen** - [?] option shows all OmO built-in agents with:
  - Agent name and description
  - Preferred model capabilities
  - Minimum context requirements
- `docs/CUSTOM-AGENTS.md` - Complete specification for future custom agent support
- UI messaging indicating tool manages OmO built-in agents only

### Changed
- Main menu now shows "[?] Show agent information" instead of "[A] Add new agent"
- Agent Config Menu updated with info option, removed add option
- UI footer shows "Managing OmO built-in agents only (see [?] for custom agents)"
- Tool scope clarified: model assignment for Oh My Opencode's curated agents

### Improved
- Tool is now honest about its functionality and limitations
- Prevents users from creating non-functional agent entries
- Clear path to full custom agent creation in future release (Option 2)

## [0.3.0] - 2025-12-24

### Added
- **Backup restore from UI** - Full restore functionality with preview and confirmation
- **Agent count display** - Show number of agents in all configuration lists
- Backup preview showing agents and models before restore
- Warning prompt with safety backup before restore
- Scope selection (current config or all backups) for restore

### Changed
- **Stay in Agent Config Menu after edits** - No longer returns to main menu after each operation
- Agent operations (add/edit/delete) stay in context when called from Agent Config Menu
- Reduced navigation friction when configuring multiple agents
- Configuration lists show agent counts: `config-name (6 agents)`

### Improved
- Workflow efficiency for multi-agent configuration
- Backup management now complete with restore capability
- Better visual indication of configuration size

## [0.2.1] - 2025-12-24

### Added
- Direct agent configuration menu after creating new configuration
- Capability legend displayed on main menu: [R]=Reasoning [I]=Image [P]=PDF
- Provider names shown in cyan color when listing models
- Agent selection by number in addition to name
- Dedicated agent configuration menu for batch editing

### Changed
- Edit/Delete agent prompts now accept either number (1-6) or agent name
- Model display now includes colored provider name for better visibility
- After creating config, users are prompted to configure agents immediately
- Improved workflow for setting up new configurations

### Improved
- Better visual distinction between model information components
- More intuitive agent selection process
- Streamlined configuration creation experience

## [0.2.0] - 2025-12-24

### Added
- **CLI argument support** - Fast configuration switching from command line
- `--switch` / `-s` - Quick switch to a configuration without interactive menu
- `--list` / `-l` - List all available configurations
- `--current` / `-c` - Show currently active configuration
- `--help` / `-h` - Display usage information
- Error handling for invalid configuration names with helpful suggestions

### Changed
- Tool now supports both interactive and CLI modes
- Non-interactive commands exit immediately after execution
- Updated README with CLI usage examples

## [0.1.1] - 2025-12-24

### Added
- Ability to copy from any existing configuration when creating a new one
- "Copy from another configuration" option in create config menu
- Shows source configuration name when creating from a copy

### Changed
- Reordered create configuration options for better UX
- Option [2] is now "Copy from another configuration" with interactive selection
- Option [3] is now "Copy current configuration" 
- Option [4] is now "Minimal configuration (no agents)"

### Fixed
- Previously could only copy from omo-default or current config, now can copy from any config

## [0.1.0] - 2025-12-24

### Added
- **Named configuration profiles** - Create, save, and switch between multiple agent configurations
- Configuration management menu with full CRUD operations (create, rename, delete, switch)
- Built-in "omo-default" configuration with Oh My Opencode defaults
- Automatic migration of existing configuration to "user-config" on first run
- Configuration metadata tracking (name, description, created/modified timestamps)
- Configuration export/import functionality for sharing and backup
- Config-specific backup naming for better organization
- Active configuration display in main menu with metadata
- Configuration-filtered backup viewer with option to view all backups
- ConfigurationManager class for centralized config operations
- Smart configuration creation with recommended defaults (copy omo-default)
- Context-aware tips after creating/switching configurations
- Warning when creating minimal configs without agents

### Changed
- Main menu now displays active configuration info at top
- "Restore defaults" now switches to "omo-default" configuration instead of overwriting
- Backup files now named with config name prefix (e.g., `user-config-2025-12-24T12-00-00.json`)
- Configuration structure now includes metadata wrapper with name, description, timestamps

### Technical
- New directory structure: `~/.config/opencode/configs/` for storing named configurations
- Active config tracked in `~/.config/opencode/active-config.json`
- All configuration operations go through ConfigurationManager for consistency
- Configuration names validated (alphanumeric, hyphens, underscores only)

## [0.0.2] - 2025-12-24

### Added
- Provider filtering feature - filter models by provider(s)
- Preferred providers configuration - set provider preference order
- Model recommendations now boost preferred providers in scoring
- Multi-select provider filter menu
- WARP.md documentation for repository guidance
- Dynamic provider extraction from available models

### Fixed
- Fixed JSON parser to handle nested braces using brace counting
- Updated regex to match model IDs with multiple slashes (e.g. openrouter/openai/model)
- Use providerID field from model data instead of splitting ID string
- Suppress stderr to prevent plugin messages from corrupting JSON parsing
- Now correctly loads 200+ models from all 6 providers (anthropic, cerebras, google, opencode, openrouter, xai)

## [0.0.1] - 2025-12-23

### Added
- Initial release
- Interactive CLI for managing Oh My Opencode agent model assignments
- Smart model recommendations based on agent profiles
- Automatic configuration backups
- Model search functionality
- Agent management (add, edit, delete)
- Restore defaults functionality
- Support for 200+ models from multiple providers
