# Coach Neural — Stockfish-labelled position dataset pipeline

Parallel **research / infrastructure** track for a future neural value network.
This stage covers roadmap steps 1–4 (collect → dedup → label → split) plus
minimal step-5 groundwork (feature encoders). It does **not** touch Coach's
production evaluation, search, move generation, board representation, UCI,
TT, qsearch, LMR, null-move, or move ordering. It only *reuses* Coach's board,
FEN, legal move generation and static evaluation, read-only, via the public
`createEngineCore()` factory.

## Isolation

- Lives in the separate worktree `Coach Neural` on branch `neural-eval`,
  based on production commit `ff59d66`.
- Reuses Coach modules through `../js/...` relative imports (or `COACH_ROOT`).
- No production file is modified.

### One-time worktree setup (run on Windows)

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Current"
git worktree add -b neural-eval "<USERPROFILE>\OneDrive\Desktop\Coach Neural" ff59d66
# then drop this neural/ folder in at the worktree root and:
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"
```

## Pipeline

```
PGNs ──► extract-positions.mjs ──► positions.jsonl ──► label-positions.mjs ──► labelled.jsonl
                 │                                              │
          (replay via Coach,                          (persistent Stockfish,
           sample, dedup, split,                       fixed nodes, White-persp,
           Coach static eval)                          resumable checkpoint)

validate-dataset.mjs   inspect-dataset.mjs   features.mjs / features.py (+ parity fixture)
```

### Files

| File | Role |
|------|------|
| `extract-positions.mjs` | PGN → unique sampled split positions (+ Coach static eval) |
| `label-positions.mjs`   | Resumable Stockfish labelling |
| `validate-dataset.mjs`  | Structural + chess-legality validation (gameKey-authoritative split check) |
| `inspect-dataset.mjs`   | Distribution / histogram / Coach-vs-SF report |
| `tools/analyze-dataset.mjs` | Read-only deterministic dataset analysis → JSON + console |
| `tools/merge-corpus.mjs` | Safe incremental corpus merging (first input wins; splits preserved) |
| `tools/analyze-pgn.mjs` | Read-only PGN triage: validity, exact-duplicate games, opening diversity, book verdict |
| `tools/analyze-calibration.mjs` | Read-only offline score-recalibration study (see `CALIBRATION-REPORT.md`): fits 4 deterministic transforms on validation only, touches test once for the selected transform |
| `tools/refine-phase-calibration.mjs` | Follow-up refinement (see `CALIBRATION-REFINEMENT-REPORT.md`): narrowly-constrained opening-intercept variants, boundary-crossing + score-landscape audits, bootstrap CIs |
| `lib/calibration.mjs` | Reusable calibration transforms (global/phase affine, power compression, bounded piecewise-linear, constrained phase-affine variants A-F) — pure `fit`/`apply`, no I/O |
| `features.mjs` / `features.py` | Identical JS + Python feature encoders |
| `fixtures/feature-parity.json` | ≥20 FEN → expected feature indices |
| `lib/*.mjs` | prng, coach loader (+ square algebraic helpers), position identity, pgn reader, replay, sampling, splits, features, jsonl, stockfish, moveutil, endgame, calibration |
| `schemas/*.json` | JSON Schemas for both record types |
| `tools/gen-selfplay-pgn.mjs` | **DEV/TEST ONLY** synthetic seeded games (not training data) |
| `train/*.mjs` | Offline value-network proof: `dataset`, `model`, `metrics`, `train-value`, `infer` (JS) |
| `train/infer.py` / `train/test_infer.py` | Pure-Python inference twin + tests |
| `train/fixtures/*.json` | Tiny parity fixture model + FEN→output cases (**not** a trained model) |
| `tests/*.test.mjs` | `node --test` suites (`neural`, `provenance-and-tools`, `train`) |

## Feature encoding: 781 baseline + optional endgame groups

The **baseline is 781 binary features and is unchanged** (`encodeFen`): 768
piece-square bits (12 planes × 64 squares), side-to-move, 4 castling bits, 8
en-passant *file* bits. Note what is **not** there: no halfmove/fifty-move
information, no check flag, no mobility/attack information, and no source or
label metadata (so there is nothing to leak).

**Why the baseline has an endgame ceiling.** A linear model over piece-square
bits computes `Σ wᵢxᵢ + b` — a sum of *independent per-piece* terms, i.e. a
piece-square table. "White king on e4" contributes a constant regardless of
everything else. Endgame concepts are **relational**: king-to-pawn distance is
`d(a,b) = max(|fₐ−f_b|, |rₐ−r_b|)`, a function of the *joint* squares. If it
were additively separable then `d(a,b) − d(a,b′) = h(b) − h(b′)` would not
depend on `a` — but it obviously does (moving the king changes which pawn is
nearer). So **no PST weighting can express it**; you need a term indexed by the
*pair* of squares. The same holds for passed pawns (a conjunction/negation over
enemy-pawn squares), opposition, the rule of the square, and rook-behind-passer.
An MLP *can* represent these in principle but must learn a 64×64 relation from a
few thousand endgame rows — learnable, but sample-inefficient.

`encodeFenExtended(fen, groups)` therefore appends compact, **bucketed one-hot**
groups after index 780 (never a dense pair explosion, so the sparse binary
representation is preserved):

| group | bits | supplies |
|-------|-----:|----------|
| `endgame-material-class` | 13 | ending class one-hot, opposite/same-coloured bishops, non-pawn-material buckets |
| `passed-pawns` | 38 | per side: count, most-advanced rank, protected/connected/outside/mobile, distance-to-promotion |
| `king-distance` | 34 | per side: king↔best-passer, enemy-king↔promotion square, centralization, king↔nearest pawn, rule-of-the-square (+ explicit side-to-move interaction) |
| `king-pawn-geometry` | 11 | direct/distant opposition and holder, king alignment, king-king distance |
| `rook-ending` | 16 | per side: rook behind own/enemy passer, rooks on the 7th, open/semi-open file, enemy king cut off |
| `interactions` | 8 | a few justified conjunctions only (advanced passer × outside-square, rook class × rook-behind-passer, low material × king closer, protected × advanced) |

Rules that keep this safe:

- **The baseline is never altered in place** — `encodeFenExtended(fen, [])` is
  bit-identical to `encodeFen(fen)`, and extended vectors keep indices `<781`
  unchanged. Groups can be enabled independently for ablation.
- Offsets are assigned in the canonical `GROUP_ORDER` over the **enabled** groups
  only, so a model **must** record its `featureGroups` (exported models do, along
  with `featureSchema`). Inference re-encodes from that list — otherwise the
  weights are meaningless.
- Everything derives from the FEN alone: no Stockfish, no Coach evaluation, no
  search, no metadata. Clocks are deliberately ignored (a test pins this).
- Python (`features.py` + `endgame.py`) mirrors JS exactly; parity fixtures cover
  both the baseline and the extended encoding.

```powershell
# train with feature groups (comma-separated); omit --features for the baseline
node train\train-value.mjs --in "C:\...\labelled.jsonl" --model linear `
     --features passed-pawns,king-distance --out-model "C:\...\model.json"
```

## Position identity (dedup key)

`positionKey = "<placement> <stm> <castling> <ep> <halfmoveBucket>"` where:

- `ep` is included **only if a legal en-passant capture exists** in that
  position (checked with Coach's legal move generator); otherwise `-`.
- `halfmoveBucket` is a coarse bucket of the halfmove clock — `hm0-49`,
  `hm50-79`, `hm80-99`, `hm100+` (the fifty-move rule fires at 100 halfmoves).
  This keeps two otherwise-identical positions in **different fifty-move
  regimes** distinct (one far from a draw claim, one on its doorstep) while
  still deduplicating trivial clock differences.
- The **fullmove** counter is excluded — it never changes the legal
  continuations.

The stored `fen` is a **canonical FEN**: its ep field is normalized to `-`
unless a legal en-passant capture exists, so the dedup key, the stored record,
and the sparse feature encoder all agree on the en-passant state (clocks are
preserved). Two FENs differing only in an irrelevant ep square, or in a
same-bucket clock, map to the same key.

## Sampling (defaults)

Skip first 8 plies, sample every 4 plies, ≤20 positions/game, exclude
game-over positions, keep in-check positions (tagged `inCheck`), deterministic
seed. A plain every-4 stride from ply 8 collapses to **White-to-move only**,
so each game gets a deterministic phase offset in `[0, every)` derived from its
key (`balanceOffset`), which balances side-to-move across the corpus without
oversampling consecutive plies. Optional global caps: `perPhase`,
`maxDuplicateMaterial`.

## Splits

Game-level, deterministic, seeded: 80/10/10 train/val/test. Split is a hash of
a stable `gameKey` (headers + full mainline). **Every position of a game stays
in one split** — no position-level leakage.

## Source provenance (record `source` block)

Each record carries:

| field | meaning |
|-------|---------|
| `file` | human-readable **basename** (e.g. `baseline_vs_shallowblue_500ms_60games.pgn`) — **not unique**: two inputs in different folders can share a basename |
| `id` | **stable unique source id**: the input path relative to `--source-root` (`/`-normalized, e.g. `Coach AB/baseline_vs_shallowblue_500ms_60games.pgn`), or `<parentDir>/<basename>` when no root is given. Never an absolute path or username |
| `gameIndex` | 0-based index of the game within its source file |
| `gameKey` | **content-derived** game identity (hash of headers + full mainline). **Authoritative** for split-leakage |
| `ply` | ply at which the position was sampled |

**Why basenames alone are insufficient:** two different PGNs that share a
basename (e.g. `baseline_vs_shallowblue_500ms_60games.pgn` under both `Coach AB`
and `Coach Null AB`) would collide on `basename + gameIndex`, making unrelated
games look like one game "spanning multiple splits." `id` disambiguates the
files, and `gameKey` identifies the actual game by content.

**Authoritative split-leakage identity:** the validator groups records by
`gameKey` (never by basename/path/index/PGN order) to decide whether one game
spans multiple splits. `id + gameIndex` is used only for provenance reporting.
Pass `--source-root DIR` to `extract-positions.mjs` so ids are stable, unique,
and free of absolute paths; extraction **fails fast** if two inputs resolve to
the same id.

### Semantic source ids + metadata (`--sources`)

For corpora where a filename is a poor family label, pass a manifest that gives
each input a **semantic id** and provenance metadata (opponent, time control,
book, engine strength). The manifest lives **outside Git** (it holds absolute
paths); records store only the lean `source.id`, and the metadata map is written
to the extract summary keyed by id, so no machine-specific path enters records:

```json
{ "sources": [
  { "path": "C:\\...\\Coach_vs_Shallowblue_1s_komodo_500games.pgn",
    "id": "shallowblue-1s-komodo-part1",
    "meta": { "opponent": "Shallowblue", "timeControl": "1s/move",
              "book": "komodo.bin", "bookDepth": 10 } }
] }
```

Duplicate ids or paths are rejected. `source.id` is what family-aware reporting
and `--exclude-family` match against.

### Triage a PGN batch BEFORE labelling it

```powershell
node .\tools\analyze-pgn.mjs --in "C:\...\match.pgn" --player Coach --json "C:\...\pgn-report.json"
```

Read-only and engine-free. Reports validity/terminations, **exact-duplicate games**,
opening diversity (distinct 4/8/12/16-ply lines, top-1/5/10 concentration, ECO
spread), the player's score, game lengths, and a book verdict
(`good for larger corpus generation` / `usable but still concentrated` /
`unsuitable`).

**Score reporting distinguishes win% from score%** and always prints a 95% CI:

```
Coach: W81 L111 D8 | win 40.5% draw 4% loss 55.5% -> SCORE 42.5% 95%CI [35.8, 49.2] | Elo -52.5 [-101.7, -5.4]
```

`score% = (wins + 0.5*draws)/games` (Elo is derived from the **score**, never the
win rate). The interval matters: a 100-game match carries roughly **±10 points**
of 95% uncertainty, so consecutive batches scoring 43.0% and 42.5% are **not**
distinguishable (that real pair differs by 0.5 pp with a 95% CI of ±11.5 pp).
Treat a single match score as an estimate, not a measurement. Games are treated
as independent; paired openings (`-repeat`) add mild correlation, so the
interval is approximate.

**Why this matters:** a deterministic engine pair plus a non-randomising book
can emit hundreds of byte-identical games from a handful of opening lines, and
raw game counts hide it completely. A real example from this project: a
600-game batch contained only **417 distinct games** (largest duplicate group:
**34 identical games**) drawn from **5–6 opening lines** — every duplicate costs
Stockfish labelling time and skews match statistics. Switching books took the
same 100-game format from **5 → 39 distinct 8-ply lines**, **5 → 37 ECO codes**,
top-1 opening share **62% → 6%**, and exact-duplicate rate **40% → 0%**. Run this
before committing engine time to a large match.

### PGN validation (abnormal terminations)

CuteChess writes `[Termination "..."]` **only for abnormal endings**
(`abandoned` after a disconnect, `time forfeit`, `illegal move`, stalled
connection); a normally-finished game has **no** Termination tag. Extraction
therefore **excludes any game with a non-`normal` Termination by default** and
reports the counts per source (`--include-abnormal` keeps them). Never assume a
game is valid just because it has a `Result` tag — a disconnected game still
carries one.

**Backward compatibility:** datasets produced before provenance existed have no
`source.gameKey`/`source.id`. The validator then falls back to a proxy identity
and downgrades any game-level leakage to a **WARNING** (never a hard failure),
printing a note that the legacy basename proxy over-reports on basename
collisions and that the dataset should be regenerated with provenance for
authoritative validation. To migrate an existing labelled set without re-running
Stockfish: re-run `extract-positions.mjs` with `--source-root`, confirm the
regenerated `positionKey` set exactly matches the old set, then join the old
labels onto the new records by `positionKey`.

## Stockfish labelling

Persistent UCI process, `Threads=1`, `Hash=64`, `MultiPV=1`,
`UCI_ShowWDL=true`, fixed **nodes** (default 25000) for reproducibility.
All of depth / nodes / hash / threads / multipv are configurable and recorded
in every record's `labelling` block.

**Per-position hash reset:** a `ucinewgame` (followed by `isready`) is issued
**before every position**, clearing the transposition table. Without this the
persistent TT would carry over between positions, making fixed-node labels
depend on evaluation order *and* on where a resumed run happened to restart.
With it, a position's label is identical regardless of order or resumption.
The policy is recorded per record as `labelling.hashResetPerPosition: true`
(the small throughput cost of the reset is the price of reproducibility).

### Score perspective — one consistent convention

**All scores are White-positive**: `scoreCpWhite > 0` ⇒ White better,
`< 0` ⇒ Black better, regardless of side to move. UCI reports side-to-move
relative values, so the driver negates for Black to move. `wdl` is stored
White-relative (win/loss swapped when Black to move).

### Mate representation

Mate is stored **separately** from centipawns: `stockfish.mate` is a signed
mate distance (White-positive; e.g. `+3` White mates in 3, `-2` Black mates in
2) and `scoreCpWhite` is `null`. For non-mate positions `mate` is `null`.

## Resumability

Append-only JSONL, fsync-flushed. Resume skips any `positionKey` already
present with a Stockfish label; `--retry-failed` re-attempts records written
with `stockfish:null`. A torn final line from a crash / Ctrl-C is detected and
dropped on the next read — never parsed as data, never duplicated. A
`.checkpoint.json` is written periodically. SIGINT flushes and exits cleanly.

## Feature encoding (step-5 groundwork)

Sparse indices, dimension **781**, a pure function of the FEN string so JS and
Python match exactly (`fixtures/feature-parity.json` is the contract):

```
0..767    piece-square: plane*64 + square
          plane order WP WN WB WR WQ WK BP BN BB BR BQ BK (0..11)
          square = rank(0=rank1)*8 + file(a=0); a1=0 … h8=63
768       side to move (set iff White to move)
769..772  castling K Q k q
773..780  en-passant file a..h (set iff FEN ep field != '-')
```

The encoder is a pure function of the FEN string, so it sets the ep bit iff the
FEN's ep field is not `-`. Because the pipeline stores the **canonical FEN**
(ep normalized to `-` unless a legal ep capture exists), the feature ep bit, the
dedup key, and the stored record all agree on en-passant state — a position like
the one after `1.e4` (ep target `e3`, no legal capture) carries **no** ep
feature. The Python purity is preserved: canonicalization happens once in JS at
extraction (which has Coach's move generator), and both encoders then operate on
the same stored canonical FEN string.

## Usage (Windows PowerShell)

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"

# Stockfish path via env (never hard-code it in tracked config)
$env:COACH_STOCKFISH_PATH = "G:\Program Files (x86)\ChessBase\Engines\stockfish-windows-x86-64-avx2_180.exe"

# --source-root makes source ids stable/unique and free of absolute paths
node extract-positions.mjs "game1.pgn" "sub\game2.pgn" --source-root . --out artifacts\positions.jsonl
node label-positions.mjs   --in artifacts\positions.jsonl --out artifacts\labelled.jsonl --nodes 50000
node validate-dataset.mjs  --in artifacts\labelled.jsonl
node inspect-dataset.mjs   --in artifacts\labelled.jsonl --json artifacts\report.json
node tools\analyze-dataset.mjs --in artifacts\labelled.jsonl --json artifacts\analysis.json
node --test tests\neural.test.mjs tests\provenance-and-tools.test.mjs
python features.py fixtures\feature-parity.json   # JS/Python parity check (use `py` if `python` is unavailable)
```

`--nodes 25000` is the reproducible default; real match-PGN labelling used
**50000** nodes (see the trial report). Labelling is resumable — re-running the
same command after an interruption skips already-labelled positions; add
`--retry-failed` to re-attempt any `stockfish:null` records.

### Growing the corpus safely (incremental merge)

Adding new games never re-splits old ones: `assignSplit` is a pure function of a
game's `gameKey`, so an existing game's split cannot change when new games are
added. To fold a new labelled batch into an accepted corpus **without relabelling
anything already accepted**:

```powershell
# 1) extract the new games (semantic ids, abnormal games auto-excluded)
node extract-positions.mjs --sources "C:\...\run-002\sources.json" --out "C:\...\run-002\positions.jsonl"
# 2) label ONLY positionKeys not already present in the accepted corpus, then
# 3) merge — the FIRST --in wins, so accepted labels/splits are preserved
node .\tools\merge-corpus.mjs --in "C:\...\run-001-fixed\labelled.jsonl" `
     --in "C:\...\run-002\labelled-new.jsonl" `
     --out "C:\...\combined\labelled.jsonl" --json "C:\...\combined\merge-report.json"
```

`merge-corpus.mjs` verifies the merged result (unique keys, no positionKey in two
splits, no `gameKey` spanning splits) and confirms the prior corpus's split
assignments are unchanged; it exits non-zero on any violation.

### Source-family holdouts

`train-value.mjs --exclude-family <substring>` (repeatable) drops matching
`source.id`s from **training only**, leaving val/test intact, so a family can be
scored on its stored test rows after being excluded from training. Every run also
reports `bySourceFamilyTest`. Game-level split boundaries are never crossed.

`analyze-dataset.mjs` is **read-only** (never modifies its input) and
deterministic. It prints a console summary and, with `--json`, writes a report
covering integrity (incl. `gameKey`-based leakage), provenance by unique source
id, position/score/mate distributions, and Coach-vs-Stockfish error breakdowns.
The `--json` output directory is **not** created automatically — it errors
clearly if the directory is missing. Reports and datasets stay **outside Git**
(or under the git-ignored `neural\artifacts\`).

## Neural value-network proof (`train/`)

An **offline engineering proof** that the 781-dim sparse features carry learnable
signal. It is **not** wired into Coach — no search/eval integration, no Elo
claim. Pure Node.js (training + inference) with a pure-Python inference twin; no
NumPy/PyTorch/TensorFlow.

- **Purpose / limits:** proves mechanics only, on the narrow `run-001-fixed`
  corpus (100% Coach-vs-Shallowblue @ 500 ms). Not evidence of playing-strength
  improvement.
- **Target convention (primary):** `target = tanh(cp / 400)`, White-positive
  (`>0` ⇒ White better); centipawns clipped to ±1000; mate → `sign(mate)·0.999`.
  Secondary comparison: WDL expected score `(w + 0.5·d)/total`. Invert with
  `cp = atanh(value)·400`.
- **Architecture:** sparse `781 → H` (ReLU) `→ 1` (tanh); `H ∈ {16,32,64}`, plus
  `constant` and `linear` baselines. Deterministic Adam, seeded init, batching,
  best-validation checkpoint (early stopping). Uses the stored game-level split
  **as-is** — no reshuffling, no label/source/split used as a feature.
- **Export format** (plain JSON, `train/model.mjs`): `modelVersion`,
  `featureDim` (781), `kind` (`linear`|`mlp`), `hidden`, `hiddenActivation`,
  `outputActivation`, `targetTransform`, dense `layers` (`W`/`b` or
  `W1`/`b1`/`W2`/`b2`), `output` convention, and `training` metadata.
- **Validation/test policy:** select the model by best **validation** loss;
  report **test** only once after selection. Do not tune on test.

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"
$IN  = "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\run-001-fixed\labelled.jsonl"
$OUT = "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\proof-run"   # OUTSIDE Git
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# Train (primary model). Model + report are written OUTSIDE the repo.
node train\train-value.mjs --in $IN --model mlp --hidden 64 --target tanh --scale 400 `
     --lr 0.005 --patience 15 --epochs 120 --seed 1 `
     --out-model "$OUT\proof-model.json" --report "$OUT\mlp64.json"

# Baselines / ablations: --model constant | linear ; --shuffle-labels (control)
# Python/JS inference parity (uses the tiny committed fixture model):
node --test tests\train.test.mjs                              # JS side
python train\infer.py train\fixtures\proof-model-fixture.json train\fixtures\inference-parity.json
python train\test_infer.py                                   # Python side

# Node inference benchmark (standalone; NOT engine-integrated):
node train\infer.mjs --model "$OUT\proof-model.json" --bench --in $IN --n 5000
```

**Parity:** JS and Python inference must agree within tolerance **1e-6** (chosen
generously; actual difference is ~machine-epsilon because both iterate the
sorted sparse indices in identical order and use IEEE-754 doubles). The
committed `train/fixtures/proof-model-fixture.json` is a **tiny** deterministic
model for parity only — **the full trained model is never committed** (it lives
under `proof-run\`, outside Git). ⚠️ **No model is integrated into Coach**;
classical evaluation is unchanged.

## Output location & Git hygiene

Write datasets **outside** the repo (recommended for real runs, e.g.
`<USERPROFILE>\OneDrive\Desktop\Coach Neural Data`) or to
`Coach Neural\neural\artifacts\` (git-ignored). This `neural/.gitignore` covers
`artifacts/`, `*.jsonl`, checkpoints, summaries, logs, models, Python caches,
`node_modules`, and Stockfish binaries — but only **within `neural/`**, so keep
in-repo generated data under `neural\artifacts\` (the repo-root `artifacts\`
would not be ignored). Never commit datasets or the engine.
