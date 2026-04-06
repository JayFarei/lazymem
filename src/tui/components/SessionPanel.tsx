import { For, Show } from "solid-js";
import type { AuditData, SessionSummary, Anomaly } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";

interface Props {
  data: AuditData | null;
  focused: boolean;
  flexGrow?: number;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function memColor(mb: number, max: number): string {
  const pct = mb / max;
  if (pct > 0.75 || mb > 3000) return "#f85149";
  if (pct > 0.40 || mb > 1000) return "#d29922";
  return "#3fb950";
}

function anomalyColor(severity: Anomaly["severity"]): string {
  return severity === "error" ? "#f85149" : "#d29922";
}

function anomalyIcon(severity: Anomaly["severity"]): string {
  return severity === "error" ? "✖" : "⚠";
}

export function SessionPanel(props: Props) {
  const borderColor = () => (props.focused ? "#58a6ff" : "#30363d");

  const sessions = () => props.data?.sessions ?? [];
  const anomalies = () => props.data?.anomalies ?? [];
  const maxMem = () => Math.max(...sessions().map((s) => s.totalMem), 1);

  const totalLabel = () => {
    if (!props.data) return "";
    return `${props.data.totalInstances} inst  ${fmtMB(props.data.totalClaudeMem)}`;
  };

  return (
    <box
      flexGrow={props.flexGrow ?? 0}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor()}
      title=" CLAUDE "
      titleAlignment="left"
      paddingX={1}
    >
      <Show
        when={props.data}
        fallback={
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#8b949e">collecting...</text>
          </box>
        }
      >
        {/* Summary row */}
        <box flexDirection="row" marginTop={1} marginBottom={1}>
          <text fg="#58a6ff">{totalLabel()}</text>
        </box>

        {/* Column headers */}
        <box flexDirection="row">
          <text fg="#4d5566">{"Session".padEnd(16)}</text>
          <text fg="#4d5566">{"#".padStart(2)}  </text>
          <text fg="#4d5566">{"RAM".padStart(6)}  </text>
          <text fg="#4d5566">Bar</text>
        </box>

        {/* Session rows */}
        <For each={sessions()}>
          {(session) => {
            const color = () => memColor(session.totalMem, maxMem());
            const pct = () => session.totalMem / maxMem();
            return (
              <box flexDirection="row">
                <text fg="#c9d1d9">{session.name.slice(0, 15).padEnd(16)}</text>
                <text fg="#8b949e">{String(session.instances).padStart(2)}  </text>
                <text fg={color()}>{fmtMB(session.totalMem).padStart(6)}  </text>
                <AnimatedBar
                  pct={pct()}
                  width={16}
                  fg={color()}
                  emptyFg="#2d333b"
                />
              </box>
            );
          }}
        </For>

        {/* Anomalies */}
        <Show when={anomalies().length > 0}>
          <box marginTop={1}>
            <text fg="#f85149">anomalies</text>
          </box>
          <For each={anomalies()}>
            {(a) => (
              <box flexDirection="row">
                <text fg={anomalyColor(a.severity)}>{anomalyIcon(a.severity)} </text>
                <text fg={anomalyColor(a.severity)}>{a.text}</text>
              </box>
            )}
          </For>
        </Show>
      </Show>
    </box>
  );
}
