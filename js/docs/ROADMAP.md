# ==========================================
# COACH CHESS ENGINE ROADMAP
# Version 0.7 Alpha
# Last Updated: July 2026
# ==========================================

# Vision

Coach is a modern chess engine whose mission is to become one of the strongest
classical chess engines possible while also becoming the best engine for
learning chess.

Project Motto

"Strong enough to compete. Smart enough to teach."

Every release should improve one or more of:

• Strength
• Performance
• Understanding
• Reliability
• Teaching

# ==========================================
# CURRENT STATUS
# ==========================================

Estimated Strength

~1200-1400 Elo

Current Personality

✓ Tactical
✓ Stable
✓ Fast
△ Positional understanding improving

Primary Weaknesses

- Delays castling
- Weak king safety
- Limited piece activity understanding
- Weak rook play
- Weak long-term planning

# ==========================================
# PRODUCTION BASELINE (Verified)
# ==========================================

Production: <USERPROFILE>\OneDrive\Desktop\Coach Current
Branch: main
HEAD: 5daef89 "Make SearchStable summary policy tree-aware"
Upstream: origin/main, synchronized
Status: clean, nothing staged

Merged since the last roadmap update:

[x] Conservative legality fast path
[x] Improved benchmark progress output
[x] SearchStable benchmark identity mode
[x] Long-endgame time-management fix
[x] SearchStable tree-aware summary policy

# ==========================================
# NEAR-TERM PRIORITY ORDER
# ==========================================

1. Finish the 200-game reverse-futility validation match.
2. Review final PGN, paired openings, tactical flags and statistics.
3. Make the diagnostic-only RF counter reset/test, if approved.
4. Run final RF correctness tests and decide merge / no-merge.
5. Execute the prepared castling search-trace smoke and two-position
   diagnosis.
6. Address any clearly proven tactical/search defects.
7. Run the Coach Elo calibration ladder.
8. Begin the minor-piece contextual quality audit.
9. Build broader Rodent/ECO/opening-character tooling as useful.

# ==========================================
# ACTIVE VALIDATION
# ==========================================

## Guarded Reverse Futility Pruning

Status: Active validation — do not merge until the full 200-game
result, PGN review, and final tests are complete.

Candidate worktree:
<USERPROFILE>\OneDrive\Desktop\Coach Candidates\Coach Reverse Futility Final

Branch: candidate/reverse-futility-final
Based on production: 5daef89

Only intended changes:

- js/engine/search.js
- tests/engine_regressions.test.mjs

Unstaged and uncommitted.

Implementation shape:

- Depth 1 only
- Non-root
- Null-window only
- Not in check
- Mate-like bounds excluded
- Side to move must retain a rook or queen
- Low-material endings excluded
- staticEval - 300 >= beta
- Bounded beta return
- No TT store on cutoff

Evidence gathered so far:

- Correctness suites passed
- Perft and null-move suites passed
- Nxe5 tactical regression preserved
- 38 exact-tree anchors: 0 best-move changes, 0 score changes,
  0 mate changes, 1 PV-only change, nodes ~-6.81%, qsearch ~-14.55%
- 120-position corpus: 120/120 best-move matches, 119/120 score
  and PV matches, no mate changes, deterministic
- Accepted SearchStable timing gain: ~+12.234%
- 20-game smoke: candidate 7 wins, 3 draws, 10 losses — no proven
  RF-caused tactical or mate regression
- 200-game match: still active. Latest checkpoint (not a final
  result) through 159 completed games: Current 51 wins, Candidate
  68 wins, 40 draws — candidate score ~55.35%

## Reverse-Futility Diagnostic Cleanup

Small post-validation cleanup, not a blocker.

- reverseFutilityCutoffs is not reset by resetStatistics()
- Counter is diagnostic-only; does not affect search, TT behavior,
  UCI output, benchmarks, time management, or playing strength
- After match completion, consider adding:
  this.reverseFutilityCutoffs = 0;
- Add a focused reset test
- Existing timing and game evidence remains applicable as long as
  the change stays strictly diagnostic

# ==========================================
# DIAGNOSIS-ONLY INVESTIGATIONS
# ==========================================

## Castling-Plan / Search Instability

Findings:

- Game 16 reproduced the depth-dependent ...Rh7 behavior
- 98-position corpus examined at multiple depths
- No broad premature-rook or castling-evaluation bias found
- Only one additional Stockfish-confirmed castling-forfeiting
  inaccuracy survived review
- Static evaluation already favored castling in the real case
- Search overrode the correct static preference
- Likely family: narrow search-horizon or plan instability
- No castling evaluation weight change recommended
- No blanket premature-rook rule
- No forced-castling rule

Diagnostic worktree:
<USERPROFILE>\OneDrive\Desktop\Coach Diagnostics\Coach Castling Search Trace

Branch: diagnostics/castling-search-trace

Status:

- Disposable instrumentation prepared
- Disabled by default
- Not yet executed
- Must wait until the 200-game match finishes
- Production and RF candidate remain untouched

Next step:

1. Run one depth-5 trace smoke
2. Verify behavior neutrality and JSONL output
3. Trace both known positions at depths 5-10
4. Investigate LMR subtree effects, TT/aspiration interaction,
   check extensions, and generic horizon instability one mechanism
   at a time

# ==========================================
# APPROVED FUTURE INVESTIGATION
# ==========================================

## Coach Elo Calibration Ladder

- Coach's exact current Elo has not yet been established
- Provisional belief is around 1500, but this remains unverified
- Prior limited-strength Stockfish and tiny reference-engine
  samples are not sufficient alone

Future plan:

- Coach plus four verified reference engines with ratings spanning
  the expected strength
- Use ratings from one consistent current rating list
- Identical time control, hardware, hash, book, and pairing
  conditions
- Rodent Polyglot book applied at engine level:
  book="$Book"
  bookdepth=8
- Paired colors and repeated openings
- Enough games against each anchor to estimate pool-relative Elo
- Report uncertainty; avoid equating engine-pool Elo directly with
  FIDE or USCF human Elo

Reference-engine ratings are not yet listed — to be verified from a
current source in a future task.

# ==========================================
# SPECULATIVE / FUTURE IDEAS
# ==========================================

## Minor-Piece Contextual Quality Audit

Priority: Medium-term evaluation project. Below proven
tactical/search defects. Above cosmetic evaluation refinements.

Concept:

- Retain stable tactical/base material values
- Evaluate each individual knight and bishop separately
- Do not assign one global value to all bishops or all knights
- Contextual quality is a separate, bounded positional term
- Surviving pieces are rescored after every move/exchange

Potential features to audit — Knights:

- Safe mobility
- Centrality
- Secure outposts
- Pawn support
- Whether enemy pawns can challenge the square
- Rim or trapped placement
- Useful routes and target pressure
- Closed-center suitability

Potential features to audit — Bishops:

- Safe mobility
- Open diagonals
- Obstruction by fixed same-colored friendly pawns
- Whether the bishop is inside or outside its pawn chain
- Influence on one or both wings
- Trapped-bishop patterns
- Openness of the center
- X-ray pressure or latent pins/skewers against king, queen, or rook

Safeguards:

- Do not alter SEE or tactical capture values based on contextual
  quality
- Keep ordinary per-piece adjustments tightly capped initially
- Avoid double counting PST, mobility, outposts, development, king
  safety, pins, and pawn structure
- Do not implement the entire system at once
- Diagnose first using a representative bishop-versus-knight corpus

Staged approach:

Stage 1:
- Safe mobility
- Bad-bishop obstruction
- Secure knight outpost quality

Stage 2, only if justified:
- Open/closed center scaling
- Long-diagonal utility
- X-ray/latent diagonal pressure
- One-wing versus two-wing endgame effects

## Rodent Opening-Book Classification and Extraction

Priority: Useful testing infrastructure, but below current
engine-search work and Elo calibration.

Capabilities discussed:

- Parse Polyglot entries
- Reconstruct reachable move trees
- Classify lines by ECO and opening name
- Record actual book depth and move weights
- Derive position character from moves/board rather than ECO alone:
  open, closed, semi-open, gambit, tactical, positional,
  pawn-structure family
- Create filtered PGN or Polyglot books such as gambit-focused
  suites

Clarification:

- ECO identifies opening family/variation
- ECO alone does not encode whether the resulting position is
  open, closed, tactical, or a true gambit
- Those labels require analysis of the reconstructed moves and
  resulting pawn structure

# ==========================================
# COMPLETED
# ==========================================

## Search

[x] Alpha-Beta Negamax
[x] Iterative Deepening
[x] Quiescence Search
[x] Killer Move Heuristic
[x] Aspiration Windows
[x] Transposition Table
[x] TT Move Ordering
[x] Principal Variation Extraction
[x] Search Profiling
[x] Search Benchmark

---

## Move Generation

[x] Legal Move Generator
[x] Castling
[x] En Passant
[x] Promotions
[x] Make / Undo Move
[x] Incremental Piece Lists
[x] Incremental Zobrist Hash

---

## Evaluation

[x] Material
[x] Piece Square Tables

Current PST

[x] Pawn
[x] Knight
[x] Bishop
[x] Rook
[x] Queen
[x] King Middlegame
[x] King Endgame

---

## Opening

[x] Development
[x] Center Control

---

## Pawn Structure

[x] Passed Pawns
[x] Connected Pawns
[x] Doubled Pawns
[x] Isolated Pawns

---

## Developer Tools

[x] verify()
[x] perft()
[x] divide()
[x] bench()
[x] debugEvaluation()
[x] debugKnightPST()

# ==========================================
# VERSION 0.7 GOALS
# ==========================================

Target Strength

1500-1700 Elo

Focus

Teach Coach positional chess.

Highest Priority

1. Mobility
2. King Safety
3. Piece Activity
4. Opening Principles
5. Better Search

Expected Improvements

✓ Natural development

✓ Castle earlier

✓ Better rook activity

✓ Better bishop activity

✓ Better pawn play

# ==========================================
# SEARCH ROADMAP
# ==========================================

## Immediate

[ ] Principal Variation Search (PVS)

Expected

10-25% node reduction

---

[ ] Complete History Heuristic

Current

[x] History table

[x] Ordering support

Future

[ ] Gravity updates

[ ] History decay

[ ] History malus

[ ] Counter Move History

[ ] Continuation History

---

[ ] Null Move Pruning

Expected

Large Elo gain

---

[ ] Late Move Reductions (LMR)

Expected

Large speed improvement

---

[ ] Static Exchange Evaluation (SEE)

---

Future

[ ] Singular Extensions

[ ] Internal Iterative Deepening

[ ] Multi-Cut

# ==========================================
# EVALUATION ROADMAP
# ==========================================

## Mobility

[ ] Knight Mobility
[ ] Bishop Mobility
[ ] Rook Mobility
[ ] Queen Mobility
[ ] Safe Mobility

---

## King Safety

[ ] Castling Bonus
[ ] Delayed Castling Penalty
[ ] Pawn Shield
[ ] Open Files
[ ] Weak Squares
[ ] King Tropism
[ ] Enemy Attack Units

---

## Piece Activity

[ ] Bishop Pair
[ ] Knight Outposts
[ ] Bad Bishop
[ ] Rook on Open File
[ ] Rook on Semi-Open File
[ ] Rook on 7th Rank
[ ] Connected Rooks
[ ] Space Advantage
[ ] Initiative

---

## Opening Principles

[ ] Early Queen Penalty
[ ] Early Rook Penalty
[ ] Development Coordination
[ ] Opening Phase Scaling

---

## Pawn Structure

Current

[x] Passed
[x] Connected
[x] Doubled
[x] Isolated

Future

[ ] Protected Passed Pawns
[ ] Candidate Passed Pawns
[ ] Pawn Chains
[ ] Pawn Islands
[ ] Backward Pawns
[ ] Blocked Pawns

---

## Game Phase

[ ] Opening
[ ] Middlegame
[ ] Endgame interpolation

---

## Incremental Evaluation

[ ] Incremental PST
[ ] Incremental Pawn Hash
[ ] Incremental Mobility

# ==========================================
# ENDGAME
# ==========================================

Dedicated endgame evaluator

Current

[x] Draw detection

Future

[ ] Opposition
[ ] Rule of the Square
[ ] Passed Pawn Races
[ ] Lucena
[ ] Philidor
[ ] King Activity
[ ] Fortresses
[ ] Zugzwang

# ==========================================
# DRAW DETECTION
# ==========================================

Current

[x] Threefold
[x] Fifty Move Rule
[x] Insufficient Material

Future

[ ] Fivefold
[ ] Seventy-five Move Rule

Improve dead draw recognition

[ ] K vs K

[ ] KB vs K

[ ] KN vs K

[ ] KNN vs K

[ ] KB vs KB

[ ] KN vs KN

# ==========================================
# PERFORMANCE
# ==========================================

[ ] Faster Move Generation
[ ] Incremental Evaluation
[ ] Zobrist Repetition Table
[ ] Piece List Optimizations
[ ] Capture Generation Profiling
[ ] TT Replacement Improvements

# ==========================================
# ENGINE ARCHITECTURE
# ==========================================

[ ] engineconstants.js
[ ] endgame.js
[ ] pawnhash.js
[ ] timemanager.js
[ ] UCI Support
[ ] Multi-PV

# ==========================================
# DEVELOPER TOOLS
# ==========================================

Current

[x] Verification Suite
[x] Benchmark
[x] Evaluation Breakdown
[x] Search Profiling

Future

[ ] Search Tree Viewer
[ ] TT Statistics
[ ] Move Ordering Diagnostics
[ ] Evaluation Heatmaps
[ ] Self Play Statistics
[ ] Elo Regression Tests

# ==========================================
# FUTURE
# ==========================================

[ ] Opening Book
[ ] Syzygy Tablebases
[ ] NNUE Evaluation
[ ] Chess960
[ ] Self Play Training

# ==========================================
# LONG-TERM GOAL
# ==========================================

Coach should eventually explain:

"What is the best move?"

and

"Why?"

with human-quality explanations backed by engine analysis.

The ultimate goal is to combine near-master playing strength with world-class teaching ability.

## Coach Lab

- Automated self-play
- Elo regression testing
- Opening book generation
- Parameter tuning
- PGN database
- Position database
- NNUE dataset generation
- Overnight training mode