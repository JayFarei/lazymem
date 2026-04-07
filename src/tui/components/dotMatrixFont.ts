// 5×7 bitmap font for digits 0–9.
// Each glyph is a 7-element array (rows top→bottom).
// Each element is a 5-bit mask: bit 4 = leftmost col, bit 0 = rightmost.
//
//   ·▪▪▪·  = 01110 = 14
//   ▪···▪  = 10001 = 17
//   ▪▪▪▪▪  = 11111 = 31

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const GLYPH_GAP = 2;

export const DOT_FONT: Record<string, number[]> = {
  "0": [14, 17, 17, 17, 17, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [17, 17, 17, 31, 1, 1, 1],
  "5": [31, 16, 16, 30, 1, 1, 30],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 4, 4, 4],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
};

export function glyphWidth(text: string): number {
  if (text.length === 0) return 0;
  return text.length * GLYPH_W + (text.length - 1) * GLYPH_GAP;
}

export function rasterizeLine(text: string, row: number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < text.length; i++) {
    if (i > 0) for (let g = 0; g < GLYPH_GAP; g++) out.push(false);
    const glyph = DOT_FONT[text[i]];
    const mask = glyph ? glyph[row] : 0;
    for (let bit = GLYPH_W - 1; bit >= 0; bit--) {
      out.push(!!(mask & (1 << bit)));
    }
  }
  return out;
}
