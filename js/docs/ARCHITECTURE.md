# ARCHITECTURE.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document defines the architecture of the Coach Chess Engine.

Unlike the roadmap, this document focuses on software organization rather than features.

Every subsystem has a single responsibility.

Maintaining these boundaries is essential for long-term maintainability.

---

# High-Level Architecture

```
               User
                 │
                 ▼
             Game Controller
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
     Search              Coach Lab
      │                     │
      ▼                     ▼
  Evaluation         Analysis / Reports
      │
      ▼
 Move Generation
      │
      ▼
 Attack Detection
      │
      ▼
     Board
```

Everything ultimately depends on the board.

Nothing bypasses the board.

---

# Layer Responsibilities

## Layer 1

### Board

Owns:

- Squares
- Piece lists
- Side to move
- Castling rights
- En passant
- Move history
- Hash key

Responsibilities:

- makeMove()
- undoMove()
- updatePieceLists()

The board knows nothing about:

- search
- evaluation
- UI

---

## Layer 2

### Attack Detection

Determines:

- attacked squares
- checks
- pins (future)
- discovered attacks (future)

Everything else relies on Attack.

Attack should never depend on Search.

---

## Layer 3

### Move Generation

Produces pseudo-legal moves.

Responsibilities:

- sliding pieces
- leapers
- promotions
- en passant
- castling

Move generation should be deterministic.

No evaluation logic belongs here.

---

## Layer 4

### Legal Move Generator

Filters pseudo-legal moves.

Responsibilities:

- legality
- king safety
- check detection

Search should never verify legality itself.

---

## Layer 5

### Evaluation

Converts a position into centipawns.

Evaluation answers:

"How good is this position?"

Evaluation does NOT answer:

"What move should I play?"

Current categories:

Material

Opening

Position

Pawns

King

Mobility

Future categories:

Game Phase

Initiative

Space

Outposts

Endgame

Evaluation must remain deterministic.

---

## Layer 6

### Search

Search answers:

"What move should I play?"

Search does NOT understand positional chess.

Search combines:

Evaluation

+

Alpha-Beta

+

Move Ordering

+

Pruning

+

Transposition Table

Search should remain independent from UI.

---

## Layer 7

### Coach Lab

Coach Lab is unique.

It never changes engine strength.

It observes.

Responsibilities:

Explain moves.

Compare evaluations.

Generate reports.

Regression analysis.

Future:

Opening reports.

Self-play reports.

Parameter tuning.

NNUE dataset generation.

Coach Lab should never influence engine decisions.

---

## Layer 8

### Game Controller

Coordinates:

Search

Board

UI

Clock

Future:

Time Management

Opening Book

Engine Matches

---

## Layer 9

### UI

Responsible only for presentation.

Examples:

Board display.

Move highlights.

Engine panel.

Evaluation display.

No chess logic belongs here.

---

# Dependency Rules

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

Dependencies should flow downward.

Lower layers should never depend on higher layers.

Example

GOOD

Search

↓

Evaluation

BAD

Evaluation

↓

Search

---

# Planned Modules

Current

✓ Board

✓ Search

✓ Evaluation

✓ UI

Future

engineconstants.js

Coach Lab

Endgame Evaluator

Pawn Hash

Time Manager

Opening Book

Tournament Manager

NNUE

Trainer

---

# Ownership Rules

## Board owns

Game state.

Nothing else.

---

Search owns

Tree exploration.

Nothing else.

---

Evaluation owns

Chess understanding.

Nothing else.

---

Coach Lab owns

Explanation.

Nothing else.

---

UI owns

Presentation.

Nothing else.

---

# Future Architecture

Current

```
Board

↓

Search

↓

UI
```

Target

```
Board
      │
      ▼
Attack
      │
      ▼
Move Generation
      │
      ▼
Evaluation
      │
      ▼
Search
      │
 ┌────┴────┐
 ▼         ▼
CoachLab  SelfPlay
 │         │
 ▼         ▼
Trainer   Tournament
 │
 ▼
NNUE
```

---

# File Organization

```
engine/

board/

evaluation/

search/

movegen/

attack/

dev/

ui/

training/        (future)

opening/          (future)

endgame/          (future)

nnue/             (future)
```

Files should belong to exactly one subsystem.

Avoid "misc.js" or "helpers.js" dumping grounds.

---

# Design Philosophy

Every class should answer one question well.

Examples

Board

"What is the current position?"

Evaluation

"How good is this position?"

Search

"What move should be played?"

Coach Lab

"Why was this move chosen?"

UI

"How should this be displayed?"

When a class begins answering multiple questions, consider refactoring.

---

# Performance Philosophy

Performance improvements should be applied at the lowest practical layer.

Preferred order:

1. Board
2. Move Generation
3. Evaluation
4. Search

Optimizing the Board benefits the entire engine.

Optimizing the UI benefits only the UI.

---

# Future Self-Play Architecture

Eventually Coach will include:

```
Coach

↓

Self Play

↓

Coach Lab

↓

Regression Reports

↓

Parameter Tuner

↓

Opening Database

↓

Position Database

↓

NNUE Dataset

↓

Next Version
```

The architecture should support this evolution without major rewrites.

---

# Architecture Checklist

Before adding a feature ask:

Does it belong in the correct subsystem?

Does it duplicate existing logic?

Does it increase coupling?

Can Coach Lab explain it?

Will this architecture still make sense in five years?

If any answer is "no," reconsider the design.

---

# Final Thought

The architecture exists to make future improvements easier.

A strong architecture compounds.

Every clean design decision today makes every future feature simpler.

Protect the architecture as carefully as the engine itself.