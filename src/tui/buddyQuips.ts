import type { AuditData, SessionSummary, Anomaly } from "../core/types";

export interface BuddyState {
  quip: string;
  mood: "chill" | "wary" | "alarmed" | "crisis";
}

// ── Prince Edmund ──────────────────────────────────────────────────
// A bumbling royal who believes he has a cunning plan for every memory
// crisis but whose plans are, at best, only slightly better than
// Baldrick's. Contextual to live system state.

// ── Contextual quip builders ───────────────────────────────────────

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function topSessionQuip(sessions: SessionSummary[]): string | null {
  if (sessions.length === 0) return null;
  const top = [...sessions].sort((a, b) => b.totalMem - a.totalMem)[0];
  const mem = fmtMB(top.totalMem);
  const pool = [
    `"${top.name}" is consuming ${mem}. I have a cunning plan: what if we simply... didn't?`,
    `Session "${top.name}" at ${mem}. That's not a session, that's a siege.`,
    `"${top.name}" hoarding ${mem}. Even I know that's excessive, and I once tried to tax turnips.`,
    `The "${top.name}" session is using ${mem}. I suspect treachery. Or a memory leak. Same thing.`,
    `"${top.name}" — ${mem}. I've seen smaller appetites at a medieval banquet.`,
  ];
  return pool[quipCounter % pool.length];
}

function anomalyQuip(anomalies: Anomaly[]): string | null {
  const errors = anomalies.filter(a => a.severity === "error");
  const warnings = anomalies.filter(a => a.severity === "warning");
  if (errors.length > 0) {
    const a = errors[0];
    return `ALERT: "${a.text}" — I have a cunning plan! ...no wait, I had one. It's gone.`;
  }
  if (warnings.length > 1) {
    return `${warnings.length} warnings. Each one a tiny dagger. I shall compose a strongly worded letter.`;
  }
  if (warnings.length === 1) {
    const w = warnings[0];
    return `Warning: "${w.text}" — Nothing to worry about. *worries visibly*`;
  }
  return null;
}

function topProcQuip(data: AuditData): string | null {
  if (data.topProcs.length === 0) return null;
  const hog = data.topProcs[0];
  if (hog.memMB < 500) return null;
  const mem = fmtMB(hog.memMB);
  const name = hog.cmd.split("/").pop() ?? hog.cmd;
  const pool = [
    `"${name}" is eating ${mem} of RAM. I'd call that gluttonous, but I've met Henry VIII.`,
    `${mem} to "${name}". What is it DOING in there? Hosting a ball?`,
    `"${name}" at ${mem}. I have a cunning plan involving the kill command and plausible deniability.`,
    `That "${name}" process at ${mem} has the appetite of a Tudor monarch.`,
  ];
  return pool[quipCounter % pool.length];
}

function multiSessionQuip(sessions: SessionSummary[]): string | null {
  if (sessions.length < 2) return null;
  const names = sessions.slice(0, 3).map(s => `"${s.name}"`).join(", ");
  const pool = [
    `${sessions.length} sessions running: ${names}. It's like a parliament, but less productive.`,
    `Sessions ${names} all competing for RAM. I shall adjudicate. Poorly.`,
    `You're running ${names} simultaneously. As cunning plans go, this one's Baldrick-tier.`,
  ];
  return pool[quipCounter % pool.length];
}

// ── Static quip pools (fallbacks) ──────────────────────────────────

const LOW: string[] = [
  "All quiet. I shall use this time to polish my cunning plans.",
  "Memory this calm makes me suspicious. I've been betrayed before.",
  "Nothing to report. A prince of the realm, reduced to watching bytes.",
  "I had a cunning plan for low memory usage. Turns out it was already happening.",
  "RAM at ease. Like a kingdom at peace. Boring, but I'll take it.",
];

const MEDIUM: string[] = [
  "Memory rising. Fear not, I have a cunning plan. Well, I have A plan.",
  "Usage climbing. This is the part where lesser men would panic. I shall merely fret.",
  "We're at the 'close a tab or two' stage. I recommend the ones you forgot about in March.",
  "Pressure building. I've seen this before, usually right before someone says 'it's fine'.",
  "RAM half full? RAM half empty? I prefer 'RAM dangerously ambiguous'.",
];

const HIGH: string[] = [
  "I have a cunning plan! It involves killing processes and hoping for the best.",
  "Memory critical. As your prince, I command you to free some RAM. Please.",
  "We're in the danger zone. I'd explain my escape plan but it involves turnips.",
  "RAM at {pct}%. Even Baldrick would say 'that's a bit much, my lord'.",
  "I've seen kingdoms fall with more warning than your memory is giving us.",
];

const CRITICAL: string[] = [
  "THIS IS A CRISIS. I shall handle it with all the grace of a startled pheasant.",
  "Memory at {pct}%. My cunning plan: PANIC. My backup plan: ALSO PANIC.",
  "The OOM killer approaches. I have made peace with my malloc()s.",
  "DEFCON BALDRICK. All cunning plans are suspended until further notice.",
  "We're doomed. Doomed! Unless... no, we're doomed.",
];

const SWAP: string[] = [
  "SWAP?! Disk swap?! That's the computing equivalent of the Black Death!",
  "You're swapping to disk. Even I know that's beneath a developer of your station.",
  "Swap active. Your SSD is doing memory's job. Like Baldrick doing... anything.",
  "Disk swap detected. I had a cunning plan for this. It was 'buy more RAM'. Still is.",
];

const AGENTS: string[] = [
  "{n} Claude agents. I have more minions than I had at the Battle of Bosworth Field.",
  "{n} agents, each with its own opinion. Democracy in action. RAM in crisis.",
  "You've spawned {n} agents. That's not delegation, that's an infestation.",
  "{n} agents running. My cunning plan: make them fight to the death for RAM.",
  "I count {n} agents. The court grows too large. Time for a purge, I say.",
];

const DOCKER: string[] = [
  "Colima hoarding {alloc} for {actual} of actual use. A royal tax I cannot endorse.",
  "Docker containers living like kings while your RAM lives like a peasant.",
  "Your VM has an appetite that would embarrass the entire Tudor dynasty.",
  "Containers using {actual} inside a {alloc} VM. That's wasteful even by my standards.",
];

const COMPRESSOR: string[] = [
  "The compressor is squeezing memory like I squeeze Baldrick for information.",
  "macOS compressor active. Your RAM is being folded like a poorly written treaty.",
  "Compression engaged. The kernel is performing feats of desperation I find relatable.",
];

const IDLE: string[] = [
  "I sit here, a prince among processes, watching bytes flow like a digital river.",
  "*adjusts crown, stares at memory graphs, sighs regally*",
  "Another cycle, another chance to deploy my legendary cunning. Any moment now.",
  "The realm is quiet. I shall use this time to scheme. Cunningly.",
  "Waiting. Watching. Occasionally judging your process management. Royally.",
];

// ── Quip selection engine ──────────────────────────────────────────

let quipCounter = 0;

function pick(pool: string[], data?: AuditData): string {
  quipCounter++;
  let q = pool[quipCounter % pool.length];

  if (data) {
    const pct = data.system.totalMB > 0
      ? Math.round((data.system.usedMB / data.system.totalMB) * 100)
      : 0;
    q = q.replace(/\{pct\}/g, String(pct));
    q = q.replace(/\{n\}/g, String(data.totalInstances));
    q = q.replace(/\{alloc\}/g, data.docker.colimaAlloc);
    const containerMem = data.docker.containers.reduce(
      (s, c) => s + (parseFloat(c.mem) || 0), 0
    );
    q = q.replace(/\{actual\}/g, fmtMB(containerMem));
  }

  return q;
}

export function getBuddyState(data: AuditData | null): BuddyState {
  if (!data) return { quip: "Booting up. Adjusting crown. Calibrating cunning...", mood: "chill" };

  quipCounter++;

  const pct = data.system.totalMB > 0
    ? (data.system.usedMB / data.system.totalMB) * 100
    : 0;

  const hasSwap = data.system.swap
    ? parseFloat(data.system.swap.used) > 0
    : false;

  const manyAgents = data.totalInstances > 4;
  const dockerHeavy = data.docker.vmActual > 500 &&
    data.docker.containers.reduce((s, c) => s + (parseFloat(c.mem) || 0), 0) < data.docker.vmActual * 0.3;
  const compressorBusy = data.system.compMB > data.system.totalMB * 0.15;

  // Alternate between contextual quips (sessions, anomalies, procs) and pool quips
  // Even cycles: try contextual. Odd cycles: use pool. Keeps variety high.
  const tryContextual = quipCounter % 3 !== 0;

  if (hasSwap) {
    return { quip: pick(SWAP, data), mood: "crisis" };
  }
  if (pct > 90) {
    if (tryContextual) {
      const q = anomalyQuip(data.anomalies) ?? topSessionQuip(data.sessions);
      if (q) return { quip: q, mood: "crisis" };
    }
    return { quip: pick(CRITICAL, data), mood: "crisis" };
  }
  if (pct > 75) {
    if (tryContextual) {
      const q = topProcQuip(data) ?? topSessionQuip(data.sessions);
      if (q) return { quip: q, mood: "alarmed" };
    }
    return { quip: pick(HIGH, data), mood: "alarmed" };
  }
  if (manyAgents) {
    if (tryContextual) {
      const q = multiSessionQuip(data.sessions) ?? topSessionQuip(data.sessions);
      if (q) return { quip: q, mood: "wary" };
    }
    return { quip: pick(AGENTS, data), mood: "wary" };
  }
  if (dockerHeavy) {
    return { quip: pick(DOCKER, data), mood: "wary" };
  }
  if (compressorBusy) {
    return { quip: pick(COMPRESSOR, data), mood: "wary" };
  }
  if (pct > 50) {
    if (tryContextual) {
      const q = topProcQuip(data) ?? anomalyQuip(data.anomalies);
      if (q) return { quip: q, mood: "wary" };
    }
    return { quip: pick(MEDIUM, data), mood: "wary" };
  }
  if (pct > 20) {
    if (tryContextual) {
      const q = topSessionQuip(data.sessions);
      if (q) return { quip: q, mood: "chill" };
    }
    return { quip: pick(LOW, data), mood: "chill" };
  }

  return { quip: pick(IDLE, data), mood: "chill" };
}
