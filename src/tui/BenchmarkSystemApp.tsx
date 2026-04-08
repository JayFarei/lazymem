import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import {
  collectSystem, collectTmux, collectTopProcs, collectProcesses, collectDocker, buildSessions,
} from "../core/index";
import type { AuditData, DockerInfo } from "../core/index";
import { SystemPanel } from "./components/SystemPanel";
import { StatusBar } from "./components/StatusBar";
import { benchmark } from "../bench/runtime";

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
  const mode = process.env.LAZYMEM_BENCHMARK_MODE ?? "system-isolated";
  const noProcs = mode === "system-isolated-no-procs" || mode === "system-isolated-text-summary";
  const animateProcessBars = mode !== "system-isolated-procs-static";
  const sectionMode = mode === "system-isolated-procs-only"
    || mode === "system-isolated-procs-static"
    ? "procs-only"
    : noProcs
      ? "no-procs"
      : "full";
  const summaryMode = mode === "system-isolated-text-summary" ? "text" : "full";

  const [data, setData] = createSignal<AuditData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [ready, setReady] = createSignal(false);
  let benchmarkExitTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const [system, tmux, topProcs] = await Promise.all([
      collectSystem(),
      collectTmux(),
      collectTopProcs(),
    ]);
    const storedTopProcs = noProcs ? [] : topProcs;
    setData({ ...emptyData(), system, tmux, topProcs: storedTopProcs });
    setLoading(false);
    benchmark.markCoreReady();

    const [processes, docker] = await Promise.all([
      collectProcesses(),
      collectDocker(),
    ]);
    const storedProcesses = noProcs ? [] : processes;
    const { sessions, anomalies, totalInstances, totalClaudeMem } = buildSessions(storedProcesses, tmux);
    const containerMem = docker.containers.reduce((sum, container) => sum + (parseFloat(container.mem) || 0), 0);
    if (docker.vmActual > 500 && containerMem < docker.vmActual * 0.2) {
      anomalies.push({
        text: `Colima VM ${docker.colimaAlloc} for ${Math.round(containerMem)}MiB containers`,
        severity: "warning",
      });
    }

    setData((current) => current ? {
      ...current,
      processes: storedProcesses,
      docker,
      sessions,
      anomalies,
      totalInstances,
      totalClaudeMem,
    } : null);

    setReady(true);
    if (benchmark.markFullReady()) {
      benchmarkExitTimer = setTimeout(async () => {
        benchmark.markIdle();
        await benchmark.flush();
        renderer.destroy();
        process.exit(0);
      }, benchmark.idleWaitMs);
    }
  });

  onCleanup(() => {
    if (benchmarkExitTimer) clearTimeout(benchmarkExitTimer);
  });

  return (
    <box flexDirection="column" width={dims().width} height={dims().height}>
      <Show
        when={ready()}
        fallback={
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#4d5566">{loading() ? "collecting..." : "mounting..."}</text>
          </box>
        }
      >
        <SystemPanel
          data={data()}
          focused={true}
          sectionMode={sectionMode}
          summaryMode={summaryMode}
          animateProcessBars={animateProcessBars}
          panelWidth={Math.max(20, dims().width - 4)}
          anomalies={data()?.anomalies ?? []}
          selectedIndex={0}
          flexGrow={1}
        />
        <StatusBar
          loading={loading()}
          instances={data()?.totalInstances ?? 0}
          totalMem={data()?.totalClaudeMem ?? 0}
          anomalies={(data()?.anomalies ?? []).length}
          focus="sys"
        />
      </Show>
    </box>
  );
}
