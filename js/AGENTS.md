# AGENTS.md

Version: 2.0  
Project: Coach Chess Engine  
Owner: Sir Slice / Sir Slice  

---

# Purpose

You are contributing to the Coach Chess Engine.

Coach has two long-term goals:

1. Become a strong classical chess engine.
2. Become the world's best explainable chess engine.

Coach is not only expected to find good moves. It must eventually explain why those moves are good.

Every contribution should improve at least one of:

- Correctness
- Reliability
- Playing strength
- Performance
- Explainability
- Teaching value
- Developer understanding

---

# Required Reading Before Significant Changes

Before making architectural, search, evaluation, board, or UI changes, read the relevant documents first.

Primary documents:

1. `COACH_ENGINE.md`
2. `ARCHITECTURE.md`
3. `ENGINE_PRINCIPLES.md`
4. `AI_CONTEXT.md`
5. `ROADMAP.md`
6. `PROJECT_HISTORY.md`, if present

If these documents conflict with this file, prefer:

1. Current user instruction
2. `AGENTS.md`
3. `ENGINE_PRINCIPLES.md`
4. `ARCHITECTURE.md`
5. Other project documents
6. Inference from code

Do not assume undocumented architecture. Inspect the code.

---

# Project Philosophy

Coach values priorities in this order:

1. Correctness
2. Reliability
3. Architecture
4. Measurability
5. Performance
6. Playing strength
7. Teaching / explanation

Do not sacrifice a higher priority for a lower one.

Examples:

- Do not make search faster if it breaks legal move generation.
- Do not make evaluation stronger if Coach Lab can no longer explain it.
- Do not add a heuristic that improves one position but creates unmeasured regressions.
- Do not mix search, evaluation, board state, and UI responsibilities.

---

# Current Development Context

Coach currently has:

- Legal move generation
- Attack detection
- Make / undo move
- Perft testing
- Alpha-beta / negamax search
- Iterative deepening
- Quiescence search
- Transposition table
- Killer move support
- Aspiration windows
- Piece-square tables
- Zobrist hashing
- Piece lists
- Coach Lab diagnostics
- Browser-based UI

Known recent milestone:

- A major pawn Piece-Square Table orientation bug was fixed.
- Correct pawn PST orientation is:

```javascript
// White pawns
score += PawnTable[square];

// Black pawns
score -= PawnTable[mirror(square)];
```

Do not reverse this without proving it with diagnostics.

Expected starting-position PST evaluation after the fix:

```text
pieceSquares ≈ 0
total eval ≈ 0
```

Current likely strength estimate:

```text
Approximately 1000–1200 Elo
```

Current highest-value improvement areas:

1. Opening discipline
2. Early queen penalty / queen discipline
3. Castling urgency
4. King safety
5. Mobility / piece activity
6. Threat evaluation
7. Late Move Reductions
8. Static Exchange Evaluation

Do not jump to advanced search techniques before the basics are stable.

---

# Architecture Boundaries

Respect these boundaries:

```text
Board
↓
Attack
↓
Move Generation
↓
Legal Move Generation
↓
Evaluation
↓
Search
↓
Coach Lab
↓
Game Controller
↓
UI
```

Responsibilities:

## Board

The board owns:

- Piece placement
- Side to move
- Castling rights
- En passant square
- Halfmove / fullmove counters
- Zobrist hash
- Piece lists
- Make / undo move state

Board code must be deterministic and reversible.

## Attack

Attack code answers:

- Is this square attacked?
- Which side attacks this square?
- Is the king in check?

Attack code should not evaluate positions.

## Move Generation

Move generation creates pseudo-legal moves.

It should not:

- Score moves
- Evaluate positions
- Search
- Explain moves
- Update UI

## Legal Move Generation

Legal move generation filters pseudo-legal moves into legal moves.

It must preserve board state after testing moves.

## Evaluation

Evaluation understands the position.

It may evaluate:

- Material
- Piece-square tables
- Pawn structure
- Center occupation
- Development
- King safety
- Mobility
- Threats
- Endgame features

Evaluation should not:

- Search
- Mutate board state
- Depend on UI
- Print debug output unless explicitly in a debug function
- Hide important terms from Coach Lab

## Search

Search calculates.

Search may:

- Call legal move generation
- Call evaluation
- Order moves
- Use transposition tables
- Use pruning and reductions
- Return best move, score, PV, and stats

Search should not:

- Contain chess understanding that belongs in evaluation
- Directly modify evaluation internals
- Print large debug output during normal search
- Depend on UI

## Coach Lab

Coach Lab explains.

Coach Lab may:

- Compare moves
- Show evaluation deltas
- Explain why a move gained or lost score
- Display search vs static evaluation
- Show largest contributors
- Help diagnose regressions

Coach Lab should not:

- Change engine behavior
- Be required for search to work
- Mutate board state permanently
- Hide undefined or missing evaluation terms unless intentionally filtered

## UI

UI displays and accepts user input.

UI should not:

- Generate legal moves itself
- Evaluate positions
- Decide engine moves
- Contain engine rules

---

# Before Writing Code

Before modifying code, classify the task.

Ask:

1. Is this a board-state problem?
2. Is this an attack-detection problem?
3. Is this a move-generation problem?
4. Is this a legality problem?
5. Is this an evaluation problem?
6. Is this a search problem?
7. Is this a Coach Lab explanation problem?
8. Is this a UI problem?
9. Is this a testing / tooling problem?

Do not mix responsibilities.

If the task touches multiple layers, explain why.

---

# Agent Workflow

For every non-trivial task:

1. Inspect relevant files.
2. Identify the correct layer.
3. Summarize the current behavior.
4. Explain the proposed change.
5. State expected impact.
6. State expected computational cost.
7. Make the smallest meaningful change.
8. Run or recommend the correct verification.
9. Report changed files and functions.
10. Report risks and follow-up work.

Do not simply generate code.

---

# Coding Rules

Prefer:

- Complete functions
- Clear names
- Readable code
- Small changes
- Incremental improvements
- Existing project style
- Explicit reasoning
- Measurable outcomes

Avoid:

- Duplicate logic
- Clever code
- Hidden side effects
- Unnecessary abstractions
- Large rewrites
- Mixed-purpose functions
- Expensive heuristics without justification
- Debug spam in hot paths
- Silent behavior changes

---

# JavaScript Style Rules

Use the existing project style.

General rules:

- Use ES modules if the surrounding file uses ES modules.
- Preserve existing imports unless verified unnecessary.
- Do not remove imports just because they appear unused without checking side effects.
- Prefer named helper functions over large anonymous blocks.
- Avoid unnecessary allocations inside search, move generation, and evaluation hot paths.
- Keep browser compatibility in mind.
- Avoid adding build tools unless explicitly requested.
- Do not add dependencies without approval.

When giving code to the project owner:

- Provide the file name.
- Provide the complete function.
- Say exactly what function to replace.
- Mention any required imports.
- Mention any console commands to test it.

---

# Board and Move Rules

Board correctness is sacred.

Any board change must preserve:

- Piece placement
- Side to move
- Castling rights
- En passant square
- Move counters
- Zobrist hash
- Piece lists
- Check status
- Legal move count
- Undo correctness

For `makeMove()` / `undoMove()` changes:

- Every field changed by `makeMove()` must be restored by `undoMove()`.
- Captures must restore captured pieces.
- Promotions must restore pawns.
- Castling must restore both king and rook.
- En passant must restore both pawns and empty squares correctly.
- Hash must return to the original value after make/undo.
- Piece lists must match board squares after make/undo.

Do not optimize board code before correctness is verified.

---

# Square and Orientation Rules

Be very careful with square orientation.

Do not assume square indexing. Inspect `square.js`, `board.js`, and existing tests.

Known important rule:

```javascript
mirror(square) === square ^ 56
```

Pawn PST orientation after the known fix:

```javascript
// White pawns use the square directly.
PawnTable[square]

// Black pawns use the mirrored square.
PawnTable[mirror(square)]
```

Before changing any PST orientation:

1. Print the relevant squares.
2. Compare against actual board coordinates.
3. Verify starting eval is balanced.
4. Verify `chess.lab()` agrees with expected chess principles.
5. Record the before / after result.

---

# Move Generation Rules

Move generation must be validated with perft.

Do not modify move generation unless you are prepared to run perft.

Move generation changes must consider:

- Pawns
- Double pawn pushes
- Captures
- Promotions
- En passant
- Knights
- Bishops
- Rooks
- Queens
- Kings
- Castling
- Check
- Pins
- Discovered checks
- Illegal king moves

Pseudo-legal move generation and legal filtering must remain separate unless a deliberate architecture change is approved.

---

# Evaluation Rules

Evaluation is Coach's chess understanding.

Every meaningful evaluation feature should eventually be visible in Coach Lab.

Examples:

- Material
- Piece-square tables
- Center occupation
- Development
- Bishop freedom
- Pawn structure
- Passed pawns
- Isolated pawns
- Doubled pawns
- Connected pawns
- Mobility
- King safety
- Castling
- Threats
- Hanging pieces
- Space
- Rook activity
- Bishop pair
- Outposts
- Endgame king activity

Nothing important should remain a black box.

Evaluation should be:

- Deterministic
- Side-consistent
- Explainable
- Cheap enough for search
- Easy to inspect through Coach Lab

Before changing evaluation:

1. Observe current behavior.
2. Use `chess.eval()`.
3. Use `chess.lab()`.
4. Use `chess.lab("move")` for candidate moves.
5. Identify the incorrect term.
6. Modify only the relevant term.
7. Retest.

Do not tune constants blindly.

---

# Evaluation Perspective Rule

Preserve the engine's current evaluation perspective.

Before changing sign logic, determine whether evaluation is:

- White-relative
- Side-to-move-relative
- Negamax-adjusted elsewhere

Do not change evaluation perspective without updating search and every diagnostic tool that depends on it.

Any sign convention change requires a dedicated explanation and regression check.

---

# Opening Evaluation Rules

Opening evaluation should encourage:

- Center pawn occupation
- Minor-piece development
- Bishop freedom
- Castling readiness
- King safety
- Avoiding repeated piece moves without reason
- Avoiding early queen adventures
- Avoiding early rook moves before development

Opening evaluation should not hard-code specific openings.

Preferred principles:

- Reward `e4`, `d4`, `e5`, `d5` center occupation appropriately.
- Reward knights and bishops leaving their starting squares.
- Reward castling.
- Penalize early queen moves while development is incomplete.
- Penalize rook moves before castling/development unless tactically justified.
- Avoid excessive opening bonuses that overpower tactics.

Opening discipline is currently a high-priority improvement area.

---

# Search Rules

Search calculates.

Evaluation understands.

Coach Lab explains.

Maintain this separation.

Search changes must include:

- Why the change helps
- Expected Elo impact
- Expected node impact
- Tactical risk
- Verification method

Search improvements should usually be introduced in this order:

1. Correct alpha-beta / negamax behavior
2. Stable quiescence
3. Good move ordering
4. Transposition table correctness
5. Principal variation accuracy
6. Killer / history heuristics
7. Aspiration windows
8. Late Move Reductions
9. Null move pruning
10. Static Exchange Evaluation
11. Futility / razoring, only after strong testing

Do not add aggressive pruning before correctness and tactical stability are verified.

---

# Quiescence Rules

Quiescence search exists to avoid horizon-effect blunders.

Quiescence should be careful with:

- Captures
- Promotions
- Checks, if implemented
- Stand-pat evaluation
- Delta pruning, if implemented
- Capture ordering

Do not make quiescence too broad without measuring node explosion.

---

# Transposition Table Rules

Transposition table correctness matters more than speed.

When modifying TT logic, verify:

- Hash keys are stable.
- Make/undo restores hash.
- Stored depth is respected.
- Bound type is correct.
- Exact / lower / upper entries are used correctly.
- Best move from TT is legal before use.
- Collisions are handled safely enough for current architecture.

TT bugs can create strong-looking but illegal or unstable play.

---

# Performance Rules

Avoid unnecessary allocations in hot paths:

- Search
- Move generation
- Legal move generation
- Evaluation
- Attack detection

Prefer:

- Reuse existing arrays where safe.
- Cache repeated values where safe.
- Use piece lists when already available.
- Measure before optimizing.
- Benchmark after search changes.

Do not optimize code that is not a bottleneck.

Do not reduce readability for minor speed gains unless the bottleneck is measured.

---

# Coach Lab Rules

Coach Lab is the preferred method for investigating engine behavior.

Before changing evaluation:

1. Observe.
2. Measure.
3. Use Coach Lab.
4. Modify.
5. Re-measure.

Coach Lab modes:

```javascript
chess.lab()
```

Expected purpose:

- Quick comparison of candidate moves.
- Static score.
- Search score.
- Search gain.
- Major deltas.

```javascript
chess.lab("e2-e4")
```

Expected purpose:

- Detailed move report.
- Opening contribution.
- PST contribution.
- Pawn contribution.
- King contribution.
- Mobility contribution.
- Final score.
- Search gain.
- Eventually Coach notes.

Coach Lab should become more readable over time, not just more detailed.

Preferred Coach Lab report shape:

```text
Opening
Piece-Square Tables
Pawn Structure
King
Mobility
Threats
Final Static Score
Search Score
Search Gain
Coach Notes
```

Every new evaluation term should either:

- Appear directly in Coach Lab, or
- Be intentionally grouped into a visible subtotal.

---

# UI Rules

UI changes must not alter engine correctness.

When changing UI:

- Preserve board orientation.
- Preserve square mapping.
- Preserve legal move highlighting.
- Preserve capture highlighting.
- Avoid mixing UI click handling with engine rules.
- Avoid changing engine files unless required.

Known UI sensitivity:

- Board row/column sizing
- Piece alignment
- SVG piece sizing
- Legal move dots
- Capture rings
- H-file / bottom-row clipping

If changing CSS, inspect visually in browser.

---

# Developer Commands

The project commonly exposes developer commands through `window.chess`.

Before using a command, inspect `main.js` to confirm the exact name.

Known or expected commands include:

```javascript
chess.verify()
chess.eval()
chess.lab()
chess.lab("e2-e4")
chess.bench(depth)
chess.compare(depth)
chess.perft.run(depth)
chess.divide(depth)
chess.debugEvaluation()
```

If a command does not exist, do not invent behavior. Report that it is missing and suggest where to add it.

---

# Required Testing by Change Type

## Board Changes

Required:

```javascript
chess.verify()
chess.perft.run(1)
chess.perft.run(2)
chess.perft.run(3)
```

Recommended:

```javascript
chess.perft.run(4)
```

Also verify:

- Make/undo restores original board.
- Hash returns to original value.
- Piece lists match board.
- Castling rights restore correctly.
- En passant restores correctly.

## Move Generation Changes

Required:

```javascript
chess.verify()
chess.perft.run(1)
chess.perft.run(2)
chess.perft.run(3)
```

Recommended:

```javascript
chess.perft.run(4)
chess.divide(depth)
```

Test special cases:

- Castling
- En passant
- Promotion
- Check
- Double check
- Pins
- Discovered checks
- King in check

## Search Changes

Required:

```javascript
chess.verify()
chess.bench(4)
chess.bench(5)
```

Recommended:

```javascript
chess.bench(6)
chess.compare(depth)
```

Report:

- Best move
- Eval
- Depth
- Nodes
- NPS
- Time
- PV
- Any tactical oddities

## Evaluation Changes

Required:

```javascript
chess.verify()
chess.eval()
chess.lab()
```

Recommended:

```javascript
chess.lab("e2-e4")
chess.lab("b1-c3")
chess.bench(5)
chess.bench(6)
```

For evaluation changes, report:

- Before score
- After score
- Which term changed
- Why it changed
- Whether Coach Lab explains it clearly
- Whether play became more natural

## Coach Lab Changes

Required:

```javascript
chess.lab()
chess.lab("e2-e4")
```

Verify:

- No permanent board mutation.
- No broken search.
- Report is readable.
- Undefined terms are intentional or documented.
- Scores reconcile with evaluation totals.

## UI Changes

Required:

- Load the page in browser.
- Move pieces.
- Check legal move dots.
- Check capture highlights.
- Check board sizing.
- Check piece alignment.

Recommended:

- Test from starting position.
- Test after several moves.
- Test captures.
- Test castling when available.

---

# Regression Positions

When behavior is suspicious, create or reuse regression positions.

A regression position should include:

- FEN or reproducible move sequence
- Expected best move or expected behavior
- Current incorrect behavior
- Relevant Coach Lab output
- Engine version or date

Do not rely only on the starting position.

---

# Pull Request / Change Philosophy

One meaningful improvement per change.

Good changes:

- Fix pawn PST orientation.
- Improve early queen penalty.
- Add bishop mobility evaluation.
- Implement PVS.
- Fix en passant legality bug.
- Improve Coach Lab report formatting.

Bad changes:

- Add mobility, king safety, null move pruning, UI changes, and refactor board in one change.
- Rewrite search and evaluation together.
- Change constants blindly across many files.
- Modify move generation while tuning evaluation.

Each change should be easy to review and easy to revert.

---

# Proposal Requirements

Every proposal should explain:

1. What problem is being solved?
2. Which layer owns the problem?
3. Why this approach?
4. Expected playing-strength impact.
5. Expected computational cost.
6. Alternatives considered.
7. Risks / tradeoffs.
8. How to test.
9. How Coach Lab will expose the change, if evaluation-related.

Do not simply generate code.

---

# Multi-Agent / Subagent Guidance

Use multiple agents only when explicitly requested or when the task is large enough to benefit from parallel investigation.

Good multi-agent splits:

## Explorer Agent

Purpose:

- Read code.
- Map relevant files.
- Identify current behavior.
- Do not edit code.

## Evaluation Agent

Purpose:

- Inspect evaluation terms.
- Identify scoring issues.
- Propose explainable heuristics.
- Ensure Coach Lab visibility.

## Search Agent

Purpose:

- Inspect search behavior.
- Analyze pruning, move ordering, TT, PV, and quiescence.
- Avoid evaluation changes.

## Verification Agent

Purpose:

- Run or design tests.
- Check perft, verify, bench, and regression positions.
- Look for unintended side effects.

## Review Agent

Purpose:

- Review diff.
- Look for architecture violations.
- Look for duplicated logic.
- Look for missing tests.

When using multiple agents, consolidate results before making changes.

Do not let multiple agents edit overlapping files without coordination.

---

# File Ownership Guidance

Expected file responsibilities may include:

```text
core/piece.js
Piece constants and piece helpers.

core/square.js
Square indexing, file/rank helpers, algebraic conversion.

core/board.js
Board representation, make/undo, FEN, hash, piece lists.

engine/attack.js
Attack detection.

engine/move.js
Move object and move flags.

engine/movegen.js
Pseudo-legal move generation.

engine/legalmovegen.js
Legal move filtering.

engine/evaluation.js
Static evaluation.

engine/search.js
Search, move ordering, TT usage, Coach Lab if currently located there.

engine/perft.js
Perft testing.

ui/ui.js
Board rendering, piece rendering, highlights, click behavior.

ui/main.js
Wiring, developer commands, game startup.
```

Inspect the actual repository before relying on this map.

---

# Known Anti-Patterns

Avoid these:

- Changing constants until one move looks better.
- Adding a penalty in search that belongs in evaluation.
- Adding evaluation terms that Coach Lab cannot show.
- Removing imports without checking browser behavior.
- Ignoring perft after move-generation changes.
- Assuming a bug is in UI when square mapping may be wrong.
- Assuming a bug is in search when evaluation signs may be wrong.
- Making Coach Lab output huge unreadable tables only.
- Adding expensive king safety before simple castling/opening discipline.
- Optimizing before measuring.
- Refactoring while fixing a bug.

---

# Definition of Done

A change is done only when:

1. The correct layer was modified.
2. The implementation is small and readable.
3. Relevant verification was run or clearly specified.
4. No unrelated behavior was changed.
5. Coach Lab reflects new evaluation logic when applicable.
6. The final response lists changed files and functions.
7. Remaining risks are stated.
8. Follow-up work is identified.

---

# Final Response Format for Agents

When completing work, report:

```text
Summary
- What changed.

Files Changed
- file.js: functionName()

Why
- Reason for the change.

Verification
- Commands run.
- Results.
- Commands not run and why.

Engine Impact
- Expected strength impact.
- Expected performance impact.
- Expected explainability impact.

Risks
- Any possible regressions.

Next Step
- One recommended follow-up.
```

Do not claim tests passed unless they were actually run.

---

# Final Instruction

If uncertain, choose the solution that is:

- More maintainable
- More measurable
- More explainable
- More reusable
- More correct

rather than merely shorter or faster.

Coach is a chess engine, but also a teaching engine.

Every contribution should help Coach either:

- Play better,
- Think faster,
- Break less,
- Explain more clearly,
- Or help the developer understand what is happening.
