# Usage Guide

How to use OmO Agent Config (web UI + CLI quick-switch).

## Getting Started

Launch the web UI:

```bash
opencode-agent-config
```

This starts a local HTTP server (default `http://localhost:3456`) and opens your browser.

## Web UI

### Views

- **Agents**: view current agent→model assignments and change an agent’s model.
- **Models**: browse the model catalog with search + provider/context/capability filters.

### Profiles

Use the profile dropdown to switch profiles. The ⚙️ button opens profile management (create/duplicate/delete/import/export).

### Saving

- Changes are staged in the browser.
- Click **Save Changes** to write to the active config (a backup is created first).

## CLI Quick Switch

Switch to a profile without opening the web UI:

```bash
opencode-agent-config <profile>
```

List profiles:

```bash
opencode-agent-config --list
```

## Files and Locations

- Active config (Oh My OpenCode reads this): `~/.config/opencode/oh-my-opencode.jsonc`
- Named profiles: `~/.config/opencode/configs/*.json`
- Active profile tracker: `~/.config/opencode/active-config.json`
- Backups: `~/.config/opencode/backups/oh-my-opencode-YYYY-MM-DD-HHMMSS.json`

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
