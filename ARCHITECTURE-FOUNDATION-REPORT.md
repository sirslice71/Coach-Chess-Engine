# Coach architecture-foundation research

Isolated worktree: `experiment/architecture-foundation`, based on production
HEAD `bf1fdb1208a5027669f3928480692083b6c96087`. **Not wired into
production.** Investigates the safest, highest-value architectural
foundation among shadow bitboards, incremental classical evaluation, and
NNUE-readiness, then prototypes and measures exactly one narrow candidate.

## Result: prototype is correct, but timing-negative — Classification B

Incremental non-king piece-square-table (PST) maintenance was built,
differentially validated at scale (zero mismatches), and confirmed
search-identical on all 38 exact-tree anchor rows — but measured **1.7-2.8%
slower**, not faster, because the maintenance cost is paid on every
`addPiece`/`removePiece` call (including throwaway legality-test make/undo
cycles), while the benefit is only realized at `evaluate()` calls, which are
a smaller fraction of total move-making traffic. Shipped default is `false`
(shadow state maintained, not consumed).

## Phase 1 — verified state

- Production (`Coach Current`): branch `main`, HEAD `bf1fdb1208a5027669f3928480692083b6c96087`, upstream `origin/main` 0 ahead/0 behind, nothing staged.
- Known unrelated status confirmed via `git hash-object`: `js/engine/attack.js` and `js/engine/search.js` show as modified in `git status`, but their working-tree blob hashes are **byte-identical to HEAD's committed blobs** (`91c0d67f...` and `379aa1cd...` respectively) — this is a line-ending artifact only, zero semantic diff. `codex-optimization-brief.md` is untracked. None of these three were touched.
- An unrelated concurrent benchmark process (`Coach Next Optimization` / `Coach Overnight Results`) was observed running in production during this session; it was not interfered with, and an identical-build control check (below) confirmed measurement stability despite it.
- Node v24.18.0, PowerShell 5.1.26100.8875.
- `stability-short` benchmark profile confirmed available (`scripts/benchmark-search-ab.mjs --profile stability-short`).
- Baseline gates: `uci/see/material/zobrist/engine_regressions/diagnostic_anchors` = 134 tests, 123 pass, 0 fail, 11 skip; `perft` = 34/34; `nullmove` = 6/6. No full anchor script run.

## Phase 2 — current architecture (text diagram)

```
Board (js/core/board.js) -- AUTHORITATIVE state, owner of everything below
 ├─ squares: Array(64) mailbox, Piece codes           [scanned by eval/insufficient-material/verify]
 ├─ whitePieces / blackPieces: {pawns,knights,bishops,rooks,queens,king}[]
 │    maintained incrementally via addPiece/removePiece (insertSquareSorted)
 │    -- king is a 1-element array + a separate cached square
 ├─ whiteKing / blackKing: cached square ints          [incremental, O(1)]
 ├─ whiteMaterial / blackMaterial: running totals       [incremental, O(1) -- addMaterial/removeMaterial]
 ├─ castlingRights: 4 booleans; packed to a 4-bit mask in move history for undo [incremental]
 ├─ enPassantSquare: single int                         [incremental, set/cleared per move]
 ├─ halfMoveClock / fullMoveNumber                       [incremental, forward + snapshot-restore]
 ├─ hashKey: BigInt Zobrist hash                         [incremental -- zobrist.updateHash(), snapshot-restore on undo]
 ├─ repetitionTable: BigInt[] (push/pop)                 [incremental; repetitionCount() strided-scans it]
 ├─ moveHistory: full per-move snapshot objects (push/pop stack) -- undo's only source of truth
 └─ nullMoveHistory: separate small stack (enPassantSquare + hashBefore only)

makeMove(move) → snapshot everything needed for undo into `history` →
  mutate squares/piece-lists/king/material/castling/EP/clock/hashKey →
  push repetitionTable. undoMove() → pop `history` → reverse every step
  (piece-list repair goes through the SAME addPiece/removePiece hooks, not
  a separate mechanism) → pop repetitionTable → restore hashKey verbatim.

Attack (js/engine/attack.js) -- STATIC, no owned state. Ray-walking mailbox
scans (pawn/knight/king = fixed-offset probes; bishop/rook = rayAttack()
loop with a per-step rank/file boundary check). isSquareAttacked() is the
single primitive behind: LegalMoveGenerator's legality test, isInCheck(),
evaluateHangingPieces(), king-safety/exposure terms, and several mobility
helpers -- i.e. almost every "does X attack Y" question in the engine.

LegalMoveGenerator -- for every pseudo-legal move: makeMove → isSquareAttacked
(on the just-moved side's king) → undoMove. Legality is tested by full
make/undo + ray-scan, not a cheaper incremental check.

Evaluation (js/engine/evaluation.js) -- STATELESS wrapper around Board;
evaluate() calls ~16 term methods UNCONDITIONALLY every time, all of which
rescan piece lists / squares from scratch. material() is the one exception
(already reads board.whiteMaterial/blackMaterial). gamePhase() is recomputed
5-7 times per single evaluate() call (cheap, O(1), but genuinely repeated).

Search (js/engine/search.js) -- negamax/PVS/quiescence over Board+Evaluation.
whiteRelativeEval() → evaluation.evaluate().total, called at the null-move
static gate, qsearch stand-pat, and leaf/depth-0 nodes.
```

## Phase 3 — repeated-work measurement (bounded instrumentation, 4 positions, depth 5, then reverted)

| position | nodes/leafNodes | isSquareAttacked calls | avg ray-steps/call | pseudo-moves tested (= legality make/undo pairs) | evaluate() calls | gamePhase() calls/eval | avg pieces scanned/evaluatePieceSquares() |
|---|---|---|---|---|---|---|---|
| opening | 16,845/15,537 | 343,235 | 5.29 | 90,047 | 15,429 | 5.00 | 29.41 |
| middlegame-quiet | 25,760/33,956 | 795,150 | 6.41 | 255,861 | 32,727 | 5.01 | 25.73 |
| middlegame-tactical | 48,918/61,110 | 1,233,637 | 6.58 | 315,870 | 59,404 | 5.00 | 25.84 |
| rook-endgame | 12,970/9,348 | 64,322 | 11.44 | 30,108 | 9,318 | 6.00 | 6.77 |

Attack detection and legality make/undo dominate call volume by roughly an
order of magnitude over evaluation calls. Instrumentation was fully reverted
(`git checkout --`) before any further work.

## Phase 4 — shadow-bitboard representation benchmark

Bounded microbenchmark, representative hot-loop patterns (full 64-square
scan, ray-walk with early exit, set/clear update — not isolated trivial ops):

| pattern | array (current) | typed array | BigInt | two-32bit (fair, inlined) |
|---|---|---|---|---|
| full occupancy scan (400k iters) | 18.4ms | 17.3ms | **506.2ms (27.5x)** | 24.2ms (1.3x) |
| ray-walk probe (2M iters) | 29.3ms | – | **587.3ms (20.0x)** | 40.5ms (1.4x) |
| set/clear update (4M iters) | 5.6ms | – | **472-494ms (84-88x)** | 20.3ms (3.6x, inlined) |

**BigInt bitboards are decisively, dramatically slower in V8 for every
tested access pattern — confirmed empirically, not assumed.** A naive
two-32-bit-int/array-destructuring implementation looked much worse for
writes (265ms) but a fair, inlined, non-allocating version dropped to
20.3ms — the array-destructuring calling convention, not the representation
itself, caused that gap; this is documented so it isn't mistaken for a real
finding. Neither representation beats the current mailbox array for simple
occupancy reads. The only plausible bitboard payoff (O(1) magic-bitboard
slider attacks replacing the ray-walk) requires a full attack-table
implementation — explicitly out of scope tonight.

## Phase 5 — incremental classical evaluation audit

| term | category | current cost | already incremental? |
|---|---|---|---|
| material | A | O(1) | **yes** — `board.whiteMaterial`/`blackMaterial`, updated via `addMaterial`/`removeMaterial` |
| piece-square values (non-king) | A | O(pieces), rescanned every `evaluate()` | **no** — this is the prototype's target |
| king PST term | A-ish but phase-coupled | O(1), but depends on `gamePhase()` (changes on ANY capture/promotion anywhere) | not attempted (see below) |
| side-to-move tempo / castling-rights-based terms | A | O(1) already (`board.sideToMove`, `board.castlingRights`) | yes |
| `isCastled()` | A | O(1) already (`board.whiteKing`/`blackKing`) | yes |
| pawn structure (passed/isolated/doubled) | B | O(pawns) + per-side `Int8Array(8)` file-count rebuild every call | no |
| king pawn shield / king safety | B | O(local squares near king) | no |
| mobility near moved pieces | B | O(pieces × directions), needs a "who's affected" dependency graph to do safely | no |
| full mobility (`evaluateMinorPieceMobility`) | C | O(pieces × offsets) every call | no |
| hanging pieces | C | O(pieces) × `isSquareAttacked()` (the most expensive primitive) per piece | no — genuinely global |
| king safety / exposure / central-line-exposure | C | attack-pattern-dependent near the king | no |
| rook file activity / king-rook coordination | B | O(rooks) + file-array rebuild | no |

**Coach already maintains material, king squares, and castling-rights state
incrementally** — the task's "don't duplicate existing state" check confirms
no redundant work was proposed there. PST is the one clear, safe,
already-hooked-in-principle gap: `addPiece`/`removePiece` are the exact
mutation points material already uses, and the king's PST term is
phase-interpolated (depends on `gamePhase()`, not just its own square), so
it was deliberately excluded from the prototype's scope rather than handled
with extra machinery.

## Phase 6 — future NNUE-readiness audit

A future incremental-neural accumulator would need: a stable
piece-square(-king) feature index (Coach's existing 781-dim non-king-relative
scheme from the neural-eval track is a usable starting point, though real
NNUE strength typically wants king-relative features — a separate, larger
redesign, not attempted here); accumulator ownership on `Board` (mirroring
`whiteMaterial`); updates at the exact same `addPiece`/`removePiece` hook
points; a refresh-on-king-move exception (if king-relative features are
ever adopted, since `board.whiteKing`/`blackKing` already make detecting
"did the king move" trivial); and the same promotion/capture/castling/
en-passant special-casing already present in `makeMove`/`undoMove` (verified
by this prototype to be sufficient and correct for a scalar delta — the same
hooks would carry a vector delta with no additional special-casing needed).
Null moves are free: Coach's own contract already states piece placement is
untouched by `makeNullMove()`.

**Ranked reusable foundations for both classical speed and future NNUE:**
1. Incremental delta maintenance at `addPiece`/`removePiece` (exactly what this prototype built) — identical mechanism an NNUE accumulator would use, scalar now, vector later.
2. The existing move `history` object (already carries every other incremental field; extending it to carry an accumulator snapshot, if ever needed, is a natural addition, not a new structure).
3. Attack maps — real classical-speed value (hanging pieces, king safety), but NNUE doesn't need them (piece lists already supply what a feature encoder needs).
4. Shadow bitboards — lowest NNUE-specific value; piece lists already serve the same "which squares have which piece" role.

## Phase 7 — ranked architectural options

| # | option | speed (1-5) | strength foundation (1-5) | safety (1-5) | maintainability (1-5) | differential testability (1-5) |
|---|---|---|---|---|---|---|
| 1 | Incremental material + PST | 2 (measured net-negative as built; real win needs scoping to reduce legality-check overhead) | 4 | 5 | 5 | 5 |
| 2 | Two-32-bit shadow occupancy bitboards (maintain only) | 2 (no read win measured; write cost modest) | 2 | 4 | 4 | 4 |
| 3 | Reusable feature-delta structure for future NNUE | 1 (no speed claim) | 5 | 4 | 3 | 3 |
| 4 | Cached attack maps | 3 (plausible, unmeasured) | 2 | 2 | 2 | 2 |
| 5 | Incremental pawn-file structure | 2 (plausible, unmeasured) | 3 | 3 | 3 | 3 |
| 6 | Full/BigInt piece bitboards | 1 (measured decisively negative) | 2 | 1 | 2 | 2 |

Scores are deliberately not inflated: option 1 (the one actually built and
measured) scores low on raw speed precisely because the measurement said so;
its high foundation/safety/maintainability/testability scores reflect that
it is correct, narrow, and cleanly reversible even though it didn't pay off
as speed tonight.

## Phase 8 — chosen prototype

**Option B: incremental material plus PST**, scoped to the five non-king
piece types (material was already done; PST was the real gap). Chosen over
shadow bitboards because Phase 4's microbenchmark found no representation
that beats the current mailbox array for simple reads, and the one
plausible bitboard payoff (magic-bitboard slider attacks) is out of scope
tonight — there was nothing safely testable to prototype there yet.

## Phase 9 — exact diff

Files touched (isolated worktree only):
- `js/core/board.js`: added `pstDeltaForPiece()` (module-level pure function), `board.pstScore` (init in constructor/`clear()`/`clearBoard()`/`updatePieceLists()`, maintained in `addPiece()`/`removePiece()`), `recomputeNonKingPstScore()` (verification helper).
- `js/engine/evaluation.js`: added `Evaluation.USE_INCREMENTAL_PST` (static flag, default `false`), `evaluatePieceSquaresIncremental()` (byte-identical king-term code, non-king part from `board.pstScore`), and a 3-line dispatch at the top of the existing `evaluatePieceSquares()`.

No other files changed. Board remains fully authoritative; the new state is
shadow-verified, not exposed beyond what the differential harness needs.

## Phase 10 — differential validation

- Random-sequence stress: **10,200 sequences** (6 seeds × 1,700), **511,531 total moves made**, max sequence depth **100**, **0 mismatches** between `board.pstScore` and a fresh recompute, checked after every make, every undo, and every null-move make/undo.
- Dedicated coverage (all resolved cleanly, 0 mismatches): castling both sides/colors, en passant both colors, promotion to N/B/R/Q (including under-promotion) both colors, capturing promotion, a rook captured on its original square by an enemy piece.
- FEN reload: exported mid-game FEN, reloaded into a new `Board`, `pstScore` matched both the recompute and the original instance.
- Multiple simultaneous `Board` instances (3, interleaved, 500 rounds each): no mismatches.
- Search identity: captured a fresh 38-row exact-tree result set from clean, unmodified production and compared it against both the "shadow maintained but unused" and "shadow used in hotspot" prototype builds — **`Search equivalence passed at exact-tree level`** for both (best move, score, nodes, leaf nodes, qsearch entries, PV, root order all identical). `evaluatePieceSquares()` vs `evaluatePieceSquaresIncremental()` were also directly cross-checked (976 positions across a random walk, 0 mismatches).

## Phase 11 — bounded performance test (`stability-short` profile)

An unrelated concurrent benchmark process was active in production during
this session; an identical-build control was required and run first.

| run | quiet-open | tactical-capture | high-branching | promotion-race | overall |
|---|---|---|---|---|---|
| **control** (Coach Current vs itself) | 0.161% faster | 0.245% faster | 0.168% faster | 0.001% faster | **0.144% faster — stable** |
| **maintained but unused** (shadow upkeep, no consumer) | 2.705% slower | 2.325% slower | 3.162% slower | 3.023% slower | **2.803% slower** |
| **used in hotspot** (shadow consumed by `evaluatePieceSquaresIncremental`) | 0.875% slower | 2.188% slower | 1.888% slower | 2.036% slower | **1.745% slower** |

- Control confirms the machine/session was stable enough to trust the two real comparisons despite the concurrent process.
- Maintenance overhead alone: ~2.8% slower.
- Using the cached value recovers about 1 percentage point (2.8% → 1.7%) but does **not** produce a net win.
- **Net effect: negative in both configurations.** Identity was exact (`ok`) on every row of every run.

**Why**: `addPiece`/`removePiece` fire on every move made anywhere in the
search tree, *including* the make/undo pairs `LegalMoveGenerator` uses purely
to test legality (Phase 3 measured 90k-316k of these per position at depth
5 — far more than the corresponding 15k-59k `evaluate()` calls). The
maintenance tax is paid at a much higher frequency than the benefit is
realized, because legality testing itself is the dominant consumer of
make/undo cycles in this engine, not evaluation. This is the same mechanism
Phase 3/4 already pointed at: **cheaper legality testing (which bitboards or
attack maps could plausibly provide) is a prerequisite for incremental
evaluation state to pay off, not an independent, unrelated improvement.**

## Phase 12 — staged roadmap

**Stage 1 (this prototype, done tonight):** incremental non-king PST,
shadow-maintained, differentially proven correct, default off. Prerequisite:
none. Files: `core/board.js`, `engine/evaluation.js`. Test burden: 9 new
tests (this session) + the existing suite, all passing. Rollback: revert
two files, zero downstream impact (nothing else reads `pstScore`).
Success metric achieved: correctness. Success metric **not** achieved:
speed. Production behavior stays exact either way.

**Stage 2 — cheap legality testing (recommended next, not bitboards for
their own sake):** investigate whether legality can be tested without a
full `makeMove`/`isSquareAttacked`/`undoMove` cycle for the common case
(e.g., a pin/check bitmask maintained incrementally, checked before
committing to the full make/undo path). This directly targets the Phase
3/11 finding that legality-testing make/undo cycles outnumber evaluation
calls several-fold. Prerequisite: Stage 1's differential-testing pattern
(reuse the same shadow-state-verification harness). Files: likely
`legalmovegen.js` + a new small "am I pinned / is my king exposed"
incremental cache in `board.js`. Test burden: large (this is exactly the
kind of change that can silently misclassify a move as legal/illegal) —
expect a stress harness at least as large as this session's. Rollback:
straightforward if scoped as a pure addition with a feature flag, as here.
Success metric: reduced `isSquareAttacked` call count at matched depth, then
re-measure incremental PST's net effect once this lands.

**Stage 3 — full piece bitboards or pawn-structure state:** only pursue
bitboards if Stage 2 or a dedicated magic-bitboard slider-attack spike shows
a real algorithmic win (O(1) attacks vs O(ray-length)) — Phase 4 ruled out
"bitboards are simply faster to read" as a justification on their own.
Alternative: incremental pawn-file structure (Category B in Phase 5),
narrower and lower-risk than full bitboards.

**Stage 4 — incremental classical evaluation expansion:** once Stage 2
reduces the make/undo tax, revisit PST (this stage's Stage 1) plus the
Category B terms (pawn structure, king shield) with a real chance of a net
win, since the underlying cost structure will have changed.

**Stage 5 — optional NNUE accumulator foundation:** reuse the exact
`addPiece`/`removePiece` delta pattern proven correct in Stage 1, generalized
from a scalar to a vector; requires a separate, larger decision about
king-relative feature indexing and quantization, explicitly out of scope
for any stage above.

## Acceptance classification: B

**Prototype is correct but timing-neutral or below threshold.** All
correctness/identity/differential requirements were met exactly; the
measured net effect is negative, not neutral, in both the maintained-only
and used-in-hotspot configurations. No classification here authorizes
production merge.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Architecture"
node --test tests\architecture_pst_prototype.test.mjs
node scripts\compare-search-equivalence.mjs --capture --output candidate.json
node scripts\compare-search-equivalence.mjs --baseline tests\data\baselines\diagnostic_anchors_87062e3.json --candidate candidate.json --level exact-tree
```
