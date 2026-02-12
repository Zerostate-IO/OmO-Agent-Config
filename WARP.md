# WARP.md

Guidance for working on this repo (warp.dev).

## Project Overview

OmO Agent Config is a local web UI + CLI wrapper for managing Oh My OpenCode / Oh My Opencode agent→model assignments.

- Backend: Node.js built-in `http` server (`lib/server.js`)
- Frontend: static SPA (`lib/web/`)
- Model catalog: `opencode models --verbose` parsed/cached in `lib/core/models.js`

## Key Commands

```bash
# Install into ~/.config/opencode/
./install.sh

# Launch web UI
opencode-agent-config

# List profiles
opencode-agent-config --list

# Quick switch
opencode-agent-config <profile>

# Smoke tests
./run-tests.sh api
./run-tests.sh ui
```

## Files / Paths

- Active config: `~/.config/opencode/oh-my-opencode.jsonc`
- Profiles: `~/.config/opencode/configs/*.json`
- Active profile tracker: `~/.config/opencode/active-config.json`
- Backups: `~/.config/opencode/backups/*.json`
- Model cache: `~/.config/opencode/cache/models-cache.json`

## Constraints

- Runtime must stay dependency-free (Node built-ins only). Dev deps (Playwright) are OK.
- Don’t reintroduce legacy `lib/ui/*` TUI codepaths.
