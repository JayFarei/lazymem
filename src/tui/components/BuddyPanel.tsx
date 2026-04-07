import { createMemo } from "solid-js";
import type { AuditData } from "../../core/types";
import { getBuddyState } from "../buddyQuips";

interface Props {
  data: AuditData | null;
  panelWidth?: number;
}

const MOOD_COLORS: Record<string, string> = {
  chill:   "#3fb950",
  wary:    "#d29922",
  alarmed: "#f0883e",
  crisis:  "#f85149",
};

export function BuddyPanel(props: Props) {
  const buddy = createMemo(() => getBuddyState(props.data));
  const color = createMemo(() => MOOD_COLORS[buddy().mood] ?? "#8b949e");

  // Wrap quip text to fit inside the panel (border + padding + face = ~10 chars)
  const lines = createMemo(() => {
    const maxW = Math.max(20, (props.panelWidth ?? 40) - 10);
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

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#444c56"
      title=" memory buddy "
      titleAlignment="left"
      paddingX={1}
      height={Math.max(4, lines().length + 2)}
    >
      <box flexDirection="row" height={1}>
        <text fg={color()}>{buddy().face}</text>
        <text fg="#8b949e"> </text>
        <text fg={color()}>{lines()[0] ?? ""}</text>
      </box>
      {lines().slice(1).map(l => (
        <box flexDirection="row" height={1}>
          <text>      </text>
          <text fg={color()}>{l}</text>
        </box>
      ))}
    </box>
  );
}
