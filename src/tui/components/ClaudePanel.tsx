import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { AuditData } from "../../core/index";
import * as os from "os";
import * as path from "path";

interface Props {
  userPrompt: string;
  data: AuditData | null;
  onClose: () => void;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;
}

async function loadMemoryContext(): Promise<string> {
  const home = os.homedir();
  const parts: string[] = [];
  try {
    const f = Bun.file(path.join(home, ".claude", "CLAUDE.md"));
    if (await f.exists()) parts.push("=== GLOBAL INSTRUCTIONS ===\n" + await f.text());
  } catch {}
  try {
    const key = process.cwd().replace(/\//g, "-");
    const f = Bun.file(path.join(home, ".claude", "projects", key, "memory", "MEMORY.md"));
    if (await f.exists()) parts.push("=== PROJECT MEMORY ===\n" + await f.text());
  } catch {}
  return parts.join("\n\n");
}

function buildAuditSummary(data: AuditData | null): string {
  if (!data) return "No audit data.";
  return [
    `System: ${data.system.used} used, ${data.system.free} free, ${data.system.compressor} comp`,
    `Claude agents: ${data.totalInstances} instances, ${fmtMB(data.totalClaudeMem)}`,
    ...data.sessions.map((s) => `  ${s.name}: ${s.instances}x  ${fmtMB(s.totalMem)}  ${s.project}`),
    data.anomalies.length
      ? "Anomalies:\n" + data.anomalies.map((a) => `  [${a.severity}] ${a.text}`).join("\n")
      : "",
    `Full data: /tmp/lazymem-context.json`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ClaudePanel(props: Props) {
  const [output, setOutput] = createSignal("");
  const [status, setStatus] = createSignal<"building" | "running" | "done" | "error">("building");
  const [spinFrame, setSpinFrame] = createSignal(0);
  let cancelled = false;

  // Spinner animation
  const spinId = setInterval(() => setSpinFrame((f) => (f + 1) % SPINNER.length), 80);
  onCleanup(() => {
    clearInterval(spinId);
    cancelled = true;
  });

  // Allow close when done (or always with q)
  useKeyboard((key: any) => {
    const name: string = typeof key === "string" ? key : (key?.name ?? "");
    if (name === "Escape" || name === "escape" || name === "q") {
      props.onClose();
    }
  });

  onMount(async () => {
    try {
      // Write audit data
      if (props.data) {
        await Bun.write("/tmp/lazymem-context.json", JSON.stringify(props.data, null, 2));
      }

      // Build full prompt
      const memory = await loadMemoryContext();
      const audit = buildAuditSummary(props.data);
      const fullPrompt = [
        memory || "",
        "=== SYSTEM STATE ===",
        audit,
        "",
        "=== REQUEST ===",
        props.userPrompt,
        "",
        "Confirm before any destructive action.",
      ]
        .filter(Boolean)
        .join("\n");

      setStatus("running");
      setOutput("");

      const child = Bun.spawn(
        ["claude", "--dangerously-skip-permissions", "-p", fullPrompt],
        { stdout: "pipe", stderr: "pipe" }
      );

      const decoder = new TextDecoder();

      // Stream stdout chunks
      const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) setOutput((o) => o + decoder.decode(value, { stream: true }));
      }
      reader.releaseLock();

      await child.exited;
      if (!cancelled) setStatus("done");
    } catch (err: any) {
      if (!cancelled) {
        setOutput((o) => o + `\n[error: ${err?.message ?? err}]`);
        setStatus("error");
      }
    }
  });

  // Show last N lines so output auto-tails
  const visibleLines = () => {
    const lines = output().split("\n");
    return lines.join("\n");
  };

  const statusLine = () => {
    switch (status()) {
      case "building": return `${SPINNER[spinFrame()]} loading context...`;
      case "running":  return `${SPINNER[spinFrame()]} claude is thinking...`;
      case "done":     return "● done";
      case "error":    return "✖ error";
    }
  };

  const statusColor = () => {
    switch (status()) {
      case "building":
      case "running":  return "#d29922";
      case "done":     return "#3fb950";
      case "error":    return "#f85149";
    }
  };

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
        <text fg="#8957e5">claude  </text>
        <text fg="#4d5566">prompt: </text>
        <text fg="#c9d1d9">{props.userPrompt.slice(0, 60)}</text>
        <text fg="#4d5566">  │  </text>
        <text fg={statusColor()}>{statusLine()}</text>
        <text fg="#4d5566">  │  </text>
        <text fg="#8b949e">Esc/q back to dashboard</text>
      </box>

      {/* Output */}
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
          when={output()}
          fallback={
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg="#8b949e">{statusLine()}</text>
            </box>
          }
        >
          <text fg="#c9d1d9">{visibleLines()}</text>
        </Show>
      </box>
    </box>
  );
}
