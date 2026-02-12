# Release v0.6.0

Date: 2026-02-12

## Highlights

- Web-first UI (local server + browser SPA)
- CLI quick-switch remains (switch profiles without opening browser)
- Improved model discovery refresh when providers/models change

## Upgrade Notes

### 1) Config file is JSONC

Active config is:

`~/.config/opencode/oh-my-opencode.jsonc`

Backups are created as JSON under:

`~/.config/opencode/backups/`

### 2) UI is now browser-based

Run:

```bash
opencode-agent-config
```

If you don’t want it to auto-open a browser:

```bash
OMO_NO_OPEN=1 opencode-agent-config
```

### 3) Model/provider refresh

The model list is sourced from:

```bash
opencode models --verbose
```

If you enabled a new provider/plan, confirm it appears there first.

## Verification

```bash
./run-tests.sh api
```
