import { For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { AuditData, Anomaly } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";

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

function parseMem(s: string): number {
  const n = parseFloat(s);
  if (s.endsWith("G") || s.toLowerCase().includes("gb") || s.toLowerCase().includes("gib")) return n * 1024;
  return n;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function ramColor(pct: number): string {
  if (pct > 0.90) return "#f85149";
  if (pct > 0.75) return "#d29922";
  return "#3fb950";
}

function procColor(mb: number): string {
  if (mb > 2000) return "#f85149";
  if (mb > 800)  return "#d29922";
  if (mb > 200)  return "#c9d1d9";
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
  // RAM row: label(6)+pct(6)+bar+sp(2)+used/total(11) = 25+bar → bar = panelW-25
  const memBarW  = () => Math.max(6, panelW() - 25);
  // Proc row: name(13)+bar+mem(5) = 18+bar → bar = panelW-18
  const procBarW = () => Math.max(4, panelW() - 18);

  const usedMB   = () => parseMem(props.data?.system.used  ?? "0");
  const wiredMB  = () => parseMem(props.data?.system.wired ?? "0");
  const compMB   = () => parseMem(props.data?.system.compressor ?? "0");
  const freeMB   = () => parseMem(props.data?.system.free  ?? "0");
  const totalMB  = () => Math.max(usedMB() + freeMB(), 1);
  const usedPct  = () => usedMB() / totalMB();
  const wiredPct = () => wiredMB() / totalMB();
  const compPct  = () => compMB() / totalMB();

  const swapUsedMB  = () => parseMem(props.data?.system.swap?.used  ?? "0");
  const swapFreeMB  = () => parseMem(props.data?.system.swap?.free  ?? "0");
  const swapTotalMB = () => swapUsedMB() + swapFreeMB();
  const swapPct     = () => swapTotalMB() > 0 ? swapUsedMB() / swapTotalMB() : 0;
  const hasSwap     = () => swapTotalMB() > 0;

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
    ? ` [1] sys  ${props.data.system.used} · ${ramPctStr()} `
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
        <box flexDirection="column" marginTop={1}>
          {/* RAM row — always visible */}
          <box flexDirection="row" height={1}>
            <text fg={titleColor()}>{"RAM ".padEnd(6)}</text>
            <text fg={ramColor(usedPct())}>{ramPctStr().padStart(4)}  </text>
            <AnimatedBar pct={usedPct()} width={memBarW()} fg={ramColor(usedPct())} emptyFg="#21262d" />
            <text fg="#8b949e">  {fmtMB(usedMB())}/{fmtMB(totalMB())}</text>
          </box>
          {/* Breakdown rows — magnified only */}
          <Show when={props.expanded}>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"wired".padEnd(6)}</text>
              <text fg="#8b949e">{"".padStart(6)}</text>
              <AnimatedBar pct={wiredPct()} width={memBarW()} fg="#4d5566" emptyFg="#21262d" />
              <text fg="#4d5566">  {props.data!.system.wired}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"comp".padEnd(6)}</text>
              <text fg="#8b949e">{"".padStart(6)}</text>
              <AnimatedBar pct={compPct()} width={memBarW()} fg="#4d5566" emptyFg="#21262d" />
              <text fg="#4d5566">  {props.data!.system.compressor}</text>
            </box>
            <Show when={hasSwap()}>
              <box flexDirection="row" height={1}>
                <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>{"swap".padEnd(6)}</text>
                <text fg="#8b949e">{"".padStart(6)}</text>
                <AnimatedBar pct={swapPct()} width={memBarW()} fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"} emptyFg="#21262d" />
                <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>  {props.data!.system.swap!.used}/{props.data!.system.swap!.total}</text>
              </box>
            </Show>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"free".padEnd(6)}</text>
              <text fg="#8b949e">{"".padStart(6)}</text>
              <AnimatedBar pct={1 - usedPct()} width={memBarW()} fg="#2d333b" emptyFg="#21262d" />
              <text fg="#4d5566">  {props.data!.system.free}</text>
            </box>
          </Show>
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
              const color = procColor(proc.memMB);
              const marker = () => selected() ? "▸ " : "  ";
              const args = () => procInfoMap().get(proc.pid) ?? "";
              return (
                <box flexDirection="column">
                  <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                    <text fg={selected() ? "#c9d1d9" : color}>{marker() + proc.cmd.slice(0, 11).padEnd(11)}</text>
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
