import { createMemo, For } from "solid-js";
import { glyphWidth, rasterizeLine } from "./dotMatrixFont";

export interface DotMatrixRowRun { fg: string; text: string }

const FILL_CHAR = "▪";

export function digitColor(pct: number): string {
  if (pct > 0.90) return "#f85149";
  if (pct > 0.75) return "#d29922";
  return "#3fb950";
}

/** Compute the RLE runs for a single row of the dot-matrix grid. */
export function dotMatrixRow(
  label: string,
  row: number,
  width: number,
  digitFg: string,
  gridFg: string,
): DotMatrixRowRun[] {
  const gw = glyphWidth(label);
  const showDigits = gw + 2 <= width;
  const offset = showDigits ? Math.floor((width - gw) / 2) : 0;
  const line = showDigits ? rasterizeLine(label, row) : [];

  const runs: DotMatrixRowRun[] = [];
  let curFg = "";
  let curLen = 0;

  for (let c = 0; c < width; c++) {
    const localCol = c - offset;
    const isDigit = showDigits && localCol >= 0 && localCol < line.length && line[localCol];
    const cellFg = isDigit ? digitFg : gridFg;

    if (cellFg === curFg) {
      curLen++;
    } else {
      if (curLen > 0) runs.push({ fg: curFg, text: FILL_CHAR.repeat(curLen) });
      curFg = cellFg;
      curLen = 1;
    }
  }
  if (curLen > 0) runs.push({ fg: curFg, text: FILL_CHAR.repeat(curLen) });
  return runs;
}

/** Renders one row of the dot-matrix grid as a sequence of <text> nodes. */
export function DotMatrixRow(props: {
  label: string;
  row: number;
  width: number;
  pct: number;
  gridFg?: string;
}) {
  const runs = createMemo(() =>
    dotMatrixRow(props.label, props.row, props.width, digitColor(props.pct), props.gridFg ?? "#21262d")
  );

  return (
    <For each={runs()}>
      {(run) => <text fg={run.fg}>{run.text}</text>}
    </For>
  );
}
