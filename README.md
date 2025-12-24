# OmO Agent Config

> Interactive CLI tool for managing [Oh My Opencode](https://github.com/opencode-ai/oh-my-opencode) agent model assignments

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Overview

OmO Agent Config is a user-friendly command-line tool that simplifies the process of configuring and managing agent model assignments in Oh My Opencode. No more manual JSON editing - use an interactive menu to browse, search, and assign models from a catalog of 200+ options.

### Key Features

- **Smart Model Recommendations** - Intelligent model suggestions based on agent type and capabilities
- **Automatic Backups** - Every configuration change creates a timestamped backup
- **Extensive Model Catalog** - Browse 200+ models from OpenCode, Google, Anthropic, xAI, OpenRouter
- **Easy Restore** - One-click restore to default configuration
- **Search & Filter** - Quickly find models by provider, name, or capabilities
- **Agent Management** - Add, edit, or delete agents through an intuitive interface

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
3. Add it to your PATH (in `~/.zshrc` or `~/.bashrc`)
4. Create the backup directory

### Manual Installation

```bash
# Copy the tool
cp opencode-agent-config ~/.config/opencode/bin/
chmod +x ~/.config/opencode/bin/opencode-agent-config

# Add to PATH (add to your shell rc file)
export PATH="$HOME/.config/opencode/bin:$PATH"

# Create backup directory
mkdir -p ~/.config/opencode/backups
```

## Usage

### Starting the Tool

```bash
opencode-agent-config
```

### Main Menu

```
======================================================================
Oh My Opencode - Agent Configuration
======================================================================

CURRENT AGENTS:

  1. oracle                    → opencode/gpt-5.2
  2. Sisyphus                  → google/claude-opus-4-5-thinking
  3. librarian                 → google/claude-sonnet-4-5
  4. frontend-ui-ux-engineer   → google/gemini-3-pro-high
  5. document-writer           → google/gemini-3-flash
  6. multimodal-looker         → google/gemini-3-flash

ACTIONS:

  [E] Edit agent model
  [A] Add new agent
  [D] Delete agent
  [R] Restore defaults
  [B] View backups
  [Q] Quit
```

### Workflow Examples

#### Change an Agent's Model

1. Press `E` to edit
2. Enter the agent name (e.g., `oracle`)
3. View recommended models ranked by suitability
4. Select a model or press `S` to search all models
5. Confirm your selection

#### Add a New Agent

1. Press `A` to add
2. Enter a unique agent name
3. Select a model from recommendations or search
4. The agent is created and saved with automatic backup

#### Restore Default Configuration

1. Press `R` to restore
2. Confirm with `yes`
3. All agents revert to default models

## Agent Profiles

The tool includes intelligent recommendations for different agent types:

| Agent | Purpose | Recommended Capabilities |
|-------|---------|-------------------------|
| **oracle** | Strategic reasoning & complex problem solving | Reasoning, Large context (128K+) |
| **Sisyphus** | Extended thinking for multi-step tasks | Reasoning, Thinking models, Large context |
| **librarian** | Research & knowledge retrieval | Large context, Fast performance |
| **frontend-ui-ux-engineer** | UI/UX with visual understanding | Multimodal, Image input |
| **document-writer** | Fast text generation | Speed, Text output |
| **multimodal-looker** | Visual analysis & PDF understanding | Multimodal, Image/PDF input |

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
```
~/.config/opencode/bin/opencode-agent-config
```

### Configuration File
```
~/.config/opencode/oh-my-opencode.json
```

This is the file Oh My Opencode reads for agent configuration.

### Backup Location
```
~/.config/opencode/backups/oh-my-opencode-YYYY-MM-DD-HHMMSS.json
```

Backups are automatically created before every configuration change.

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
echo 'export PATH="$HOME/.config/opencode/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Restore a backup manually

```bash
cp ~/.config/opencode/backups/oh-my-opencode-2025-12-24-123000.json \
   ~/.config/opencode/oh-my-opencode.json
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
