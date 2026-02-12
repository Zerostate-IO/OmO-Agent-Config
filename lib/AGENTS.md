# lib/

## OVERVIEW

Core implementation (Node built-ins only). Web UI backend in `server.js`; frontend assets in `web/`; core domain logic in `core/`.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Config paths/defaults | `constants.js` | `CONFIG_DIR`, `CONFIG_FILE`, `OPENCODE_CONFIG_FILE`, `SECRETS_DIR` |
| Named config profiles | `config-manager.js` | metadata envelope `{ name, description, created, modified, config }` |
| Model catalog parsing + cache | `core/models.js` | runs `opencode models --verbose`, brace-count JSON parse |
| Model scoring (agent-fit) | `model-loader.js` | capability + context scoring using `AGENT_PROFILES` |
| Missing agent/MCP sync | `validation.js` | add missing agents/MCPs to match expected roster |
| Upstream schema caching | `upstream.js` | GitHub latest release → raw schema → `~/.config/opencode/cache/` |
| Web UI HTTP API | `server.js` | `/api/*` + static file serving for `web/` |
| Frontend SPA | `web/app.js` | filters, modals, model selector, profile mgmt |

## CONVENTIONS

- No npm deps; Node built-ins only
- Config writes always preceded by backup (handled in UI layer + config-manager)

## ANTI-PATTERNS

- Don’t add package.json/deps
- Don’t embed secrets in defaults (prefer `{env:...}` / `{file:...}` + `secrets/`)
- Don’t reintroduce `lib/ui/*` (legacy TUI paths)
