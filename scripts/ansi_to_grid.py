#!/usr/bin/env python3
import re
import sys
from pathlib import Path


ANSI_16 = {
    30: ("ansi", 0), 31: ("ansi", 1), 32: ("ansi", 2), 33: ("ansi", 3),
    34: ("ansi", 4), 35: ("ansi", 5), 36: ("ansi", 6), 37: ("ansi", 7),
    90: ("ansi", 8), 91: ("ansi", 9), 92: ("ansi", 10), 93: ("ansi", 11),
    94: ("ansi", 12), 95: ("ansi", 13), 96: ("ansi", 14), 97: ("ansi", 15),
}
BG_16 = {
    40: ("ansi", 0), 41: ("ansi", 1), 42: ("ansi", 2), 43: ("ansi", 3),
    44: ("ansi", 4), 45: ("ansi", 5), 46: ("ansi", 6), 47: ("ansi", 7),
    100: ("ansi", 8), 101: ("ansi", 9), 102: ("ansi", 10), 103: ("ansi", 11),
    104: ("ansi", 12), 105: ("ansi", 13), 106: ("ansi", 14), 107: ("ansi", 15),
}


def parse_ansi(text: str):
    lines = [[]]
    fg = None
    bg = None
    bold = False
    i = 0

    while i < len(text):
      ch = text[i]
      if ch == "\x1b":
        if i + 1 < len(text) and text[i + 1] == "[":
          end = i + 2
          while end < len(text) and text[end] not in "ABCDEFGHJKSTfm":
            end += 1
          if end >= len(text):
            break
          final = text[end]
          params = text[i + 2:end]
          if final == "m":
            fg, bg, bold = apply_sgr(params, fg, bg, bold)
          i = end + 1
          continue
        i += 1
        continue
      if ch == "\r":
        i += 1
        continue
      if ch == "\n":
        lines.append([])
        i += 1
        continue
      if ch == "\b":
        if lines[-1]:
          lines[-1].pop()
        i += 1
        continue

      lines[-1].append((ch, fg, bg, bold))
      i += 1

    while lines and not lines[-1]:
      lines.pop()
    return lines


def apply_sgr(params: str, fg, bg, bold):
    values = [int(part) if part else 0 for part in params.split(";")] if params else [0]
    idx = 0
    while idx < len(values):
      value = values[idx]
      if value == 0:
        fg = None
        bg = None
        bold = False
      elif value == 1:
        bold = True
      elif value == 22:
        bold = False
      elif value == 39:
        fg = None
      elif value == 49:
        bg = None
      elif value in ANSI_16:
        fg = ANSI_16[value]
      elif value in BG_16:
        bg = BG_16[value]
      elif value in (38, 48):
        target = "fg" if value == 38 else "bg"
        if idx + 1 < len(values) and values[idx + 1] == 2 and idx + 4 < len(values):
          color = ("rgb", values[idx + 2], values[idx + 3], values[idx + 4])
          if target == "fg":
            fg = color
          else:
            bg = color
          idx += 4
        elif idx + 1 < len(values) and values[idx + 1] == 5 and idx + 2 < len(values):
          color = ("256", values[idx + 2])
          if target == "fg":
            fg = color
          else:
            bg = color
          idx += 2
      idx += 1
    return fg, bg, bold


def compare(left_path: Path, right_path: Path, chars_only: bool):
    left = parse_ansi(left_path.read_text())
    right = parse_ansi(right_path.read_text())
    max_rows = max(len(left), len(right))
    mismatches = []

    for row in range(max_rows):
      left_row = left[row] if row < len(left) else []
      right_row = right[row] if row < len(right) else []
      max_cols = max(len(left_row), len(right_row))
      for col in range(max_cols):
        left_cell = left_row[col] if col < len(left_row) else (" ", None, None, False)
        right_cell = right_row[col] if col < len(right_row) else (" ", None, None, False)
        same = left_cell[0] == right_cell[0] if chars_only else left_cell == right_cell
        if not same:
          mismatches.append((row + 1, col + 1, left_cell, right_cell))
          if len(mismatches) >= 20:
            return mismatches

    return mismatches


def format_cell(cell):
    ch, fg, bg, bold = cell
    return f"char={repr(ch)} fg={fg} bg={bg} bold={bold}"


def main(argv):
    chars_only = False
    args = argv[1:]
    if args and args[0] == "--chars-only":
      chars_only = True
      args = args[1:]

    if len(args) != 2:
      print("usage: ansi_to_grid.py [--chars-only] <left.ansi> <right.ansi>", file=sys.stderr)
      return 2

    left = Path(args[0])
    right = Path(args[1])
    mismatches = compare(left, right, chars_only)
    if not mismatches:
      print("PASS")
      return 0

    print(f"FAIL: {len(mismatches)} mismatches (showing first {len(mismatches)})")
    for row, col, left_cell, right_cell in mismatches:
      print(f"{row}:{col} left[{format_cell(left_cell)}] right[{format_cell(right_cell)}]")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
