import type { AuditData } from "../core/types";

export interface BuddyState {
  face: string;
  quip: string;
  mood: "chill" | "wary" | "alarmed" | "crisis";
}

const FACES = {
  chill:   " \u25E0\u203F\u25E0 ",
  wary:    " \u25C9_\u25C9 ",
  alarmed: " \u2299_\u2299 ",
  crisis:  " \u00D7_\u00D7 ",
};

// ── Quip pools keyed by trigger condition ──────────────────────────

const LOW: string[] = [
  "I say, the RAM is positively lounging about. How tediously civilized.",
  "Memory this relaxed? Either genius or you haven't opened Chrome yet.",
  "Smoother than Baldrick's last cunning plan. Which, admittedly, is a low bar.",
  "All quiet on the memory front. Almost suspiciously quiet.",
  "Your system is running with the effortless grace of a well-bribed butler.",
];

const MEDIUM: string[] = [
  "Memory's creeping up. I have a cunning plan involving that browser from 2024.",
  "The RAM situation is what we call 'interesting'. By interesting, I mean concerning.",
  "Not to alarm you, but we're entering 'maybe close a tab' territory.",
  "Usage is rising like Baldrick's confidence before a spectacularly bad idea.",
  "We're at the 'perhaps reconsider that third IDE' stage of the evening.",
];

const HIGH: string[] = [
  "I have a cunning plan, sir. What if we... freed some memory?",
  "Your RAM is more packed than a Victorian workhouse. Downsizing, perhaps?",
  "We're deep in the 'abandon hope, all ye who malloc here' zone.",
  "If memory were a ship, we'd be rearranging deck chairs on the Titanic.",
  "The situation is dire. Even Baldrick would notice, and he once mistook a turnip for his mother.",
];

const CRITICAL: string[] = [
  "DEFCON BALDRICK. I repeat, DEFCON BALDRICK.",
  "This is more dire than Baldrick's personal hygiene. We must act.",
  "My cunning plans have run out. This calls for actual competence.",
  "We've gone beyond 'cunning plan' and into 'blind panic' territory.",
  "The kernel is writing its memoirs. In swap. On a spinning disk. We're doomed.",
];

const SWAP: string[] = [
  "Swapping to disk? The computational equivalent of sleeping in the gutter.",
  "Swap active. Even Baldrick would call this a turnip of a situation.",
  "Your SSD is doing RAM's job now. This is like asking the butler to do surgery.",
  "Disk swap detected. We have descended below the floor of acceptable computing.",
];

const AGENTS: string[] = [
  "You've spawned more agents than the British Empire had colonies. Perhaps a cull?",
  "{n} Claude agents. That's not multitasking, that's a parliamentary session.",
  "Each agent thinks it's the protagonist. {n} protagonists, zero RAM to go around.",
  "Running {n} agents simultaneously. Bold. Reckless. Baldrick-esque, one might say.",
  "I count {n} agents. That's {n} opinions and one increasingly nervous kernel.",
];

const DOCKER: string[] = [
  "Your Docker containers eat RAM like Baldrick eats turnips.",
  "Colima is hoarding {alloc} for containers using {actual}. Even the Treasury would blush.",
  "The containers are comfortable. Your RAM, however, is not.",
  "Docker: because why use memory efficiently when you can virtualize the problem?",
];

const COMPRESSOR: string[] = [
  "The compressor is working overtime. Memory squeezed like a tax collector's heart.",
  "macOS compressor engaged. Your RAM is being vacuum-packed like a budget airline seat.",
  "Compression active. The kernel is playing Tetris with your memory, and losing.",
];

const IDLE: string[] = [
  "I'm just here, watching the bytes go by. Existential, isn't it?",
  "Another refresh cycle, another chance to judge your process management.",
  "Monitoring memory so you don't have to. You're welcome.",
  "Still here. Still sardonic. Still more useful than Baldrick.",
];

// ── Quip selection engine ──────────────────────────────────────────

let lastQuip = "";
let quipCounter = 0;

function pick(pool: string[], data?: AuditData): string {
  // Rotate through the pool rather than random, so each refresh gets a new one
  quipCounter++;
  let q = pool[quipCounter % pool.length];

  // Template substitution
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
  if (!data) return { face: FACES.chill, quip: "Collecting intel...", mood: "chill" };

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

  // Priority: swap > critical > high > agents > docker > compressor > medium > low > idle
  if (hasSwap) {
    return { face: FACES.crisis, quip: pick(SWAP, data), mood: "crisis" };
  }
  if (pct > 90) {
    return { face: FACES.crisis, quip: pick(CRITICAL, data), mood: "crisis" };
  }
  if (pct > 75) {
    return { face: FACES.alarmed, quip: pick(HIGH, data), mood: "alarmed" };
  }
  if (manyAgents) {
    return { face: FACES.wary, quip: pick(AGENTS, data), mood: "wary" };
  }
  if (dockerHeavy) {
    return { face: FACES.wary, quip: pick(DOCKER, data), mood: "wary" };
  }
  if (compressorBusy) {
    return { face: FACES.wary, quip: pick(COMPRESSOR, data), mood: "wary" };
  }
  if (pct > 50) {
    return { face: FACES.wary, quip: pick(MEDIUM, data), mood: "wary" };
  }
  if (pct > 20) {
    return { face: FACES.chill, quip: pick(LOW, data), mood: "chill" };
  }

  return { face: FACES.chill, quip: pick(IDLE, data), mood: "chill" };
}
