#!/bin/bash

# OmO Agent Config Installation Script
# Installs the OpenCode agent configuration tool

set -e

TOOL_NAME="opencode-agent-config"
INSTALL_DIR="$HOME/.config/opencode/bin"
BACKUP_DIR="$HOME/.config/opencode/backups"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "========================================================================"
echo "OmO Agent Config - Installation"
echo "========================================================================"
echo ""

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
    SHELL_NAME="bash"
else
    SHELL_RC="$HOME/.profile"
    SHELL_NAME="shell"
fi

echo "Detected shell: $SHELL_NAME"
echo "Shell RC file: $SHELL_RC"
echo ""

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$BACKUP_DIR"
echo "✓ Created $INSTALL_DIR"
echo "✓ Created $BACKUP_DIR"
echo ""

# Copy tool
echo "Installing tool..."
cp "$SCRIPT_DIR/$TOOL_NAME" "$INSTALL_DIR/$TOOL_NAME"
chmod +x "$INSTALL_DIR/$TOOL_NAME"
echo "✓ Installed $TOOL_NAME to $INSTALL_DIR"
echo ""

# Add to PATH
if grep -q "opencode/bin" "$SHELL_RC" 2>/dev/null; then
    echo "✓ Tool path already in $SHELL_RC"
else
    echo "Adding tool to PATH..."
    echo "" >> "$SHELL_RC"
    echo "# OmO Agent Config - OpenCode agent configuration tool" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.config/opencode/bin:\$PATH\"" >> "$SHELL_RC"
    echo "✓ Added to $SHELL_RC"
fi

echo ""
echo "========================================================================"
echo "Installation Complete!"
echo "========================================================================"
echo ""
echo "To start using the tool:"
echo ""
echo "  1. Reload your shell:"
echo "     source $SHELL_RC"
echo ""
echo "  2. Run the tool:"
echo "     $TOOL_NAME"
echo ""
echo "Or run directly without reloading:"
echo "  $INSTALL_DIR/$TOOL_NAME"
echo ""
echo "Documentation:"
echo "  - README: $SCRIPT_DIR/README.md"
echo "  - Docs: $SCRIPT_DIR/docs/"
echo ""
