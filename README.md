# lazymem

Terminal UI memory monitor for macOS dev environments. Built with [Bun](https://bun.sh) and [@opentui/solid](https://github.com/nicholasgasior/opentui).

Tracks system memory, per-process RSS, Claude/Codex agent sessions, Node/dev tools, Docker containers, and swap pressure in a single dashboard.

## Install

### Homebrew

```sh
brew tap JayFarei/tap
brew install lazymem
```

### npm / bun

```sh
npm install -g lazymem
# or
bun install -g lazymem
```

### curl

```sh
curl -fsSL https://raw.githubusercontent.com/JayFarei/lazymem/main/install.sh | sh
```

### From source

```sh
git clone https://github.com/JayFarei/lazymem.git
cd lazymem
bun install
bun run dev
```

## Usage

```sh
lazymem
```

### Keybindings

| Key | Action |
|-----|--------|
| `q` | Quit |
| `c` | Copy snapshot to clipboard (for AI-assisted memory management) |
| `Tab` | Cycle panels |
| Arrow keys | Scroll within panel |

## Claude Code Skill (optional)

lazymem ships with a companion Claude Code skill that lets your AI assistant manage memory using TUI snapshots. To install:

```sh
mkdir -p ~/.claude/skills/lazymem
cp node_modules/lazymem/skill/SKILL.md ~/.claude/skills/lazymem/SKILL.md
```

Then use `/lazymem` in Claude Code to collect memory state, analyze pressure, and perform safe cleanup operations.

## Requirements

- macOS (uses `vm_stat`, `sysctl`, `ps` with macOS-specific flags)
- [Bun](https://bun.sh) >= 1.0

## License

MIT
