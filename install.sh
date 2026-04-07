#!/bin/sh
set -e

# lazymem installer
# Usage: curl -fsSL https://raw.githubusercontent.com/JayFarei/lazymem/main/install.sh | sh

REPO="JayFarei/lazymem"
INSTALL_DIR="$HOME/.lazymem"
BIN_DIR="/usr/local/bin"

echo "Installing lazymem..."

# macOS only
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: lazymem only supports macOS" >&2
  exit 1
fi

# Check for bun
if ! command -v bun >/dev/null 2>&1; then
  echo "lazymem requires Bun. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    echo "Error: Failed to install Bun. Install manually: https://bun.sh" >&2
    exit 1
  fi
fi

# Get latest version
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
if [ -z "$LATEST" ]; then
  echo "Error: Could not determine latest version" >&2
  exit 1
fi

echo "Version: v$LATEST"

# Download and extract
TARBALL_URL="https://github.com/$REPO/archive/refs/tags/v${LATEST}.tar.gz"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR"

# Install
rm -rf "$INSTALL_DIR"
mv "$TMP_DIR/lazymem-$LATEST" "$INSTALL_DIR"
cd "$INSTALL_DIR"
rm -f bun.lock bun.lockb
bun install --production

# Symlink
if [ -w "$BIN_DIR" ]; then
  ln -sf "$INSTALL_DIR/bin/lazymem" "$BIN_DIR/lazymem"
else
  echo "Creating symlink in $BIN_DIR (requires sudo)..."
  sudo ln -sf "$INSTALL_DIR/bin/lazymem" "$BIN_DIR/lazymem"
fi

echo ""
echo "lazymem v$LATEST installed successfully!"
echo "Run 'lazymem' to start."
echo ""
echo "Optional: install the Claude Code skill for AI-assisted memory management:"
echo "  mkdir -p ~/.claude/skills/lazymem"
echo "  cp $INSTALL_DIR/skill/SKILL.md ~/.claude/skills/lazymem/SKILL.md"
