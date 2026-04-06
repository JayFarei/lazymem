import { createSignal } from "solid-js";

export type FocusPane = "sys" | "agents" | "dev" | "docker";
export const FOCUS_CYCLE: FocusPane[] = ["sys", "agents", "dev", "docker"];

export function usePaneState() {
  const [focus, setFocusRaw]         = createSignal<FocusPane>("agents");
  const [fullscreen, setFullscreen]  = createSignal<FocusPane | null>(null);
  const [selectedIndex, setSelected] = createSignal(0);

  function setFocus(pane: FocusPane) {
    setFocusRaw(pane);
    setSelected(0);
    setFullscreen(null);
  }

  function cycleFocus() {
    setFocusRaw(f => FOCUS_CYCLE[(FOCUS_CYCLE.indexOf(f) + 1) % FOCUS_CYCLE.length]);
    setSelected(0);
  }

  function navigateDown(max: number) {
    setSelected(i => Math.min(i + 1, Math.max(0, max - 1)));
  }

  function navigateUp() {
    setSelected(i => Math.max(0, i - 1));
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
  };
}
