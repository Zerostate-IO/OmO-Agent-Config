# UI Flows

This document captures the primary user flows in the **web UI**.

## Entry Points

### Web UI (default)

```bash
opencode-agent-config
```

Starts the local server and opens the browser.

### CLI quick-switch (no browser)

```bash
opencode-agent-config <profile>
```

Switches `~/.config/opencode/oh-my-opencode.jsonc` to the selected profile.

## Flow: Change an agent’s model

1. Open **Agents** view
2. Click an agent
3. Choose a new model from the selector
4. Click **Save Changes**

## Flow: Browse models

1. Open **Models** view
2. Search and/or filter by provider, context size, and capabilities
3. Open model details to inspect cost/context/caps

## Flow: Manage profiles

1. Use the profile dropdown to switch
2. Use ⚙️ to create/duplicate/delete/import/export profiles
3. Activate a profile to make it current

## Notes

- Model list comes from `opencode models --verbose` via the backend.
- Config writes create a timestamped backup first.
