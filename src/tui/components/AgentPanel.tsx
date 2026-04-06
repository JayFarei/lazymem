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

const isSidecar = (args: string) =>
  args.includes("qmd mcp") || (args.includes("codex") && args.includes("mcp-server"));

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function memColor(pct: number, mb: number): string {
  if (pct > 0.75 || mb > 2500) return "#f85149";
  if (pct > 0.40 || mb > 800)  return "#d29922";
  return "#3fb950";
}

const SCROLL_STYLE = {
  scrollbarOptions: {
    showArrows: false,
    trackOptions: { foregroundColor: "#0d1117", backgroundColor: "#0d1117" },
  },
};

export function AgentPanel(props: Props) {
  const FOCUS_COLOR = "#3fb950";
  const borderColor = () => props.focused ? FOCUS_COLOR : "#444c56";

  const dims = useTerminalDimensions();
  // 3 equal columns: W/3 - border(1) - paddingX(1) - paddingX(1)
  const panelW = () => props.expanded
    ? Math.max(60, dims().width - 4)
    : props.panelWidth != null
      ? props.panelWidth
      : Math.max(24, Math.floor(dims().width / 3) - 4);
  // Magnified columns — scale with available width
  // layout: marker(2) + sessionW + projectW + n(5) + mem(8) + bar
  const sessionW  = () => Math.min(24, Math.max(11, 11 + Math.floor((panelW() - 50) / 2)));
  const projectW  = () => Math.min(20, Math.max(12, 12 + Math.floor((panelW() - 50) / 3)));
  const barWMag   = () => Math.min(props.expanded ? 50 : panelW(), Math.max(0, panelW() - (2 + sessionW() + projectW() + 13)));
  // Minified columns — name scales with panel, bar fills remainder
  // layout: miniNameW + " "(1) + bar + mem(6) → bar = panelW - miniNameW - 7
  const miniNameW = () => Math.min(20, Math.max(14, 14 + Math.floor((panelW() - 40) / 2)));
  const barWMini  = () => Math.max(0, panelW() - miniNameW() - 7);

  const sessions  = () => props.data?.sessions ?? [];
  const maxMem    = () => Math.max(...sessions().map(s => s.totalMem), 1);
  const totalInst = () => props.data?.totalInstances ?? 0;
  const totalMem  = () => props.data?.totalClaudeMem ?? 0;

  const codexProcs = () =>
    (props.data?.processes ?? []).filter(
      p => !isSidecar(p.args) && p.args.toLowerCase().includes("codex") && p.cmd !== "claude"
    );
  const codexMem = () => codexProcs().reduce((s, p) => s + p.mem, 0);
  const hasCodex = () => codexProcs().length > 0;

  const panelTitle = () => {
    if (!props.data) return " [2] agents ";
    const parts = [`[2] agents  ${totalInst()}x · ${fmtMB(totalMem())}`];
    if (hasCodex()) parts.push(`codex ${codexProcs().length}x`);
    return ` ${parts.join("  ")} `;
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
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#4d5566">collecting...</text>
          </box>
        }
      >
        <Show
          when={sessions().length > 0}
          fallback={
            <box flexGrow={1} justifyContent="center" alignItems="center">
              <text fg="#4d5566">no active sessions</text>
            </box>
          }
        >
          {/* ── Magnified (expanded/fullscreen) ──────────── */}
          <Show when={props.expanded}>
            <box flexDirection="row" marginTop={1} height={1}>
              <text fg="#4d5566">{"  session".padEnd(sessionW() + 2)}</text>
              <text fg="#4d5566">{"project".padEnd(projectW())}</text>
              <text fg="#4d5566">{"n".padStart(3)}  </text>
              <text fg="#4d5566">{"mem".padStart(6)}  </text>
              <Show when={barWMag() >= 4}>
                <text fg="#4d5566">usage</text>
              </Show>
            </box>

            <scrollbox flexGrow={1} focused={props.focused} style={SCROLL_STYLE}>
              <For each={sessions()}>
                {(s, idx) => {
                  const selected = () => idx() === (props.selectedIndex ?? 0);
                  const pct   = () => s.totalMem / maxMem();
                  const color = () => memColor(pct(), s.totalMem);
                  const sW    = sessionW();
                  const pW    = projectW();
                  return (
                    <box flexDirection="row" height={1} backgroundColor={selected() ? "#161b22" : undefined}>
                      <text fg={selected() ? "#e6edf3" : "#c9d1d9"}>
                        {(selected() ? "▸ " : "  ") + s.name.slice(0, sW - 1).padEnd(sW)}
                      </text>
                      <text fg="#8b949e">{s.project.slice(0, pW).padEnd(pW)}</text>
                      <text fg="#8b949e">{String(s.instances).padStart(3)}  </text>
                      <text fg={color()}>{fmtMB(s.totalMem).padStart(6)}  </text>
                      <Show when={barWMag() >= 4}>
                        <AnimatedBar pct={pct()} width={barWMag()} fg={color()} emptyFg="#21262d" />
                      </Show>
                    </box>
                  );
                }}
              </For>

              <Show when={hasCodex()}>
                <box flexDirection="row" height={1}>
                  <text fg="#8957e5">{"  codex".padEnd(sessionW() + 2)}</text>
                  <text fg="#4d5566">{"".padEnd(projectW())}</text>
                  <text fg="#8b949e">{String(codexProcs().length).padStart(3)}  </text>
                  <text fg="#8957e5">{fmtMB(codexMem()).padStart(6)}  </text>
                  <Show when={barWMag() >= 4}>
                    <AnimatedBar
                      pct={codexMem() / Math.max(maxMem(), codexMem())}
                      width={barWMag()}
                      fg="#8957e5"
                      emptyFg="#21262d"
                    />
                  </Show>
                </box>
              </Show>
            </scrollbox>
          </Show>

          {/* ── Minified (not expanded) ────────────────── */}
          <Show when={!props.expanded}>
            <box flexDirection="row" marginTop={1} height={1}>
              <text fg="#4d5566">{"  session".padEnd(miniNameW())}</text>
              <Show when={barWMini() >= 4}>
                <text fg="#4d5566">{" " + "usage".padEnd(barWMini())}</text>
              </Show>
              <text fg="#4d5566">{"mem".padStart(6)}</text>
            </box>

            <scrollbox flexGrow={1} focused={false} style={SCROLL_STYLE}>
              <For each={sessions()}>
                {(s, idx) => {
                  const pct   = () => s.totalMem / maxMem();
                  const color = () => memColor(pct(), s.totalMem);
                  const nW    = miniNameW();
                  const isInlineExpanded = () => idx() === (props.expandedIndex ?? -1);
                  return (
                    <box flexDirection="column">
                      <box flexDirection="row" height={1}>
                        <text fg="#c9d1d9">{"  " + s.name.slice(0, nW - 3).padEnd(nW - 2)}</text>
                        <Show when={barWMini() >= 4}>
                          <text fg="#30363d"> </text>
                          <AnimatedBar pct={pct()} width={barWMini()} fg={color()} emptyFg="#21262d" />
                        </Show>
                        <text fg={color()}>{fmtMB(s.totalMem).padStart(6)}</text>
                      </box>
                      <Show when={isInlineExpanded()}>
                        <box flexDirection="row" height={1}>
                          <text fg="#4d5566">{"    project  "}</text>
                          <text fg="#8b949e">{s.project.slice(0, Math.max(10, panelW() - 16))}</text>
                        </box>
                        <box flexDirection="row" height={1}>
                          <text fg="#4d5566">{"    instances "}</text>
                          <text fg="#8b949e">{String(s.instances)}</text>
                          <text fg="#4d5566">{"  sidecars "}</text>
                          <text fg="#4d5566">{String(s.sidecars)}</text>
                        </box>
                      </Show>
                    </box>
                  );
                }}
              </For>

              <Show when={hasCodex()}>
                <box flexDirection="row" height={1}>
                  <text fg="#8957e5">{"  codex".padEnd(miniNameW())}</text>
                  <Show when={barWMini() >= 4}>
                    <text fg="#30363d"> </text>
                    <AnimatedBar
                      pct={codexMem() / Math.max(maxMem(), codexMem())}
                      width={barWMini()}
                      fg="#8957e5"
                      emptyFg="#21262d"
                    />
                  </Show>
                  <text fg="#8957e5">{fmtMB(codexMem()).padStart(6)}</text>
                </box>
              </Show>
            </scrollbox>
          </Show>
        </Show>
      </Show>
    </box>
  );
}
