# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-12
**Commit:** 8274c52
**Branch:** main

## OVERVIEW

Local web UI + CLI wrapper for managing Oh My OpenCode / Oh My Opencode agent→model assignments and profiles. Node.js (CommonJS) backend with zero-dependency HTTP server + static SPA, backed by OpenCode CLI model discovery (`opencode models --verbose`).

## STRUCTURE

```
OmO-Agent-Config/
├── bin/
│   └── opencode-agent-config        # CLI entry: launch web UI or quick-switch profile
├── lib/
│   ├── server.js                    # HTTP server + API routes + static file serving
│   ├── constants.js                 # Paths, DEFAULTS, AGENT_PROFILES, JSONC helpers
│   ├── config-manager.js            # Named profile CRUD + migrations
│   ├── validation.js                # Config integrity checks + missing agent/MCP helpers
│   ├── upstream.js                  # Fetch/cache upstream schema from GitHub
│   ├── core/
│   │   ├── models.js                # `opencode models --verbose` parsing + cache + ranking
│   │   ├── model-requirements.js    # Upstream fallback chain definitions + resolution
│   │   ├── agents.js                # Fetch/parse agent docs (GitHub) + cache
│   │   ├── provider-diagnostics.js  # Provider availability diagnostics
│   │   └── backup.js                # Timestamped backups
│   └── web/
│       ├── index.html               # SPA shell
│       ├── app.js                   # Frontend logic (filters, modals, profile mgmt)
│       └── styles.css               # UI styling
├── docs/                            # Design + UX + troubleshooting
├── tests/                           # Playwright UI test(s)
├── run-tests.sh                     # Manual API/UI smoke runner
├── install.sh                       # Copies bin/ + lib/ → ~/.config/opencode/ and symlinks
├── VERSION                          # Manual version tracking
└── CHANGELOG.md                     # Release history
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI entry / quick-switch | `bin/opencode-agent-config` | Also launches web UI by default |
| Web UI backend | `lib/server.js` | Routes under `/api/*` + static `lib/web/*` |
| Model discovery + provider list | `lib/core/models.js` | Runs `opencode models --verbose`, parses, caches, ranks |
| Agent docs / new-agent discovery | `lib/core/agents.js` | Pulls upstream agent docs + caches locally |
| Profile CRUD + envelopes | `lib/config-manager.js` | `{ name, description, created, modified, config }` |
| Defaults + paths + JSONC parsing | `lib/constants.js` | Reads/writes `~/.config/opencode/oh-my-opencode.jsonc` |
| Schema caching | `lib/upstream.js` | GitHub release tag → cached schema in `~/.config/opencode/cache/` |
| Frontend behavior | `lib/web/app.js` | State, filtering, model picker UX |
| Smoke verification | `run-tests.sh` | Curl API checks + Playwright UI run |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `startServer()` | function | `lib/server.js` | Starts local HTTP server + binds port |
| `handleRequest()` | function | `lib/server.js` | Router for API + static files |
| `getModels()` | function | `lib/core/models.js` | Cache + fetch model catalog |
| `parseModels()` | function | `lib/core/models.js` | Brace-count parser for `opencode models --verbose` |
| `rankProvider()` | function | `lib/core/models.js` | Provider tier + cost/context ranking |
| `getAllAgentDocumentation()` | function | `lib/core/agents.js` | Fetch + parse agent docs |
| `ConfigurationManager` | class | `lib/config-manager.js` | Profiles CRUD + migrations |
| `AGENT_PROFILES` | object | `lib/constants.js` | Agent capability requirements used for scoring |
| `checkAndUpdateOhMyOpenCodeSchema()` | function | `lib/upstream.js` | Updates cached upstream schema |

### Key Paths

```
~/.config/opencode/
├── oh-my-opencode.jsonc     # Active config (what OmO reads)
├── active-config.json       # Tracks which named config is active
├── configs/                 # Named configuration profiles
│   ├── omo-default.json
│   └── user-config.json
├── backups/                 # Timestamped backups
├── cache/                   # Cached upstream schema (Oh My OpenCode)
├── secrets/                 # Local secret files for {file:...} placeholders
└── bin/                     # Installed tool
    ├── opencode-agent-config
    └── lib/                 # Copied lib/ directory
```

## CONVENTIONS

- Runtime uses **Node.js built-ins only** (no production deps); repo may include dev tooling (Playwright)
- **Modular architecture**: Split into logical modules under `lib/`
- **Relative requires**: Modules use relative paths, no npm dependencies
- **Manual versioning**: Update `VERSION` file + `CHANGELOG.md` for releases
- **Config validation**: Names must match `/^[a-z0-9-_]+$/i`
- **install.sh deploys**: Copies entire bin/ and lib/ structure

## ANTI-PATTERNS (THIS PROJECT)

- Don’t add runtime deps (keep Node built-ins only)
- Don’t rely on removed `lib/ui/*` TUI paths (web UI replaced it)
- Don’t use `sudo` for install/run (see `docs/TROUBLESHOOTING.md`)
- Don’t remove/modify the `mcps` section when editing configs (see `docs/TROUBLESHOOTING.md`)

## UNIQUE STYLES

- **Source-as-binary**: JS file with shebang, distributed as executable
- **Shell-based installation**: No npm/brew; `install.sh` copies into `~/.config/opencode/` and links into `~/.local/bin`
- **Metadata wrapping**: Configs stored with `{ name, description, created, modified, config }` envelope
- **Provider preference scoring**: `preferred_providers` array boosts model scores

## COMMANDS

```bash
# Install
./install.sh

# Launch web UI
opencode-agent-config

# CLI quick operations
opencode-agent-config -l                # List profiles
opencode-agent-config --help            # Help
opencode-agent-config <profile>         # Quick switch

# Smoke checks
./run-tests.sh api
./run-tests.sh ui
```

## NOTES

- **Model loading**: `opencode models --verbose` output is parsed via brace counting; results cached in `~/.config/opencode/cache/models-cache.json`
- **Cache gotcha**: provider/model changes in `~/.config/opencode/opencode.json` should trigger a refresh (cache invalidates when that file mtime is newer than cache timestamp)
- **Config file edited**: `~/.config/opencode/oh-my-opencode.jsonc` (JSONC supported)
- **No `.github/workflows/`**: local/manual verification (see `run-tests.sh`)
