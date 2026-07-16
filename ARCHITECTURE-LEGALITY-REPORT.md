# Coach conservative legality fast path

Isolated worktree: `experiment/legality-fast-path`, based on production
HEAD `bf1fdb1208a5027669f3928480692083b6c96087` — a clean checkout, **not**
built on top of `experiment/architecture-foundation` (the timing-negative
PST prototype from the prior architecture study). Investigates whether a
conservative subset of pseudo-legal moves can be proven legal without
`makeMove()`/`undoMove()`, as an architectural prerequisite for future
incremental evaluation, NNUE-style accumulators, and deeper search.

## Result: correct, and timing-positive — Classification A, provisionally accepted

The chosen fast path ("Candidate B" — moves not aligned with the mover's
own king, when not in check, not a king move, not castling, not en
passant) is proven safe by an exhaustive case analysis, matches on
**429,326** randomly-walked positions and **60,000** move-by-move board
states with **zero mismatches**, passes **16/16** targeted exception tests
covering every named tricky case, and reproduces all **38** exact-tree
diagnostic-anchor rows identically to a clean production baseline. It
avoids **24.6%-34.6%** of legality make/undo pairs on the four bounded
instrumentation positions. The `stability-short` benchmark (1 control +
3 candidate runs) measured a control-adjusted whole-search speed gain of
**+4.64% mean / +4.41% median** (raw +4.56%/+4.32%), every candidate run
positive, every position positive in every run, no single position
dominating the gain (tactical-capture 36.1% of the positive mean, not
&gt;50%), exact identity throughout. All of this task's provisional
acceptance criteria are met.

## Phase 1 — verified production state

- `Coach Current`: branch `main`, HEAD `bf1fdb1208a5027669f3928480692083b6c96087`, upstream `origin/main` in sync (0/0), nothing staged.
- `js/engine/attack.js` / `js/engine/search.js` show as modified in `git status`, but `git hash-object` confirms their working-tree blob hashes are byte-identical to HEAD's committed blobs (line-ending artifact only, zero semantic diff, as in the prior architecture study). `codex-optimization-brief.md` untracked. None touched.
- Node v24.18.0, PowerShell 5.1.26100.8875. Machine quiet (only session infrastructure processes) at benchmark time.
- Baseline gates: `uci/see/material/zobrist/engine_regressions/diagnostic_anchors` = 134 tests, 123 pass, 0 fail, 11 skip; `perft` = 34/34; `nullmove` = 6/6.

## Phase 2 — legality-generation map

```
MoveGenerator.generateMoves(capturesOnly)          -- js/engine/movegen.js
  produces PSEUDO-LEGAL moves for every piece type, unconditionally:
  knights/bishops/rooks/queens/king/pawns (incl. promotions, en passant
  flag) + generateCastlingMoves() (only when !capturesOnly).

  generateCastlingMoves() ALREADY prefilters check-safety directly using
  Attack.isSquareAttacked() on the king's current/pass-through/destination
  squares BEFORE emitting the move -- a castling move that reaches
  LegalMoveGenerator has already had its check-safety independently
  verified by the pseudo-legal generator itself. (Not exploited by this
  narrow prototype -- castling stays on the fallback path by design, see
  Phase 7's proof scope -- but noted as a legitimate future extension.)

LegalMoveGenerator.generateMoves(capturesOnly)     -- js/engine/legalmovegen.js
  for each pseudo-legal move:
    generate pseudo-legal move
        -> [NEW] conservative fast path: proven-safe? -> accept, no make/undo
        -> otherwise: makeMove -> isSquareAttacked(own king) -> undoMove -> accept/reject

  ONE single legality path is used everywhere: root search, full-depth
  search recursion, qsearch (both the capturesOnly branch AND the
  full-generateMoves check-evasion branch, gated on `inCheck` at the
  search.js call site itself), perft, UCI position replay
  (js/uci/uciengine.js), and game-facing move application
  (js/game/gamecontroller.js). Confirmed via direct grep of every
  legalMoveGenerator.generateMoves()/generateCaptures() call site.
```

## Phase 3 — move-category classification

| category | provable without make/undo? | info required | already available? |
|---|---|---|---|
| king move | no | destination-attacked-after-vacating-origin (classic "king moves along the checking ray" bug) | no — needs a smarter check ("Candidate D", not attempted) |
| castling | in principle yes (already pre-verified by the generator itself) | none beyond what `generateCastlingMoves()` already checks | yes, but out of this candidate's scope |
| en passant | no | double-pawn-removal discovered-check edge case | excluded unconditionally |
| move while in check | no | checker identity, block/capture/king-move analysis | excluded unconditionally (whole side falls back) |
| pinned-piece move | only if genuinely unpinned | full pin computation (Candidate C) or conservative alignment (Candidate B) | Candidate B needs only `board.whiteKing`/`blackKing`, already cached |
| line-opening move vs. own king | subsumed by "aligned with king" | same as above | same as above |
| ordinary non-king move, unaligned | **yes** | moving piece's origin square vs. own king square (O(1)) | yes, no new state |
| promotion / underpromotion | same as ordinary move (pin logic doesn't depend on the promoted piece) | same alignment check | yes |
| capture of a checking/pinning piece | only relevant while in check (excluded) or affects the enemy's own king (irrelevant to this proof) | n/a | n/a |
| double check | only exists while in check (excluded) | n/a | n/a |

## Phase 4 — bounded instrumentation (4 positions, depth 5, temporary, reverted)

| position | total pseudo-legal | make/undo pairs | fast-path-eligible (unalignedNonKing) | as % of all | as % of not-in-check | aligned-illegal (validates the split is meaningful) |
|---|---|---|---|---|---|---|
| opening | 90,047 | 90,047 | 31,136 | 34.6% | 38.6% | 250/46,948 (0.5%) |
| middlegame-quiet | 255,861 | 255,861 | 80,001 | 31.3% | 45.2% | 2,727/84,274 (3.2%) |
| middlegame-tactical | 315,870 | 315,870 | 86,654 | 27.4% | 37.3% | 1,738/126,876 (1.4%) |
| rook-endgame | 30,108 | 30,108 | 7,418 | 24.6% | 28.4% | 16/6,340 (0.3%) |

**Zero illegal moves among 205,209 fast-path-eligible ("unalignedNonKing") moves across all four positions** — direct empirical corroboration of the proof, not a substitute for it. This total (315,870 pairs for middlegame-tactical) exactly reproduces the prior architecture study's cited figure, validating rather than merely assuming it. `castling` count was 0 in this bounded sample (none of the four positions had castling available at the sampled depth) — a genuine coverage gap in this specific instrumentation pass, though irrelevant to Candidate B's own correctness since castling is excluded from the fast path regardless.

## Phase 5 — pin/check information audit

`grep -rl "pinned\|pinDirection\|checker\|isPinned\|kingRay"` across `js/` returns **nothing** — Coach has zero existing pin/checker infrastructure; everything currently relies on make/undo + `isSquareAttacked()`. This directly favors Candidate B: it requires **no new state and no per-position precomputation** (only `board.whiteKing`/`blackKing`, already cached, and an O(1) rank/file/diagonal comparison per move), versus Candidate C's full pinned-piece map, which would need a from-scratch ray-walk in 8 directions from the king every position (a real, currently-nonexistent capability) plus cache-invalidation logic across search recursion. Candidate B's near-zero marginal compute cost is why it was chosen as the narrow, safe first step.

## Phase 6 — candidate ranking

| candidate | bypass volume | compute cost | patch size | correctness risk | maintainability | notes |
|---|---|---|---|---|---|---|
| **B — line alignment** | 24.6-34.6% of all moves | O(1)/move, no precompute | ~75 lines | very low (proof + 0 empirical counterexamples over 429k+ positions) | high, self-contained | **chosen** |
| D — king-move specialization | smaller (2,533-18,942/position, the `kingMove` category) | moderate (needs an "exclude origin square" attack variant) | moderate, touches `Attack`'s ray-walk | moderate | moderate | complementary to B, not attempted tonight |
| A — explicit unpinned (non-aligned-only) check | potentially higher than B | higher (needs true pin knowledge, same as C) | larger | higher | lower | subsumed by C's info requirement |
| C — cached pinned-piece map | highest ceiling | real (new per-position ray-walk, cache invalidation across recursion) | large, new global state | highest of the safe candidates | lowest | good candidate for **Stage 2**, not a narrow prototype |
| E — no prototype | — | — | — | — | — | not chosen; B clears every bar |

## Phase 7 — safety proof (Candidate B)

**Claim.** Let S be the side to move, K = S's own king's current square, and
m a pseudo-legal move with origin square f. If (i) S is not in check, (ii)
the piece on f is not S's king, (iii) m is not castling, (iv) m is not en
passant, and (v) f is not collinear (same rank, file, or diagonal) with K,
then m is legal.

**Proof.** A move can expose the mover's own king to check only via:
(a) uncovering a rook/bishop/queen line to K that the moved piece was
blocking — requires f to lie ON that line, i.e. collinear with K; ruled
out by (v). (b) responding to an existing check — ruled out by (i): no
checker exists. (c) a king move to a newly-unsafe square (including the
square just vacated) — ruled out by (ii). (d) castling through/out of/into
check — ruled out by (iii). (e) en passant's double-pawn-removal opening a
rank line — ruled out by (iv). (f) knight/pawn/king contact attacks cannot
be "discovered" by an unrelated third piece moving (no intervening square
to block), so they reduce to (a)-(e). Since (a)-(f) are exhaustive and each
is precluded by one of (i)-(v), m cannot expose S's king, and — S not being
in check — m is legal. ∎

**Every exception identified and its handling:**
1. En passant discovered check — excluded unconditionally by (iv).
2. King-moves-along-the-checking-ray bug — excluded unconditionally by (ii); this is exactly why king moves are Candidate D's separate, harder concern.
3. Castling through/out of/into check — excluded unconditionally by (iii), even though separately provably safe by the generator's own prefilter (Phase 2) — kept out of this narrow candidate's scope deliberately.
4. Any in-check response reasoning (blocking, capturing the checker, double check) — excluded wholesale by (i) at the position level, not per-move.
5. Aligned-but-not-actually-pinned pieces — **not a safety exception**, only a lost optimization opportunity: these moves are conservatively pushed to the always-correct fallback rather than fast-pathed, costing performance, never correctness.

No unresolved exceptions. Proceeded to implementation.

## Phase 8 — exact diff

`js/engine/legalmovegen.js` only: added `alignedWithKing()`,
`provenLegalWithoutMakeUndo()` (pure, no board mutation, no allocation),
`LegalMoveGenerator.FAST_PATH_ENABLED` (default `true`, this branch's
shipped behavior; settable to `false` to reproduce the baseline within the
same process for testing), and lightweight `diagnosticsEnabled`/
`diagnostics` counters (disabled by default, two integer increments). The
authoritative make/undo fallback is otherwise byte-for-byte unchanged. No
other file touched — no board representation change, no evaluation change,
no move-order change, no search-semantic change, no bitboards.

## Phase 9 — legal-move-set differential

**429,326 positions checked** (required ≥100,000) across 7,200 random
sequences (6 seeds × 1,200), curated starting positions covering opening,
middlegame, tactical, sparse endgame, castling-rich, en-passant-rich,
promotion-rich, pin-rich, and discovered-attack-rich shapes, max depth 60
plies. **0 mismatches** in legal move count or full sorted legal move list
between `FAST_PATH_ENABLED=true` and `=false`. Coverage observed: 17,495
in-check positions, 110 checkmates, 16 stalemates, 31,690 legal castling
moves, 2,189 legal en-passant moves, 28,304 legal promotions (21,228
under-promotions). Completed in 35.5s.

## Phase 10 — move-by-move board-state differential

**60,000 moves checked** (required ≥50,000). For each: made the same move
under both configurations, compared the complete post-move board state
(FEN, hash, repetition table, piece lists, king squares, castling rights,
en passant, clocks, material), undid, and compared the fully-restored
state against both the pre-move snapshot and the other configuration's
restored state. **0 mismatches.**

## Phase 11 — targeted exception tests

16/16 pass, each run under both `FAST_PATH_ENABLED=true` and `=false` with
identical results: pinned knight (zero legal moves), pinned bishop/rook/
queen (legal along the pin line, illegal off it), discovered rook/bishop
check (legal — own king unaffected), en passant discovered check
(illegal), king capturing a defended piece (illegal), king vacating a
blocking square into a newly-revealed attack (illegal — the classic bug
case), castling through check / out of check (never even pseudo-legal),
double check (only king moves legal), blocking a check (legal), capturing
the checker (legal), promotion/underpromotion exposing the own king
(push illegal, capturing the pinner while promoting legal). Committed as
`tests/legality_fast_path.test.mjs`.

## Phase 12 — deterministic engine gates

`uci/see/material/zobrist/engine_regressions/diagnostic_anchors`: 134
tests, 123 pass, 0 fail, 11 skip. `perft`: 34/34. `nullmove`: 6/6 —
identical totals to the Phase 1 production baseline. All **38** exact-tree
diagnostic-anchor rows (`scripts/compare-search-equivalence.mjs --level
exact-tree`) are identical between a freshly-captured clean production
baseline and this candidate: `Search equivalence passed at exact-tree
level` — move, score, completed depth, nodes, leaf nodes, qsearch entries,
PV, and root move order all match exactly.

## Phase 13 — work avoided (re-measured, temporary instrumentation, reverted)

| position | make/undo pairs avoided | isSquareAttacked calls avoided | ray-attack steps avoided |
|---|---|---|---|
| opening | 31,136 / 90,047 (34.6%) | 31,136 / 349,877 (8.9%) | 328,603 / 3,602,122 (9.1%) |
| middlegame-quiet | 80,001 / 255,861 (31.3%) | 80,001 / 810,395 (9.9%) | 1,018,118 / 8,885,785 (11.5%) |
| middlegame-tactical | 86,654 / 315,870 (27.4%) | 86,654 / 1,249,417 (6.9%) | 1,095,408 / 14,198,730 (7.7%) |
| rook-endgame | 7,418 / 30,108 (24.6%) | 7,418 / 68,316 (10.9%) | 150,183 / 1,515,273 (9.9%) |

The `isSquareAttacked`/ray-step reduction is proportionally smaller than
the make/undo reduction because gating the fast path itself costs one
`board.isInCheck()` call per `generateMoves()` invocation (itself one
`isSquareAttacked()` call) — this is an intrinsic, unavoidable cost of
implementing the proof's precondition (i) at all, already included in
these "avoided" figures, not a separate caveat to subtract further.

## Phase 14 — performance benchmark

Machine confirmed quiet (only session infrastructure processes) before
running. Used production's validated harness directly:
`scripts/run-coach-overnight.ps1 -Mode Benchmark -BenchmarkProfile
stability-short -BaselinePath "Coach Current" -CandidatePath "Coach
Legality" -CandidateRuns 3` (one control + three candidate comparisons, as
required; note the script's actual parameter is `-BenchmarkProfile`, not
`-Profile` as informally suggested).

**Control** (Coach Current vs. itself, identical build):

| position | result |
|---|---|
| quiet-open | 0.446% faster |
| tactical-capture | 0.193% slower |
| high-branching | 0.715% slower |
| promotion-race | 0.134% faster |
| **overall** | **0.081% slower — within ±0.5%, stable** |

**Candidate runs** (Coach Current baseline vs. Coach Legality candidate, 3 seeds):

| run | quiet-open | tactical-capture | high-branching | promotion-race | raw gain | adjusted gain |
|---|---|---|---|---|---|---|
| #1 (seed 26071522) | +4.901% | +7.649% | +5.278% | +3.974% | +5.460% | **+5.541%** |
| #2 (seed 26071523) | +4.057% | +4.659% | +5.185% | +1.648% | +3.897% | **+3.978%** |
| #3 (seed 26071524) | +4.275% | +7.376% | +3.298% | +2.268% | +4.323% | **+4.405%** |

All 12 position×run results positive (0 negative or zero anywhere). Identity `ok` on every row of every run.

**Aggregate** (harness's own `benchmark-search-summary.mjs`, independently reproducing the same numbers this report computed by hand):

- raw candidate speed gain: mean +4.560%, median +4.323%, sd 0.660%
- **adjusted candidate speed gain: mean +4.641%, median +4.405%, sd 0.660%**
- positive candidate runs: 3/3
- worst position: promotion-race, +2.630% (still comfortably positive)
- best position: tactical-capture, +6.561%
- dominance check: tactical-capture contributes 36.1% of the positive per-position mean gain — **dominated=false**
- **verdict: accepted**

## Phase 15 — architecture decision

**Acceptance criteria, checked exactly against this task's stated thresholds:**

| criterion | required | actual | met? |
|---|---|---|---|
| stable control | within ±0.5% | 0.081% slower | ✅ |
| all three adjusted runs positive | yes | +5.541%, +3.978%, +4.405% | ✅ |
| adjusted mean | ≥ +1.0% | +4.641% | ✅ |
| runs at/above +1.0% | ≥2 of 3 | 3 of 3 | ✅ |
| no serious recurring position regression | — | zero negative results anywhere (12/12 position×run positive) | ✅ |
| no one-position domination | — | tactical-capture 36.1% (not >50%), all 4 positions contribute | ✅ |
| exact identity throughout | yes | `identity=ok` on every row | ✅ |

**Classification: A — Conservative legality fast path is correct and timing-positive.**

This classification does not authorize production merge. It authorizes
treating Candidate B as a validated, narrow architectural building block —
the specific thing this task set out to prove or rigorously refute.

**Architecture recommendation.** Candidate B is a genuinely reusable
foundation stone: it removes real work (24.6%-34.6% of legality make/undo
pairs) using only state Coach already maintains (`board.whiteKing`/
`blackKing`), with a proof that has no unresolved exceptions and 429k+
positions / 60k+ moves / 38 exact-tree rows / 16 targeted cases of
empirical corroboration. Recommended next steps, in order of narrow safety:
(1) Candidate D (king-move specialization via an origin-square-excluded
attack test) as a complementary, independent fast path targeting the
`kingMove` category this candidate deliberately excludes; (2) revisit
Candidate C (a cached pinned-piece map) now that Candidate B has proven
the mechanism-level approach pays off in practice, not just in theory —
Candidate C could recover the `alignedNonKing` category's still-mostly-legal
moves (only 0.3%-3.2% actually illegal in the Phase 4 sample) at a higher
implementation cost; (3) revisit the PST/incremental-evaluation prototype
from `experiment/architecture-foundation`, since its earlier negative result
was explicitly attributed to legality-testing make/undo cycles dominating
the maintenance tax — a cheaper legality path changes that cost structure
and may flip the earlier verdict.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Legality"
node --test tests\legality_fast_path.test.mjs
node scripts\compare-search-equivalence.mjs --capture --output candidate.json
node scripts\compare-search-equivalence.mjs --baseline tests\data\baselines\diagnostic_anchors_87062e3.json --candidate candidate.json --level exact-tree
```
