import { createSignal, createEffect, onCleanup, untrack } from "solid-js";
import { animateTo } from "../animation";

interface Props {
  pct: number;
  width: number;
  fg: string;
  animate?: boolean;
  emptyFg?: string;
  char?: string;
  emptyChar?: string;
}

export function AnimatedBar(props: Props) {
  const pct = () => Math.max(0, Math.min(1, props.pct));
  const fillChar = () => props.char      ?? "▪";
  const mptyChar = () => props.emptyChar ?? " ";

  if (props.animate === false) {
    const filled = Math.round(pct() * props.width);
    const empty = Math.max(props.width - filled, 0);
    return (
      <box flexDirection="row" width={props.width}>
        <text fg={props.fg}>{fillChar().repeat(filled)}</text>
        <text fg={props.emptyFg ?? "#21262d"}>{mptyChar().repeat(empty)}</text>
      </box>
    );
  }

  const [displayed, setDisplayed] = createSignal(0);

  createEffect(() => {
    const target = pct();
    const start = untrack(displayed);
    const cancel = animateTo(start, target, setDisplayed);
    onCleanup(cancel);
  });

  const filled   = () => Math.round(displayed() * props.width);
  const empty    = () => Math.max(props.width - filled(), 0);

  return (
    <box flexDirection="row" width={props.width}>
      <text fg={props.fg}>{fillChar().repeat(filled())}</text>
      <text fg={props.emptyFg ?? "#21262d"}>{mptyChar().repeat(empty())}</text>
    </box>
  );
}
