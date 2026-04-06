export interface SystemInfo {
  // All values in MB; totalMB is from hw.memsize (ground truth denominator)
  totalMB: number;
  appMB: number;       // anonymous - purgeable  (Activity Monitor "App Memory")
  wiredMB: number;     // wired down pages
  compMB: number;      // pages occupied by compressor
  cachedMB: number;    // file-backed pages (disk cache)
  freeMB: number;      // free - speculative
  usedMB: number;      // appMB + wiredMB + compMB  (Activity Monitor "Used")
  swap?: { total: string; used: string; free: string };
}

export interface TopProc {
  pid: string;
  cmd: string;
  mem: string;
  memMB: number;
}

export interface TmuxPane {
  session: string;
  pane: string;
  tty: string;
  cmd: string;
  path: string;
}

export interface ProcessInfo {
  pid: string;
  tty: string;
  mem: number;
  cmd: string;
  args: string;
}

export interface DockerContainer {
  name: string;
  mem: string;
  cpu: string;
  image?: string;
}

export interface DockerInfo {
  containers: DockerContainer[];
  colimaAlloc: string;
  vmActual: number;
}

export interface SessionSummary {
  name: string;
  project: string;
  instances: number;     // claude processes
  codexInstances: number;
  sidecars: number;
  totalMem: number;
}

export interface Anomaly {
  text: string;
  severity: "error" | "warning" | "info";
}

export interface AuditData {
  system: SystemInfo;
  topProcs: TopProc[];
  tmux: TmuxPane[];
  processes: ProcessInfo[];
  docker: DockerInfo;
  sessions: SessionSummary[];
  anomalies: Anomaly[];
  totalInstances: number;
  totalClaudeMem: number;
  myTty: string;
}
