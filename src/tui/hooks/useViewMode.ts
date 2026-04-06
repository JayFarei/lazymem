import { createSignal } from "solid-js";

export type FocusPane = "sys" | "agents" | "dev" | "docker";
export const FOCUS_CYCLE: FocusPane[] = ["sys", "agents", "dev", "docker"];

export function usePaneState() {
  const [focus, setFocusRaw]           = createSignal<FocusPane>("sys");
  const [fullscreen, setFullscreen]    = createSignal<FocusPane | null>(null);
  const [selectedIndex, setSelected]   = createSignal(0);
  const [expandedIndex, setExpanded]   = createSignal<number | null>(null);

  function setFocus(pane: FocusPane) {
    setFocusRaw(pane);
    setSelected(0);
    setExpanded(null);
    setFullscreen(null);
  }

  function cycleFocus() {
    setFocusRaw(f => FOCUS_CYCLE[(FOCUS_CYCLE.indexOf(f) + 1) % FOCUS_CYCLE.length]);
    setSelected(0);
    setExpanded(null);
  }

  function navigateDown(max: number) {
    setSelected(i => {
      const next = Math.min(i + 1, Math.max(0, max - 1));
      if (next !== i) setExpanded(null);
      return next;
    });
  }

  function navigateUp() {
    setSelected(i => {
      const next = Math.max(0, i - 1);
      if (next !== i) setExpanded(null);
      return next;
    });
  }

  function toggleExpand() {
    setExpanded(i => (i === selectedIndex() ? null : selectedIndex()));
  }

  function toggleFullscreen() {
    setFullscreen(f => (f !== null ? null : focus()));
  }

  function exitFullscreen() {
    setFullscreen(null);
  }

  return {
    focus, setFocus, cycleFocus,
    fullscreen, toggleFullscreen, exitFullscreen,
    selectedIndex, navigateDown, navigateUp,
    expandedIndex, toggleExpand,
  };
}
