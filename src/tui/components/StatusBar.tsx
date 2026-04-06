import { createSignal, onCleanup, Show } from "solid-js";
import type { FocusPane } from "../hooks/useViewMode";

interface Props {
  loading: boolean;
  instances: number;
  totalMem: number;
  anomalies: number;
  focus: FocusPane;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const FOCUS_COLORS: Record<FocusPane, string> = {
  sys:    "#58a6ff",
  agents: "#3fb950",
  dev:    "#d29922",
  docker: "#8957e5",
};

function Spinner() {
  const [frame, setFrame] = createSignal(0);
  const id = setInterval(() => setFrame(f => (f + 1) % SPINNER.length), 80);
  onCleanup(() => clearInterval(id));
  return <text fg="#d29922">{SPINNER[frame()]}</text>;
}

export function StatusBar(props: Props) {
  const mem = () =>
    props.totalMem >= 1024
      ? `${(props.totalMem / 1024).toFixed(1)}G`
      : `${props.totalMem}M`;

  const focusColor = () => FOCUS_COLORS[props.focus];

  return (
    <box height={1} flexDirection="row" paddingX={1}>
      <text fg="#58a6ff">lazymem</text>
      <text fg="#30363d">  │  </text>

      {/* Live / refreshing indicator */}
      <Show when={props.loading} fallback={<text fg="#3fb950">●</text>}>
        <Spinner />
      </Show>
      <text fg="#4d5566">{props.loading ? " syncing" : " live"}</text>
      <text fg="#30363d">  │  </text>

      {/* Agent totals */}
      <text fg="#c9d1d9">{props.instances}x {mem()}</text>
      <text fg="#30363d">  │  </text>

      {/* Anomaly / clean */}
      <Show
        when={props.anomalies > 0}
        fallback={<text fg="#3fb950">✓</text>}
      >
        <text fg="#f85149">⚠ {props.anomalies}</text>
      </Show>
      <text fg="#30363d">  │  </text>

      {/* Current focus */}
      <text fg={focusColor()}>{props.focus}</text>
      <text fg="#30363d">  │  </text>

      {/* Compact key hints */}
      <text fg="#4d5566">r</text><text fg="#8b949e"> fresh  </text>
      <text fg="#4d5566">Tab</text><text fg="#8b949e"> cycle  </text>
      <text fg="#4d5566">1-4</text><text fg="#8b949e"> focus  </text>
      <text fg="#4d5566">j/k</text><text fg="#8b949e"> nav  </text>
      <text fg="#4d5566">g</text><text fg="#8b949e"> full  </text>
      <text fg="#4d5566">?</text><text fg="#8b949e"> help  </text>
      <text fg="#4d5566">q</text><text fg="#8b949e"> quit</text>
    </box>
  );
}
