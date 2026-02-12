# bin/

## OVERVIEW

CLI entrypoint for OmO-Agent-Config: launches the local web UI by default, or performs quick profile switching.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Argument parsing / help text | `opencode-agent-config` | `--list`, `--help`, `<profile>` |
| Local dev vs installed lib path | `opencode-agent-config` | Chooses `../lib` if present; else `~/.config/opencode/lib` |
| Web UI startup | `opencode-agent-config` → `lib/server.js` | Calls `startServer()` then opens browser |
| Quick switch | `opencode-agent-config` | Writes active config + updates `active-config.json` |

## CONVENTIONS

- Keep this file a thin wrapper; real logic belongs in `lib/`.
- User-facing output is part of the UX (don’t silently change flags/behavior).

## ANTI-PATTERNS

- Don’t add runtime dependencies here.
- Don’t hardcode paths outside `~/.config/opencode/` (use `lib/constants.js`).
