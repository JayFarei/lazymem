/**
 * Fullscreen view for a single panel.
 * Triggered by `g`, exited with `g` or Escape.
 * Rendered *instead of* the dashboard (not on top of it), so no
 * background-fill hack is needed and content never overlaps.
 */
import { Show } from "solid-js";
import type { FocusPane } from "../hooks/useViewMode";
import type { AuditData, Anomaly } from "../../core/index";
import { SystemPanel } from "./SystemPanel";
import { AgentPanel } from "./AgentPanel";
import { DevPanel } from "./DevPanel";
import { DockerPanel } from "./DockerPanel";
import type { DockerInfo } from "../../core/index";

interface Props {
  pane: FocusPane;
  data: AuditData | null;
  anomalies: Anomaly[];
  selectedIndex: number;
  expandedIndex?: number;
}

export function FullscreenPane(props: Props) {
  const docker = (): DockerInfo | null => props.data?.docker ?? null;

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={props.pane === "sys"}>
        <SystemPanel
          data={props.data}
          focused={true}
          expanded={true}
          anomalies={props.anomalies}
          selectedIndex={props.selectedIndex}
          expandedIndex={props.expandedIndex}
          flexGrow={1}
        />
      </Show>

      <Show when={props.pane === "agents"}>
        <AgentPanel
          data={props.data}
          focused={true}
          expanded={true}
          selectedIndex={props.selectedIndex}
          expandedIndex={props.expandedIndex}
          flexGrow={1}
        />
      </Show>

      <Show when={props.pane === "dev"}>
        <DevPanel
          data={props.data}
          focused={true}
          expanded={true}
          selectedIndex={props.selectedIndex}
          expandedIndex={props.expandedIndex}
          flexGrow={1}
        />
      </Show>

      <Show when={props.pane === "docker"}>
        <DockerPanel
          docker={docker()}
          focused={true}
          expanded={true}
          selectedIndex={props.selectedIndex}
          expandedIndex={props.expandedIndex}
          flexGrow={1}
        />
      </Show>

      <box height={1} paddingX={1}>
        <text fg="#4d5566">g  </text>
        <text fg="#30363d">or  </text>
        <text fg="#4d5566">Esc  </text>
        <text fg="#30363d">exit fullscreen</text>
      </box>
    </box>
  );
}
