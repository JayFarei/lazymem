import type { AuditData, SessionSummary, Anomaly } from "../core/types";

export type Mood = "chill" | "wary" | "alarmed" | "crisis";

export interface BuddyState {
  mood: Mood;
  pool: string[];
}

// ── Prince Edmund ──────────────────────────────────────────────────
// Quips are built from observations about the ACTUAL system state.
// Instead of a rigid priority waterfall, we collect all notable
// observations and build a diverse pool from them.

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

// ── Observation collectors ─────────────────────────────────────────
// Each returns quips about what it notices. All run, all contribute.

function observeRAM(data: AuditData): string[] {
  const p = pct(data.system.usedMB, data.system.totalMB);
  const used = fmtMB(data.system.usedMB);
  const total = fmtMB(data.system.totalMB);
  const out: string[] = [];

  if (p > 90) {
    out.push(
      `RAM at ${p}%. My cunning plan: PANIC. Backup plan: ALSO PANIC.`,
      `${used} of ${total} used. The OOM killer is warming up. I can feel it.`,
      `${p}% RAM. We're past cunning plans and into blind prayer territory.`,
    );
  } else if (p > 75) {
    out.push(
      `RAM at ${p}%. I have a cunning plan involving the kill command.`,
      `${used} of ${total}. Your memory has the structural integrity of a wet biscuit.`,
      `${p}% used. Even Baldrick would say 'that's a bit much, my lord'.`,
    );
  } else if (p > 50) {
    out.push(
      `RAM at ${p}%. Not dire, but I'm keeping one eye on the exits.`,
      `${used} of ${total}. Usage is climbing like my anxiety.`,
      `${p}% memory used. The sensible thing would be to close something. You won't.`,
    );
  } else {
    out.push(
      `RAM at ${p}%. The kingdom is at peace. Suspiciously so.`,
      `${used} of ${total}. Plenty of headroom. I'm almost bored.`,
      `${p}% used. Your memory management is... adequate. Don't let it go to your head.`,
    );
  }
  return out;
}

function observeSwap(data: AuditData): string[] {
  if (!data.system.swap) return [];
  const used = parseFloat(data.system.swap.used);
  if (used <= 0) return [];
  const total = parseFloat(data.system.swap.total);
  // On macOS, some swap is normal. Only remark if it's significant.
  if (used > total * 0.5) {
    return [
      `Swap is ${data.system.swap.used} used. The disk is doing RAM's job. Peasant work.`,
      `Heavy swap at ${data.system.swap.used}. Your SSD is weeping quietly.`,
    ];
  }
  if (used > 1024) {
    return [
      `${data.system.swap.used} in swap. macOS hoarding as usual, but keep an eye on it.`,
    ];
  }
  // Small amount of swap - normal macOS behavior, don't obsess
  return [];
}

function observeCompressor(data: AuditData): string[] {
  const ratio = data.system.totalMB > 0 ? data.system.compMB / data.system.totalMB : 0;
  if (ratio < 0.1) return [];
  const comp = fmtMB(data.system.compMB);
  if (ratio > 0.2) {
    return [
      `Compressor holding ${comp}. Your RAM is being squeezed like a tax collector's heart.`,
      `${comp} compressed. The kernel is playing Tetris with your pages, and losing.`,
    ];
  }
  return [
    `${comp} in compressor. macOS is quietly rearranging the furniture.`,
  ];
}

function observeSessions(data: AuditData): string[] {
  const out: string[] = [];
  if (data.sessions.length === 0) return out;

  const sorted = [...data.sessions].sort((a, b) => b.totalMem - a.totalMem);
  const top = sorted[0];
  const topMem = fmtMB(top.totalMem);

  if (top.totalMem > 500) {
    out.push(
      `"${top.name}" is devouring ${topMem}. I'd call it gluttonous, but I've met Henry VIII.`,
      `Session "${top.name}" at ${topMem}. That's not a session, that's a siege.`,
    );
  } else if (top.totalMem > 100) {
    out.push(
      `"${top.name}" using ${topMem}. Modest by royal standards, but I'm watching.`,
    );
  }

  if (data.sessions.length >= 3) {
    const names = sorted.slice(0, 3).map(s => `"${s.name}"`).join(", ");
    out.push(
      `${data.sessions.length} sessions running: ${names}. A full court, and twice as noisy.`,
      `Sessions ${names} competing for RAM like nobles at a feast.`,
    );
  } else if (data.sessions.length === 2) {
    out.push(
      `Two sessions: "${sorted[0].name}" and "${sorted[1].name}". A duel, essentially.`,
    );
  }

  if (top.instances > 3) {
    out.push(
      `"${top.name}" has ${top.instances} agents. That's not multitasking, that's a riot.`,
    );
  }

  return out;
}

function observeAgents(data: AuditData): string[] {
  const n = data.totalInstances;
  if (n <= 1) return [];
  const mem = fmtMB(data.totalClaudeMem);
  const out: string[] = [];

  if (n > 6) {
    out.push(
      `${n} agents consuming ${mem}. I have more minions than I had at Bosworth Field.`,
      `${n} Claude instances. Each one convinced it's the protagonist. Classic.`,
    );
  } else if (n > 3) {
    out.push(
      `${n} agents using ${mem}. A respectable retinue. Perhaps too respectable.`,
      `${n} Claude agents. Democracy in action. RAM in crisis.`,
    );
  } else {
    out.push(
      `${n} agents sharing ${mem}. A small court, but cunning.`,
    );
  }
  return out;
}

function observeDocker(data: AuditData): string[] {
  const out: string[] = [];
  const dc = data.docker;
  if (dc.containers.length === 0 && dc.vmActual === 0) return out;

  const containerMem = dc.containers.reduce((s, c) => s + (parseFloat(c.mem) || 0), 0);

  if (dc.containers.length > 0) {
    const top = [...dc.containers].sort((a, b) => (parseFloat(b.mem) || 0) - (parseFloat(a.mem) || 0))[0];
    const topMem = parseFloat(top.mem) || 0;
    if (topMem > 200) {
      out.push(
        `Container "${top.name}" eating ${fmtMB(topMem)}. Living like a king in its little box.`,
      );
    }
    if (dc.containers.length > 3) {
      out.push(
        `${dc.containers.length} containers running. A bustling port. An expensive port.`,
      );
    }
  }

  if (dc.vmActual > 500 && containerMem < dc.vmActual * 0.3) {
    out.push(
      `Colima VM has ${dc.colimaAlloc} allocated for ${fmtMB(containerMem)} of actual use. Royal waste.`,
      `Your VM allocation would embarrass the entire Tudor treasury.`,
    );
  }

  return out;
}

function observeProcesses(data: AuditData): string[] {
  if (data.topProcs.length === 0) return [];
  const out: string[] = [];

  // Top memory hog
  const hog = data.topProcs[0];
  const name = hog.cmd.split("/").pop() ?? hog.cmd;
  const mem = fmtMB(hog.memMB);

  if (hog.memMB > 2000) {
    out.push(
      `"${name}" at ${mem}. That process has the appetite of a Tudor monarch.`,
      `${mem} to "${name}". What is it DOING in there? Hosting a coronation?`,
    );
  } else if (hog.memMB > 800) {
    out.push(
      `"${name}" leading the pack at ${mem}. I'd investigate, but I'm a prince, not a detective.`,
    );
  } else if (hog.memMB > 300) {
    out.push(
      `Top process: "${name}" at ${mem}. Unremarkable. I expected more drama.`,
    );
  }

  // Count of heavy processes
  const heavy = data.topProcs.filter(p => p.memMB > 500);
  if (heavy.length >= 3) {
    const names = heavy.slice(0, 3).map(p => p.cmd.split("/").pop() ?? p.cmd);
    out.push(
      `${heavy.length} processes over 500M: ${names.join(", ")}. A consortium of gluttony.`,
    );
  }

  return out;
}

function observeAnomalies(data: AuditData): string[] {
  const out: string[] = [];
  for (const a of data.anomalies) {
    if (a.severity === "error") {
      out.push(`ALERT: "${a.text}" - I had a cunning plan for this! ...it's gone.`);
    } else if (a.severity === "warning") {
      out.push(`Warning spotted: "${a.text}" *adjusts crown nervously*`);
    }
  }
  return out;
}

// ── Idle / filler quips (used when nothing is notable) ─────────────

const FILLER: string[] = [
  "I sit here, a prince among processes, watching bytes like a digital river.",
  "*adjusts crown, stares at memory graphs, sighs regally*",
  "Another cycle, another chance to deploy my legendary cunning. Any moment now.",
  "The realm is quiet. I shall use this time to scheme. Cunningly.",
  "Waiting. Watching. Occasionally judging your process management. Royally.",
  "I could be conquering kingdoms but instead I'm watching your RSS values.",
  "A prince reduced to monitoring malloc. What would father say.",
  "Somewhere, Baldrick is having a worse day than your memory. Probably.",
  "All systems nominal. A phrase I find deeply unsatisfying.",
  "Everything's fine. Which historically means something is about to go wrong.",
];

// ── Mood calculation ───────────────────────────────────────────────

function calcMood(data: AuditData): Mood {
  const p = pct(data.system.usedMB, data.system.totalMB);
  const hasHeavySwap = data.system.swap
    ? parseFloat(data.system.swap.used) > parseFloat(data.system.swap.total) * 0.5
    : false;
  const errors = data.anomalies.filter(a => a.severity === "error").length;

  if (p > 90 || hasHeavySwap || errors > 0) return "crisis";
  if (p > 75 || data.totalInstances > 6) return "alarmed";
  if (p > 50 || data.totalInstances > 3) return "wary";
  return "chill";
}

// ── Public API ─────────────────────────────────────────────────────

export function getBuddyState(data: AuditData | null): BuddyState {
  if (!data) return { mood: "chill", pool: ["Booting up. Adjusting crown. Calibrating cunning..."] };

  const mood = calcMood(data);

  // Collect ALL observations about the actual system
  const observations = [
    ...observeRAM(data),
    ...observeSwap(data),
    ...observeCompressor(data),
    ...observeSessions(data),
    ...observeAgents(data),
    ...observeDocker(data),
    ...observeProcesses(data),
    ...observeAnomalies(data),
  ];

  // Always include some filler for variety
  const pool = observations.length > 0
    ? [...observations, ...FILLER.slice(0, 3)]
    : [...FILLER];

  return { mood, pool };
}
