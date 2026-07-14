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
| `validate-dataset.mjs`  | Structural + chess-legality validation |
| `inspect-dataset.mjs`   | Distribution / histogram / Coach-vs-SF report |
| `features.mjs` / `features.py` | Identical JS + Python feature encoders |
| `fixtures/feature-parity.json` | ≥20 FEN → expected feature indices |
| `lib/*.mjs` | prng, coach loader, position identity, pgn reader, replay, sampling, splits, features, jsonl, stockfish, moveutil |
| `schemas/*.json` | JSON Schemas for both record types |
| `tools/gen-selfplay-pgn.mjs` | **DEV/TEST ONLY** synthetic seeded games (not training data) |
| `tests/neural.test.mjs` | `node --test` suite |

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

node extract-positions.mjs "game1.pgn" "game2.pgn" --out artifacts\positions.jsonl
node label-positions.mjs   --in artifacts\positions.jsonl --out artifacts\labelled.jsonl --nodes 50000
node validate-dataset.mjs  --in artifacts\labelled.jsonl
node inspect-dataset.mjs   --in artifacts\labelled.jsonl --json artifacts\report.json
node --test tests\neural.test.mjs
python features.py fixtures\feature-parity.json   # JS/Python parity check (use `py` if `python` is unavailable)
```

`--nodes 25000` is the reproducible default; real match-PGN labelling used
**50000** nodes (see the trial report). Labelling is resumable — re-running the
same command after an interruption skips already-labelled positions; add
`--retry-failed` to re-attempt any `stockfish:null` records.

## Output location & Git hygiene

Write datasets **outside** the repo (recommended for real runs, e.g.
`<USERPROFILE>\OneDrive\Desktop\Coach Neural Data`) or to
`Coach Neural\neural\artifacts\` (git-ignored). This `neural/.gitignore` covers
`artifacts/`, `*.jsonl`, checkpoints, summaries, logs, models, Python caches,
`node_modules`, and Stockfish binaries — but only **within `neural/`**, so keep
in-repo generated data under `neural\artifacts\` (the repo-root `artifacts\`
would not be ignored). Never commit datasets or the engine.
