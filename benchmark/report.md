# OpenTUI vs RatatUI

This is the current checked-in benchmark snapshot for the real OpenTUI app versus the real RatatUI app.

Measured medians from the current accepted head-to-head run:

| Metric | OpenTUI | RatatUI | Delta |
| --- | ---: | ---: | ---: |
| CLI -> core ready | 376 ms | 315 ms | -61 ms |
| CLI -> full ready | 611 ms | 526 ms | -85 ms |
| RSS at full ready | 244.5 MB | 4.7 MB | -239.8 MB |
| RSS after idle | 263.8 MB | 7.0 MB | -256.8 MB |
| Peak RSS | 263.8 MB | 7.0 MB | -256.8 MB |

Notes:

- Lower is better for every metric above.
- RSS here means main-process RSS, not total subprocess or system memory.
- The benchmark harness and raw local artifacts live under `benchmark/`.
