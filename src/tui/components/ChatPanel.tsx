import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { AuditData } from "../../core/index";
import { loadContext, buildSystemPrompt } from "../../core/context";
import { ChatSession, makeToolExecutor } from "../../core/chat-session";
import type { ToolUse, ConfirmHandler } from "../../core/chat-session";
import type { LazyMemContext } from "../../core/context";

interface Props {
  userPrompt: string;
  data: AuditData | null;
  onClose: () => void;
}

type Phase = "loading" | "idle" | "streaming" | "confirming" | "error";

interface DisplayMsg {
  kind: "user" | "assistant" | "tool_start" | "tool_result" | "error";
  text: string;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function ChatPanel(props: Props) {
  const dims = useTerminalDimensions();

  const [phase, setPhase] = createSignal<Phase>("loading");
  const [messages, setMessages] = createSignal<DisplayMsg[]>([]);
  const [streamBuf, setStreamBuf] = createSignal("");
  const [inputText, setInputText] = createSignal("");
  const [spinFrame, setSpinFrame] = createSignal(0);
  const [pendingTool, setPendingTool] = createSignal<ToolUse | null>(null);
  const [errorMsg, setErrorMsg] = createSignal("");

  let session: ChatSession | null = null;
  let ctx: LazyMemContext | null = null;
  let confirmResolve: ((v: boolean) => void) | null = null;

  const spinId = setInterval(() => setSpinFrame(f => (f + 1) % SPINNER.length), 80);
  onCleanup(() => clearInterval(spinId));

  useKeyboard((key: any) => {
    const name: string = typeof key === "string" ? key : (key?.name ?? "");

    // Confirmation dialog intercepts all keys
    if (phase() === "confirming") {
      if (name === "y" && confirmResolve) {
        const r = confirmResolve;
        confirmResolve = null;
        setPendingTool(null);
        setPhase("streaming");
        r(true);
      } else if ((name === "n" || name === "Escape" || name === "escape") && confirmResolve) {
        const r = confirmResolve;
        confirmResolve = null;
        setPendingTool(null);
        setPhase("streaming");
        r(false);
      }
      return;
    }

    if (name === "Escape" || name === "escape") {
      if (phase() === "idle" || phase() === "error") props.onClose();
      return;
    }

    if (phase() === "idle" && (name === "return" || name === "enter")) {
      const text = inputText().trim();
      if (text && session && ctx) {
        setInputText("");
        sendMessage(text);
      }
    }
  });

  async function sendMessage(text: string) {
    if (!session || !ctx) return;

    setMessages(m => [...m, { kind: "user", text }]);
    setPhase("streaming");
    setStreamBuf("");

    const onConfirm: ConfirmHandler = async (tool: ToolUse) => {
      setPendingTool(tool);
      setPhase("confirming");
      return new Promise<boolean>(resolve => {
        confirmResolve = resolve;
      });
    };

    const executor = makeToolExecutor(ctx, onConfirm);
    const gen = session.send(text, executor);

    for await (const event of gen) {
      if (event.type === "text_delta") {
        setStreamBuf(b => b + event.text);
      } else if (event.type === "tool_start") {
        // flush any text accumulated before the tool call
        const buf = streamBuf().trim();
        if (buf) {
          setMessages(m => [...m, { kind: "assistant", text: buf }]);
          setStreamBuf("");
        }
        setMessages(m => [...m, { kind: "tool_start", text: event.name }]);
      } else if (event.type === "tool_result") {
        const preview = event.content.split("\n").slice(0, 3).join("\n");
        setMessages(m => [...m, { kind: "tool_result", text: preview }]);
        setStreamBuf("");
      } else if (event.type === "message_end") {
        const buf = streamBuf().trim();
        if (buf) {
          setMessages(m => [...m, { kind: "assistant", text: buf }]);
          setStreamBuf("");
        }
        setPhase("idle");
      } else if (event.type === "error") {
        const buf = streamBuf().trim();
        if (buf) {
          setMessages(m => [...m, { kind: "assistant", text: buf }]);
          setStreamBuf("");
        }
        setErrorMsg(event.message);
        setPhase("error");
      }
    }
  }

  onMount(async () => {
    if (!props.data) {
      setErrorMsg("No audit data available.");
      setPhase("error");
      return;
    }

    try {
      ctx = await loadContext(props.data);
      session = new ChatSession(buildSystemPrompt(ctx));
      setPhase("idle");
      sendMessage(props.userPrompt);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to initialize session.");
      setPhase("error");
    }
  });

  // Render messages as a flat list of lines, clamped to the visible area
  const displayLines = () => {
    const h = dims().height;
    // reserve: 3 header + 2 borders + 3 input/status + 2 padding = ~10
    const maxLines = Math.max(6, h - 10);
    const lines: string[] = [];

    for (const msg of messages()) {
      if (msg.kind === "user") {
        lines.push(`you  ${msg.text}`, "");
      } else if (msg.kind === "assistant") {
        // Split on newlines from the response
        const textLines = msg.text.split("\n");
        lines.push(...textLines, "");
      } else if (msg.kind === "tool_start") {
        lines.push(`  [${msg.text}...]`);
      } else if (msg.kind === "tool_result") {
        const preview = msg.text.split("\n")[0];
        lines.push(`  -> ${preview}`, "");
      } else if (msg.kind === "error") {
        lines.push(`  error: ${msg.text}`, "");
      }
    }

    // Append streaming buffer inline
    if (streamBuf()) {
      lines.push(...streamBuf().split("\n"));
    }

    return lines.slice(-maxLines).join("\n");
  };

  const statusText = () => {
    switch (phase()) {
      case "loading":    return `${SPINNER[spinFrame()]} loading context...`;
      case "streaming":  return `${SPINNER[spinFrame()]} responding...`;
      case "confirming": return `${SPINNER[spinFrame()]} waiting for confirmation`;
      case "idle":       return `${messages().length} msgs`;
      case "error":      return `error: ${errorMsg().slice(0, 60)}`;
    }
  };

  const statusColor = () => {
    switch (phase()) {
      case "loading":
      case "streaming":  return "#d29922";
      case "confirming": return "#58a6ff";
      case "idle":       return "#3fb950";
      case "error":      return "#f85149";
    }
  };

  const tool = () => pendingTool();

  return (
    <box flexGrow={1} flexDirection="column">

      {/* Header */}
      <box
        height={3}
        flexDirection="row"
        border
        borderStyle="rounded"
        borderColor="#8957e5"
        paddingX={1}
        alignItems="center"
      >
        <text fg="#8957e5">memory chat  </text>
        <text fg={statusColor()}>{statusText()}</text>
        <text fg="#4d5566">  │  </text>
        <text fg="#8b949e">Esc back</text>
      </box>

      {/* Message history */}
      <box
        flexGrow={1}
        border
        borderStyle="rounded"
        borderColor="#30363d"
        paddingX={1}
        paddingY={1}
        overflow="hidden"
      >
        <Show
          when={displayLines().length > 0}
          fallback={
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg="#4d5566">{statusText()}</text>
            </box>
          }
        >
          <text fg="#c9d1d9">{displayLines()}</text>
        </Show>
      </box>

      {/* Confirmation dialog */}
      <Show when={phase() === "confirming" && tool() !== null}>
        <box
          height={6}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor="#f0883e"
          paddingX={2}
          paddingY={1}
        >
          <box flexDirection="row">
            <text fg="#f0883e">confirm  </text>
            <text fg="#c9d1d9">{tool()!.name}</text>
          </box>
          <box>
            <text fg="#8b949e">{JSON.stringify(tool()!.input).slice(0, 100)}</text>
          </box>
          <box flexDirection="row" marginTop={1}>
            <text fg="#3fb950">y  proceed    </text>
            <text fg="#f85149">n  cancel</text>
          </box>
        </box>
      </Show>

      {/* Input row: active when idle */}
      <Show when={phase() === "idle"}>
        <box
          height={3}
          flexDirection="row"
          border
          borderStyle="rounded"
          borderColor="#21262d"
          paddingX={1}
          alignItems="center"
        >
          <text fg="#4d5566">  </text>
          <input
            value={inputText()}
            onInput={(v: string) => setInputText(v)}
            placeholder="follow up..."
            focused
            flexGrow={1}
          />
          <text fg="#4d5566">  Esc back</text>
        </box>
      </Show>

      {/* Status row: shown when not idle */}
      <Show when={phase() !== "idle"}>
        <box
          height={3}
          flexDirection="row"
          border
          borderStyle="rounded"
          borderColor="#21262d"
          paddingX={1}
          alignItems="center"
        >
          <text fg={statusColor()}>{statusText()}</text>
          <Show when={phase() === "error"}>
            <text fg="#4d5566">  │  </text>
            <text fg="#8b949e">Esc back</text>
          </Show>
        </box>
      </Show>

    </box>
  );
}
