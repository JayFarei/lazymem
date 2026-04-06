import { createSignal, createEffect, onCleanup, untrack } from "solid-js";

interface Props {
  pct: number;
  width: number;
  fg: string;
  emptyFg?: string;
  char?: string;
  emptyChar?: string;
}

export function AnimatedBar(props: Props) {
  const [displayed, setDisplayed] = createSignal(0);

  createEffect(() => {
    const target = Math.max(0, Math.min(1, props.pct));
    const start = untrack(displayed);
    const startTime = Date.now();
    const dur = 450;

    const id = setInterval(() => {
      const t = Math.min((Date.now() - startTime) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(start + (target - start) * eased);
      if (t >= 1) {
        setDisplayed(target);
        clearInterval(id);
      }
    }, 16);

    onCleanup(() => clearInterval(id));
  });

  const filled   = () => Math.round(displayed() * props.width);
  const empty    = () => Math.max(props.width - filled(), 0);
  const fillChar = () => props.char      ?? "▪";
  const mptyChar = () => props.emptyChar ?? " ";

  return (
    <box flexDirection="row" width={props.width}>
      <text fg={props.fg}>{fillChar().repeat(filled())}</text>
      <text fg={props.emptyFg ?? "#21262d"}>{mptyChar().repeat(empty())}</text>
    </box>
  );
}
