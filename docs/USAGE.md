# Usage Guide

How to use OmO Agent Config (web UI + CLI quick-switch).

## Getting Started

Launch the web UI:

```bash
opencode-agent-config
```

This starts a local HTTP server (default `http://localhost:3456`) and opens your browser.

### Security Notes

- The server is intended for **localhost use only** and binds to `127.0.0.1`
- CORS policy defaults to same-origin with no wildcard (`*`) allowed
- No authentication is required since it only accepts connections from the local machine

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

## Running Tests

Run the full test suite:

```bash
./run-tests.sh all        # Run all tests
```

Or run specific test groups directly:

```bash
./run-tests.sh all        # Run all tests
./run-tests.sh api        # API tests only
./run-tests.sh ui         # UI tests only
./run-tests.sh install    # Installation tests
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
