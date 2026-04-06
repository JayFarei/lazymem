# btop++: UX Patterns & Information Architecture Brief

> Research date: 2026-04-06
> Source: https://github.com/aristocratos/btop
> Category: TUI framework / terminal resource monitor
> Stars: 31,422 | License: Apache 2.0 | Last push: 2026-03-23

---

## Overview

btop++ is a C++23 terminal resource monitor by aristocratos that covers CPU, memory, disk, network, and GPU in a single dashboard. It is the spiritual successor to bashtop and bpytop, and is widely regarded as the gold standard for terminal system monitors due to its visual density, keyboard discoverability, and Unicode graph fidelity. It runs on Linux, macOS, FreeBSD, NetBSD, and OpenBSD.

---

## 1. Information Architecture

### Panel Hierarchy and Visual Weight

btop treats all five data domains as **first-class citizens** with roughly equal visual weight — this is the sharpest philosophical departure from htop (which makes the process list dominant at 80% of screen) and top (which has no panels at all).

Default layout from top to bottom:

| Region | Key Toggle | Default Screen Share | Data Type |
|--------|-----------|---------------------|-----------|
| CPU | `1` | ~28% height, full width | History graph + per-core bars |
| Memory | `2` | ~30% height, left half | RAM bar + history + swap |
| Network | `4` | ~30% height, center | Throughput time-series |
| Process list | — | ~30% height, right column | Scrollable table |
| Disk I/O | `d` | embedded in Mem panel | Read/write speeds |
| GPU (x4) | `5`–`0` | Optional, off by default | Utilization + VRAM |

**Key insight for lazymem**: CPU is top-and-full-width because it is the most volatile and most actionable signal. The process list shares the lower half with memory and network rather than dominating. lazymem should apply the same logic: the most actionable panel (anomalies, active agents) should anchor the top; detailed breakdowns (per-session memory history, docker containers) share the lower half.

### Temporal Coexistence

btop shows both **instantaneous values** and **historical graphs** in the same panel simultaneously — no mode switching. The memory panel has both:
- A horizontal bar showing current RAM usage
- A vertical time-series graph showing usage history over the last N seconds

This is repeatedly cited by practitioners as the key differentiator vs htop: "I can see the trend AND the value without toggling views." lazymem should adopt this: show current memory value + a sparkline history inline.

---

## 2. Panel / Layout System

### Box Abstraction

Each panel is a **namespace with shared position state**, not a generic `Box` class:

```cpp
namespace Cpu {
    extern string box;       // pre-rendered ANSI outline string
    extern int x, y, width, height;
    extern int width_p, height_p;  // percentage of terminal
    extern bool shown, redraw;
}
```

The layout is computed once in `Draw::calcSizes()` (`btop_draw.cpp:2214`) by partitioning `Term::width / Term::height` among enabled panels using fixed percentage rules (e.g., Cpu gets 32% of height). Position flags (`cpu_bottom`, `proc_left`, `mem_below_net`) swap panels without changing their proportions.

### Responsive Behavior

Min-size enforcement per panel:
- CPU: `min_width=60`, `min_height=8`
- Proc: `min_width=44`, `min_height=16`

When the terminal shrinks below minimums, panels auto-hide rather than overflow. `calcSizes()` is re-run on every `SIGWINCH` (terminal resize). The box outline is re-rendered and stored; interior content is repainted on the next data tick.

### Preset System

Up to 9 named presets saved in config as a space-separated string:

```
"cpu:1:default,proc:0:default cpu:0:default,mem:0:default,net:0:default"
```

Each preset entry is `box:position:graph_symbol`. Cycle with `p` / `P`. Preset 0 is always the current custom state. The preset system is considered limiting by power users — arbitrary panel arrangements are not supported.

**lazymem takeaway**: Implement at minimum two presets: "compact" (AgentPanel + StatusBar only) and "full" (2x2 grid). Cycling via a single key is better UX than a settings menu.

---

## 3. Rendering Architecture

### String Accumulation Model

All draw functions return `std::string` of ANSI escape sequences. A Runner thread concatenates all panel outputs into one large string, then does a single `cout << output << flush`. No intermediate framebuffer, no dirty-rect tracking.

Box outlines are rendered once and stored in `Cpu::box` etc. Only data interiors are re-rendered each tick, using absolute cursor positioning: `\x1b[{row};{col}f`.

### Synchronized Output Protocol

When `terminal_sync` config is enabled, the entire flush is bracketed by:
```
\x1b[?2026h  (sync start)
... output ...
\x1b[?2026l  (sync end)
```
This is the [iTerm2 synchronized rendering protocol](https://gitlab.com/gnachman/iterm2/-/issues/7648) — eliminates visible tearing on fast updates.

**This is the most-cited flaw in btop**: keyboard response latency is noticeably slower than htop because the Runner thread does all work including data collection before flushing output. OpenTUI handles this at the framework level, but be aware of blocking render loops.

---

## 4. Graph Rendering

### Symbol System

Three graph modes, selectable per-panel via presets:

| Mode | Characters | Resolution | Compatibility |
|------|-----------|-----------|---------------|
| `braille` | U+2800–U+28FF (⣿) | 2 samples per cell, 4 dots tall | Modern terminals only |
| `block` | U+2580–U+259F (▄▆) | 1 sample per cell, 2 levels | Wide terminal compat |
| `tty` | ASCII `|` | 1 sample per cell, 1 level | All terminals |

The braille trick: each braille character packs **two** data samples (left half + right half), each with 4 vertical dot positions — giving 8 binary pixels per character cell. This doubles horizontal resolution for "free."

Symbol lookup table (`btop_draw.cpp:62`): a 25-entry `vector<string>` per mode, indexed by `left_value * 5 + right_value` (each 0–4).

### Graph Class API

```cpp
Graph(int width, int height,
      const string& color_gradient,  // key into Theme::gradients
      const deque<long long>& data,
      const string& symbol = "default",
      bool invert = false,
      long long max_value = 0);

string& operator()(const deque<long long>& data);  // append + return
string& operator()();                               // return cached
```

**lazymem takeaway**: The existing `AnimatedBar.tsx` covers instantaneous values. Add a separate `SparklineGraph` component using braille characters for history visualization. Per-panel graph symbol selection (braille vs block) is a nice-to-have for narrow terminals.

---

## 5. Color and Theming

### Semantic Color Slot System

Colors are named by **semantic role**, not by position or component. The full slot set from `Default_theme` (`btop_theme.cpp:51`):

| Slot | Purpose |
|------|---------|
| `main_bg` / `main_fg` | Global background/foreground |
| `title` | Box border title text |
| `hi_fg` | Keyboard shortcut highlight |
| `selected_bg` / `selected_fg` | Active row in lists |
| `inactive_fg` | Dimmed/disabled items |
| `div_line` | Inner dividers |
| `cpu_box` / `mem_box` / `net_box` / `proc_box` | Per-panel border color |
| `cpu_start` / `cpu_mid` / `cpu_end` | 3-stop CPU gradient |
| `mem_start` / `mem_mid` / `mem_end` | Memory gradient |
| `proc_misc` | Process list miscellaneous |
| `temp_start` / `temp_end` | Temperature gradient |

All gradients are **pre-computed** at theme load time into 101-element arrays (one ANSI escape string per percentage step). Zero runtime color math during drawing — `Theme::g("cpu")[value_pct]` is a pure array lookup.

**lazymem takeaway**: Replace magic hex strings scattered across components with a centralized theme object. Define slots like `theme.sessionBar`, `theme.anomalyHigh`, `theme.inactive`, `theme.panelBorder`. Pre-compute gradients for memory usage bars (green → yellow → red).

### Theme File Format

```ini
[main_bg] = "#141414"
[title] = "#ee9a69"
[hi_fg] = "#b54a47"
[selected_bg] = "#b04a43"
```

Community ecosystem: 20+ themes (Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Everforest). Theme files are backward-compatible with bashtop. **lazymem should ship 2-3 bundled themes** and define a clean file format for community themes.

---

## 6. Keyboard Navigation Model

### Layered Mnemonic System

btop uses **inline keyboard hint rendering** — shortcut keys are displayed next to every interactive element in the UI itself, not in a bottom strip. This is considered "discoverable without being intrusive" by practitioners.

Key categories:

| Category | Keys | Pattern |
|----------|------|---------|
| Panel toggle | `1`–`4`, `5`–`0` | Digit keys show/hide panels |
| Preset cycle | `p` / `P` | Forward / backward |
| List navigation | `↑↓` / `j k` | Arrow + vim aliases |
| List sort | `←→` | Cycle sort columns |
| Filter | `f` / `/` | Both activate inline search |
| Actions | `K` kill, `Enter` expand | Mnemonic letters |
| Update speed | `+` / `-` | Increments of 100ms |
| Overlays | `h`/`F1` help, `o`/`F2` options | Alt shortcut pairs |
| Quit | `q` / `Ctrl-C` | Both always work |

### Mouse Unification Pattern

Mouse hit-testing uses a flat `unordered_map<string, {line,col,h,w}>` where the key is the **same string as the keyboard shortcut**. A mouse click resolves to a key string, then goes through the identical `process(key)` dispatch path. This means every interactive element is automatically keyboard+mouse-accessible at zero additional cost.

**lazymem takeaway**: Register mouse regions by shortcut name during draw. Current PromptOverlay and keybindings should all be unifiable through a single dispatch.

### Help System

`h` or `F1` opens a centered modal overlay listing all shortcuts. The overlay dims the background by applying `Fx::uncolor()` to the main output and overlaying the help content. The help content is **static** — it does not dynamically reflect which panels are currently shown.

---

## 7. Process List / Action UX

This is btop's most mature subsystem and is directly analogous to lazymem's memory management feature.

### Interaction Model

```
List view (default)
   ↓ f / /
Filter mode (inline TextEdit, live preview)
   ↓ Enter       ↓ Esc
Filtered list   Cancelled (restore old filter)
   ↓ Enter on row
Detailed expand (per-process pane)
   ↓ K (from list)
Signal picker menu (named signals, not numbers)
   ↓ Enter
Confirm dialog → action executed
```

Key design choices:
- **Filter is non-modal**: the list remains visible and updates live behind the filter input
- **Signal picker shows names** (`SIGTERM`, `SIGKILL`, `SIGSTOP`) not numbers — practitioners cite this as markedly better than htop
- **Confirmation step before destructive actions** — hard-coded, not bypassable
- **Tree view is inline toggle** (`e`), not a separate mode — the list reformats in place

### Filter Implementation

`Draw::TextEdit` (`btop_draw.hpp:68`):
- Tracks both byte position and Unicode character position for multibyte safety
- `operator()(limit)` renders the field truncated to `limit` chars
- Committed to config on Enter; cancelled with Esc (restores previous value)

Filter matching (`btop_shared.cpp:175`):
- Prefix `!` → POSIX extended regex against name + cmd + user + pid
- Otherwise → case-insensitive substring across all four fields

**lazymem takeaway for memory management**: Model the memory action flow after btop's process interaction:
1. Show memory entries as a list (file name, type, age, summary preview)
2. `f` = filter/search across all memory content
3. `Enter` = expand selected entry (show full content)
4. `d` = delete (with confirmation dialog)
5. `e` = edit (opens inline or modal editor)
6. `n` = new memory entry
7. Named action menu rather than raw commands

---

## 8. Status Bar Conventions

btop embeds status inline in panel borders (top title + bottom subtitle) rather than a dedicated global status bar. The CPU box title doubles as the clock. Key info that btop surfaces persistently:

- Update interval (shown in CPU title: `cpu 1.0s`)
- Network interface name (Net box title)
- Sort column and direction (Proc box title)
- Filter string (Proc box subtitle when active)

The only global "status" is the title bar of each box — there is no separate bottom strip.

**lazymem has a `StatusBar` component** — this is fine for global signals (total instances, anomaly count, spinner). Consider also embedding per-panel status into panel titles (e.g., `agents 3x 412M ↑` showing count + mem + trend arrow).

---

## 9. Key Takeaways for lazymem IA & UX

### Information Architecture

1. **Elevate anomalies and active agents** to the top-full-width slot (btop's CPU position) — highest volatility, most actionable
2. **Session breakdown** takes the left-mid panel (btop's Memory position) — detailed but secondary
3. **Dev processes and Docker** share the lower half (btop's Net+Disk position)
4. **Memory management (CLAUDE.md + project memories)** should be a dedicated panel, toggleable with a digit key, not buried in a panel

### UI Patterns to Adopt

5. **Inline key hints**: render `[f]ilter [n]ew [d]elete [enter] expand` directly in panel borders
6. **Number key panel toggles**: `1`–`4` to show/hide panels (lazymem currently uses Tab cycling only)
7. **Braille sparklines**: add history graphs to session bars — current value + recent trend inline
8. **Semantic theme slots**: centralize all colors into a theme object with role-based names
9. **Mouse region unification**: one dispatch function for keyboard and mouse clicks
10. **Confirmation dialogs for destructive actions**: styled like btop's `msgBox` overlay

### Performance

11. **Avoid blocking the render loop on data collection** — btop's biggest flaw is keyboard latency caused by the Runner thread blocking on `collect()` calls. OpenTUI's reactive model helps, but keep data fetches async with stale-data fallback.
12. **Pre-compute gradients** — all memory bar colors should be ANSI strings precomputed from a gradient array, not computed per-render

---

## Sources

- [GitHub - aristocratos/btop](https://github.com/aristocratos/btop) — source code, README, themes/
- [Here's why btop++ became my favorite Linux terminal resource monitor — HowToGeek](https://www.howtogeek.com/heres-why-btop-became-my-favorite-linux-terminal-resource-monitor/)
- [btop — the top of my dreams — Both.org](https://www.both.org/?p=9668)
- [A Guide to Linux System Monitoring: top, htop, btop, glances — machaddr.substack.com](https://machaddr.substack.com/p/a-guide-to-linux-system-monitoring)
- [Btop variants, glances, why should I move from htop? — HN](https://news.ycombinator.com/item?id=43477810)
- [Btop++: Resource monitor for processor, memory, disks, network and processes — HN](https://news.ycombinator.com/item?id=36467236)
- [btop layout discussion — GitHub Discussions #207](https://github.com/aristocratos/btop/discussions/207)
- [catppuccin/btop — Theme ecosystem reference](https://github.com/catppuccin/btop)
- Code exploration: `/tmp/scout-RAN1hr/btop/src/btop_draw.cpp`, `btop_input.cpp`, `btop_theme.cpp`, `btop_config.cpp`
