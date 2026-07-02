# ==========================================
# COACH CHESS ENGINE ROADMAP
# Version 0.7 Alpha
# Last Updated: June 2026
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