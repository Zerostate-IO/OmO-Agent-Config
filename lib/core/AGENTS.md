# lib/core/

## OVERVIEW

Core domain modules: model discovery/parsing, agent doc discovery/parsing, and backup utilities.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Model catalog fetch + cache | `models.js` | Executes `opencode models --verbose`; caches in `~/.config/opencode/cache/models-cache.json` |
| Model parsing | `models.js` | Brace-count JSON parsing; provider extracted from `providerID` or `id` prefix |
| Provider ranking | `models.js` | `rankProvider()` tier + cost + context heuristics |
| Agent docs fetch/cache | `agents.js` | Pulls upstream agent docs (GitHub), caches locally |
| Agent metadata parsing | `agents.js` | Extracts role/behavior/constraints blocks and scoring hints |
| Backups | `backup.js` | Timestamped backups + restore helpers |

## CONVENTIONS

- Keep these modules dependency-free (Node built-ins only).
- Treat CLI output as untrusted: tolerate missing fields and partial failures.

## ANTI-PATTERNS

- Don’t bake UI formatting into core modules (return data; format in `server.js`/frontend).
- Don’t assume `providerID` is always present; maintain safe fallbacks.
