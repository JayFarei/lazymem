import { createMemo } from "solid-js";
import type { AuditData } from "../../core/types";
import { getBuddyState } from "../buddyQuips";

interface Props {
  data: AuditData | null;
  panelWidth?: number;
}

// Drizzk — LEGENDARY SHINY robot companion
// A corroded chrome oracle who debugs flawlessly but refuses to explain fixes,
// instead muttering about "the drizzle of '09" and how modern allocators lack grit.

const FACES: Record<string, string[]> = {
  chill: [
    "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
    "  \u2502\u25C9 \u2583 \u25C9\u2502 ",
    "  \u2502 \u2594\u2594\u2594 \u2502 ",
    "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
    "    \u2502 \u2502   ",
  ],
  wary: [
    "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
    "  \u2502\u25C8 \u2583 \u25C8\u2502 ",
    "  \u2502 \u2500\u2500\u2500 \u2502 ",
    "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
    "    \u2502 \u2502   ",
  ],
  alarmed: [
    "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
    "  \u2502\u2299 \u2583 \u2299\u2502 ",
    "  \u2502 \u25CB\u25CB\u25CB \u2502 ",
    "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
    "    \u2502 \u2502   ",
  ],
  crisis: [
    "  \u250C\u2500\u2500\u2500\u2500\u2500\u2510 ",
    "  \u2502\u00D7 \u2583 \u00D7\u2502 ",
    "  \u2502 \u2588\u2588\u2588 \u2502 ",
    "  \u2514\u2500\u252C\u2500\u252C\u2500\u2518 ",
    "    \u2502 \u2502   ",
  ],
};

const FACE_WIDTH = 10; // visual width of the face block

const EYE_COLORS: Record<string, string> = {
  chill:   "#58a6ff",
  wary:    "#d29922",
  alarmed: "#f0883e",
  crisis:  "#f85149",
};

export function BuddyPanel(props: Props) {
  const buddy = createMemo(() => getBuddyState(props.data));
  const eyeColor = createMemo(() => EYE_COLORS[buddy().mood] ?? "#8b949e");
  const face = createMemo(() => FACES[buddy().mood] ?? FACES.chill);

  // Wrap quip to fit beside the face, inside the speech bubble
  const bubbleW = createMemo(() => Math.max(16, (props.panelWidth ?? 40) - FACE_WIDTH - 6));

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

  // Build the speech bubble lines
  const bubble = createMemo(() => {
    const ql = quipLines();
    const w = bubbleW();
    const top    = `\u256D${ "\u2500".repeat(w + 2)}\u256E`;
    const bottom = `\u2570${ "\u2500".repeat(w + 2)}\u256F`;
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
      title=" drizzk "
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
