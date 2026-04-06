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
    expandedIndex, toggleExpand,
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
      case "dev": {
        const isSC = (a: string) => a.includes("qmd mcp") || (a.includes("codex") && a.includes("mcp-server"));
        const ttySet = new Set(d.tmux.map(p => p.tty.replace("/dev/", "")));
        const types = new Set(
          d.processes
            .filter(p => !isSC(p.args) && p.mem > 20 && (p.tty === "??" || ttySet.has(p.tty)))
            .map(p => {
              const cmd = p.cmd; const a = p.args;
              if (cmd === "claude" || cmd.includes("claude")) return "claude";
              if (a.toLowerCase().includes("codex"))          return "codex";
              if (a.includes("next"))                         return "next";
              if (a.includes("vite"))                         return "vite";
              if (a.includes("tailwindcss-language"))         return "tailwind-lsp";
              if (a.includes("typescript-language"))          return "ts-lsp";
              return cmd.split("/").pop() ?? cmd;
            })
        );
        return Math.min(types.size, 12);
      }
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
    toggleExpand,
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
  // Only pass expandedIndex to the focused pane; others get undefined
  const paneExp = (pane: string) => focus() === pane ? (expandedIndex() ?? undefined) : undefined;

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
              <SystemPanel data={data()} focused={focus() === "sys"}    panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} expandedIndex={paneExp("sys")}    flexGrow={focus() === "sys" ? 4 : 2} />
              <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("agents")} flexGrow={focus() === "agents" ? 4 : 2} />
              <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("dev")}    flexGrow={focus() === "dev" ? 3 : 1} />
              <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("docker")} flexGrow={focus() === "docker" ? 3 : 1} />
            </box>
          }
        >
          <Show
            when={wide()}
            fallback={
              /* Medium (100-119): two columns — sys | agents+dev+docker */
              <box flexDirection="row" flexGrow={1}>
                <SystemPanel data={data()} focused={focus() === "sys"} panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} expandedIndex={paneExp("sys")}    flexGrow={sysGrow()} />
                <box flexDirection="column" flexGrow={agentsGrow() + rightGrow()}>
                  <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("agents")} flexGrow={agentsGrow()} />
                  <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("dev")}    flexGrow={devGrow()} />
                  <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("docker")} flexGrow={dockerGrow()} />
                </box>
              </box>
            }
          >
            {/* Wide (≥120): three columns — sys | agents | dev+docker */}
            <box flexDirection="row" flexGrow={1}>
              <SystemPanel data={data()} focused={focus() === "sys"} panelWidth={panelContentW()} anomalies={anomalies()} selectedIndex={selectedIndex()} expandedIndex={paneExp("sys")}    flexGrow={sysGrow()} />
              <AgentPanel  data={data()} focused={focus() === "agents"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("agents")} flexGrow={agentsGrow()} />
              <box flexDirection="column" flexGrow={rightGrow()}>
                <DevPanel    data={data()} focused={focus() === "dev"}    panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("dev")}    flexGrow={devGrow()} />
                <DockerPanel docker={data()?.docker ?? null} focused={focus() === "docker"} panelWidth={panelContentW()} selectedIndex={selectedIndex()} expandedIndex={paneExp("docker")} flexGrow={dockerGrow()} />
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
