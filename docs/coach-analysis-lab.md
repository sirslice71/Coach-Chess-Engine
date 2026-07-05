# Coach Analysis Lab

`tools/coach-analysis-lab.mjs` is a command-line diagnostic tool that runs
Coach (and optionally a stronger reference UCI engine such as Stockfish)
over a set of FEN positions and reports where the two engines disagree
most. It is designed for overnight or post-tournament runs that produce
concrete engineering targets by morning.

It is a diagnostic tool only: it talks to engines strictly over UCI
stdin/stdout and changes no engine behavior.

## Quick start

Coach-only baseline (no reference engine required):

```
node tools/coach-analysis-lab.mjs --fen-file docs/coach-analysis-sample-fens.txt --coach "node uci.js" --movetime 1000
```

Compare against Stockfish:

```
node tools/coach-analysis-lab.mjs --fen-file docs/coach-analysis-sample-fens.txt --coach "node uci.js" --stockfish "C:\Path To\stockfish.exe" --movetime 10000
```

Single position:

```
node tools/coach-analysis-lab.mjs --fen "8/R5N1/2p2pkp/4p3/P7/1p3P1P/2r3PK/8 b - - 0 45" --coach "node uci.js" --movetime 10000
```

## Options

| Flag | Meaning |
|------|---------|
| `--fen-file <path>` | File with one FEN per line; `label \| fen` and `#` comments allowed |
| `--fen "<fen>"` | Analyze a single FEN (use `--label` to name it) |
| `--coach "<cmd>"` | Coach UCI command (default `node uci.js`) |
| `--stockfish "<cmd>"` / `--ref` | Reference UCI engine command or executable path (optional) |
| `--movetime <ms>` | `go movetime` per position (default 5000) |
| `--depth <n>` | `go depth` per position instead of movetime |
| `--limit <n>` | Only analyze the first n positions |
| `--out <dir>` | Output base directory (default `analysis-runs`, which is gitignored) |
| `--timeout <ms>` | Per-position hard timeout (default 3x movetime + 15s) |
| `--verbose` | Echo raw UCI traffic to stderr |

Engine commands containing spaces work two ways: an executable path with
spaces is detected automatically if it exists on disk, and quoted command
lines like `"node uci.js"` are split respecting quotes.

## Output

Each run writes `analysis-runs/YYYYMMDD-HHMMSS/`:

- `results.json` — machine-readable: settings, summary, and per-position
  records (best move, score, depth, nodes, wall time, PV, comparison,
  theme tags, priority).
- `report.md` — human-readable: settings, summary statistics, the top 10
  disagreement positions with review notes, and a raw results table.

Scores are side-to-move-relative centipawns (UCI convention). Coach
reports forced mates as cp values near ±100000; Stockfish-style
`score mate N` is normalized into the same range. Mate-class scores are
excluded from centipawn averages and flagged separately.

## Interpreting the report

- **Eval difference** = Coach score − reference score (same position,
  same side to move). Positive means Coach is more optimistic than the
  reference about the side to move.
- **Follow-up priority**: `high` = mate disagreement, or different best
  move with ≥100cp disagreement; `medium` = different best move or
  ≥60cp; `low` otherwise.
- **Theme tags** (cheap v1 heuristics from the FEN and scores only):
  `rook endgame`, `endgame`, `passed pawn`, `tactic`, `unknown`.
  King-safety and time-management tags are not implemented yet (they
  need check detection / clock data the tool does not compute cheaply).

## Failure behavior

- Engine handshake failures abort the run with a clear message before
  any position is analyzed.
- Every UCI wait has a timeout; a wedged engine cannot hang the run.
- If an engine crashes or times out on one position, the tool restarts
  it once and retries; if that also fails, the position is recorded as
  an error and the run continues.
- Child processes are always quit (politely, then killed).
