import { useKeyboard } from "@opentui/solid";

interface Props {
  onClose: () => void;
}

const KEYS: Array<[string, string, string]> = [
  ["r",       "#58a6ff", "refresh data"],
  ["Tab",     "#58a6ff", "cycle focus  sys → agents → dev → docker"],
  ["1–4",     "#58a6ff", "jump to panel directly"],
  ["j / ↓",  "#58a6ff", "navigate down within focused panel"],
  ["k / ↑",  "#58a6ff", "navigate up within focused panel"],
  ["g",       "#58a6ff", "fullscreen focused panel  (g or Esc to exit)"],
  ["?",       "#58a6ff", "toggle this help"],
  ["Esc",     "#58a6ff", "exit fullscreen or close help"],
  ["q",       "#58a6ff", "quit"],
];

export function HelpOverlay(props: Props) {
  useKeyboard((key: any) => {
    const name: string = typeof key === "string" ? key : (key?.name ?? "");
    if (name === "?" || name === "Escape" || name === "escape") props.onClose();
  });

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor="#58a6ff"
        title=" help "
        titleAlignment="center"
        paddingX={3}
        paddingY={1}
        width={58}
      >
        <box flexDirection="row" marginBottom={1}>
          <text fg="#21262d">{"─".repeat(48)}</text>
        </box>

        {KEYS.map(([key, color, desc]) => (
          <box flexDirection="row" marginBottom={1}>
            <text fg={color}>{key.padEnd(10)}</text>
            <text fg="#c9d1d9">{desc}</text>
          </box>
        ))}

        <box flexDirection="row" marginTop={1} marginBottom={1}>
          <text fg="#21262d">{"─".repeat(48)}</text>
        </box>

        <box>
          <text fg="#8b949e">panels: </text>
          <text fg="#58a6ff">sys  </text>
          <text fg="#3fb950">agents  </text>
          <text fg="#d29922">dev  </text>
          <text fg="#8957e5">docker</text>
        </box>
        <box marginTop={1}>
          <text fg="#4d5566">focused panel expands, others compress</text>
        </box>
        <box marginTop={1}>
          <text fg="#4d5566">? or Esc to close</text>
        </box>
      </box>
    </box>
  );
}
