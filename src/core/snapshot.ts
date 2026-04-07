import type { AuditData, ProcessInfo, TopProc } from "./types";
import type { FocusPane } from "../tui/hooks/useViewMode";
import { isClaude, isCodexAgent, isSidecar } from "./collector";

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

export function serializeSnapshot(data: AuditData, focus: FocusPane): string {
  const lines: string[] = [];
  const ts = new Date().toISOString().replace(/\.\d+Z$/, "");

  lines.push("LAZYMEM SNAPSHOT");
  lines.push(`ts: ${ts}`);
  lines.push(`focus: ${focus}`);
  lines.push("");

  // ── RAM ──
  const s = data.system;
  lines.push("[RAM]");
  lines.push(`total: ${s.totalMB}  used: ${s.usedMB}  app: ${s.appMB}  wired: ${s.wiredMB}  comp: ${s.compMB}  cached: ${s.cachedMB}  free: ${s.freeMB}`);
  if (s.swap) {
    lines.push(`swap_used: ${s.swap.used}  swap_total: ${s.swap.total}`);
  }
  lines.push("");

  // ── AGENTS ──
  // Build a map of session -> processes for PID listing
  const ttyToSession = new Map<string, string>();
  for (const pane of data.tmux) {
    ttyToSession.set(pane.tty.replace("/dev/", ""), pane.session);
  }

  const sessionProcs = new Map<string, ProcessInfo[]>();
  for (const proc of data.processes) {
    if (proc.tty === "??" || !proc.tty) continue;
    const session = ttyToSession.get(proc.tty);
    if (!session) continue;
    if (!isClaude(proc.cmd) && !isCodexAgent(proc.cmd, proc.args) && !isSidecar(proc.args)) continue;
    const list = sessionProcs.get(session) ?? [];
    list.push(proc);
    sessionProcs.set(session, list);
  }

  lines.push("[AGENTS]");
  for (const sess of data.sessions) {
    lines.push(`session: ${sess.name}  project: ${sess.project}  claude: ${sess.instances}  codex: ${sess.codexInstances}  sidecars: ${sess.sidecars}  mem: ${sess.totalMem}`);
    const procs = sessionProcs.get(sess.name) ?? [];
    for (const p of procs.sort((a, b) => b.mem - a.mem)) {
      lines.push(`  pid: ${p.pid}  tty: ${p.tty}  mem: ${p.mem}  cmd: ${p.cmd}  args: ${p.args}`);
    }
  }
  lines.push("");

  // ── DEV ──
  // Replicate DevPanel's classify logic for grouping
  const devProcs = data.processes.filter(p => !isSidecar(p.args) && p.mem > 20);
  const devGroups = new Map<string, ProcessInfo[]>();
  for (const p of devProcs) {
    const type = classifyDev(p.cmd, p.args);
    const list = devGroups.get(type) ?? [];
    list.push(p);
    devGroups.set(type, list);
  }

  lines.push("[DEV]");
  const sortedDevGroups = [...devGroups.entries()]
    .map(([label, procs]) => ({ label, procs, totalMem: procs.reduce((s, p) => s + p.mem, 0) }))
    .sort((a, b) => b.totalMem - a.totalMem);
  for (const g of sortedDevGroups) {
    lines.push(`group: ${g.label}  count: ${g.procs.length}  mem: ${g.totalMem}`);
    for (const p of g.procs.sort((a, b) => b.mem - a.mem)) {
      lines.push(`  pid: ${p.pid}  tty: ${p.tty}  mem: ${p.mem}  cmd: ${p.cmd}  args: ${p.args}`);
    }
  }
  lines.push("");

  // ── DOCKER ──
  lines.push("[DOCKER]");
  lines.push(`vm_actual: ${data.docker.vmActual}  vm_alloc: ${data.docker.colimaAlloc}`);
  for (const c of data.docker.containers) {
    lines.push(`container: ${c.name}  mem: ${c.mem}  cpu: ${c.cpu}${c.image ? `  image: ${c.image}` : ""}`);
  }
  lines.push("");

  // ── PROCS (non-dev, non-agent) ──
  const coveredPids = new Set(data.processes.map(p => p.pid));
  const filtered = data.topProcs
    .filter(p => p.cmd.trim().length > 0)
    .filter(p => !coveredPids.has(p.pid))
    .filter(p => !p.args.includes("com.apple.Virtu"))
    .filter(p => !p.args.includes(".agent-browser/"));

  const procGroups = new Map<string, TopProc[]>();
  for (const p of filtered) {
    const list = procGroups.get(p.cmd) ?? [];
    list.push(p);
    procGroups.set(p.cmd, list);
  }

  lines.push("[PROCS]");
  const sortedProcGroups = [...procGroups.entries()]
    .map(([name, procs]) => ({ name, procs, totalMem: procs.reduce((s, p) => s + p.memMB, 0) }))
    .sort((a, b) => b.totalMem - a.totalMem);
  for (const g of sortedProcGroups) {
    const pids = g.procs.map(p => p.pid).join(",");
    lines.push(`proc: ${g.name}  count: ${g.procs.length}  mem: ${g.totalMem}  pids: ${pids}`);
  }
  lines.push("");

  // ── ALERTS ──
  if (data.anomalies.length > 0) {
    lines.push("[ALERTS]");
    for (const a of data.anomalies) {
      lines.push(`${a.severity}: ${a.text}`);
    }
    lines.push("");
  }

  // ── TMUX ──
  lines.push("[TMUX]");
  for (const pane of data.tmux) {
    lines.push(`pane: ${pane.session}  tty: ${pane.tty}  path: ${pane.path}`);
  }

  return lines.join("\n");
}

function classifyDev(cmd: string, args: string): string {
  if (cmd === "claude" || cmd.includes("claude")) return "claude";
  if (args.includes("codex") && args.includes("mcp-server")) return "codex-mcp";
  if (args.toLowerCase().includes("codex")) return "codex";
  if (args.includes("next")) return "next";
  if (args.includes("vite")) return "vite";
  if (args.includes("tailwindcss-language")) return "tailwind-lsp";
  if (args.includes("typescript-language")) return "ts-lsp";
  if (args.includes("tsx")) return "tsx";
  if (args.includes("postcss")) return "postcss";
  if (args.includes("pnpm")) return "pnpm";
  if (args.includes("python") || cmd.includes("python")) return "python";
  if (args.includes("surf-cli")) return "surf-cli";
  if (args.includes("qmd") && args.includes("--http")) return "qmd";
  if (args.includes("telegram")) return "telegram";
  if (cmd.includes("nvim") || args.includes("nvim")) return "nvim";
  return cmd.split("/").pop() ?? cmd;
}
