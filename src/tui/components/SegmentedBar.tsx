import { createSignal, createEffect, onCleanup, untrack, For, Show } from "solid-js";

export interface BarSegment {
  pct: number;   // fraction of total width (0–1); segments should sum to ≤ 1
  fg: string;
  char?: string;
}

interface Props {
  segments: BarSegment[];
  width: number;
  emptyFg?: string;
  char?: string;
}

export function SegmentedBar(props: Props) {
  // Animate total fill (same easing as AnimatedBar)
  const [displayed, setDisplayed] = createSignal(0);

  const totalPct = () =>
    Math.min(1, props.segments.reduce((s, sg) => s + sg.pct, 0));

  createEffect(() => {
    const target = totalPct();
    const start = untrack(displayed);
    const startTime = Date.now();
    const dur = 450;
    const id = setInterval(() => {
      const t = Math.min((Date.now() - startTime) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(start + (target - start) * eased);
      if (t >= 1) { setDisplayed(target); clearInterval(id); }
    }, 16);
    onCleanup(() => clearInterval(id));
  });

  const filledW = () => Math.round(displayed() * props.width);

  // Distribute filled chars among segments proportionally,
  // using largest-remainder to ensure they sum exactly to filledW.
  const segChars = () => {
    const fw = filledW();
    if (fw === 0) return props.segments.map(() => 0);
    const total = props.segments.reduce((s, sg) => s + sg.pct, 0);
    if (total === 0) return props.segments.map(() => 0);
    const raw   = props.segments.map(sg => (sg.pct / total) * fw);
    const floor = raw.map(Math.floor);
    const rem   = fw - floor.reduce((a, b) => a + b, 0);
    raw.map((w, i) => ({ i, frac: w - floor[i] }))
      .sort((a, b) => b.frac - a.frac)
      .slice(0, rem)
      .forEach(({ i }) => floor[i]++);
    return floor;
  };

  const emptyW  = () => Math.max(0, props.width - filledW());
  const fillCh  = () => props.char ?? "▪";
  const emptyCh = () => " ";

  return (
    <box flexDirection="row" width={props.width}>
      <For each={segChars()}>
        {(w, i) => (
          <Show when={w > 0}>
            <text fg={props.segments[i()].fg}>
              {(props.segments[i()].char ?? fillCh()).repeat(w)}
            </text>
          </Show>
        )}
      </For>
      <text fg={props.emptyFg ?? "#21262d"}>{emptyCh().repeat(emptyW())}</text>
    </box>
  );
}
