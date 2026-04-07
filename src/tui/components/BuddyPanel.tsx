import { createSignal, createMemo, onCleanup } from "solid-js";
import type { AuditData } from "../../core/types";
import { getBuddyState } from "../buddyQuips";

interface Props {
  data: AuditData | null;
  panelWidth?: number;
}

// ── Prince Edmund ──────────────────────────────────────────────────
// A bumbling royal who believes he has a cunning plan for every
// memory crisis. Animated with idle fidgets and mood-reactive eyes.

// Each mood has an animation sequence of frames. The face is 7 chars
// wide visually. Frames cycle to give Edmund life.
//
// Legend:
//   Row 0: crown
//   Row 1: head top
//   Row 2: eyes + nose
//   Row 3: mouth
//   Row 4: head bottom
//   Row 5: body
//   Row 6: legs

type Frame = string[];

const ANIM: Record<string, Frame[]> = {
  chill: [
    // Frame 0: eyes center, relaxed smile
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u00B7 \u2583 \u00B7\u2502 ",
      "  \u2502 \u203F\u203F\u203F \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 1: eyes left, slight lean
    [
      "   \u2655     ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u00B7\u00B7\u2583  \u2502 ",
      "  \u2502 \u203F\u203F\u203F \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 2: eyes center, blink
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u2500 \u2583 \u2500\u2502 ",
      "  \u2502 \u203F\u203F\u203F \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 3: eyes right
    [
      "     \u2655   ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502  \u2583 \u00B7\u00B7\u2502 ",
      "  \u2502 \u203F\u203F\u203F \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
  ],
  wary: [
    // Frame 0: worried eyes center
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u25C9 \u2583 \u25C9\u2502 ",
      "  \u2502 \u2500\u2500\u2500 \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 1: glance left nervously
    [
      "   \u2655     ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u25C9\u25C9\u2583  \u2502 ",
      "  \u2502 \u2500\u2500\u2500 \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 2: worried blink
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u2500 \u2583 \u2500\u2502 ",
      "  \u2502  ~  \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 3: glance right nervously
    [
      "     \u2655   ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502  \u2583\u25C9\u25C9\u2502 ",
      "  \u2502 \u2500\u2500\u2500 \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
  ],
  alarmed: [
    // Frame 0: wide eyes
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u2299 \u2583 \u2299\u2502 ",
      "  \u2502 \u25CB\u25CB\u25CB \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 1: recoil left
    [
      "   \u2655     ",
      " \u250C\u2500\u2500\u2500\u2500\u2500\u2510  ",
      " \u2502\u2299 \u2583 \u2299\u2502  ",
      " \u2502 \u25CB\u25CB\u25CB \u2502  ",
      " \u2514\u2500\u252C\u2500\u252C\u2500\u2518  ",
      "  \u250C\u2534\u2500\u2534\u2510   ",
      "  \u2514\u2500\u2510\u250C\u2500\u2518   ",
    ],
    // Frame 2: shaking
    [
      "     \u2655   ",
      "   \u250C\u2500\u2500\u2500\u2500\u2500\u2510",
      "   \u2502\u2299 \u2583 \u2299\u2502",
      "   \u2502 \u25CB\u25CB\u25CB \u2502",
      "   \u2514\u2500\u252C\u2500\u252C\u2500\u2518",
      "    \u250C\u2534\u2500\u2534\u2510 ",
      "    \u2514\u2500\u2510\u250C\u2500\u2518 ",
    ],
    // Frame 3: wide eyes blink
    [
      "    \u2655    ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502> \u2583 <\u2502 ",
      "  \u2502 \u25CB\u25CB\u25CB \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
  ],
  crisis: [
    // Frame 0: X eyes, crown askew
    [
      "      \u2655  ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u00D7 \u2583 \u00D7\u2502 ",
      "  \u2502 \u2588\u2588\u2588 \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      "   \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
    // Frame 1: flailing left
    [
      "  \u2655      ",
      " \u250C\u2500\u2500\u2500\u2500\u2500\u2510  ",
      " \u2502\u00D7 \u2583 \u00D7\u2502  ",
      " \u2502 \u2588\u2588\u2588 \u2502  ",
      " \u2514\u2500\u252C\u2500\u252C\u2500\u2518  ",
      "  \u250C\u2534\u2500\u2534\u2510   ",
      "  \u2514\u2500\u2510\u250C\u2500\u2518   ",
    ],
    // Frame 2: flailing right
    [
      "       \u2655 ",
      "   \u250C\u2500\u2500\u2500\u2500\u2500\u2510",
      "   \u2502\u00D7 \u2583 \u00D7\u2502",
      "   \u2502 \u2588\u2588\u2588 \u2502",
      "   \u2514\u2500\u252C\u2500\u252C\u2500\u2518",
      "    \u250C\u2534\u2500\u2534\u2510 ",
      "    \u2514\u2500\u2510\u250C\u2500\u2518 ",
    ],
    // Frame 3: crown falling
    [
      "         ",
      "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
      "  \u2502\u00D7 \u2583 \u00D7\u2502 ",
      "  \u2502 \u2588\u2588\u2588 \u2502 ",
      "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
      "   \u250C\u2534\u2500\u2534\u2510  ",
      " \u2655 \u2514\u2500\u2510\u250C\u2500\u2518  ",
    ],
  ],
};

const FACE_WIDTH = 10;
const FRAME_MS = 800;

const EYE_COLORS: Record<string, string> = {
  chill:   "#58a6ff",
  wary:    "#d29922",
  alarmed: "#f0883e",
  crisis:  "#f85149",
};

export function BuddyPanel(props: Props) {
  const [frame, setFrame] = createSignal(0);
  const timer = setInterval(() => setFrame(f => f + 1), FRAME_MS);
  onCleanup(() => clearInterval(timer));

  const buddy = createMemo(() => getBuddyState(props.data));
  const mood = createMemo(() => buddy().mood);
  const eyeColor = createMemo(() => EYE_COLORS[mood()] ?? "#8b949e");
  const frames = createMemo(() => ANIM[mood()] ?? ANIM.chill);
  const face = createMemo(() => frames()[frame() % frames().length]);

  // Wrap quip to fit beside the face inside the speech bubble
  const bubbleW = createMemo(() => Math.max(14, (props.panelWidth ?? 40) - FACE_WIDTH - 6));

  const quipLines = createMemo(() => {
    const maxW = bubbleW();
    const words = buddy().quip.split(" ");
    const result: string[] = [];
    let line = "";
    for (const w of words) {
      if (line.length + w.length + 1 > maxW && line.length > 0) {
        result.push(line);
        line = w;
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line) result.push(line);
    return result;
  });

  const bubble = createMemo(() => {
    const ql = quipLines();
    const w = bubbleW();
    const top    = `\u256D${"\u2500".repeat(w + 2)}\u256E`;
    const bottom = `\u2570${"\u2500".repeat(w + 2)}\u256F`;
    const mid = ql.map(l => `\u2502 ${l.padEnd(w)} \u2502`);
    return [top, ...mid, bottom];
  });

  const totalLines = createMemo(() => Math.max(face().length, bubble().length));

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#444c56"
      title=" Prince Edmund "
      titleAlignment="left"
      paddingX={1}
      height={totalLines() + 2}
    >
      {Array.from({ length: totalLines() }, (_, i) => {
        const faceLine = face()[i] ?? " ".repeat(FACE_WIDTH);
        const bubbleLine = bubble()[i] ?? "";
        return (
          <box flexDirection="row" height={1}>
            <text fg={eyeColor()}>{faceLine}</text>
            <text fg="#6e7681">{bubbleLine}</text>
          </box>
        );
      })}
    </box>
  );
}
