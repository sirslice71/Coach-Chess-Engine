# Coach Neural — Data Pipeline Acceptance Report (corrected)

Parallel neural-evaluation track. Stages 1–4 (collect → dedup → label → split)
plus step-5 feature groundwork. **Production Coach was not modified.** This
report supersedes the earlier delivered `NEURAL-TRIAL-REPORT.md`, which was
generated in a Linux sandbox and contained a false claim (see
[§Corrections](#corrections)). All numbers below were produced on the user's
Windows machine with the real Stockfish 18 engine and the real Coach match PGNs.

## Environment

- Worktree: `<USERPROFILE>\OneDrive\Desktop\Coach Neural`, branch `neural-eval`,
  based on production commit `ff59d66 Optimize sorted piece-list insertion`.
- Stockfish: **Stockfish 18** —
  `G:\Program Files (x86)\ChessBase\Engines\stockfish-windows-x86-64-avx2_180.exe`.
  Path supplied via `COACH_STOCKFISH_PATH`; never hard-coded in tracked config.
- Node `node --test`; Python via `python` (Python 3.14).
- Coach modules reused **read-only** through `js/uci/uciengine.js`, `js/core/fen.js`,
  `js/game/pgn.js`, `js/core/move.js` (no production file touched).

## Corrections

The prior report's point 36 claimed `Coach Current\js\core\board.js` was
**truncated** and that several production files (`board.js`, `move.js`,
`evaluation.js`) had uncommitted changes. **Direct verification showed this is
false:** `board.js` is complete in both worktrees (ends with `clearMoveHistory()`
and the closing brace), and `git status` in `Coach Current` shows only
`js/engine/attack.js` and `js/engine/search.js` modified (the concurrent
optimization track) plus an untracked `codex-optimization-brief.md`. Nothing
required restoration. The truncation claim is retracted and not repeated.

A stray zero-byte `zidglFsF` file existed only in the delivery outputs folder; it
was never copied into the worktree, so there was nothing to remove here.

## Policy fixes applied during acceptance

Three gaps between the delivered code and the required identity/label contract
were found and fixed inside the neural worktree; each changes the dataset, so the
trial artifacts were **regenerated** (they are git-ignored and never committed):

1. **Halfmove-clock bucket in the position key.** The key previously excluded the
   halfmove clock entirely, so two positions in different fifty-move regimes
   (e.g. hm=10 vs hm=98) deduplicated together. The key now appends a coarse
   bucket `hm0-49 / hm50-79 / hm80-99 / hm100+`. Fullmove remains excluded.
2. **Per-position hash reset.** The Stockfish driver never sent `ucinewgame`, so
   the transposition table carried over between positions — fixed-node labels
   depended on evaluation order and on resume boundaries. A `ucinewgame`+`isready`
   is now issued before every position; recorded as `hashResetPerPosition: true`.
3. **Canonical en-passant in the stored FEN.** The dedup key used the strict
   legal-ep rule but the stored FEN kept the raw ep field, so the feature encoder
   saw phantom ep bits (e.g. after `1.e4`). Extraction now stores a canonical FEN
   (ep normalized to `-` unless a legal ep capture exists), so key, record, and
   features agree; Python-purity of the encoder is preserved.

Two robustness bugs were also found by the resumability test and fixed:

4. **Torn-line healing on resume.** A crash could leave a final line with no
   trailing newline; the next resume appended onto it, merging two records into
   one malformed line. `AppendWriter` now truncates a torn trailing line on open,
   so the incomplete record is discarded and its position is cleanly re-labelled.
5. **`--retry-failed` duplicate keys.** Retrying a failed record appended the new
   label but left the stale `stockfish:null` record, producing a duplicate
   `positionKey`. The retry path now compacts the failed records first.

## Real-data trial (Stockfish 18, 50 000 nodes)

Source PGNs (both on the Desktop):
`Coach_vs_Shallowblue_1a5caa4_500ms_60games.pgn`,
`Coach_vs_Shallowblue_87062e3_500ms_60games.pgn`.

| Metric | Value |
|---|---|
| Games read | 120 |
| Positions sampled | 2258 |
| Duplicates removed | 90 |
| Unique positions | 2168 |
| Split (train/val/test) | 1713 / 150 / 305 |
| Side to move (w/b) | 1155 / 1013 |
| Phase (opening/middle/end) | 197 / 1252 / 719 |
| In check | 225 |
| Mate-labelled | 191 (White 124 / Black 67) |
| Labelled | 2168 |
| Failed | 0 |
| Throughput | 18.2 pos/sec ≈ 65.7k pos/hour |

Eval histogram (cp, White perspective) — well-centered on real games (the largest
bucket is `-50..50`), unlike the earlier synthetic-game histogram:

```
<=-500:144 | -500..-200:191 | -200..-100:103 | -100..-50:67 |
-50..50:408 | 50..100:154 | 100..200:183 | 200..500:424 | >=500:303
```

**Validation:** 2168 records, 2168 unique keys, 120 distinct games, 0 malformed,
no torn line, **0 failures**.

**Coach classical vs Stockfish (static, research only):** n=1977 non-mate,
mean abs error **193 cp**, median **156 cp**, Pearson **r=0.761**. Coach's
classical eval tracks direction well but is materially off on sharp/tactical
positions (worst outliers ~1300 cp). Not an Elo statement.

## Verification performed

- **Unit tests:** `node --test neural/tests/neural.test.mjs` → **14 pass, 0 fail**
  (added: halfmove-bucket distinction, canonical-ep normalization, validator FEN
  sanity, torn-line writer healing).
- **Feature parity:** `python features.py fixtures/feature-parity.json` →
  **27 fixtures, 0 mismatches**. Feature dimension **781** (0..767 piece-square,
  768 stm, 769..772 castling, 773..780 ep file). Described as a *sparse
  piece-square baseline value-network feature set* — not NNUE/HalfKP.
- **Resumability:** labelled 20, interrupted, appended a torn line, resumed →
  40 more with 20 skipped, torn line healed → **60 records, 0 malformed, 0
  failures**. `--retry-failed` on an injected `stockfish:null` record →
  re-labelled with **no duplicate key** (61 records / 61 unique / 0 failures).
- **MultiPV=3 subset (29 positions, both sides, all phases):** the bulk MultiPV=1
  best move is the MultiPV=3 top move in **27/29** cases with **0 illegal
  moves**; the 2 non-matches are mate-in-2 positions with several equal `#2`
  moves (ties, not disagreements).

## Validity contract (what `validate-dataset.mjs` actually enforces)

Structural: every non-trailing line parses (a single torn trailing line is
tolerated and reported); FEN imports through Coach; `sideToMove` matches the FEN;
split ∈ {train,val,test}; each source game maps to one split; `positionKey` is
unique. Board sanity (static): side-to-move token valid; 8 ranks; exactly one
king per side; no pawns on rank 1/8; the side-not-to-move is not already in check
(best-effort). Label sanity: `bestMove` and `pv[0]` are legal Coach moves;
exactly one of `scoreCpWhite`/`mate` is non-null; `scorePerspective === "white"`.
It does **not** prove full historical game legality or castling-rights/rook
consistency.

## Score & mate convention

All scores are **White-positive** (`scoreCpWhite > 0` ⇒ White better),
independent of side to move; UCI side-to-move values are negated for Black, and
`wdl` is stored White-relative (win/loss swapped for Black to move). Mate is
stored separately: `mate` is a signed White-positive distance and `scoreCpWhite`
is `null` (and vice-versa).

## Limitations

- 2168 positions is a trial, not a training corpus.
- Source games are 500 ms Coach-vs-Shallowblue matches; broaden the PGN set for a
  representative corpus.
- Coach static eval is `evaluate().total` only (no search); phase is a simple
  24-point material heuristic.
- No model has been trained and no neural evaluator has been integrated (out of
  scope for this stage).

## Confidence

High that the pipeline is correct, deterministic, resumable, and leak-free
(verified by 14 tests, interrupt/resume/torn/retry, MultiPV cross-check, and
validation). Medium on final dataset *representativeness* until it is re-run on a
larger, more varied real-PGN set (see the overnight-run plan the reviewer
prepared).
