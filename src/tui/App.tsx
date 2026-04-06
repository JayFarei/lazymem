import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import {
  collectSystem, collectTmux, collectTopProcs, collectProcesses, collectDocker,
  buildSessions,
} from "../core/index";
import type { AuditData, DockerInfo } from "../core/index";
import { SystemPanel } from "./components/SystemPanel";
import { AgentPanel } from "./components/AgentPanel";
import { DockerPanel } from "./components/DockerPanel";
import { DevPanel } from "./components/DevPanel";
import { StatusBar } from "./components/StatusBar";
import { HelpOverlay } from "./components/HelpOverlay";
import { FullscreenPane } from "./components/FullscreenPane";
import { usePaneState } from "./hooks/useViewMode";
import { useKeybindings } from "./hooks/useKeybindings";

function emptyData(): AuditData {
  return {
    system: { totalMB: 0, appMB: 0, wiredMB: 0, compMB: 0, cachedMB: 0, freeMB: 0, usedMB: 0 },
    topProcs: [],
    tmux: [],
    processes: [],
    docker: { containers: [], colimaAlloc: "N/A", vmActual: 0 },
    sessions: [],
    anomalies: [],
    totalInstances: 0,
    totalClaudeMem: 0,
    myTty: "unknown",
  };
}

function emptyDocker(): DockerInfo {
  return { containers: [], colimaAlloc: "N/A", vmActual: 0 };
}

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

  // Layout tiers — memoised so they only recompute on dimension changes
  const narrow = createMemo(() => width() < 100);
  const wide   = createMemo(() => width() >= 120);

  // Focus-aware flexGrow for each top-level column
  const sysGrow    = createMemo(() => focus() === "sys"    ? 3 : 2);
  const agentsGrow = createMemo(() => focus() === "agents" ? 4 : 3);
  const rightGrow  = createMemo(() => (focus() === "dev" || focus() === "docker") ? 4 : 3);
  const devGrow    = createMemo(() => focus() === "docker" ? 1 : 2);
  const dockerGrow = createMemo(() => focus() === "docker" ? 2 : 1);

  const panelContentW = createMemo(() => {
    if (narrow()) return Math.max(20, width() - 4);
    if (wide())   return Math.max(20, Math.floor(width() / 3) - 4);
    return Math.max(20, Math.floor(width() / 2) - 4);
  });

  const anomalies = createMemo(() => data()?.anomalies ?? []);

  const focusedPanelSize = createMemo(() => {
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
  });

  // Docker runs on cycle 1, 4, 7... (every 30s at 10s interval)
  let refreshCount = 0;

  async function refresh() {
    setLoading(true);

    // Wave 1 — fast (~50ms): system info, tmux panes, process list
    const [system, tmux, topProcs] = await Promise.all([
      collectSystem(),
      collectTmux(),
      collectTopProcs(),
    ]);
    // On first load data is null — seed it with real values so panels never
    // flash the 0/0 skeleton. On subsequent refreshes, merge into existing data.
    setData(d => d
      ? { ...d, system, tmux, topProcs }
      : { ...emptyData(), system, tmux, topProcs }
    );

    setLoading(false); // core data is ready; Wave 2 updates agents/docker silently

    // Wave 2 — slower: processes + conditionally docker
    refreshCount++;
    const runDocker = refreshCount === 1 || refreshCount % 3 === 1;
    const [processes, docker] = await Promise.all([
      collectProcesses(),
      runDocker ? collectDocker() : Promise.resolve(data()?.docker ?? emptyDocker()),
    ]);

    const { sessions, anomalies, totalInstances, totalClaudeMem } = buildSessions(processes, tmux);

    // Docker anomaly check
    const containerMem = docker.containers.reduce((s, c) => s + (parseFloat(c.mem) || 0), 0);
    if (docker.vmActual > 500 && containerMem < docker.vmActual * 0.2) {
      anomalies.push({
        text: `Colima VM ${docker.colimaAlloc} for ${Math.round(containerMem)}MiB containers`,
        severity: "warning",
      });
    }

    setData(d => d ? { ...d, processes, docker, sessions, anomalies, totalInstances, totalClaudeMem } : null);
  }

  let timer: ReturnType<typeof setInterval>;
  onMount(async () => { await refresh(); timer = setInterval(refresh, 10_000); });
  onCleanup(() => clearInterval(timer));

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

  // Only pass expandedIndex to the focused pane; others get undefined
  const paneExp = (pane: string) => focus() === pane ? (expandedIndex() ?? undefined) : undefined;

  return (
    <box flexDirection="column" width={width()} height={height()}>

      {/* -- Help overlay ------------------------------------------ */}
      <Show when={showHelp()}>
        <HelpOverlay onClose={() => setShowHelp(false)} />
      </Show>

      {/* -- Main content (dashboard OR fullscreen, never both) ------ */}
      <Show when={!showHelp()}>
        <Show
          when={fullscreen() !== null}
          fallback={
            /* -- Dashboard ----------------------------------------- */
            <box flexDirection="column" flexGrow={1}>
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
                    /* Medium (100-119): two columns */
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
                  {/* Wide (>=120): three columns */}
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
            </box>
          }
        >
          {/* -- Fullscreen ----------------------------------------- */}
          <FullscreenPane
            pane={fullscreen()!}
            data={data()}
            anomalies={anomalies()}
            selectedIndex={selectedIndex()}
            expandedIndex={expandedIndex() ?? undefined}
          />
        </Show>
      </Show>
    </box>
  );
}
