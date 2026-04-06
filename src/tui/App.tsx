import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import { collectAll } from "../core/index";
import type { AuditData } from "../core/index";
import { SystemPanel } from "./components/SystemPanel";
import { AgentPanel } from "./components/AgentPanel";
import { DockerPanel } from "./components/DockerPanel";
import { DevPanel } from "./components/DevPanel";
import { StatusBar } from "./components/StatusBar";
import { HelpOverlay } from "./components/HelpOverlay";
import { FullscreenPane } from "./components/FullscreenPane";
import { usePaneState } from "./hooks/useViewMode";
import { useKeybindings } from "./hooks/useKeybindings";

export function App() {
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  const width  = () => dims().width;
  const height = () => dims().height;

  const [data, setData]         = createSignal<AuditData | null>(null);
  const [loading, setLoading]   = createSignal(true);
  const [showHelp, setShowHelp] = createSignal(false);

  const {
    focus, setFocus, cycleFocus,
    fullscreen, toggleFullscreen, exitFullscreen,
    selectedIndex, navigateDown, navigateUp,
  } = usePaneState();

  async function refresh() {
    setLoading(true);
    try { setData(await collectAll()); } catch {}
    setLoading(false);
  }

  let timer: ReturnType<typeof setInterval>;
  onMount(async () => { await refresh(); timer = setInterval(refresh, 10_000); });
  onCleanup(() => clearInterval(timer));

  function focusedPanelSize(): number {
    const d = data();
    if (!d) return 0;
    switch (focus()) {
      case "sys":    return d.topProcs.length;
      case "agents": return d.sessions.length;
      case "dev":    return d.processes.filter(p => p.tty === "??" && p.mem > 20).length;
      case "docker": return d.docker.containers.length;
    }
  }

  useKeybindings({
    enabled:          () => !showHelp(),
    refresh,
    toggleHelp:       () => setShowHelp(v => !v),
    quit:             () => renderer.destroy(),
    cycleFocus,
    setFocus,
    navigateDown:     () => navigateDown(focusedPanelSize()),
    navigateUp,
    toggleFullscreen,
    exitFullscreen,
    fullscreenActive: () => fullscreen() !== null,
  });

  // Layout tiers
  const narrow = () => width() < 100;   // single column
  const wide   = () => width() >= 120;  // three columns; between = two columns

  // Focus-aware flexGrow for each top-level column
  // Focused column gets +1 to gently expand without squishing others too much
  const sysGrow    = () => focus() === "sys"    ? 3 : 2;
  const agentsGrow = () => focus() === "agents" ? 4 : 3;
  const rightGrow  = () => (focus() === "dev" || focus() === "docker") ? 4 : 3;

  // Within the right column (dev + docker stacked)
  const devGrow    = () => focus() === "docker" ? 1 : 2;
  const dockerGrow = () => focus() === "docker" ? 2 : 1;

  // Compute inner panel content width.
  // flex columns render at approximately equal widths in practice (title min-sizes dominate),
  // so we use floor(totalWidth / numCols) - 4 (border(2) + paddingX(2)).
  const panelContentW = () => {
    if (narrow()) return Math.max(20, width() - 4);
    if (wide())   return Math.max(20, Math.floor(width() / 3) - 4);
    return Math.max(20, Math.floor(width() / 2) - 4); // medium: 2 columns
  };

  const anomalies = () => data()?.anomalies ?? [];

  return (
    <box flexDirection="column" width={width()} height={height()}>

      {/* ── Help overlay ───────────────────────────────────── */}
      <Show when={showHelp()}>
        <HelpOverlay onClose={() => setShowHelp(false)} />
      </Show>

      {/* ── Main dashboard ─────────────────────────────────── */}
      <Show when={!showHelp()}>
        <Show
          when={!narrow()}
          fallback={
            /* Narrow: single column */
            <box flexDirection="column" flexGrow={1}>
              <SystemPanel data={data()} focused={focus() === "sys"}    panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} flexGrow={focus() === "sys" ? 4 : 2} />
              <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} flexGrow={focus() === "agents" ? 4 : 2} />
              <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} flexGrow={focus() === "dev" ? 3 : 1} />
              <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} flexGrow={focus() === "docker" ? 3 : 1} />
            </box>
          }
        >
          <Show
            when={wide()}
            fallback={
              /* Medium (100-119): two columns — sys | agents+dev+docker */
              <box flexDirection="row" flexGrow={1}>
                <SystemPanel data={data()} focused={focus() === "sys"} panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} flexGrow={sysGrow()} />
                <box flexDirection="column" flexGrow={agentsGrow() + rightGrow()}>
                  <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} flexGrow={agentsGrow()} />
                  <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} flexGrow={devGrow()} />
                  <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} flexGrow={dockerGrow()} />
                </box>
              </box>
            }
          >
            {/* Wide (≥120): three columns — sys | agents | dev+docker */}
            <box flexDirection="row" flexGrow={1}>
              <SystemPanel data={data()} focused={focus() === "sys"} panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} flexGrow={sysGrow()} />
              <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} flexGrow={agentsGrow()} />
              <box flexDirection="column" flexGrow={rightGrow()}>
                <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} flexGrow={devGrow()} />
                <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} flexGrow={dockerGrow()} />
              </box>
            </box>
          </Show>
        </Show>

        <StatusBar
          loading={loading()}
          instances={data()?.totalInstances ?? 0}
          totalMem={data()?.totalClaudeMem ?? 0}
          anomalies={anomalies().length}
          focus={focus()}
        />

        {/* ── Fullscreen overlay ─────────────────────────────── */}
        <Show when={fullscreen() !== null}>
          <FullscreenPane
            pane={fullscreen()!}
            data={data()}
            anomalies={anomalies()}
            selectedIndex={selectedIndex()}
          />
        </Show>
      </Show>
    </box>
  );
}
