import { createMemo, For } from "solid-js";
import { glyphWidth, rasterizeLine } from "./dotMatrixFont";

export interface DotMatrixRowRun { fg: string; text: string }

const FILL_CHAR = "▪";

export function digitColor(pct: number): string {
  if (pct > 0.90) return "#f85149";
  if (pct > 0.75) return "#d29922";
  return "#3fb950";
}

/** Compute the RLE runs for a single row of the dot-matrix grid.
 *  leftMargin: cols before this bar in the row (e.g. 4 for "RAM "). Used to
 *  center digits relative to a wider reference width so they align with
 *  full-width rows above/below. */
export function dotMatrixRow(
  label: string,
  row: number,
  width: number,
  digitFg: string,
  gridFg: string,
  leftMargin = 0,
  refWidth?: number,
): DotMatrixRowRun[] {
  const gw = glyphWidth(label);
  const showDigits = gw + 2 <= width;
  // Center digits relative to refWidth (full panel), then shift into local coords
  const rw = refWidth ?? width;
  const offset = showDigits ? Math.floor((rw - gw) / 2) - leftMargin : 0;
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
  leftMargin?: number;
  refWidth?: number;
}) {
  const runs = createMemo(() =>
    dotMatrixRow(props.label, props.row, props.width, digitColor(props.pct), props.gridFg ?? "#21262d", props.leftMargin ?? 0, props.refWidth)
  );

  return (
    <For each={runs()}>
      {(run) => <text fg={run.fg}>{run.text}</text>}
    </For>
  );
}
