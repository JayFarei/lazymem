import { useKeyboard } from "@opentui/solid";
import type { FocusPane } from "./useViewMode";

export interface KeybindingHandlers {
  enabled:          () => boolean;
  refresh:          () => void;
  toggleHelp:       () => void;
  quit:             () => void;
  cycleFocus:       () => void;
  setFocus:         (pane: FocusPane) => void;
  navigateDown:     () => void;
  navigateUp:       () => void;
  toggleExpand:     () => void;
  toggleFullscreen: () => void;
  exitFullscreen:   () => void;
  fullscreenActive: () => boolean;
}

export function useKeybindings(h: KeybindingHandlers) {
  useKeyboard((key: any) => {
    if (!h.enabled()) return;
    const name: string = typeof key === "string" ? key : (key?.name ?? "");

    switch (name) {
      case "r":
        h.refresh();
        break;
      case "?":
        h.toggleHelp();
        break;
      case "q":
        h.quit();
        break;

      case "Tab":
      case "tab":
        h.cycleFocus();
        break;

      case "1": h.setFocus("sys");    break;
      case "2": h.setFocus("agents"); break;
      case "3": h.setFocus("dev");    break;
      case "4": h.setFocus("docker"); break;

      case "j":
      case "down":
        h.navigateDown();
        break;
      case "k":
      case "up":
        h.navigateUp();
        break;

      case "return":
      case "Return":
        h.toggleExpand();
        break;

      case "g":
        h.toggleFullscreen();
        break;

      case "Escape":
      case "escape":
        if (h.fullscreenActive()) h.exitFullscreen();
        break;
    }
  });
}
