# Diagnostic Anchor Suite

The diagnostic anchor suite is permanent infrastructure for measuring Coach search changes without changing production engine behavior.

It has three jobs:

1. Track strength-sensitive opening positions where Coach has historically preferred early minor-piece moves differently from a Stockfish reference.
2. Guard exact-search sentinels where a known best move should remain stable at a fixed depth.
3. Capture deterministic search baselines so refactors can prove whether they preserved the same tree, the same practical choice, or only the same strength profile.

## Files

- `tests/data/diagnostic_anchors.json` is the source of truth for anchors.
- `tests/data/baselines/diagnostic_anchors_87062e3.json` is the baseline captured from commit `87062e3`.
- `scripts/run-diagnostic-anchors.mjs` runs anchors and writes JSON results.
- `scripts/compare-search-equivalence.mjs` captures or compares deterministic result sets.
- `tests/diagnostic_anchors.test.mjs` validates anchor shape, FEN legality, expected move legality, and comparison behavior.

## Run Anchors

Run the full suite in PowerShell:

```sh
node scripts/run-diagnostic-anchors.mjs
```

Write compact deterministic output:

```sh
node scripts/run-diagnostic-anchors.mjs --stable-only --output tests/data/baselines/diagnostic_anchors_87062e3.json
```

Run one group:

```sh
node scripts/run-diagnostic-anchors.mjs --category strict-sentinel --stable-only
```

Run one anchor at a temporary depth:

```sh
node scripts/run-diagnostic-anchors.mjs --id control-startpos --depths 4 --stable-only
```

## Compare Search Equivalence

Capture a candidate result:

```sh
node scripts/compare-search-equivalence.mjs --capture --output candidate.json
```

Compare against the saved baseline:

```sh
node scripts/compare-search-equivalence.mjs --baseline tests/data/baselines/diagnostic_anchors_87062e3.json --candidate candidate.json --level exact-tree
```

Comparison levels:

- `exact-tree` requires best move, score, node count, qsearch entry count, and PV to match.
- `functional` requires best move and score to match, ignoring node count and PV drift.
- `strength` reports best-move drift only and is intended for opening diagnostic review.

## Anchor Types

- `early-minor-piece`: strength diagnostics for the six supplied opening positions. Reference moves are advisory, not strict pass/fail gates.
- `strict-sentinel`: fixed-depth tactical or conversion positions with expected moves.
- `equivalence-control`: broad controls for move generation, search, pruning, evaluation, and endgame behavior.

The saved baseline intentionally omits timestamps, elapsed time, Node version, and platform data. That keeps it useful for exact comparisons in later optimization work.

## Add An Anchor

Add new positions to `tests/data/diagnostic_anchors.json` with a stable `id`, `category`, `mode`, `fen`, `depths`, and `tags`.

Use `expected` for strict or accepted sentinel moves. Use `reference` for non-strict Stockfish or other advisory moves; these are diagnostic signals, not hard failures unless the anchor is explicitly marked strict.

After adding an anchor, run:

```sh
node --test tests/diagnostic_anchors.test.mjs
node scripts/run-diagnostic-anchors.mjs --id your-anchor-id --stable-only
```

For pure-speed candidates, capture a candidate baseline after the code change and compare it to `diagnostic_anchors_87062e3.json` with `--level exact-tree`. Elapsed time and NPS should stay informational and must not be used as strict identity fields.
