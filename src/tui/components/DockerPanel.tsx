import { For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { DockerInfo } from "../../core/index";
import { AnimatedBar } from "./AnimatedBar";

interface Props {
  docker: DockerInfo | null;
  focused: boolean;
  expanded?: boolean;
  panelWidth?: number;
  flexGrow?: number;
}

function parseMem(s: string): number {
  const n = parseFloat(s);
  if (s.includes("GiB") || s.includes("GB")) return n * 1024;
  if (s.includes("MiB") || s.includes("MB")) return n;
  if (s.includes("KiB") || s.includes("KB")) return n / 1024;
  return n;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

function memColor(mb: number): string {
  if (mb > 1000) return "#f85149";
  if (mb > 400)  return "#d29922";
  return "#8b949e";
}

const SCROLL_STYLE = {
  scrollbarOptions: {
    showArrows: false,
    trackOptions: { foregroundColor: "#0d1117", backgroundColor: "#0d1117" },
  },
};

export function DockerPanel(props: Props) {
  const FOCUS_COLOR = "#8957e5";
  const borderColor = () => props.focused ? FOCUS_COLOR : "#30363d";

  const dims = useTerminalDimensions();
  const panelW      = () => props.expanded
    ? Math.max(60, dims().width - 4)
    : props.panelWidth != null
      ? props.panelWidth
      : Math.max(24, Math.floor(dims().width / 3) - 4);
  // Container name column scales with panel width
  // layout: containerW + " "(1) + bar + " "(1) + mem(5) → bar = panelW - containerW - 7
  const containerW  = () => Math.min(32, Math.max(20, 20 + Math.floor((panelW() - 50) / 2)));
  const barW        = () => Math.max(0, panelW() - containerW() - 7);

  const containers = () => props.docker?.containers ?? [];
  const maxMem     = () =>
    Math.max(...containers().map(c => parseMem(c.mem.split("/")[0].trim())), 1);

  const vmRatio = () => {
    if (!props.docker || props.docker.colimaAlloc === "N/A") return 0;
    const alloc  = parseMem(props.docker.colimaAlloc);
    const actual = props.docker.vmActual;
    return alloc > 0 ? actual / alloc : 0;
  };

  const panelTitle = () => {
    if (!props.docker) return " [4] docker ";
    const n = containers().length;
    const vmStr = props.docker.colimaAlloc !== "N/A"
      ? `VM ${props.docker.colimaAlloc}`
      : "no VM";
    return n > 0
      ? ` [4] docker  ${vmStr} · ${n} container${n !== 1 ? "s" : ""} `
      : ` [4] docker  ${vmStr} `;
  };

  return (
    <box
      flexGrow={props.flexGrow ?? 1}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor()}
      title={panelTitle()}
      titleAlignment="left"
      paddingX={1}
    >
      <Show
        when={props.docker}
        fallback={
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#4d5566">no docker data</text>
          </box>
        }
      >
        {/* VM usage bar */}
        <Show when={props.docker!.colimaAlloc !== "N/A"}>
          <box flexDirection="row" height={1} marginTop={1}>
            <text fg="#4d5566">{"VM".padEnd(4)}</text>
            <text fg="#c9d1d9">{props.docker!.vmActual}M</text>
            <text fg="#4d5566"> / </text>
            <text fg="#8b949e">{props.docker!.colimaAlloc}  </text>
            <Show when={barW() >= 4}>
              <AnimatedBar
                pct={vmRatio()}
                width={Math.min(barW(), 14)}
                fg={vmRatio() > 0.8 ? "#f85149" : vmRatio() > 0.6 ? "#d29922" : "#8957e5"}
                emptyFg="#21262d"
              />
            </Show>
          </box>
        </Show>

        <Show
          when={containers().length > 0}
          fallback={
            <box marginTop={1} flexGrow={1} justifyContent="center" alignItems="center">
              <text fg="#4d5566">no containers running</text>
            </box>
          }
        >
          {/* Header */}
          <box flexDirection="row" height={1} marginTop={1}>
            <text fg="#4d5566">{"container".padEnd(containerW())}</text>
            <Show when={barW() >= 4}>
              <text fg="#4d5566">{" " + "usage".padEnd(barW())}</text>
            </Show>
            <text fg="#4d5566">{"mem".padStart(6)}</text>
          </box>

          <scrollbox flexGrow={1} focused={props.focused} style={SCROLL_STYLE}>
            <For each={containers()}>
              {(c) => {
                const memUsed = parseMem(c.mem.split("/")[0].trim());
                const color   = memColor(memUsed);
                const cW      = containerW();
                const imgTag  = c.image ? c.image.split(":")[1] ?? "" : "";
                const imgName = c.image ? c.image.split(":")[0].split("/").pop() ?? "" : "";
                const showImg = c.image && imgName !== c.name && imgName !== c.name.split("-")[0];
                const label   = showImg
                  ? `${c.name.slice(0, cW - 12)} [${imgName.slice(0, 8)}${imgTag && imgTag !== "latest" ? `:${imgTag.slice(0, 4)}` : ""}]`.slice(0, cW - 1).padEnd(cW)
                  : c.name.slice(0, cW - 1).padEnd(cW);
                return (
                  <box flexDirection="row" height={1}>
                    <text fg="#c9d1d9">{label}</text>
                    <Show when={barW() >= 4}>
                      <text fg="#30363d"> </text>
                      <AnimatedBar pct={memUsed / maxMem()} width={barW()} fg={color} emptyFg="#21262d" />
                    </Show>
                    <text fg={color}>{fmtMB(memUsed).padStart(6)}</text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </Show>
      </Show>
    </box>
  );
}
