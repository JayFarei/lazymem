import type { AuditData, SessionSummary, Anomaly } from "../core/types";

export type Mood = "chill" | "wary" | "alarmed" | "crisis";

export interface BuddyState {
  mood: Mood;
  pool: string[];   // candidate quips for current state
}

// ── Prince Edmund ──────────────────────────────────────────────────
// A bumbling royal who believes every memory crisis can be solved
// with a cunning plan. Quips are contextual to live system state:
// session names, process hogs, anomaly text, agent counts.

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

// ── Contextual quip builders (return strings or null) ──────────────

function sessionQuips(sessions: SessionSummary[]): string[] {
  if (sessions.length === 0) return [];
  const top = [...sessions].sort((a, b) => b.totalMem - a.totalMem)[0];
  const m = fmtMB(top.totalMem);
  const n = top.name;
  const out: string[] = [];
  if (top.totalMem > 100) {
    out.push(
      `"${n}" is consuming ${m}. I have a cunning plan: what if we simply... didn't?`,
      `Session "${n}" at ${m}. That's not a session, that's a siege.`,
      `"${n}" hoarding ${m}. Even I know that's excessive, and I once tried to tax turnips.`,
      `The "${n}" session is using ${m}. I suspect treachery. Or a memory leak. Same thing.`,
    );
  }
  if (sessions.length >= 2) {
    const names = sessions.slice(0, 3).map(s => `"${s.name}"`).join(", ");
    out.push(
      `${sessions.length} sessions: ${names}. It's like a parliament, but less productive.`,
      `Sessions ${names} all competing for RAM. I shall adjudicate. Poorly.`,
    );
  }
  return out;
}

function anomalyQuips(anomalies: Anomaly[]): string[] {
  const out: string[] = [];
  const errors = anomalies.filter(a => a.severity === "error");
  const warnings = anomalies.filter(a => a.severity === "warning");
  for (const a of errors.slice(0, 2)) {
    out.push(`ALERT: "${a.text}" - I had a cunning plan for this! ...it's gone.`);
  }
  if (warnings.length > 1) {
    out.push(`${warnings.length} warnings. Each one a tiny dagger. I shall compose a strongly worded letter.`);
  }
  for (const w of warnings.slice(0, 2)) {
    out.push(`Warning: "${w.text}" - Nothing to worry about. *worries visibly*`);
  }
  return out;
}

function procQuips(data: AuditData): string[] {
  if (data.topProcs.length === 0) return [];
  const hog = data.topProcs[0];
  if (hog.memMB < 500) return [];
  const m = fmtMB(hog.memMB);
  const name = hog.cmd.split("/").pop() ?? hog.cmd;
  return [
    `"${name}" is eating ${m}. I'd call that gluttonous, but I've met Henry VIII.`,
    `${m} to "${name}". What is it DOING in there? Hosting a ball?`,
    `"${name}" at ${m}. I have a cunning plan involving kill -9 and plausible deniability.`,
    `That "${name}" process at ${m} has the appetite of a Tudor monarch.`,
  ];
}

// ── Static quip pools ──────────────────────────────────────────────

const IDLE: string[] = [
  "I sit here, a prince among processes, watching bytes like a digital river.",
  "*adjusts crown, stares at memory graphs, sighs regally*",
  "Another cycle, another chance to deploy my legendary cunning. Any moment now.",
  "The realm is quiet. I shall use this time to scheme. Cunningly.",
  "Waiting. Watching. Occasionally judging your process management. Royally.",
  "I could be conquering kingdoms but instead I'm watching your RSS values.",
  "A prince reduced to monitoring malloc. What would father say.",
  "Somewhere, Baldrick is having a worse day than your memory. Probably.",
];

const LOW: string[] = [
  "All quiet. I shall use this time to polish my cunning plans.",
  "Memory this calm makes me suspicious. I've been betrayed before.",
  "Nothing to report. A prince of the realm, reduced to watching bytes.",
  "RAM at ease. Like a kingdom at peace. Boring, but I'll take it.",
  "I had a cunning plan for low memory. Turns out it was already happening.",
  "Your allocators are performing... adequately. Don't let it go to your head.",
  "Smooth sailing. Reminds me of a kernel I knew. Before the incident.",
  "Everything's fine. Which historically means something is about to go wrong.",
];

const MEDIUM: string[] = [
  "Memory rising. Fear not, I have a cunning plan. Well, I have A plan.",
  "Usage climbing. Lesser men would panic. I shall merely fret.",
  "We're at the 'close a tab or two' stage. Try the ones from March.",
  "Pressure building. I've seen this before, usually right before 'it's fine'.",
  "RAM half full? Half empty? I prefer 'dangerously ambiguous'.",
  "I could fix this, but explaining it would take longer than your uptime.",
  "That's a lot of resident bytes for what I assume is a todo app.",
  "Memory pressure building. Like the drizzle before a proper storm.",
];

const HIGH: string[] = [
  "I have a cunning plan! It involves killing processes and hoping for the best.",
  "Memory critical. As your prince, I command you to free some RAM. Please.",
  "We're in the danger zone. My escape plan involves turnips.",
  "RAM at {pct}%. Even Baldrick would say 'that's a bit much, my lord'.",
  "I've seen kingdoms fall with more warning than your memory is giving us.",
  "Your RAM has the structural integrity of a wet biscuit. Kill something.",
  "This reminds me of the Great Leak of '14. Same smell. Same hubris.",
  "You're running out of memory and patience. I can only help with one.",
];

const CRITICAL: string[] = [
  "THIS IS A CRISIS. I shall handle it with the grace of a startled pheasant.",
  "Memory at {pct}%. My cunning plan: PANIC. Backup plan: ALSO PANIC.",
  "The OOM killer approaches. I have made peace with my mallocs.",
  "DEFCON BALDRICK. All cunning plans suspended until further notice.",
  "We're doomed. Doomed! Unless... no, we're doomed.",
  "Everything is on fire. This is fine. I've seen worse. Barely.",
  "The kernel is writing its memoirs. In swap. On a spinning disk. We're finished.",
  "Your system has the headroom of a crushed tin can. Act now or perish.",
];

const SWAP: string[] = [
  "SWAP?! Disk swap?! The computing equivalent of the Black Death!",
  "Swapping to disk. Even I know that's beneath a developer of your station.",
  "Swap active. Your SSD is doing memory's job. Like Baldrick doing anything.",
  "Disk swap detected. My cunning plan: 'buy more RAM'. Still is.",
  "The SSD is crying. I can hear it. You probably can't. Peasant ears.",
  "Swapping to disk. In my day, that meant you'd already failed.",
];

const AGENTS: string[] = [
  "{n} agents. I have more minions than I had at the Battle of Bosworth Field.",
  "{n} agents, each with its own opinion. Democracy in action. RAM in crisis.",
  "You've spawned {n} agents. That's not delegation, that's an infestation.",
  "{n} agents running. My cunning plan: make them fight to the death for RAM.",
  "I count {n} agents. The court grows too large. Time for a purge.",
  "{n} agents. Each one convinced it's the main character. Classic.",
  "{n} Claude instances. I've seen server farms with fewer tenants.",
];

const DOCKER: string[] = [
  "Colima hoarding {alloc} for {actual} of containers. A royal tax I cannot endorse.",
  "Docker containers living like kings while your RAM lives like a peasant.",
  "Your VM has an appetite that would embarrass the entire Tudor dynasty.",
  "Containers using {actual} inside a {alloc} VM. Wasteful even by my standards.",
  "Docker: because who needs real memory when you can abstract the problem away?",
];

const COMPRESSOR: string[] = [
  "The compressor is squeezing memory like I squeeze Baldrick for information.",
  "macOS compressor active. Your RAM is being folded like a bad treaty.",
  "Compression engaged. The kernel is performing feats of desperation I find relatable.",
  "Your memory is being vacuum-packed. Like a budget airline seat. For bytes.",
];

// ── Template substitution ──────────────────────────────────────────

function substitute(q: string, data: AuditData): string {
  const pct = data.system.totalMB > 0
    ? Math.round((data.system.usedMB / data.system.totalMB) * 100)
    : 0;
  const containerMem = data.docker.containers.reduce(
    (s, c) => s + (parseFloat(c.mem) || 0), 0
  );
  return q
    .replace(/\{pct\}/g, String(pct))
    .replace(/\{n\}/g, String(data.totalInstances))
    .replace(/\{alloc\}/g, data.docker.colimaAlloc)
    .replace(/\{actual\}/g, fmtMB(containerMem));
}

// ── Public API ─────────────────────────────────────────────────────
// Returns mood + full pool of candidate quips (already substituted).
// The caller picks which quip to display using its own rotation timer
// so quips don't flicker on data refresh.

export function getBuddyState(data: AuditData | null): BuddyState {
  if (!data) return { mood: "chill", pool: ["Booting up. Adjusting crown. Calibrating cunning..."] };

  const pct = data.system.totalMB > 0
    ? (data.system.usedMB / data.system.totalMB) * 100
    : 0;
  const hasSwap = data.system.swap ? parseFloat(data.system.swap.used) > 0 : false;
  const manyAgents = data.totalInstances > 4;
  const dockerHeavy = data.docker.vmActual > 500 &&
    data.docker.containers.reduce((s, c) => s + (parseFloat(c.mem) || 0), 0) < data.docker.vmActual * 0.3;
  const compressorBusy = data.system.compMB > data.system.totalMB * 0.15;

  // Collect contextual quips from live state
  const ctx = [
    ...sessionQuips(data.sessions),
    ...anomalyQuips(data.anomalies),
    ...procQuips(data),
  ];

  let mood: Mood;
  let base: string[];

  if (hasSwap)             { mood = "crisis";  base = SWAP; }
  else if (pct > 90)       { mood = "crisis";  base = CRITICAL; }
  else if (pct > 75)       { mood = "alarmed"; base = HIGH; }
  else if (manyAgents)     { mood = "wary";    base = AGENTS; }
  else if (dockerHeavy)    { mood = "wary";    base = DOCKER; }
  else if (compressorBusy) { mood = "wary";    base = COMPRESSOR; }
  else if (pct > 50)       { mood = "wary";    base = MEDIUM; }
  else if (pct > 20)       { mood = "chill";   base = LOW; }
  else                     { mood = "chill";   base = IDLE; }

  // Interleave contextual and pool quips for variety
  const pool = [...base, ...ctx].map(q => substitute(q, data));

  return { mood, pool };
}
