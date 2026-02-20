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


### Browser doesn’t open

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

## Config files

- Active config (Oh My OpenCode reads): `~/.config/opencode/oh-my-opencode.jsonc`
- Profiles: `~/.config/opencode/configs/*.json`
- Backups: `~/.config/opencode/backups/*.json`

If you need to roll back manually:

```bash
cp ~/.config/opencode/backups/oh-my-opencode-YYYY-MM-DD-HHMMSS.json \
  ~/.config/opencode/oh-my-opencode.jsonc
```

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
