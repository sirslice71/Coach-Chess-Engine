# EVALUATION_GUIDE.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document describes every evaluation term used by the Coach Chess Engine.

Evaluation is responsible for answering one question:

> **"How good is this position?"**

Search is responsible for finding the best move.

Evaluation is responsible for understanding the position.

Coach Lab is responsible for explaining the evaluation.

These responsibilities should never overlap.

---

# Evaluation Philosophy

Coach uses a classical handcrafted evaluation.

Every evaluation term should satisfy four requirements.

## 1. Explainable

Coach Lab must eventually display the value.

---

## 2. Measurable

Its impact should be measurable through testing.

---

## 3. Efficient

The computational cost must justify the Elo gain.

---

## 4. Independent

Each heuristic should represent one chess concept.

Avoid combining unrelated ideas.

---

# Current Evaluation Pipeline

```
Material

↓

Opening

↓

Position

↓

Pawns

↓

King

↓

Mobility

↓

Total Evaluation
```

Every category is evaluated independently.

The final score is the sum of all categories.

---

# Material

Purpose

Measure material balance.

Current

✓ Pawns

✓ Knights

✓ Bishops

✓ Rooks

✓ Queens

Future

Draw scaling

Exchange imbalance

Bishop vs Knight imbalance

Piece synergy

---

# Opening

Current Features

✓ Development

✓ Center Control

Future

Opening Coordination

Early Queen Penalty

Early Rook Penalty

Delayed Castling

Opening Initiative

Game Phase Scaling

---

## Development

Rewards

Minor pieces leaving starting squares.

Future

Reward complete development.

Penalize repeated development.

Reward completed kingside development.

Reward opening bishop lines.

---

## Center Control

Current

Rewards occupation and influence of central squares.

Future

Distinguish:

Occupation

Influence

Control

Support

Contest

---

# Position

Current

Piece-Square Tables

Future

Piece Activity

Space

Open Files

Outposts

Bad Bishop

Rook Activity

Initiative

---

## Piece-Square Tables

Current

Pawn

Knight

Bishop

Rook

Queen

King Middlegame

King Endgame

Future

Automatically tuned PSTs.

---

## Piece Activity

Future

Measure

Freedom

Influence

Pressure

Coordination

Instead of relying solely on PST values.

---

# Pawn Structure

Current

Passed Pawns

Connected Pawns

Isolated Pawns

Doubled Pawns

Future

Backward Pawns

Candidate Passed Pawns

Protected Passed Pawns

Pawn Chains

Pawn Islands

Blocked Pawns

Pawn Levers

---

## Passed Pawns

Purpose

Reward pawns with no opposing pawns blocking promotion.

Future

Scale by:

Rank

King proximity

Support

Game phase

---

## Connected Pawns

Purpose

Reward mutually supporting pawns.

Future

Differentiate

Connected

Protected

Chained

---

## Isolated Pawns

Purpose

Penalize pawns without friendly neighbors.

Future

Reduce penalty if:

Open file benefits rook.

Creates attack.

---

## Doubled Pawns

Purpose

Penalize stacked pawns.

Future

Reduce penalty when:

Open file compensation exists.

Passed pawn potential exists.

---

# King Safety

Current

Minimal.

Future

Castling Bonus

Delayed Castling Penalty

Pawn Shield

Open Files

Weak Squares

King Tropism

Enemy Attack Units

Storm Pawns

Shelter Evaluation

King Exposure

King Activity (Endgame)

---

# Mobility

Current

Framework exists.

Future

Knight Mobility

Bishop Mobility

Rook Mobility

Queen Mobility

Safe Mobility

Restricted Mobility

Attacking Mobility

Defensive Mobility

---

# Game Phase

Current

Opening

Future

Opening

↓

Middlegame

↓

Endgame

Use interpolation instead of abrupt transitions.

---

# Endgame

Future

King Activity

Passed Pawn Races

Opposition

Rule of the Square

Lucena

Philidor

Fortresses

Zugzwang

---

# Evaluation Order

Preferred evaluation order

1.

Material

↓

2.

Game Phase

↓

3.

Opening

↓

4.

Pawn Structure

↓

5.

Piece Activity

↓

6.

King Safety

↓

7.

Mobility

↓

8.

Special Bonuses

↓

Total

This order minimizes unnecessary work.

---

# Incremental Evaluation

Long-term objective

Avoid recalculating everything every node.

Future

Incremental PST

Incremental Material

Pawn Hash

Incremental Mobility

Incremental King Safety

Incremental Game Phase

---

# Coach Lab Integration

Every evaluation term should eventually appear in Coach Lab.

Example

```
Opening

Development

+12

Center

+8

Coordination

+6

Tempo

-4
```

Nothing should remain hidden.

---

# Parameter Tuning

Future

Every evaluation constant should become tunable.

Workflow

Old Value

↓

New Value

↓

5,000 Self-Play Games

↓

Compare Elo

↓

Accept or Reject

Coach should evolve through measured improvements.

---

# Evaluation Constants

Long-term goal

Every evaluation constant should exist in a centralized file.

Examples

```
PASSED_PAWN

CONNECTED_PAWN

ISOLATED_PAWN

DOUBLED_PAWN

BISHOP_PAIR

CASTLING_BONUS
```

Avoid magic numbers inside evaluation code.

---

# Evaluation Checklist

Before adding a new heuristic ask:

Is it explainable?

Is it measurable?

Is it efficient?

Does Coach Lab display it?

Can it become incremental later?

Does Stockfish evaluate something similar?

If the answer to most of these is "no,"

reconsider the heuristic.

---

# Long-Term Vision

Coach's evaluation should evolve from:

Simple handcrafted heuristics

↓

Rich positional understanding

↓

Automatically tuned parameters

↓

Hybrid classical + NNUE evaluation

without sacrificing explainability.

---

# Final Thought

Evaluation is where Coach learns chess.

Search discovers moves.

Coach Lab explains ideas.

Together they create an engine that is not only stronger...

...but understandable.