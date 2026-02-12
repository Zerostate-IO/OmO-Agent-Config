# OmO Agent Config

> Local web UI + CLI wrapper for managing [Oh My OpenCode (Oh My Opencode)](https://github.com/code-yeongyu/oh-my-opencode) agent model assignments

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Overview

OmO Agent Config is a local web UI (served by a zero-dependency Node.js HTTP server) plus a small CLI wrapper. It helps you browse available models from `opencode models --verbose`, assign models to OmO agents, and manage named configuration profiles without hand-editing JSON.

### Key Features

- **Named Configuration Profiles** - Create and switch between multiple agent configurations for different workflows
- **Web UI (default)** - Browse models + edit agent assignments in a browser
- **CLI Quick Switch** - Fast profile switching: `opencode-agent-config <profile>`
- **Smart Model Recommendations** - Intelligent model suggestions based on agent type and capabilities
- **Automatic Backups** - Every configuration change creates a timestamped backup
- **Extensive Model Catalog** - Browse models from all configured providers
- **Easy Restore** - One-click restore to default configuration
- **Search & Filter** - Quickly find models by provider, name, or capabilities
- **Agent Information** - View detailed information about Oh My Opencode's built-in agents

## Prerequisites

- [OpenCode](https://opencode.ai) installed and configured
- Node.js (v14 or higher)
- macOS, Linux, or WSL2

## Installation

### Quick Install

```bash
# Clone the repository
git clone git@github.com:ZeroState-IO/OmO-Agent-Config.git
cd OmO-Agent-Config

# Run the installer
./install.sh
```

The installer will:
1. Copy the tool to `~/.config/opencode/bin/`
2. Make it executable
3. Link it into `~/.local/bin/` (so it can be run from anywhere)
4. Ensure `~/.local/bin` is on your PATH (in your shell rc file)
5. Create the backup directory

### Manual Installation

```bash
# Copy the tool
mkdir -p ~/.config/opencode/bin
cp bin/opencode-agent-config ~/.config/opencode/bin/
chmod +x ~/.config/opencode/bin/opencode-agent-config

# Link into a common user bin dir
mkdir -p ~/.local/bin
ln -sf ~/.config/opencode/bin/opencode-agent-config ~/.local/bin/opencode-agent-config

# Ensure ~/.local/bin is on PATH (add to your shell rc file)
export PATH="$HOME/.local/bin:$PATH"

# Create backup directory
mkdir -p ~/.config/opencode/backups
```

## Usage

### Command Line Interface

Quickly manage configurations from the command line:

```bash
# Launch web UI (default)
opencode-agent-config

# Quick switch to a profile
opencode-agent-config omo-default

# List profiles
opencode-agent-config -l
opencode-agent-config --list

# Show help
opencode-agent-config -h
opencode-agent-config --help
```

### Web UI

Running `opencode-agent-config` (with no arguments) starts a local server and opens your browser.

- Models view: search/filter the model catalog, inspect capabilities/cost/context
- Agents view: assign a model to each agent
- Profiles: create/duplicate/import/export/activate named profiles

## Agent Profiles

The tool includes intelligent recommendations for different agent types:

The defaults track the Oh My Opencode v3.x agent lineup.

## Model Capabilities Legend

When browsing models, you'll see these capability indicators:

- **R** - Reasoning capable
- **I** - Image input support
- **P** - PDF input support
- **Context size** - Displayed as "128K", "200K", etc.

Example:
```
1. Claude Opus 4.5 Thinking (200K[R]) ⭐ (current)
2. Gemini 3 Pro High (1048K[RIP])
3. GPT-5.2 (200K[R])
```

## Configuration Files

### Tool Location

Primary install path:
```
~/.config/opencode/bin/opencode-agent-config
```

Convenience link (recommended in PATH):
```
~/.local/bin/opencode-agent-config
```

### Configuration File
```
~/.config/opencode/oh-my-opencode.jsonc
```

This is the file Oh My Opencode reads for agent configuration.

### Backup Location
```
~/.config/opencode/backups/oh-my-opencode-YYYY-MM-DD-HHMMSS.json
```

Backups are automatically created before every configuration change.

## API Keys / Portability

This repo does **not** ship API keys.

If you enable the Exa MCP (`websearch_exa`), you have two portable options:

1) Environment variable:
```bash
export EXA_API_KEY="..."
```

2) File-based secret (recommended if you want to back up a single directory):
```
~/.config/opencode/secrets/exa_api_key
```

This tool can set either placeholder in the MCP URL (`{env:EXA_API_KEY}` or `{file:...}`), depending on your preference.

For OpenCode MCP servers defined in `~/.config/opencode/opencode.json`, this tool also supports migrating inline `mcp.*.environment` secrets into `~/.config/opencode/secrets/*` and replacing them with `{file:...}` placeholders (one-dir backup friendly).

## Default Agent Configuration

The tool includes these defaults for easy restoration:

```json
{
  "agents": {
    "oracle": {
      "model": "opencode/gpt-5.2"
    },
    "Sisyphus": {
      "model": "google/claude-opus-4-5-thinking"
    },
    "librarian": {
      "model": "google/claude-sonnet-4-5"
    },
    "frontend-ui-ux-engineer": {
      "model": "google/gemini-3-pro-high"
    },
    "document-writer": {
      "model": "google/gemini-3-flash"
    },
    "multimodal-looker": {
      "model": "google/gemini-3-flash"
    }
  }
}
```

## Troubleshooting

### Tool won't start

Ensure it's executable:
```bash
chmod +x ~/.config/opencode/bin/opencode-agent-config
```

### Can't find models

Verify OpenCode is installed:
```bash
opencode models
```

### Command not found

Add to your PATH manually:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Or run directly:
```bash
~/.local/bin/opencode-agent-config
```

### Restore a backup manually

```bash
cp ~/.config/opencode/backups/oh-my-opencode-2025-12-24-123000.json \
   ~/.config/opencode/oh-my-opencode.jsonc
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Oh My Opencode](https://github.com/opencode-ai/oh-my-opencode) - The agent framework this tool configures
- [OpenCode](https://opencode.ai) - The AI coding assistant

## Support

If you encounter issues or have questions:

- Open an issue on [GitHub](https://github.com/ZeroState-IO/OmO-Agent-Config/issues)
- Check the [documentation](docs/)

---

Made with ❤️ for the Oh My Opencode community
