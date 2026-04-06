import { For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { AuditData, Anomaly } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";
import { SegmentedBar } from "./SegmentedBar";

interface Props {
  data: AuditData | null;
  focused: boolean;
  expanded?: boolean;
  panelWidth?: number;
  flexGrow?: number;
  anomalies?: Anomaly[];
  selectedIndex?: number;
  expandedIndex?: number;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function ramColor(pct: number): string {
  if (pct > 0.90) return "#f85149";
  if (pct > 0.75) return "#d29922";
  return "#3fb950";
}

function procColor(mb: number, totalMB: number): string {
  const pct = mb / Math.max(totalMB, 1);
  if (pct > 0.025) return "#f85149";  // >2.5% of total RAM
  if (pct > 0.010) return "#d29922";  // >1.0%
  if (pct > 0.003) return "#c9d1d9";  // >0.3%
  return "#8b949e";
}

// Invisible scrollbar: thumb and track both match background
const SCROLL_STYLE = {
  scrollbarOptions: {
    showArrows: false,
    trackOptions: { foregroundColor: "#0d1117", backgroundColor: "#0d1117" },
  },
};

export function SystemPanel(props: Props) {
  const FOCUS_COLOR = "#58a6ff";
  const borderColor = () => props.focused ? FOCUS_COLOR : "#444c56";
  const titleColor  = () => props.focused ? FOCUS_COLOR : "#6e7681";

  const dims = useTerminalDimensions();
  // 3 equal columns: W/3 - border(1) - paddingX(1) - paddingX(1)
  const panelW   = () => props.expanded
    ? Math.max(40, dims().width - 4)
    : props.panelWidth != null
      ? props.panelWidth
      : Math.max(20, Math.floor(dims().width / 3) - 4);
  // Memory section columns (expanded: fixed bar so values align; minified: fill)
  //   label(8) + gap(5) + bar + value(13)  → bar = panelW - 26, capped at 60
  const memBarW  = () => props.expanded
    ? Math.min(60, Math.max(8, panelW() - 26))
    : Math.max(6, panelW() - 25);
  // Proc section: name column wider in expanded, bar fills remaining space
  const procNameW = () => props.expanded ? Math.min(20, Math.max(14, panelW() - 30)) : 11;
  const procBarW  = () => Math.max(4, panelW() - procNameW() - 9);

  const sys       = () => props.data?.system;
  const totalMB   = () => Math.max(sys()?.totalMB ?? 1, 1);
  const usedMB    = () => sys()?.usedMB  ?? 0;
  const wiredMB   = () => sys()?.wiredMB ?? 0;
  const compMB    = () => sys()?.compMB  ?? 0;
  const cachedMB  = () => sys()?.cachedMB ?? 0;
  const freeMB    = () => sys()?.freeMB  ?? 0;
  const appMB     = () => sys()?.appMB   ?? 0;

  const usedPct   = () => usedMB()   / totalMB();
  const wiredPct  = () => wiredMB()  / totalMB();
  const compPct   = () => compMB()   / totalMB();
  const cachedPct = () => cachedMB() / totalMB();
  const appPct    = () => appMB()    / totalMB();

  // Segmented RAM bar: app+wired (green) | comp (amber) | cached (dark)
  const ramSegments = () => [
    { pct: (appMB() + wiredMB()) / totalMB(), fg: ramColor(usedPct()) },
    { pct: compMB()   / totalMB(), fg: "#d29922" },
    { pct: cachedMB() / totalMB(), fg: "#30363d" },
  ];

  // Parse raw sysctl swap string (e.g. "4528.25M", "6.00G") → MB
  const parseSwapMB = (s: string): number => {
    const n = parseFloat(s); if (isNaN(n)) return 0;
    return s.toUpperCase().includes("G") ? n * 1024 : n;
  };
  const swapUsedMB2 = () => parseSwapMB(sys()?.swap?.used  ?? "");
  const swapTotMB2  = () => parseSwapMB(sys()?.swap?.total ?? "");
  const swapPct     = () => swapTotMB2() > 0 ? swapUsedMB2() / swapTotMB2() : 0;
  const hasSwap     = () => swapTotMB2() > 0;
  const swapValStr  = () => `${fmtMB(swapUsedMB2())}/${fmtMB(swapTotMB2())}`;

  // Right-aligned value column for memory rows in expanded mode (13 chars)
  const memVal = (s: string) => props.expanded ? s.padStart(13) : "  " + s;

  const allProcs   = () => [...(props.data?.topProcs ?? [])]
    .filter(p => p.cmd.trim().length > 0)
    .sort((a, b) => b.memMB - a.memMB);
  const maxProcMem = () => Math.max(...allProcs().map(p => p.memMB), 1);

  const procInfoMap = () => {
    const m = new Map<string, string>();
    for (const p of (props.data?.processes ?? [])) m.set(p.pid, p.args);
    return m;
  };

  const ramPctStr  = () => `${(usedPct() * 100).toFixed(0)}%`;
  const panelTitle = () => props.data
    ? ` [1] sys  ${fmtMB(usedMB())}/${fmtMB(totalMB())} · ${ramPctStr()} `
    : " [1] sys ";

  const alerts = () => props.anomalies ?? [];

  return (
    <box
      flexGrow={props.flexGrow ?? 1}
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
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#4d5566">collecting...</text>
          </box>
        }
      >
        {/* ── Memory breakdown ────────────────────────── */}
        {/* @opentui/solid drops the last child of any container (getNextSibling bug).
            Workaround: use <Show> to completely hide breakdown rows when not expanded (avoids
            the height=0 artifact where the last-before-sentinel row still renders its content).
            Each level ends with a text-node sentinel (non-box nodes aren't pruned by the layout
            engine's zero-height optimization, so they reliably absorb the drop). */}
        <box flexDirection="column" marginTop={1}>
          {/* RAM row — always visible */}
          <box flexDirection="row" height={1}>
            <text fg={titleColor()}>{"RAM".padEnd(8)}</text>
            <text fg={ramColor(usedPct())}>{ramPctStr().padStart(4) + " "}</text>
            <SegmentedBar segments={ramSegments()} width={memBarW()} emptyFg="#21262d" />
            <text fg="#8b949e">{memVal(fmtMB(usedMB()) + "/" + fmtMB(totalMB()))}</text>
          </box>
          {/* Breakdown rows — expanded only.
              All 6 rows are static BaseRenderables in a single column.
              Swap uses reactive height prop (no SlotRenderable injected as sibling).
              Text-node sentinel at end: text nodes survive the layout engine's pruning,
              ensuring the preceding sibling (swap) is not the effective "last" child.
              Accepts 1 blank sentinel line after the breakdown rows. */}
          <Show when={props.expanded}>
            <box flexDirection="column">
              <box flexDirection="row" height={1}>
                <text fg="#4d5566">{"  app".padEnd(8)}</text><text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={appPct()} width={memBarW()} fg="#58a6ff" emptyFg="#21262d" />
                <text fg="#4d5566">{memVal(fmtMB(appMB()))}</text>
              </box>
              <box flexDirection="row" height={1}>
                <text fg="#4d5566">{"  wired".padEnd(8)}</text><text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={wiredPct()} width={memBarW()} fg="#4d5566" emptyFg="#21262d" />
                <text fg="#4d5566">{memVal(fmtMB(wiredMB()))}</text>
              </box>
              <box flexDirection="row" height={1}>
                <text fg="#d29922">{"  comp".padEnd(8)}</text><text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={compPct()} width={memBarW()} fg="#d29922" emptyFg="#21262d" />
                <text fg="#d29922">{memVal(fmtMB(compMB()))}</text>
              </box>
              <box flexDirection="row" height={1}>
                <text fg="#4d5566">{"  cached".padEnd(8)}</text><text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={cachedPct()} width={memBarW()} fg="#30363d" emptyFg="#21262d" />
                <text fg="#4d5566">{memVal(fmtMB(cachedMB()))}</text>
              </box>
              <box flexDirection="row" height={1}>
                <text fg="#4d5566">{"  free".padEnd(8)}</text><text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={freeMB() / totalMB()} width={memBarW()} fg="#2d333b" emptyFg="#21262d" />
                <text fg="#4d5566">{memVal(fmtMB(freeMB()))}</text>
              </box>
              <box flexDirection="row" height={hasSwap() ? 1 : 0}>
                <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>{"  swap".padEnd(8)}</text>
                <text fg="#4d5566">{"     "}</text>
                <AnimatedBar pct={swapPct()} width={memBarW()} fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"} emptyFg="#21262d" />
                <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>{memVal(swapValStr())}</text>
              </box>
              <text fg="#0d1117">{" "}</text>{/* text-node sentinel: prevents last BaseRenderable (swap) from being dropped */}
            </box>
            <box height={0} />{/* Show sentinel */}
          </Show>
          <box height={0} />{/* outer box sentinel */}
        </box>

        {/* Divider */}
        <box marginTop={1}>
          <text fg="#21262d">{"─".repeat(Math.max(10, panelW()))}</text>
        </box>

        {/* ── Processes table ─────────────────────────── */}
        <box flexDirection="row" marginTop={1} marginBottom={1}>
          <text fg={titleColor()}>procs  </text>
          <text fg="#4d5566">{allProcs().length}</text>
        </box>

        <scrollbox flexGrow={1} focused={props.focused} style={SCROLL_STYLE}>
          <For each={allProcs()}>
            {(proc, idx) => {
              const selected = () => props.focused && idx() === (props.selectedIndex ?? 0);
              const isInlineExpanded = () => idx() === (props.expandedIndex ?? -1);
              const color = procColor(proc.memMB, totalMB());
              const nameW  = procNameW();
              const marker = () => selected() ? "▸ " : "  ";
              const args = () => procInfoMap().get(proc.pid) ?? "";
              return (
                <box flexDirection="column">
                  <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                    <text fg={selected() ? "#c9d1d9" : color}>{marker() + proc.cmd.slice(0, nameW).padEnd(nameW)}</text>
                    <AnimatedBar pct={proc.memMB / maxProcMem()} width={procBarW()} fg={selected() ? "#c9d1d9" : color} emptyFg="#21262d" />
                    <text fg={selected() ? "#c9d1d9" : color}>{fmtMB(proc.memMB).padStart(5)}</text>
                  </box>
                  <Show when={isInlineExpanded()}>
                    <box flexDirection="row" height={1}>
                      <text fg="#4d5566">{"  pid "}</text>
                      <text fg="#8b949e">{proc.pid.padEnd(8)}</text>
                      <text fg="#4d5566">{"raw "}</text>
                      <text fg={color}>{proc.mem}</text>
                    </box>
                    <Show when={args().length > 0}>
                      <box flexDirection="row" height={1}>
                        <text fg="#4d5566">{"  cmd "}</text>
                        <text fg="#6e7681">{args().slice(0, Math.max(10, panelW() - 8))}</text>
                      </box>
                    </Show>
                  </Show>
                </box>
              );
            }}
          </For>
        </scrollbox>

        {/* ── Alerts ──────────────────────────────────── */}
        <Show when={alerts().length > 0}>
          <box marginTop={1}>
            <text fg="#21262d">{"─".repeat(Math.max(10, panelW()))}</text>
          </box>
          <For each={alerts()}>
            {(a) => (
              <box flexDirection="row" height={1}>
                <text fg={a.severity === "error" ? "#f85149" : a.severity === "warning" ? "#d29922" : "#58a6ff"}>
                  {a.severity === "error" ? "!! " : a.severity === "warning" ? ">> " : "-- "}
                </text>
                <text fg={a.severity === "error" ? "#f85149" : a.severity === "warning" ? "#d29922" : "#8b949e"}>
                  {a.text.slice(0, Math.max(10, panelW() - 3))}
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>
    </box>
  );
}
