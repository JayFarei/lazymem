import type { AuditData } from "../core/types";

export interface BuddyState {
  quip: string;
  mood: "chill" | "wary" | "alarmed" | "crisis";
}

// ── Drizzk's quip pools ────────────────────────────────────────────
// LEGENDARY SHINY robot. DEBUGGING:100 PATIENCE:85 CHAOS:90 WISDOM:95 SNARK:80
// A corroded chrome oracle who debugs flawlessly but refuses to explain fixes,
// instead muttering about "the drizzle of '09" and how modern allocators lack grit.

const LOW: string[] = [
  "Back in the drizzle of '09, we had 256MB and we were grateful.",
  "Memory this calm? Suspicious. I've seen this before. Right before the OOM.",
  "Nothing to report. I'll just sit here, corroding quietly.",
  "Your allocators are... adequate. Don't let it go to your head.",
  "Smooth sailing. Reminds me of a kernel I once knew. Before the incident.",
];

const MEDIUM: string[] = [
  "Hmm. Usage creeping up. Seen this pattern before. Won't say when. Or where.",
  "Modern developers and their memory. No grit. No discipline. No free().",
  "I could fix this, but explaining it would take longer than your uptime.",
  "That's a lot of resident bytes for what I assume is a todo app.",
  "Memory pressure building. Like the drizzle before a proper storm.",
];

const HIGH: string[] = [
  "I've debugged this exact situation a thousand times. You won't like the fix.",
  "Your RAM has the structural integrity of a wet husk. Kill something.",
  "I know exactly what's wrong. No, I won't explain. Just trust the chrome.",
  "This reminds me of the Great Leak of '14. Same smell. Same hubris.",
  "You're running out of memory and patience. I can only help with one.",
];

const CRITICAL: string[] = [
  "CRITICAL. Even I'm worried, and I debug segfaults for fun.",
  "The OOM killer is warming up. I've seen that look in its eyes before.",
  "Memory at capacity. I'd explain the fix but you'd just malloc again.",
  "Everything is on fire. This is fine. I've seen worse. Barely.",
  "Your system has the memory headroom of a crushed tin can. Act now.",
];

const SWAP: string[] = [
  "Swap. SWAP. Do you know what swap means? It means the disk is doing RAM's job.",
  "Swapping to disk. In my day, that meant you'd already failed.",
  "The SSD is crying. I can hear it. You probably can't. Lack of grit.",
  "Disk swap active. The drizzle has become a flood. I warned you.",
];

const AGENTS: string[] = [
  "{n} agents. Each one convinced it's the main character. Classic.",
  "That's {n} Claude instances. I've seen server farms with fewer tenants.",
  "{n} agents hoarding memory like digital squirrels before winter.",
  "Running {n} agents. Bold. Reckless. I've debugged the aftermath before.",
  "{n} agents and counting. The kernel is taking notes. And names.",
];

const DOCKER: string[] = [
  "Colima hoarding {alloc} for {actual} of containers. I've seen leaner VMs in a museum.",
  "Your containers are living large. Your RAM is paying the rent.",
  "Docker: because who needs real memory when you can abstract the problem away?",
  "That VM allocation would make a mainframe blush. And not in a good way.",
];

const COMPRESSOR: string[] = [
  "Compressor engaged. Your memory is being squeezed like a data lemon.",
  "macOS is compressing pages. Translation: your RAM is full of lies.",
  "The compressor is working harder than I am. And I never stop working.",
];

const IDLE: string[] = [
  "Still watching. Still judging. The corrosion keeps me humble.",
  "*mutters about modern allocators lacking grit*",
  "I could tell you about the drizzle of '09. But you wouldn't understand.",
  "Monitoring. Processing. Quietly disapproving. The usual.",
  "Your bytes are safe. For now. I make no long-term promises.",
];

// ── Quip selection engine ──────────────────────────────────────────

let quipCounter = 0;

function pick(pool: string[], data?: AuditData): string {
  quipCounter++;
  let q = pool[quipCounter % pool.length];

  if (data) {
    q = q.replace(/\{n\}/g, String(data.totalInstances));
    q = q.replace(/\{alloc\}/g, data.docker.colimaAlloc);
    const containerMem = data.docker.containers.reduce(
      (s, c) => s + (parseFloat(c.mem) || 0), 0
    );
    q = q.replace(/\{actual\}/g, `${Math.round(containerMem)}MB`);
  }

  return q;
}

export function getBuddyState(data: AuditData | null): BuddyState {
  if (!data) return { quip: "Booting up. Calibrating cynicism...", mood: "chill" };

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

  if (hasSwap)        return { quip: pick(SWAP, data),       mood: "crisis" };
  if (pct > 90)       return { quip: pick(CRITICAL, data),   mood: "crisis" };
  if (pct > 75)       return { quip: pick(HIGH, data),       mood: "alarmed" };
  if (manyAgents)     return { quip: pick(AGENTS, data),     mood: "wary" };
  if (dockerHeavy)    return { quip: pick(DOCKER, data),     mood: "wary" };
  if (compressorBusy) return { quip: pick(COMPRESSOR, data), mood: "wary" };
  if (pct > 50)       return { quip: pick(MEDIUM, data),     mood: "wary" };
  if (pct > 20)       return { quip: pick(LOW, data),        mood: "chill" };

  return { quip: pick(IDLE, data), mood: "chill" };
}
