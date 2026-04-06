import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { AuditData } from "../../core/index";

interface Props {
  data: AuditData | null;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;
}

export function PromptOverlay(props: Props) {
  const [text, setText] = createSignal("");

  useKeyboard((key: any) => {
    const name: string = typeof key === "string" ? key : (key?.name ?? "");
    if (name === "return" || name === "enter") {
      const t = text().trim();
      if (t) props.onSubmit(t);
    }
    if (name === "Escape" || name === "escape") {
      props.onClose();
    }
  });

  const context = () => {
    if (!props.data) return "no data yet";
    const d = props.data;
    return `${d.totalInstances} instances  ${fmtMB(d.totalClaudeMem)}  ${d.system.used} RAM used`;
  };

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor="#58a6ff"
        title=" ASK CLAUDE "
        titleAlignment="center"
        paddingX={3}
        paddingY={1}
        width={62}
      >
        {/* Context summary */}
        <box flexDirection="row" marginTop={1}>
          <text fg="#4d5566">context  </text>
          <text fg="#8b949e">{context()}</text>
        </box>
        <box flexDirection="row">
          <text fg="#4d5566">includes  </text>
          <text fg="#8b949e">CLAUDE.md + project memory + audit data</text>
        </box>

        <box marginTop={1} marginBottom={1}>
          <text fg="#4d5566">{"─".repeat(52)}</text>
        </box>

        {/* Prompt input */}
        <box marginBottom={1}>
          <text fg="#c9d1d9">What would you like Claude to do?</text>
        </box>

        <input
          value={text()}
          onInput={(v: string) => setText(v)}
          placeholder="e.g. kill idle sessions, list memory hogs..."
          focused
          width={56}
        />

        <box marginTop={1}>
          <text fg="#4d5566">{"─".repeat(52)}</text>
        </box>

        <box flexDirection="row" marginTop={1}>
          <text fg="#58a6ff">Enter </text>
          <text fg="#8b949e">open in-TUI session  </text>
          <text fg="#58a6ff">Esc </text>
          <text fg="#8b949e">cancel</text>
        </box>
      </box>
    </box>
  );
}
