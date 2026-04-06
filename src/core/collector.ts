import type {
  SystemInfo, TopProc, TmuxPane, ProcessInfo,
  DockerInfo, SessionSummary, Anomaly, AuditData,
} from "./types";

async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
  return await new Response(proc.stdout).text();
}

export async function collectSystem(): Promise<SystemInfo> {
  // hw.memsize: ground-truth physical RAM in bytes
  const [vmstatOut, memsizeOut, swapOut] = await Promise.all([
    run(["vm_stat"]),
    run(["sysctl", "-n", "hw.memsize"]),
    run(["sysctl", "-n", "vm.swapusage"]),
  ]);

  // Parse page size from "Mach Virtual Memory Statistics: (page size of N bytes)"
  const pageSizeMatch = vmstatOut.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1]) : 16384;

  // Extract page counts from vm_stat output
  function pages(label: string): number {
    const m = vmstatOut.match(new RegExp(`${label}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  }
  const freePages        = pages("Pages free");
  const activePages      = pages("Pages active");
  const inactivePages    = pages("Pages inactive");
  const specPages        = pages("Pages speculative");
  const wiredPages       = pages("Pages wired down");
  const compPages        = pages("Pages occupied by compressor");
  const purgeable        = pages("Pages purgeable");
  const fileBacked       = pages("File-backed pages");
  const anonymous        = pages("Anonymous pages");

  const toMB = (p: number) => Math.round((p * pageSize) / (1024 * 1024));

  const totalMB  = Math.round(parseInt(memsizeOut.trim()) / (1024 * 1024));
  // Activity Monitor categories:
  const appMB    = toMB(Math.max(0, anonymous - purgeable));
  const wiredMB  = toMB(wiredPages);
  const compMB   = toMB(compPages);
  const cachedMB = toMB(fileBacked);
  const freeMB   = toMB(Math.max(0, freePages - specPages));
  const usedMB   = appMB + wiredMB + compMB;

  // Swap: "vm.swapusage: total = 3.00G  used = 1.25G  free = 1.75G  ..."
  let swap: SystemInfo["swap"];
  const swapM = swapOut.match(/total\s*=\s*([\d.]+[BKMG])\s+used\s*=\s*([\d.]+[BKMG])\s+free\s*=\s*([\d.]+[BKMG])/i);
  if (swapM) {
    swap = { total: swapM[1], used: swapM[2], free: swapM[3] };
  }

  return { totalMB, appMB, wiredMB, compMB, cachedMB, freeMB, usedMB, swap };
}

export async function collectTopProcs(): Promise<TopProc[]> {
  const out = await run(["top", "-l", "1", "-o", "mem", "-n", "30", "-stats", "pid,command,mem"]);
  return out
    .split("\n")
    .slice(12)
    .filter((l) => l.trim())
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      if (parts.length < 3) return null;
      const cmd = parts[1]?.trim() ?? "";
      if (!cmd) return null;
      const mem = parts[parts.length - 1];
      const memMB = mem.endsWith("G") ? parseFloat(mem) * 1024 : parseInt(mem) || 0;
      return { pid: parts[0], cmd, mem, memMB };
    })
    .filter(Boolean) as TopProc[];
}

export async function collectTmux(): Promise<TmuxPane[]> {
  try {
    const out = await run([
      "tmux", "list-panes", "-a", "-F",
      "#{session_name}\t#{window_index}.#{pane_index}\t#{pane_tty}\t#{pane_current_command}\t#{pane_current_path}",
    ]);
    return out
      .split("\n")
      .filter((l) => l.includes("\t"))
      .map((l) => {
        const [session, pane, tty, cmd, path] = l.split("\t");
        return { session, pane, tty, cmd, path };
      });
  } catch {
    return [];
  }
}

export async function collectProcesses(): Promise<ProcessInfo[]> {
  const psOut = await run(["ps", "-eo", "pid,comm"]);
  const pids = psOut
    .split("\n")
    .filter((l) => /claude|node/.test(l))
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean);

  const results: ProcessInfo[] = [];
  for (const pid of pids) {
    try {
      const [ttyOut, memOut, commOut, argsOut] = await Promise.all([
        run(["ps", "-p", pid, "-o", "tty="]),
        run(["ps", "-p", pid, "-o", "rss="]),
        run(["ps", "-p", pid, "-o", "comm="]),
        run(["ps", "-p", pid, "-o", "args="]),
      ]);
      const tty = ttyOut.trim() || "??";
      const mem = Math.round(parseInt(memOut.trim()) / 1024) || 0;
      const cmd = commOut.trim();
      const args = argsOut.trim().slice(0, 120);
      if (cmd) results.push({ pid, tty, mem, cmd, args });
    } catch {}
  }
  return results;
}

export async function collectDocker(): Promise<DockerInfo> {
  let containers: DockerInfo["containers"] = [];
  let colimaAlloc = "N/A";
  let vmActual = 0;

  try {
    const [statsOut, psOut] = await Promise.all([
      run(["docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"]),
      run(["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"]),
    ]);
    const imageMap = new Map<string, string>();
    for (const l of psOut.split("\n").filter((l) => l.includes("\t"))) {
      const [n, img] = l.split("\t");
      imageMap.set(n.trim(), img.trim());
    }
    containers = statsOut
      .split("\n")
      .filter((l) => l.includes("\t"))
      .map((l) => {
        const [name, mem, cpu] = l.split("\t");
        return { name, mem, cpu, image: imageMap.get(name) };
      });
  } catch {}

  try {
    const colimaOut = await run(["colima", "list"]);
    const lastLine = colimaOut.split("\n").filter((l) => l.trim()).pop() ?? "";
    colimaAlloc = lastLine.split(/\s+/)[4] ?? "N/A";
  } catch {}

  try {
    const vmOut = await run(["ps", "-eo", "pid,rss,comm"]);
    const vmLine = vmOut.split("\n").find((l) => l.includes("com.apple.Virtua"));
    if (vmLine) {
      vmActual = Math.round(parseInt(vmLine.trim().split(/\s+/)[1]) / 1024);
    }
  } catch {}

  return { containers, colimaAlloc, vmActual };
}

function isSidecar(args: string): boolean {
  return args.includes("qmd mcp") || (args.includes("codex") && (args.includes("mcp-server") || args.includes("codex exec")));
}

function isClaude(cmd: string): boolean {
  return cmd === "claude" || cmd.includes("claude");
}

function isCodexAgent(cmd: string, args: string): boolean {
  return !isClaude(cmd) && !isSidecar(args) && args.toLowerCase().includes("codex");
}

export function buildSessions(
  processes: ProcessInfo[],
  tmux: TmuxPane[],
): { sessions: SessionSummary[]; anomalies: Anomaly[]; totalInstances: number; totalClaudeMem: number } {
  const ttyMap = new Map<string, { session: string; path: string }>();
  for (const pane of tmux) {
    ttyMap.set(pane.tty.replace("/dev/", ""), { session: pane.session, path: pane.path });
  }

  const sessionMap = new Map<string, { project: string; claudes: number; codex: number; sidecars: number; mem: number }>();
  for (const proc of processes) {
    if (proc.tty === "??" || !proc.tty) continue;
    const info = ttyMap.get(proc.tty);
    if (!info) continue;

    const entry = sessionMap.get(info.session) ?? { project: "", claudes: 0, codex: 0, sidecars: 0, mem: 0 };
    if (!entry.project) {
      const parts = info.path.split("/");
      entry.project = parts[parts.length - 1] || parts[parts.length - 2] || info.path;
    }
    entry.mem += proc.mem;
    if (isClaude(proc.cmd))                entry.claudes++;
    else if (isCodexAgent(proc.cmd, proc.args)) entry.codex++;
    else if (isSidecar(proc.args))         entry.sidecars++;
    sessionMap.set(info.session, entry);
  }

  const sessions: SessionSummary[] = [...sessionMap.entries()]
    .map(([name, v]) => ({
      name,
      project:        v.project,
      instances:      v.claudes,
      codexInstances: v.codex,
      sidecars:       v.sidecars,
      totalMem:       v.mem,
    }))
    .filter((s) => s.instances > 0 || s.codexInstances > 0)
    .sort((a, b) => b.totalMem - a.totalMem);

  const anomalies: Anomaly[] = [];
  for (const s of sessions) {
    const total = s.instances + s.codexInstances;
    if (total > 4) {
      anomalies.push({ text: `${s.name}: ${s.instances}c+${s.codexInstances}x agents (${fmtMB(s.totalMem)})`, severity: "error" });
    }
  }

  const totalInstances = sessions.reduce((s, x) => s + x.instances + x.codexInstances, 0);
  const totalClaudeMem = sessions.reduce((s, x) => s + x.totalMem, 0);

  return { sessions, anomalies, totalInstances, totalClaudeMem };
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;
}

export async function collectAll(): Promise<AuditData> {
  const [system, topProcs, tmux, processes, docker] = await Promise.all([
    collectSystem(),
    collectTopProcs(),
    collectTmux(),
    collectProcesses(),
    collectDocker(),
  ]);

  const { sessions, anomalies, totalInstances, totalClaudeMem } = buildSessions(processes, tmux);

  // Docker anomaly
  const containerMem = docker.containers.reduce((s, c) => s + (parseFloat(c.mem) || 0), 0);
  if (docker.vmActual > 500 && containerMem < docker.vmActual * 0.2) {
    anomalies.push({
      text: `Colima VM ${docker.colimaAlloc} for ${Math.round(containerMem)}MiB containers`,
      severity: "warning",
    });
  }

  const myTty = "unknown";

  return { system, topProcs, tmux, processes, docker, sessions, anomalies, totalInstances, totalClaudeMem, myTty };
}
