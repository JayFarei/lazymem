#!/bin/sh
set -e

REPO="JayFarei/lazymem"
INSTALL_DIR="$HOME/.lazymem"
BIN_DIR="/usr/local/bin"

echo "Installing lazymem..."

# macOS only
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: lazymem only supports macOS" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TARGET="aarch64-apple-darwin" ;;
  x86_64) TARGET="x86_64-apple-darwin" ;;
  *)
    echo "Error: unsupported macOS architecture: $ARCH" >&2
    exit 1
    ;;
esac

LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p' | head -n1)
if [ -z "$LATEST" ]; then
  echo "Error: Could not determine latest version" >&2
  exit 1
fi

ASSET="lazymem-v${LATEST}-${TARGET}.tar.gz"
ASSET_URL="https://github.com/$REPO/releases/download/v${LATEST}/${ASSET}"
SHA_URL="${ASSET_URL}.sha256"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Version: v$LATEST"
echo "Target:  $TARGET"

curl -fsSL "$ASSET_URL" -o "$TMP_DIR/$ASSET"
curl -fsSL "$SHA_URL" -o "$TMP_DIR/$ASSET.sha256"
(cd "$TMP_DIR" && shasum -a 256 -c "$ASSET.sha256")
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"

rm -rf "$INSTALL_DIR"
mv "$TMP_DIR/lazymem-v${LATEST}-${TARGET}" "$INSTALL_DIR"

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
