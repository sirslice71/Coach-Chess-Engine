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

The default profile is named `full`. A shorter opt-in profile is available for
control-stability studies:

```powershell
node .\scripts\benchmark-search-ab.mjs `
    --baseline "C:\path\baseline" `
    --candidate "C:\path\baseline" `
    --control `
    --profile stability-short
```

`stability-short` uses four representative primary positions
(`quiet-open`, `tactical-capture`, `high-branching`, and `promotion-race`), two
warmups per label, and 16 ABBA/BAAB measured groups per position. The seed
chooses the first group orientation and the profile rotates orientation by
position. Aggregation uses per-group paired log-ratios, each position's median
paired result, and then the usual primary geomean. Raw timing and speed-gain
sign conventions are unchanged. The profile is intended to validate whether the
machine/session is stable enough for timing work without silently replacing the
full protocol.

Ratios are `candidate median / baseline median`. The raw timing difference is
`(candidate time / baseline time - 1) * 100`. Negative raw timing differences
mean the candidate was faster; positive raw timing differences mean it was
slower. User-facing speed gain is the negated value: `speed gain = -raw timing
difference`. Positive speed gain means faster, and negative speed gain means
slower.

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
control raw timing difference should normally be inside `-0.5%` to `+0.5%`. If
it is outside that range, treat the session as too noisy and rerun under quieter
conditions.

A candidate normally needs about `1.0-1.5%` primary-subset improvement, a second
confirming run, no serious per-position regression, and exact identity for
semantic-preserving changes. The full 18-position corpus may be reported, but it
should not be used to accept small candidates on this machine.

A timing gain is only a speed signal. It does not by itself prove Elo strength;
engine matches are still required before treating a performance change as a
playing-strength improvement.

The console output is human-readable and does not print bare timing
percentages. Per-position rows identify the run as `candidate` or `control` and
say whether the raw timing difference was `faster`, `slower`, or `neutral`.
Aggregate output prints both raw timing difference and speed gain. `--json`
writes the full report including samples, environment metadata, Git metadata,
and assessments. `--csv` writes a per-position summary table.

Single-run candidate verdicts are deliberately conservative. A fast single run
may print `candidate run: promising; confirmation required`; that means the run
cleared the configured single-run threshold, not that the optimization is ready
to commit. Final acceptance requires a multi-run summary with stable controls.

## Multi-Run Summary

Use `scripts/benchmark-search-summary.mjs` to aggregate saved JSON files:

```powershell
node .\scripts\benchmark-search-summary.mjs `
    --control "$Results\control.json" `
    --candidate "$Results\candidate-a.json" `
    --candidate "$Results\candidate-b.json" `
    --control "$Results\control-2.json" `
    --candidate "$Results\candidate-c.json"
```

Controls apply to following candidates until another `--control` appears, or by
explicit `--session` names. The summary reports every control and candidate,
raw timing difference, speed gain, same-session control timing difference,
control-adjusted speed gain, positive positions, per-position mean speed gain,
best/worst positions, variance, and whether one position dominates the
aggregate. Positive positions are positions where speed gain is positive, not
where raw timing difference is positive.

Adjustment is explicit: speed gain is `-(candidate/baseline geomean percent)`,
and a candidate run is adjusted by subtracting the same-session identical-build
control speed gain. For example, a `+0.4%` raw control means the candidate label
was slower than the baseline label in that control, so the control speed gain is
`-0.4%` and matching candidate runs are adjusted relative to that same-session
measurement.

Acceptance requires stable controls within `+/-0.5%`, exact identity in every
candidate run, at least two candidate runs, all candidate speed gains positive,
average adjusted speed gain near or above `1.0%`, at least one confirming
adjusted run at or above `1.0%`, no one-position domination, and no repeated
per-position regression pattern. Positive but weaker evidence is reported as
promising, not accepted. Slower, mixed-sign, identity-mismatched, noisy-control,
or dominated evidence is rejected. No summary command stages, commits, merges,
or pushes.

## Overnight Workflow

`scripts/run-coach-overnight.ps1` provides local orchestration without changing
source or Git state. Modes:

```powershell
.\scripts\run-coach-overnight.ps1 -Mode Match
.\scripts\run-coach-overnight.ps1 -Mode Benchmark
.\scripts\run-coach-overnight.ps1 -Mode MatchThenBenchmark
.\scripts\run-coach-overnight.ps1 -Mode AnalyzeExistingMatch
```

Example:

```powershell
Set-Location "<USERPROFILE>\OneDrive\Desktop\Coach Current"

.\scripts\run-coach-overnight.ps1 `
    -Mode MatchThenBenchmark `
    -Games 200 `
    -Concurrency 4 `
    -StockfishElo 2000 `
    -BookPath "<USERPROFILE>\Downloads\rodent.bin" `
    -CandidatePath "<USERPROFILE>\OneDrive\Desktop\Coach Candidates\Coach King List In Place"
```

Opening-book note: Sir Slice's local Rodent Polyglot book is expected at
`<USERPROFILE>\Downloads\rodent.bin`. Keep that path in mind for future
matches, but do not pass it to the current PowerShell wrapper as-is: the
wrapper rejects `.bin` books and currently accepts only PGN or EPD opening
suites through `-BookPath`. To use `rodent.bin`, either run CuteChess directly
with Polyglot support or add wrapper support for `.bin` before using it in
automated Coach matches.

Benchmark-only example:

```powershell
Set-Location "<USERPROFILE>\OneDrive\Desktop\Coach Current"

.\scripts\run-coach-overnight.ps1 `
    -Mode Benchmark `
    -BaselinePath "<USERPROFILE>\OneDrive\Desktop\Coach Current" `
    -CandidatePath "<USERPROFILE>\OneDrive\Desktop\Coach Candidates\<candidate>"
```

Dry-run example:

```powershell
.\scripts\run-coach-overnight.ps1 `
    -Mode Benchmark `
    -BaselinePath "<USERPROFILE>\OneDrive\Desktop\Coach Current" `
    -CandidatePath "<USERPROFILE>\OneDrive\Desktop\Coach Candidates\<candidate>" `
    -DryRun
```

The script validates CuteChess exit status, PGN presence, completed game count,
Coach wins/draws/losses, score percentage, win percentage, and logs. Logs are
decoded as UTF-8, UTF-16LE, or UTF-16BE and scanned for illegal moves,
disconnects, timeouts, time forfeits, crashes, errors, warnings, and stalls. If
the match is incomplete or abnormal, benchmarking does not proceed.

Before benchmarks it waits for cooldown when following a match, verifies
CuteChess/Stockfish are gone, samples CPU several times, ignores the lightweight
`node.exe ./mcp/server.mjs` process, and defers if the machine remains busy. It
does not kill processes automatically. It then runs a control, candidate
confirmations, and the multi-run summary into an external timestamped or
user-selected result directory. Existing result directories are not overwritten
unless `-Force` or `-Resume` is supplied. With `-Resume`, completed benchmark
JSON phases are reused and partial outputs survive failures. With `-DryRun`, the
script prints result paths and commands without launching CuteChess, Stockfish,
or benchmark searches.

`MatchThenBenchmark` is optional after a long match. Benchmarking remains
subject to cooldown and the quiet-machine checks, and it will not begin after an
incomplete or abnormal match.

If the neural PGN analyzer exists, `-RunPgnAnalyzer` may call it read-only:

```powershell
<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural\tools\analyze-pgn.mjs
```

## Windows Task Scheduler

Create a task manually. Use:

- Program: `powershell.exe`
- Arguments:
  `-NoProfile -ExecutionPolicy Bypass -File "<USERPROFILE>\OneDrive\Desktop\Coach Current\scripts\run-coach-overnight.ps1" -Mode MatchThenBenchmark -Games 200 -Concurrency 4 -StockfishElo 2000 -CandidatePath "<USERPROFILE>\OneDrive\Desktop\Coach Candidates\Coach King List In Place"`
- Start in:
  `<USERPROFILE>\OneDrive\Desktop\Coach Current`

Choose a scheduled start time and, if desired, enable "Start the task only if
the computer is on AC power." Do not create scheduled tasks from the benchmark
scripts themselves.

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
