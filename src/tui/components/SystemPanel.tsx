import { For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { AuditData, Anomaly, TopProc } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";
import { digitColor, DotMatrixRow } from "./DotMatrixBar";

interface ProcGroup {
  name: string;
  count: number;
  totalMB: number;
  procs: TopProc[];
}

interface Props {
  data: AuditData | null;
  focused: boolean;
  sectionMode?: "full" | "no-procs" | "procs-only";
  summaryMode?: "full" | "text";
  animateProcessBars?: boolean;
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


function procColor(mb: number, totalMB: number): string {
  const pct = mb / Math.max(totalMB, 1);
  if (pct > 0.025) return "#f85149";  // >2.5% of total RAM
  if (pct > 0.010) return "#d29922";  // >1.0%
  if (pct > 0.003) return "#c9d1d9";  // >0.3%
  return "#8b949e";
}

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
  // Dot-matrix: full-width on non-label rows, label row reserves space for "RAM " + value
  const ramValStr  = () => fmtMB(usedMB()) + "/" + fmtMB(totalMB());
  const ramValW    = () => ramValStr().length + 2; // 2 for "  " prefix
  const dotFullW   = () => panelW();              // non-label rows: edge to edge
  const dotLabelW  = () => Math.max(4, panelW() - 4 - ramValW()); // label row: "RAM " + bar + value
  // Shared right-aligned value column width: fits the widest value (swap ratio)
  const valW = () => {
    const swapStr = swapValStr();
    return Math.max(7, swapStr.length + 1);
  };
  // Memory breakdown bar: label(8) + bar + value(valW) = panelW
  const memBarW  = () => Math.max(4, panelW() - 8 - valW());
  // Proc section: name column scales with panel width, bar fills remaining space
  const procNameW = () => props.expanded
    ? Math.min(24, Math.max(14, panelW() - 30))
    : Math.min(18, Math.max(12, 12 + Math.floor((panelW() - 30) / 2)));
  // name(2+procNameW) + gap(1) + bar + value(valW)
  const procBarW  = () => Math.max(4, panelW() - procNameW() - 3 - valW());

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

  // Right-aligned value column for memory breakdown and procs
  const memVal = (s: string) => s.padStart(valW());

  // Exclude PIDs already shown in agents/dev panels and docker VM
  const coveredPids = () => {
    const pids = new Set<string>();
    for (const p of (props.data?.processes ?? [])) pids.add(p.pid);
    return pids;
  };
  const filteredProcs = () => [...(props.data?.topProcs ?? [])]
    .filter(p => p.cmd.trim().length > 0)
    .filter(p => !coveredPids().has(p.pid))
    .filter(p => !p.args.includes("com.apple.Virtu"))
    .filter(p => !p.args.includes(".agent-browser/"))
    .sort((a, b) => b.memMB - a.memMB);

  // Group by process name, sorted by total memory
  const procGroups = (): ProcGroup[] => {
    const byName = new Map<string, TopProc[]>();
    for (const p of filteredProcs()) {
      const list = byName.get(p.cmd) ?? [];
      list.push(p);
      byName.set(p.cmd, list);
    }
    return [...byName.entries()]
      .map(([name, procs]) => ({
        name,
        count: procs.length,
        totalMB: procs.reduce((s, p) => s + p.memMB, 0),
        procs,
      }))
      .sort((a, b) => b.totalMB - a.totalMB);
  };
  const maxGroupMem = () => Math.max(...procGroups().map(g => g.totalMB), 1);
  const totalProcCount = () => filteredProcs().length;

  const ramPctStr  = () => `${(usedPct() * 100).toFixed(0)}%`;
  const panelTitle = () => props.data
    ? ` [1] sys  ${fmtMB(usedMB())}/${fmtMB(totalMB())} · ${ramPctStr()} `
    : " [1] sys ";

  const alerts = () => props.anomalies ?? [];
  const showSummary = () => props.sectionMode !== "procs-only";
  const showProcesses = () => props.sectionMode !== "no-procs";
  const showAlerts = () => props.sectionMode === "full" || props.sectionMode === "no-procs";
  const textSummary = () => props.summaryMode === "text";

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
        <Show when={showSummary()}>
          <Show
            when={textSummary()}
            fallback={
              <box flexDirection="column">
                {/* ── RAM — 7-row dot-matrix percentage display (5×7 font) ── */}
                {/* Non-label rows go edge-to-edge. Label row (3) wraps "RAM" and value. */}
                <box flexDirection="row" height={1} marginTop={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={0} width={dotFullW()} pct={usedPct()} />
                </box>
                <box flexDirection="row" height={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={1} width={dotFullW()} pct={usedPct()} />
                </box>
                <box flexDirection="row" height={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={2} width={dotFullW()} pct={usedPct()} />
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={titleColor()}>{"RAM "}</text>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={3} width={dotLabelW()} pct={usedPct()} leftMargin={4} refWidth={dotFullW()} />
                  <text fg="#8b949e">{"  " + ramValStr()}</text>
                </box>
                <box flexDirection="row" height={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={4} width={dotFullW()} pct={usedPct()} />
                </box>
                <box flexDirection="row" height={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={5} width={dotFullW()} pct={usedPct()} />
                </box>
                <box flexDirection="row" height={1}>
                  <DotMatrixRow label={Math.round(usedPct() * 100).toString()} row={6} width={dotFullW()} pct={usedPct()} />
                </box>
              </box>
            }
          >
            <box flexDirection="row" height={1} marginTop={1}>
              <text fg={titleColor()}>RAM </text>
              <text fg="#8b949e">{ramValStr()}</text>
              <text fg="#4d5566">{"  "}</text>
              <text fg={digitColor(usedPct())}>{ramPctStr()}</text>
            </box>
          </Show>

          {/* ── Memory breakdown (expanded) ────────────── */}
          <Show when={props.expanded}>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"  app".padEnd(8)}</text>
              <AnimatedBar pct={appPct()} width={memBarW()} fg="#58a6ff" emptyFg="#21262d" />
              <text fg="#4d5566">{memVal(fmtMB(appMB()))}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"  wired".padEnd(8)}</text>
              <AnimatedBar pct={wiredPct()} width={memBarW()} fg="#4d5566" emptyFg="#21262d" />
              <text fg="#4d5566">{memVal(fmtMB(wiredMB()))}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg="#d29922">{"  comp".padEnd(8)}</text>
              <AnimatedBar pct={compPct()} width={memBarW()} fg="#d29922" emptyFg="#21262d" />
              <text fg="#d29922">{memVal(fmtMB(compMB()))}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"  cached".padEnd(8)}</text>
              <AnimatedBar pct={cachedPct()} width={memBarW()} fg="#30363d" emptyFg="#21262d" />
              <text fg="#4d5566">{memVal(fmtMB(cachedMB()))}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg="#4d5566">{"  free".padEnd(8)}</text>
              <AnimatedBar pct={freeMB() / totalMB()} width={memBarW()} fg="#2d333b" emptyFg="#21262d" />
              <text fg="#4d5566">{memVal(fmtMB(freeMB()))}</text>
            </box>
            <box flexDirection="row" height={hasSwap() ? 1 : 0}>
              <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>{"  swap".padEnd(8)}</text>
              <AnimatedBar pct={swapPct()} width={memBarW()} fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"} emptyFg="#21262d" />
              <text fg={swapPct() > 0.5 ? "#d29922" : "#4d5566"}>{memVal(swapValStr())}</text>
            </box>
          </Show>
        </Show>

        <Show when={showSummary() && showProcesses()}>
          <box marginTop={1}>
            <text fg="#21262d">{"─".repeat(Math.max(10, panelW()))}</text>
          </box>
        </Show>

        <Show when={showProcesses()}>
          {/* ── Processes table ─────────────────────────── */}
          <box flexDirection="row" marginTop={1} marginBottom={1}>
            <text fg={titleColor()}>procs  </text>
            <text fg="#4d5566">{totalProcCount()}</text>
          </box>
          <box flexDirection="row" height={1} marginBottom={0}>
            <text fg="#4d5566">{"  " + "name".padEnd(procNameW())}</text>
            <text fg="#4d5566">{" " + "usage".padEnd(procBarW())}</text>
            <text fg="#4d5566">{"mem".padStart(valW())}</text>
          </box>

          <scrollbox
            ref={(el: any) => { if (el?.verticalScrollBar) el.verticalScrollBar.visible = false; }}
            flexGrow={1} focused={props.focused} style={SCROLL_STYLE}
          >
            <For each={procGroups()}>
              {(group, idx) => {
                const selected = () => props.focused && idx() === (props.selectedIndex ?? 0);
                const isInlineExpanded = () => idx() === (props.expandedIndex ?? -1);
                const color = procColor(group.totalMB, totalMB());
                const nameW  = procNameW();
                const marker = () => selected() ? "▸ " : "  ";
                const rawLabel = group.count > 1 ? `${group.name} ×${group.count}` : group.name;
                return (
                  <box flexDirection="column">
                    <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                      <text fg={selected() ? "#c9d1d9" : color}>{marker() + rawLabel.slice(0, nameW).padEnd(nameW)}</text>
                      <text fg="#30363d">{" "}</text>
                      <AnimatedBar pct={group.totalMB / maxGroupMem()} width={procBarW()} fg={selected() ? "#c9d1d9" : color} emptyFg="#21262d" animate={props.animateProcessBars} />
                      <text fg={selected() ? "#c9d1d9" : color}>{memVal(fmtMB(group.totalMB))}</text>
                    </box>
                    <Show when={isInlineExpanded()}>
                      <For each={group.procs}>
                        {(proc) => {
                          const pColor = procColor(proc.memMB, totalMB());
                          return (
                            <box flexDirection="row" height={1}>
                              <text fg="#6e7681">{"    " + proc.pid.padEnd(8)}</text>
                              <text fg={pColor}>{fmtMB(proc.memMB).padStart(5)}</text>
                              <text fg="#4d5566">{"  "}</text>
                              <text fg="#6e7681">{proc.args.slice(0, Math.max(10, panelW() - 20))}</text>
                            </box>
                          );
                        }}
                      </For>
                    </Show>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </Show>

        {/* ── Alerts ──────────────────────────────────── */}
        <Show when={showAlerts() && alerts().length > 0}>
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
