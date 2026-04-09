import { createSignal, createMemo, onCleanup } from "solid-js";
import type { AuditData } from "../../core/types";
import { getBuddyState } from "../buddyQuips";
import type { Mood } from "../buddyQuips";

interface Props {
  data: AuditData | null;
  panelWidth?: number;
}

// ── Prince Edmund ──────────────────────────────────────────────────
// Animated using buddy-crack sprite system: 5-line x 12-char frames,
// {E} eye placeholder, 15-step idle sequence at 500ms.
// Quip rotation is decoupled from data refresh to prevent flicker.

// ── Sprite frames ──────────────────────────────────────────────────

const FRAMES = [
  // Frame 0: rest
  [
    '   \\^^^/    ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__.  ) ',
    '  `------´  ',
  ],
  // Frame 1: fidget (smirk)
  [
    '   \\^^^/    ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__>  ) ',
    '  `------´  ',
  ],
  // Frame 2: special (plotting)
  [
    '   \\^^^/ o  ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__.  ) ',
    '  `------´| ',
  ],
];

const SPRITE_W = 12;

const MOOD_EYES: Record<string, string> = {
  chill: '*', wary: 'o', alarmed: 'O', crisis: 'x',
};

const MOOD_COLORS: Record<string, string> = {
  chill: '#d29922', wary: '#d29922', alarmed: '#f0883e', crisis: '#f85149',
};

// 15-step idle sequence: 0=rest, 1=fidget, 2=special, -1=blink
const IDLE_SEQ = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
const ANIM_MS = 500;
const QUIP_MS = 20_000; // rotate quip every 20s (independent of data refresh)
const DETERMINISTIC = process.env.LAZYMEM_DETERMINISTIC_BUDDY === "1"
  || process.env.LAZYMEM_FIXTURE !== undefined
  || process.env.LAZYMEM_BENCHMARK === "1";

// ── Speech bubble ──────────────────────────────────────────────────

function wrapText(text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > maxW && line.length > 0) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildBubble(text: string, maxW: number): string[] {
  const wrapped = wrapText(text, maxW);
  const w = Math.max(maxW, ...wrapped.map(l => l.length));
  const top = ` .${'-'.repeat(w + 2)}.`;
  const ptr = `<  ${wrapped[0]?.padEnd(w) ?? ''.padEnd(w)}  |`;
  const mid = wrapped.slice(1).map(l => `|  ${l.padEnd(w)}  |`);
  const bot = ` '${'-'.repeat(w + 2)}'`;
  return [top, ptr, ...mid, bot];
}

// ── Component ──────────────────────────────────────────────────────

export function BuddyPanel(props: Props) {
  // Animation tick (500ms) — drives sprite frames
  const [tick, setTick] = createSignal(0);
  const animTimer = DETERMINISTIC ? undefined : setInterval(() => setTick(t => t + 1), ANIM_MS);
  onCleanup(() => { if (animTimer) clearInterval(animTimer); });

  // Quip rotation tick (20s) — drives which quip from the pool is shown
  const [quipIdx, setQuipIdx] = createSignal(0);
  const quipTimer = DETERMINISTIC ? undefined : setInterval(() => setQuipIdx(i => i + 1), QUIP_MS);
  onCleanup(() => { if (quipTimer) clearInterval(quipTimer); });

  // Mood + pool recompute when data changes (instant, no flicker)
  const buddy = createMemo(() => getBuddyState(props.data));
  const mood = createMemo((): Mood => buddy().mood);
  const spriteColor = createMemo(() => MOOD_COLORS[mood()] ?? '#d29922');

  // Quip picked from pool using the rotation index (stable between data refreshes)
  const quip = createMemo(() => {
    const pool = buddy().pool;
    if (pool.length === 0) return '';
    return pool[quipIdx() % pool.length];
  });

  // Sprite animation
  const eye = createMemo(() => {
    const hint = IDLE_SEQ[tick() % IDLE_SEQ.length];
    return hint === -1 ? '-' : (MOOD_EYES[mood()] ?? '*');
  });

  const frameIdx = createMemo(() => {
    const hint = IDLE_SEQ[tick() % IDLE_SEQ.length];
    return hint === -1 ? 0 : (hint % FRAMES.length);
  });

  const sprite = createMemo(() =>
    FRAMES[frameIdx()].map(line => line.replaceAll('{E}', eye()))
  );

  // Bubble layout
  const bubbleW = createMemo(() => Math.max(12, (props.panelWidth ?? 40) - SPRITE_W - 5));
  const bubble = createMemo(() => buildBubble(quip(), bubbleW()));

  // Compose
  const totalH = createMemo(() => Math.max(sprite().length, bubble().length));
  const spriteOff = createMemo(() => Math.max(0, Math.floor((totalH() - sprite().length) / 2)));
  const bubbleOff = createMemo(() => Math.max(0, Math.floor((totalH() - bubble().length) / 2)));

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#444c56"
      title=" Prince Edmund "
      titleAlignment="left"
      paddingX={1}
      height={totalH() + 2}
    >
      {Array.from({ length: totalH() }, (_, i) => {
        const si = i - spriteOff();
        const bi = i - bubbleOff();
        const sLine = (si >= 0 && si < sprite().length) ? sprite()[si] : ' '.repeat(SPRITE_W);
        const bLine = (bi >= 0 && bi < bubble().length) ? bubble()[bi] : '';
        return (
          <box flexDirection="row" height={1}>
            <text fg={spriteColor()}>{sLine}</text>
            <text fg="#9198a1">{bLine}</text>
          </box>
        );
      })}
    </box>
  );
}
