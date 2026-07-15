# Search Benchmark Harness

`scripts/benchmark-search-ab.mjs` runs fixed-depth A/B search benchmarks for Coach.
It is intended for performance-infrastructure work and optimization validation, not
for changing engine behavior.

## Stable Corpus

The primary speed aggregate uses the 10-position stable subset in
`tests/data/search_benchmark_corpus.json`:

1. quiet-defense
2. tactical-capture
3. game8
4. game10
5. high-branching
6. quiet-open
7. capture-rich
8. queen-rook-mate
9. kiwipete
10. promotion-race

The remaining positions are available with `--corpus diagnostic` or
`--corpus all`. Game 4 remains in the diagnostic corpus because it is an active
correctness sentinel, but it is excluded from the primary speed aggregate by
default: same-build timing showed bimodal runtime despite identical best move,
score, nodes, and leaf nodes.

## Protocol

Defaults:

- persistent Node process
- concurrency 1
- 5 warmups per position and label
- 10 measured AB/BA pairs per position
- deterministic paired order from `--seed`; the seed chooses the first pair's
  label order, then later pairs alternate AB/BA so neither label is
  systematically warmer
- per-position median elapsed time per label
- candidate/baseline ratio per position
- primary-subset geomean across position ratios

Ratios are `candidate median / baseline median`. Negative percentages mean the
candidate was faster; positive percentages mean it was slower.

Exact identity checks are enabled by default. For every paired baseline and
candidate sample, the harness compares best move, score, nodes, leaf nodes,
completed depth, qsearch entries, and PV when available. Mismatched rows are
reported and excluded from performance acceptance. Use `--non-exact` only for
intentional non-exact-tree experiments; the console and JSON output still
identify identity mismatches, but they do not force a nonzero exit in that mode.

## Examples

Identical-build control:

```powershell
node .\scripts\benchmark-search-ab.mjs `
    --baseline "<USERPROFILE>\OneDrive\Desktop\Coach Current" `
    --candidate "<USERPROFILE>\OneDrive\Desktop\Coach Current" `
    --control
```

Baseline versus candidate worktree with output files:

```powershell
node .\scripts\benchmark-search-ab.mjs `
    --baseline "C:\path\baseline" `
    --candidate "C:\path\candidate" `
    --json "$env:TEMP\coach-bench.json" `
    --csv "$env:TEMP\coach-bench.csv"
```

Resume after interruption:

```powershell
node .\scripts\benchmark-search-ab.mjs `
    --baseline "C:\path\baseline" `
    --candidate "C:\path\candidate" `
    --checkpoint "$env:TEMP\coach-bench.checkpoint.json"

node .\scripts\benchmark-search-ab.mjs `
    --baseline "C:\path\baseline" `
    --candidate "C:\path\candidate" `
    --resume "$env:TEMP\coach-bench.checkpoint.json"
```

## Interpretation

Run an identical-build control before candidate timing. The stable primary
control should normally be inside `-0.5%` to `+0.5%`. If it is outside that
range, treat the session as too noisy and rerun under quieter conditions.

A candidate normally needs about `1.0-1.5%` primary-subset improvement, a second
confirming run, no serious per-position regression, and exact identity for
semantic-preserving changes. The full 18-position corpus may be reported, but it
should not be used to accept small candidates on this machine.

A timing gain is only a speed signal. It does not by itself prove Elo strength;
engine matches are still required before treating a performance change as a
playing-strength improvement.

The console output is human-readable. `--json` writes the full report including
samples, environment metadata, Git metadata, and assessments. `--csv` writes a
per-position summary table.

## Environment And Optional Controls

The harness records timestamp, Node version, Windows version, CPU model when
available, logical processor count, available memory, active power plan when
available, working directory, Git branch/HEAD/status for each repo, seed,
warmups, pairs, and requested priority/affinity.

Checkpoints are written with a temporary file and rename so interrupted writes
are recoverable. Resume validates benchmark paths, seed, protocol settings,
position IDs, corpus fingerprint, and Git metadata captured at the start of the
run.

Optional `--priority above-normal` and `--affinity <hex mask>` are best-effort
temporary settings for the benchmark process only. Real-time priority is not
supported. Default benchmarks do not force garbage collection; heap usage before
and after each sample is recorded, and `--trace-gc` is reserved as a diagnostic
flag for runs launched with Node GC tracing.
