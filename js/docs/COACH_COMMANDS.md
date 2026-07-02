# COACH_COMMANDS.md

Version: 1.0
Project: Coach Chess Engine

---

# Purpose

This document describes every developer command available through the
`window.chess` interface.

These commands are intended for development, debugging, testing, benchmarking,
and engine analysis.

As Coach grows, this document should always reflect the current developer API.

---

# General Commands

## chess.turn()

Returns the side to move.

Example

```javascript
chess.turn()

"White"
```

---

## chess.moves()

Returns all legal moves.

Example

```javascript
chess.moves()
```

Returns

```
Array<Move>
```

---

## chess.printMoves()

Returns all legal moves in algebraic coordinate notation.

Example

```javascript
chess.printMoves()

[
    "e2-e4",
    "d2-d4",
    "g1-f3"
]
```

Useful for quick move inspection.

---

## chess.history()

Displays every move played in the current game.

Example

```javascript
chess.history()
```

Output

| Ply | Move |
|----:|------|
| 1 | e2-e4 |
| 2 | e7-e5 |
| 3 | g1-f3 |

---

# Position Commands

## chess.position(name)

Loads one of the built-in positions.

Example

```javascript
chess.position("start")
```

---

## chess.positions()

Lists all available built-in positions.

Example

```javascript
chess.positions()
```

---

## chess.load(fen)

Loads a FEN string.

Example

```javascript
chess.load("rnbqkbnr/pppppppp/...")
```

---

## chess.fen()

Returns the current FEN.

Example

```javascript
chess.fen()
```

---

## chess.savePosition(name)

Prints the current position as a reusable FEN entry.

Example

```javascript
chess.savePosition("Knight Test")
```

---

# Evaluation Commands

## chess.eval()

Returns the current static evaluation.

Example

```javascript
chess.eval()
```

---

## chess.staticEval()

Alias of

```
chess.eval()
```

---

## chess.searchEval()

Returns the evaluation from the most recent completed search.

Example

```javascript
chess.searchEval()
```

---

## chess.engineEval()

Returns the complete evaluation object from the last search.

Useful for debugging.

---

## chess.debugEvaluation()

Displays every evaluation category.

Current sections

Material

Opening

Position

Pawns

King

Mobility

Future

Space

Initiative

Game Phase

---

## chess.debugKnightPST()

Displays the Knight Piece-Square Table.

Useful while tuning PST values.

---

# Coach Lab

## chess.lab(move)

Analyzes why a move changes the evaluation.

Example

```javascript
chess.lab("e2-e4")
```

Output

Before

↓

After

↓

Difference

Displayed Categories

Material

Opening

Position

Pawns

King

Mobility

Total

Coach Lab is the preferred evaluation debugging tool.

---

## chess.compare(depth)

Searches every legal move and compares their evaluations.

Useful for understanding why Coach selected a move.

Example

```javascript
chess.compare(2)
```

Displays

Search score

Static score

Evaluation breakdown

One row per move

---

# Search Commands

## chess.bench(depth)

Runs the search benchmark.

Example

```javascript
chess.bench(6)
```

Displays

Best move

Evaluation

Nodes

Time

NPS

Principal Variation

Search Profile

---

## chess.benchAll()

Runs benchmarks from depth 1 upward.

Useful for regression testing.

---

## chess.analyze(depth)

Runs an engine search without playing a move.

Useful while debugging.

---

# Perft

## chess.verify()

Runs the complete verification suite.

Includes

Perft

Hash verification

Make/Undo validation

Board verification

Every major code change should pass verify().

---

## chess.perft(depth)

Runs a standard Perft test.

Example

```javascript
chess.perft(5)
```

Returns

Nodes

Elapsed time

Nodes Per Second

---

## chess.divide(depth)

Runs a divide test.

Displays node counts for every legal root move.

Useful for move generation debugging.

---

## chess.divideAfter(move, depth)

Runs divide after a specific move.

Example

```javascript
chess.divideAfter("e2-e4", 5)
```

Useful for debugging a specific branch.

---

# Attack Helpers

## chess.attacked(square, byWhite)

Returns true if a square is attacked.

Example

```javascript
chess.attacked("e4", true)
```

---

## chess.attack(square, byWhite)

Displays attack information for a square.

Developer debugging tool.

---

# Hashing

## chess.hash()

Generates the current Zobrist hash.

---

## chess.verifyHash()

Verifies the incremental hash.

Useful after board modifications.

---

# Material

## chess.material()

Returns

White material

Black material

Difference

---

# Castling

## chess.castling()

Displays current castling rights.

---

# En Passant

## chess.enPassant()

Displays the current en passant square.

---

# Internal Objects

These are intended primarily for engine development.

```
chess.board

chess.search

chess.evaluation

chess.perft

chess.tt

chess.zobrist

chess.ui

chess.logger
```

Direct modification is discouraged.

---

# Typical Workflow

Evaluation change

```
verify()

↓

lab()

↓

compare()

↓

bench()

↓

Play games
```

---

Search change

```
verify()

↓

bench()

↓

benchAll()

↓

Play games
```

---

Bug fix

```
Reproduce

↓

verify()

↓

Fix

↓

verify()

↓

Regression test

↓

Document
```

---

# Future Commands

Planned

```
chess.selfplay()

chess.tournament()

chess.regression()

chess.openings()

chess.stats()

chess.training()

chess.exportNNUE()

chess.regressionReport()

chess.performance()

chess.profile()

chess.explain()
```

---

# Design Philosophy

The `window.chess` interface is intentionally designed to expose every major
engine subsystem for inspection.

The goal is not merely to debug the engine, but to understand it.

Coach should be one of the easiest chess engines in the world to explore and
learn from.