# CODEBASE_MAP.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document is the navigation guide for the Coach Chess Engine.

It exists to answer one question:

**"Where does this belong?"**

Both human developers and AI assistants should consult this document before making changes.

If a feature appears to belong in multiple places, the architecture should be reconsidered.

---

# High-Level Layout

```
Coach/

index.html

style.css

js/

    board/

    engine/

    evaluation/

    ui/

    dev/

docs/
```

---

# Board

## board.js

### Responsibilities

Owns the entire game state.

### Important Functions

makeMove()

undoMove()

verify()

updatePieceLists()

repetitionKey()

### Owns

Squares

Side to move

Move history

Castling rights

En passant

Material

Piece lists

Hash key

### NEVER

Search

Evaluation

UI

---

# Move Generation

## movegen.js

### Responsibilities

Generate pseudo-legal moves.

### Important Functions

generateMoves()

generatePawnMoves()

generateKnightMoves()

generateSlidingMoves()

---

## legalmovegen.js

### Responsibilities

Filter pseudo-legal moves into legal moves.

### Important Functions

generateMoves()

removeIllegalMoves()

### NEVER

Evaluate positions.

---

# Attack

## attack.js

### Responsibilities

Square attack detection.

### Used By

Board

Move Generation

Evaluation

Search

### Important Functions

isSquareAttacked()

debug()

Future

Attack maps

Pins

Discovered attacks

---

# Evaluation

## evaluation.js

### Responsibilities

Static evaluation only.

### Entry Point

evaluate()

### Current Functions

evaluateMaterial()

evaluateOpening()

evaluateDevelopment()

evaluateCenter()

evaluatePosition()

evaluatePawns()

evaluateKing()

evaluateMobility()

debugEvaluation()

### Future Functions

evaluateGamePhase()

evaluateSpace()

evaluateInitiative()

evaluateOutposts()

evaluateBadBishop()

evaluateOpenFiles()

evaluateConnectedRooks()

---

# Piece Square Tables

## pst.js

Owns

Pawn PST

Knight PST

Bishop PST

Rook PST

Queen PST

King MG

King EG

Future

Incremental PST

---

# Search

## search.js

### Responsibilities

Find the best move.

### Important Functions

searchRoot()

searchIteration()

negamax()

quiescence()

bench()

benchAll()

compareRootMoves()

lab()

analyze()

### Future

PVS

Null Move

LMR

SEE

IID

Singular Extensions

---

# Transposition Table

## tt.js

Responsibilities

Store searched positions.

Probe.

Replace.

Future

Replacement strategies.

Statistics.

---

# Zobrist

## zobrist.js

Responsibilities

Hash generation.

Hash verification.

Incremental updates.

---

# Game Controller

## gamecontroller.js

Responsibilities

Coordinate:

Board

Search

UI

Engine Panel

Move execution

Future

Time manager

Game clocks

Engine matches

---

# UI

## ui.js

Responsibilities

Rendering.

Mouse interaction.

Highlights.

Animations.

### NEVER

Contain chess logic.

---

# Developer Tools

## enginedebug.js

Responsibilities

Debug output.

Tables.

Verification.

Search logging.

Future

Evaluation heatmaps.

Search tree viewer.

---

# Main Entry

## main.js

Responsibilities

Application startup.

Wire all engine components together.

Expose:

window.chess

Developer console commands.

---

# Current Developer API

verify()

perft()

divide()

divideAfter()

bench()

benchAll()

compare()

lab()

debugEvaluation()

debugKnightPST()

engineEval()

material()

position()

fen()

savePosition()

moves()

history()

---

# Coach Lab

Current

search.lab()

Future

coachlab.js

Responsibilities

Explain moves.

Regression reports.

Evaluation inspection.

Parameter tuning.

Self-play reports.

Opening reports.

---

# Future Modules

## endgame.js

Specialized endgame evaluator.

---

## pawnhash.js

Pawn structure cache.

---

## timemanager.js

Clock management.

---

## openingbook.js

Opening database.

---

## selfplay.js

Automated engine matches.

---

## trainer.js

Parameter tuning.

Regression testing.

---

## tournament.js

Engine tournaments.

Version comparisons.

---

## nnue/

Future neural evaluation.

---

# Where Should I Put New Code?

## Search Feature

search.js

---

## Static Evaluation

evaluation.js

---

## Pawn Evaluation

evaluation.js

Future:

pawnhash.js

---

## Endgame Logic

endgame.js

---

## Time Controls

timemanager.js

---

## Developer Commands

main.js

---

## Engine Diagnostics

Coach Lab

enginedebug.js

---

## UI

ui.js

---

# Dependency Graph

```
Board

↓

Attack

↓

Move Generation

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

Dependencies should only move downward.

Never create circular dependencies.

---

# Ownership Rules

Board owns game state.

Evaluation owns chess understanding.

Search owns move selection.

Coach Lab owns explanation.

UI owns presentation.

Respect these boundaries.

---

# Common Tasks

## I want to improve king safety

evaluation.js

Coach Lab

---

## I want to improve move ordering

search.js

---

## I want to optimize make/undo

board.js

---

## I want to explain why Coach chose a move

Coach Lab

---

## I want to add a developer command

main.js

---

## I want to add a benchmark

search.js

---

## I want to improve evaluation transparency

Coach Lab

evaluation.js

---

# Navigation Philosophy

No developer should spend time searching for where code belongs.

The architecture should answer that question immediately.

CODEBASE_MAP.md exists to make the engine navigable as it grows from thousands to tens of thousands of lines of code.
