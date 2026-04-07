import { For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { AuditData } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";

interface Props {
  data: AuditData | null;
  focused: boolean;
  expanded?: boolean;
  panelWidth?: number;
  flexGrow?: number;
  selectedIndex?: number;
  expandedIndex?: number;
}

// Only qmd-mcp is hidden from DevPanel (pure infrastructure noise).
// codex-mcp-server is shown as its own service group so its memory is visible.
const isSidecar = (args: string) => args.includes("qmd mcp");

// Known dev tool types returned by classify(). Anything not in this set is a
// raw-cmd fallback (Obsidian, Chrome helpers, Spark, etc.) and should only be
// shown if the process is attached to a tmux pane — not as a background daemon.
const KNOWN_DEV_TYPES = new Set([
  "claude", "codex-mcp", "codex",
  "next", "vite", "tsx", "postcss", "pnpm",
  "tailwind-lsp", "ts-lsp",
  "python", "surf-cli", "qmd", "telegram", "nvim",
]);

function classify(cmd: string, args: string): string {
  // Agent harnesses — classified before dev-server heuristics
  if (cmd === "claude" || cmd.includes("claude"))                          return "claude";
  if (args.includes("codex") && args.includes("mcp-server"))               return "codex-mcp";
  if (args.toLowerCase().includes("codex"))                                 return "codex";
  if (args.includes("next"))                 return "next";
  if (args.includes("vite"))                 return "vite";
  if (args.includes("tailwindcss-language")) return "tailwind-lsp";
  if (args.includes("typescript-language"))  return "ts-lsp";
  if (args.includes("tsx"))                  return "tsx";
  if (args.includes("postcss"))              return "postcss";
  if (args.includes("pnpm"))                 return "pnpm";
  if (args.includes("python") || cmd.includes("python")) return "python";
  if (args.includes("surf-cli"))             return "surf-cli";
  if (args.includes("qmd") && args.includes("--http")) return "qmd";
  if (args.includes("telegram"))             return "telegram";
  if (cmd.includes("nvim") || args.includes("nvim")) return "nvim";
  return cmd.split("/").pop() ?? cmd;
}

function extractService(args: string): string {
  if (!args) return "";
  const nmIdx = args.indexOf("node_modules");
  const candidate = nmIdx > 0 ? args.slice(0, nmIdx) : args;
  for (const token of candidate.split(/\s+/).reverse()) {
    if (!token.startsWith("/")) continue;
    const parts = token.split("/").filter((p) => p && !p.startsWith(".") && p !== "node_modules");
    if (parts.length >= 2) return parts[parts.length - 1];
  }
  return "";
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function memColor(mb: number): string {
  if (mb > 1000) return "#f85149";
  if (mb > 400)  return "#d29922";
  return "#8b949e";
}

const SCROLL_STYLE = {
  scrollbarOptions: {
    showArrows: false,
    trackOptions: { foregroundColor: "#0d1117", backgroundColor: "#0d1117" },
  },
};

interface DevGroup {
  label: string;
  totalCount: number;
  totalMem: number;
  sessions: { service: string; count: number; mem: number }[];
}

type DevEntry =
  | { kind: "group"; label: string; count: number; totalMem: number }
  | { kind: "child"; service: string; count: number; mem: number; maxChildMem: number };

export function DevPanel(props: Props) {
  const FOCUS_COLOR = "#d29922";
  const borderColor = () => props.focused ? FOCUS_COLOR : "#444c56";

  const dims = useTerminalDimensions();
  // 3 equal columns: W/3 - border(1) - paddingX(1) - paddingX(1)
  const panelW = () => props.expanded
    ? Math.max(60, dims().width - 4)
    : props.panelWidth != null
      ? props.panelWidth
      : Math.max(24, Math.floor(dims().width / 3) - 4);
  // Service name column scales with available width in expanded mode
  const serviceW = () => Math.min(24, Math.max(14, 14 + Math.floor((panelW() - 50) / 3)));
  // Minified columns — label scales with panel, bar fills remainder
  // layout: miniLabelW + " "(1) + bar + " "(1) + mem(5) → bar = panelW - miniLabelW - 7
  const miniLabelW = () => Math.min(22, Math.max(15, 15 + Math.floor((panelW() - 40) / 2)));
  const barWMini   = () => Math.max(0, panelW() - miniLabelW() - 7);
  // Magnified child: "  "+service + bar + " "(1) + mem(5) = (2+serviceW+6)+bar
  const barWMag  = () => Math.min(props.expanded ? 50 : panelW(), Math.max(0, panelW() - (2 + serviceW() + 6)));

  const devGroups = (): DevGroup[] => {
    const ttyToSession = new Map<string, string>();
    const pathToSession = new Map<string, string>();
    for (const pane of (props.data?.tmux ?? [])) {
      ttyToSession.set(pane.tty.replace("/dev/", ""), pane.session);
      const folder = pane.path.split("/").filter(Boolean).pop() ?? "";
      if (folder) pathToSession.set(folder, pane.session);
    }
    const byLabel = new Map<string, Map<string, { count: number; mem: number }>>();
    for (const p of (props.data?.processes ?? [])) {
      if (isSidecar(p.args) || p.mem <= 20) continue;
      const inTmux  = ttyToSession.has(p.tty);
      const isBackground = p.tty === "??";
      if (!inTmux && !isBackground) continue;

      const type = classify(p.cmd, p.args);
      // Background processes with no tmux pane must be a recognized dev type.
      // Electron apps (Obsidian, Spark, Chrome helpers) also run with tty=??
      // and may match the node/claude filter — reject them via the raw-cmd fallback.
      if (isBackground && !inTmux && !KNOWN_DEV_TYPES.has(type)) continue;
      const folder = extractService(p.args);
      const svc  = ttyToSession.get(p.tty) ?? pathToSession.get(folder) ?? folder;
      if (!byLabel.has(type)) byLabel.set(type, new Map());
      const sm = byLabel.get(type)!;
      const s = sm.get(svc) ?? { count: 0, mem: 0 };
      s.count++;
      s.mem += p.mem;
      sm.set(svc, s);
    }
    return [...byLabel.entries()].map(([label, sm]) => {
      const sessions = [...sm.entries()]
        .map(([service, s]) => ({ service, ...s }))
        .sort((a, b) => b.mem - a.mem);
      return {
        label,
        totalCount: sessions.reduce((s, x) => s + x.count, 0),
        totalMem:   sessions.reduce((s, x) => s + x.mem,   0),
        sessions,
      };
    }).sort((a, b) => b.totalMem - a.totalMem).slice(0, 12);
  };

  const devEntries = (): DevEntry[] => {
    const groups = devGroups();
    if (!props.expanded) {
      // Minified: flat group rows only
      return groups.map(g => ({
        kind: "group" as const,
        label: g.label,
        count: g.totalCount,
        totalMem: g.totalMem,
      }));
    }
    // Magnified: interleave group headers and children
    const entries: DevEntry[] = [];
    for (const g of groups) {
      entries.push({ kind: "group", label: g.label, count: g.totalCount, totalMem: g.totalMem });
      const maxChildMem = Math.max(...g.sessions.map(s => s.mem), 1);
      for (const s of g.sessions) {
        entries.push({ kind: "child", service: s.service, count: s.count, mem: s.mem, maxChildMem });
      }
    }
    return entries;
  };

  const maxGroupMem  = () => Math.max(...devGroups().map(g => g.totalMem), 1);
  const totalMem     = () => devGroups().reduce((s, g) => s + g.totalMem, 0);
  const groupCount   = () => devGroups().length;

  const indexedDevEntries = () => {
    let gi = -1;
    return devEntries().map(entry => {
      if (entry.kind === "group") gi++;
      return { entry, groupIndex: gi };
    });
  };

  const panelTitle = () => {
    if (!props.data) return " [3] dev ";
    return groupCount() > 0 ? ` [3] dev  ${groupCount()} · ${fmtMB(totalMem())} ` : " [3] dev ";
  };

  return (
    <box
      flexGrow={props.flexGrow ?? 2}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor()}
      title={panelTitle()}
      titleAlignment="left"
      paddingX={1}
    >
      <Show
        when={props.data}
        fallback={
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg="#4d5566">collecting...</text>
          </box>
        }
      >
        <Show
          when={devGroups().length > 0}
          fallback={
            <box flexGrow={1} justifyContent="center" alignItems="center">
              <text fg="#4d5566">no background processes</text>
            </box>
          }
        >
          {/* Header row */}
          <Show when={props.expanded}>
            <box flexDirection="row" marginTop={1} height={1}>
              <text fg="#4d5566">{"  session".padEnd(serviceW() + 2)}</text>
              <Show when={barWMag() >= 4}>
                <text fg="#4d5566">{"usage".padEnd(barWMag() + 1)}</text>
              </Show>
              <text fg="#4d5566">{"mem".padStart(5)}</text>
            </box>
          </Show>
          <Show when={!props.expanded}>
            <box flexDirection="row" marginTop={1} height={1}>
              <text fg="#4d5566">{"  service".padEnd(miniLabelW())}</text>
              <Show when={barWMini() >= 4}>
                <text fg="#4d5566">{" " + "usage".padEnd(barWMini())}</text>
              </Show>
              <text fg="#4d5566">{"mem".padStart(6)}</text>
            </box>
          </Show>

          <scrollbox ref={(el: any) => { if (el?.verticalScrollBar) el.verticalScrollBar.visible = false; }} flexGrow={1} focused={props.focused} style={SCROLL_STYLE}>
            <For each={indexedDevEntries()}>
              {({ entry, groupIndex }) => {
                if (entry.kind === "group") {
                  const selected = () => props.focused && groupIndex === (props.selectedIndex ?? 0);
                  const color = () => memColor(entry.totalMem);
                  if (props.expanded) {
                    const rawLabel = entry.count > 1
                      ? `${entry.label} ×${entry.count}`
                      : entry.label;
                    const hdr = () => (selected() ? "▸ " : "  ") +
                      rawLabel.slice(0, panelW() - 7).padEnd(panelW() - 7);
                    return (
                      <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                        <text fg={selected() ? "#e6edf3" : "#c9d1d9"}>{hdr()}</text>
                        <text fg={color()}>{fmtMB(entry.totalMem).padStart(5)}</text>
                      </box>
                    );
                  }
                  const mLW = miniLabelW();
                  const rawLbl = entry.count > 1 ? `${entry.label} ×${entry.count}` : entry.label;
                  const isInlineExpanded = () => groupIndex === (props.expandedIndex ?? -1);
                  const lbl = () => selected()
                    ? ("▸ " + rawLbl.slice(0, mLW - 2)).padEnd(mLW)
                    : ("  " + rawLbl.slice(0, mLW - 2)).padEnd(mLW);
                  const sessions = () => devGroups()[groupIndex]?.sessions ?? [];
                  const maxSessionMem = () => Math.max(...sessions().map(s => s.mem), 1);
                  return (
                    <box flexDirection="column">
                      <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                        <text fg={selected() ? "#e6edf3" : "#c9d1d9"}>{lbl()}</text>
                        <Show when={barWMini() >= 4}>
                          <text fg="#30363d"> </text>
                          <AnimatedBar pct={entry.totalMem / maxGroupMem()} width={barWMini()} fg={color()} emptyFg="#21262d" />
                        </Show>
                        <text fg={color()}>{fmtMB(entry.totalMem).padStart(6)}</text>
                      </box>
                      <Show when={isInlineExpanded()}>
                        <For each={sessions()}>
                          {(s) => {
                            const sColor = memColor(s.mem);
                            const sW = mLW - 2;
                            const sLabel = (s.count > 1 ? `  ${s.service} ×${s.count}` : `  ${s.service}`).slice(0, sW).padEnd(sW);
                            return (
                              <box flexDirection="row" height={1}>
                                <text fg="#6e7681">{sLabel}</text>
                                <Show when={barWMini() >= 4}>
                                  <text fg="#21262d"> </text>
                                  <AnimatedBar pct={s.mem / maxSessionMem()} width={barWMini()} fg={sColor} emptyFg="#21262d" />
                                </Show>
                                <text fg={sColor}>{fmtMB(s.mem).padStart(6)}</text>
                              </box>
                            );
                          }}
                        </For>
                      </Show>
                    </box>
                  );
                }

                // Magnified child row: "  "+session(serviceW) + bar + " " + mem(5)
                const childColor = memColor(entry.mem);
                const sW = serviceW();
                const svcStr = (entry.count > 1
                  ? `  ${entry.service} ×${entry.count}`
                  : `  ${entry.service}`
                ).slice(0, sW + 2).padEnd(sW + 2);
                return (
                  <box flexDirection="row" height={1}>
                    <text fg="#8b949e">{svcStr}</text>
                    <Show when={barWMag() >= 4}>
                      <AnimatedBar pct={entry.mem / entry.maxChildMem} width={barWMag()} fg={childColor} emptyFg="#21262d" />
                      <text fg="#30363d"> </text>
                    </Show>
                    <text fg={childColor}>{fmtMB(entry.mem).padStart(5)}</text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </Show>
      </Show>
    </box>
  );
}
