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

### Fallback Editor
Each agent card now includes a "Configure Fallback Models" button that opens the fallback editor modal. This modal allows you to customize the per-agent fallback model priority list.

- Add fallback models from the catalog using the model picker
- Remove fallback models from the list
- Reorder fallback models using up/down controls
- Save changes to persist the fallback configuration

### Viewing Fallback Information
In the agent detail view, you see two sections:
- **Configured Fallback Models** - Your custom `fallback_models` list (editable via the editor)
- **Upstream Recommendation Chain** - Oh My Opencode's built-in fallback recommendations (read-only, for reference)

#### Example
```json
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-opus-4-6",
      "fallback_models": [
        "anthropic/claude-sonnet-4-6",
        "google/gemini-3.1-pro"
      ]
    }
  }
}
```
#### Dual-Field Pattern
- **`configuredFallbackModels`** (from API) - User-configured fallback list
- **`fallbackChain`** (from agent docs) - Upstream recommendation chain
These are intentionally separate to avoid confusion.

### Fallback Editor Usage
1. Click the "Configure Fallback Models" button on an agent card
2. In the modal, you can:
   - Add models by clicking the "+" button and selecting from the catalog
   - Reorder models by using the up/down arrow buttons
   - Remove models by clicking the "×" button
3. Click "Save" to persist your changes
4. Review the pending changes before confirming
### Model ID Format
Fallback models must use the `provider/model` format:
- Examples: `anthropic/claude-sonnet-4-6`, `google/gemini-3.1-pro`, `openai/gpt-5.4`
- Invalid entries (missing slash, empty strings, non-strings) are automatically removed
### Order Preservation
The fallback list order is preserved exactly as configured
 If you configure `["model-a", "model-b", "model-c"]`, the fallback chain will try models in that exact order.### Views

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
npm test
```

Or use the test runner script directly:

```bash
./run-tests.sh all        # Run all tests
./run-tests.sh api        # API tests only
./run-tests.sh ui         # UI tests only
./run-tests.sh install    # Installation tests
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
