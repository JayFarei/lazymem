```
 _                    __  __                
| |    __ _ _____   _|  \/  | ___ _ __ ___  
| |   / _` |_  / | | | |\/| |/ _ \ '_ ` _ \ 
| |__| (_| |/ /| |_| | |  | |  __/ | | | | |
|_____\__,_/___|\__, |_|  |_|\___|_| |_| |_|
                |___/                        
```

If you're running multiple Claude/Codex agents across tmux sessions, a handful of dev servers, and Docker containers on the side, your Mac's memory disappears fast. lazymem gives you a single dashboard to see where it's all going, and an agent-native way to clean it up.

![lazymem screenshot](screenshot.png)

## What it does

- **System panel** - RAM breakdown (app, wired, compressor, cached, swap), top processes by RSS, anomaly alerts
- **Agent panel** - Claude and Codex instances grouped by tmux session, with per-session memory totals
- **Dev panel** - Node, Bun, Python, LSPs, and other dev processes grouped by type
- **Docker panel** - Container stats, Colima VM allocation vs actual use
- **Prince Edmund** - An animated companion who comments on your memory situation (contextual to live state)

## Agent-native memory management

lazymem is designed to work alongside AI coding agents. Press `c` to copy a structured snapshot to your clipboard, then paste it into Claude Code. The snapshot includes PIDs, session mappings, and memory values your agent can act on directly.

For a fully integrated workflow, install the companion skill:

```sh
mkdir -p ~/.claude/skills/lazymem
cp node_modules/lazymem/skill/SKILL.md ~/.claude/skills/lazymem/SKILL.md
```

Then use `/lazymem` in Claude Code to:
- Collect live memory state across all your sessions
- Identify which agents and dev servers are using the most RAM
- Kill idle agents, stop containers, or purge cache with confirmation prompts
- See before/after memory deltas after each operation

The skill can also parse lazymem snapshots directly, so you don't need to wait for a fresh collection.

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

## Keybindings

| Key | Action |
|-----|--------|
| `q` | Quit |
| `c` | Copy snapshot to clipboard |
| `Tab` | Cycle panels |
| `1-4` | Jump to panel |
| `j/k` | Navigate rows |
| `Enter` | Expand row details |
| `g` | Fullscreen panel |
| `r` | Force refresh |
| `?` | Help overlay |

## Requirements

- macOS (uses `vm_stat`, `sysctl`, `ps` with macOS-specific flags)
- [Bun](https://bun.sh) >= 1.0

## License

MIT
