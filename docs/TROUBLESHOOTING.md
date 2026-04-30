# Troubleshooting

Common issues and fixes for OmO Agent Config.

## Install / Launch

### Command not found

Make sure `~/.local/bin` is on your PATH and reinstall:

```bash
./install.sh
```

### Permission denied

```bash
chmod +x ~/.config/opencode/bin/opencode-agent-config
```

### Don’t use sudo

If you needed `sudo` to install Node, reinstall Node using a version manager instead.

## Web UI / Server
### Security / Access from other devices

The server is designed for localhost use only:
- Binds to `127.0.0.1` (not accessible from other machines)
- CORS policy restricts requests to same-origin only
- No wildcard (`*`) CORS is allowed

If you need to access from another device, use SSH port forwarding instead of changing the bind address.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OMO_PORT` | `3456` | Explicit port binding. Skips port probing. |
| `OMO_ALLOW_EXTERNAL_HOST` | unset | Set to `1` to allow non-localhost `Host` headers. **Security risk**: only use on trusted networks. |
| `OMO_NO_OPEN` | unset | Set to `1` to disable automatic browser opening. |

Examples:

```bash
# Bind to a specific port
OMO_PORT=8080 opencode-agent-config

# Run in CI/headless environments
OMO_NO_OPEN=1 opencode-agent-config

# Allow external access (caution: exposes to network)
OMO_ALLOW_EXTERNAL_HOST=1 opencode-agent-config
```


### Browser doesn't open

The server still starts. Open the printed URL manually.

To disable auto-open:

```bash
OMO_NO_OPEN=1 opencode-agent-config
```

### Port already in use

The server will probe ports starting at `3456` (up to 10 attempts). If you have something bound on `3456`, retry and use the printed URL.

## Models / Providers not showing

### New provider/models not appearing

Model discovery comes from:

```bash
opencode models --verbose
```

If it doesn’t show there, OmO Agent Config can’t show it either.

If it **does** show there but the UI still looks stale:

- Click **Refresh** in the UI, or
- Hit `GET /api/models?refresh=true`

Note: model results are cached under `~/.config/opencode/cache/models-cache.json`.

### LM Studio Models Not Appearing

**Status:** LM Studio custom detection is **not implemented**.

This tool surfaces models only through `opencode models --verbose`. If LM Studio models
are not appearing:

1. Verify LM Studio is running and has models loaded
2. Check that OpenCode CLI is configured to use LM Studio
3. Run `opencode models --verbose` to see what OpenCode discovers
4. This tool does **not** probe `localhost:1234` directly

The model discovery path is entirely CLI-driven. This tool is a configuration UI,
not a model discovery engine. No custom localhost probing is implemented for LM Studio
or any other local inference server.

### Provider Diagnostics

If providers appear in `opencode models --verbose` but not in the UI, check the diagnostics endpoint:

```bash
curl http://localhost:3456/api/providers/diagnostics
```

This returns:
- `sources` - providers found in config files and agent assignments
- `mismatches` - providers expected but missing, or discovered but not expected
- `cacheStatus` - age of the models cache
- `hints` - actionable suggestions

Common issues:
- **Stale cache**: Cache is older than your config file. Click Refresh in the UI.
- **Provider name mismatch**: Some providers use different naming in different contexts. Check `normalized.discovered` vs `normalized.expected`.
- **Missing from opencode.json**: Provider must be configured in `~/.config/opencode/opencode.json` first.

### Model Visibility Troubleshooting

Model discovery is driven entirely by `opencode models --verbose`. If models are missing from the UI, follow this checklist:

1. **Verify OpenCode sees the model**: Run `opencode models --verbose | grep "provider/model"`. If it doesn't appear there, the issue is in your OpenCode provider configuration, not in this tool.

2. **Refresh the cache**: Click **Refresh** in the UI, or call `GET /api/models?refresh=true`. The cache invalidates automatically when `~/.config/opencode/opencode.json` is modified (mtime check).

3. **Check provider config**: Ensure the provider is configured in `~/.config/opencode/opencode.json` with valid credentials.

4. **Check diagnostics**: The provider diagnostics endpoint shows discovered vs expected providers, cache status, and mismatch details.

This tool does not probe local inference servers (LM Studio, Ollama, etc.) directly. All model discovery goes through the OpenCode CLI.

## Config files

- Active config (Oh My OpenCode reads): `~/.config/opencode/oh-my-opencode.jsonc`
- Profiles: `~/.config/opencode/configs/*.json`
- Backups: `~/.config/opencode/backups/*.json`

The primary config file is `~/.config/opencode/oh-my-opencode.jsonc`. Despite the upstream repo rename to `oh-my-openagent`, this filename is preserved for backward compatibility. The tool does not read or write `oh-my-openagent.jsonc`; if that file exists alongside the primary config, diagnostics will flag it as advisory only.

### Config Split Diagnostics

The tool runs read-only diagnostics to detect common configuration issues. These appear as hints in the provider diagnostics modal and via the API:

```bash
curl http://localhost:3456/api/config/diagnostics
```

**Sibling config file**: If `oh-my-openagent.jsonc` exists in `~/.config/opencode/`, the tool reports a warning. This file is not read or migrated. No automatic action is taken.

**Stale `$schema` URL**: If the config file's `$schema` property references the old repo path (`code-yeongyu/oh-my-opencode/master` or `/dev`), the tool suggests updating to the canonical URL from `code-yeongyu/oh-my-openagent`. The tool does not modify the URL automatically.

**Old plugin name**: If `~/.config/opencode/opencode.json` references `oh-my-opencode` as a plugin name (singular `plugin` or plural `plugins`), the tool notes that the upstream project now uses `oh-my-openagent`. This is a hint only; the tool does not rename plugins.

All diagnostics are advisory. The tool never renames, moves, or migrates config files.

If you need to roll back manually:

```bash
cp ~/.config/opencode/backups/oh-my-opencode-YYYY-MM-DD-HHMMSS.json \
  ~/.config/opencode/oh-my-opencode.jsonc
```

### Fallback Model Entries

`fallback_models` entries can be strings (`"provider/model"`) or rich objects (`{ "model": "provider/model", "variant": "high" }`). The UI preserves both shapes. If you see `[object Object]` in the fallback display, refresh the page (this was a bug in earlier versions).

If object entries have unknown fields, those fields are preserved through save/load cycles and are not stripped.

## Tests

### Running tests

Run the full test suite:

```bash
npm test
```

Or use the test runner script:

```bash
./run-tests.sh all        # Run all tests
./run-tests.sh api        # API tests only
./run-tests.sh ui         # UI tests only
./run-tests.sh install    # Installation tests
```
