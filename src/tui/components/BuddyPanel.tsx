import { createSignal, createMemo, onCleanup } from "solid-js";
import type { AuditData } from "../../core/types";
import { getBuddyState } from "../buddyQuips";

interface Props {
  data: AuditData | null;
  panelWidth?: number;
}

// ── Prince Edmund ──────────────────────────────────────────────────
// Species: royal  |  Eyes: *  |  Hat: crown
// A bumbling prince who believes every memory crisis can be solved
// with a cunning plan. Animated using the buddy-crack sprite system:
// 5-line frames, 12 chars wide, {E} eye placeholder, 15-step idle
// sequence at 500ms ticks.

// ── Sprite frames (5 lines x 12 chars each) ───────────────────────
// Line 0 = hat slot (blank unless hat/effect)
// Lines 1-4 = body

const FRAMES = [
  // Frame 0: rest
  [
    '   \\^^^/    ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__.  ) ',
    '  `------´  ',
  ],
  // Frame 1: fidget (eyebrow raise, smirk)
  [
    '   \\^^^/    ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__>  ) ',
    '  `------´  ',
  ],
  // Frame 2: special (plotting, hand raised)
  [
    '   \\^^^/ o  ',
    '  .------.  ',
    ' ( {E}    {E} ) ',
    ' (  .__.  ) ',
    '  `------´| ',
  ],
];

const EYE = '*';
const BLINK_EYE = '-';
const SPRITE_W = 12;

// Mood affects eye character and color, not sprite shape
const MOOD_EYES: Record<string, string> = {
  chill:   '*',
  wary:    'o',
  alarmed: 'O',
  crisis:  'x',
};

const MOOD_COLORS: Record<string, string> = {
  chill:   '#d29922',  // gold (legendary rarity color)
  wary:    '#d29922',
  alarmed: '#f0883e',
  crisis:  '#f85149',
};

// 15-step idle sequence from the buddy system: 0=rest, 1=fidget, 2=special, -1=blink
const IDLE_SEQ = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
const TICK_MS = 500;

// ── Speech bubble builder ──────────────────────────────────────────

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
  // Pointer on line 1 connects bubble to character
  const top = ` .${'-'.repeat(w + 2)}.`;
  const ptr = `<  ${wrapped[0]?.padEnd(w) ?? ''.padEnd(w)}  |`;
  const mid = wrapped.slice(1).map(l => `|  ${l.padEnd(w)}  |`);
  const bot = ` '${'-'.repeat(w + 2)}'`;
  return [top, ptr, ...mid, bot];
}

// ── Component ──────────────────────────────────────────────────────

export function BuddyPanel(props: Props) {
  const [tick, setTick] = createSignal(0);
  const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
  onCleanup(() => clearInterval(timer));

  // Quip only updates when data changes (not on animation tick)
  const buddy = createMemo(() => getBuddyState(props.data));
  const mood = createMemo(() => buddy().mood);
  const spriteColor = createMemo(() => MOOD_COLORS[mood()] ?? '#d29922');

  // Animation: pick frame + eye from idle sequence
  const eye = createMemo(() => {
    const seqIdx = tick() % IDLE_SEQ.length;
    const hint = IDLE_SEQ[seqIdx];
    if (hint === -1) return BLINK_EYE;
    return MOOD_EYES[mood()] ?? EYE;
  });

  const frameIdx = createMemo(() => {
    const seqIdx = tick() % IDLE_SEQ.length;
    const hint = IDLE_SEQ[seqIdx];
    if (hint === -1) return 0; // blink uses rest pose
    return hint % FRAMES.length;
  });

  const sprite = createMemo(() =>
    FRAMES[frameIdx()].map(line => line.replaceAll('{E}', eye()))
  );

  // Speech bubble: stable between data refreshes
  const bubbleW = createMemo(() => Math.max(12, (props.panelWidth ?? 40) - SPRITE_W - 5));
  const bubble = createMemo(() => buildBubble(buddy().quip, bubbleW()));

  // Compose: sprite on left, bubble on right, vertically centered
  const totalH = createMemo(() => Math.max(sprite().length, bubble().length));

  const spriteOffset = createMemo(() =>
    Math.max(0, Math.floor((totalH() - sprite().length) / 2))
  );
  const bubbleOffset = createMemo(() =>
    Math.max(0, Math.floor((totalH() - bubble().length) / 2))
  );

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
        const si = i - spriteOffset();
        const bi = i - bubbleOffset();
        const sLine = (si >= 0 && si < sprite().length) ? sprite()[si] : ' '.repeat(SPRITE_W);
        const bLine = (bi >= 0 && bi < bubble().length) ? bubble()[bi] : '';
        return (
          <box flexDirection="row" height={1}>
            <text fg={spriteColor()}>{sLine}</text>
            <text fg="#484f58">{bLine}</text>
          </box>
        );
      })}
    </box>
  );
}
