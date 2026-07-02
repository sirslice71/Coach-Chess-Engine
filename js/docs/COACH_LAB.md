# COACH_LAB.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

Coach Lab is the analytical subsystem of the Coach Chess Engine.

Unlike Search, Coach Lab does not attempt to play stronger chess.

Instead, Coach Lab exists to understand, explain, measure, and improve the engine.

Coach Lab is the bridge between playing chess and learning chess.

It is designed for both developers and players.

---

# Mission

Search answers:

"What is the best move?"

Coach Lab answers:

"Why?"

Eventually Coach Lab should also answer:

- What alternatives existed?
- Why were they rejected?
- Which evaluation terms mattered most?
- Which plans were considered?
- Which long-term ideas influenced the decision?

Coach Lab exists to remove mystery from engine decisions.

---

# Philosophy

Coach Lab never influences search.

Coach Lab never changes evaluation.

Coach Lab observes.

Measures.

Explains.

Reports.

This separation is intentional.

Search should remain as fast as possible.

Coach Lab can afford to spend additional time analyzing positions because it is used for development and learning.

---

# Current Features

Implemented

✓ Evaluation breakdown

✓ compare()

✓ debugEvaluation()

✓ lab(move)

These tools provide visibility into Coach's decision-making process.

---

# Current Workflow

Current position

↓

Coach Lab

↓

Make candidate move

↓

Static evaluation

↓

Undo move

↓

Report differences

Current output includes:

Material

Opening

Position

Pawns

King

Mobility

Total

---

# Near-Term Goals

Coach Lab should evolve into a comprehensive analysis environment.

Future features include:

## Position Analysis

Current evaluation

Game phase

Material balance

Strategic overview

Development status

King safety

Pawn structure

Space

Initiative

---

## Move Analysis

For every legal move display:

Static evaluation

Search evaluation

Evaluation delta

Search delta

Principal variation

Confidence

Expected game phase

---

## Evaluation Breakdown

Every evaluation category should become expandable.

Example

Opening

↓

Development

Center Control

Coordination

Tempo

Future:

Piece Activity

↓

Knight Activity

Bishop Activity

Rook Activity

Queen Activity

Eventually every evaluation heuristic should be visible.

Nothing should remain a black box.

---

# Explainability

The defining feature of Coach Lab is explainability.

Coach should eventually be capable of producing explanations such as:

"I selected e4 because:

• It increases center control.

• It develops a pawn toward the center.

• It opens the bishop.

• It prepares castling.

• No tactical refutation was found."

The explanation should be generated from real evaluation data rather than hard-coded text.

---

# Regression Analysis

Future versions of Coach Lab should compare engine versions.

Example:

Version A

↓

Version B

↓

5,000 self-play games

↓

Results

↓

Strength change

↓

Evaluation differences

↓

Report

Coach Lab should become the central regression testing system.

---

# Position Database

Coach Lab should eventually maintain a database of interesting positions.

Examples:

Opening mistakes

Missed tactics

Endgame failures

King safety failures

Positional misunderstandings

These positions become future regression tests.

Coach should never repeatedly make the same mistake without detection.

---

# Opening Reports

Future capability

Analyze thousands of opening positions.

Example report:

Coach as White

1.e4

Score

57%

Coach as White

1.d4

Score

53%

Coach as Black

1...e5

Score

55%

Coach as Black

1...Nc6

Score

41%

This identifies opening weaknesses without human intervention.

---

# Self-Play Reports

Future capability

Every overnight training session should generate a report.

Example

Games Played

5,000

Wins

2,371

Losses

2,198

Draws

431

Most common mistakes

• Delayed castling

• Weak bishop activity

• Repeated knight moves

• Weak king safety

Coach Lab should summarize these automatically.

---

# Parameter Tuning

Coach Lab should eventually evaluate parameter changes.

Example

Old bishop pair bonus

30

New bishop pair bonus

35

Result

+18 Elo

Confidence

High

Only measured improvements should be accepted.

---

# Elo Regression

Future capability

Every engine version should have an Elo history.

Example

Version

0.7

1300 Elo

↓

0.8

1385 Elo

↓

0.9

1462 Elo

Coach Lab should preserve this history permanently.

---

# Coach Lab Dashboard

Long-term vision

```
=======================================

COACH LAB

=======================================

Engine Version

0.9

Estimated Strength

1650 Elo

Current Position

+0.42

Best Move

e4

Confidence

86%

Search Depth

12

Evaluation

Material

0

Opening

+18

Position

+16

King

+6

Pawns

+2

Mobility

+4

Principal Variation

e4 e5 Nf3 Nc6

Warnings

Delayed castling

Weak bishop activity

Center can be improved

=======================================
```

---

# Educational Mode

One of Coach's defining long-term goals.

Coach should eventually explain moves in human language.

Example

Beginner

"Develop your knight before moving the rook."

Intermediate

"e4 gains central space while opening the bishop."

Advanced

"The move improves central control and slightly increases long-term kingside attacking potential."

Coach Lab should support multiple explanation levels.

---

# Overnight Learning

Coach Lab becomes the central coordinator.

```
Self Play

↓

Analyze Games

↓

Find Weaknesses

↓

Generate Reports

↓

Parameter Suggestions

↓

Regression Testing

↓

Developer Review

↓

Merge Improvements
```

Eventually Coach Lab should perform much of this automatically.

---

# NNUE Preparation

Long-term

Coach Lab should generate high-quality training positions.

Store

Position

Evaluation

Principal Variation

Game Phase

Search Depth

Result

This dataset eventually becomes the foundation of NNUE training.

---

# Design Principles

Coach Lab must never:

Modify search.

Modify evaluation.

Modify move ordering.

Its role is observation only.

This guarantees reproducible analysis.

---

# Success Criteria

Coach Lab succeeds when:

A developer can explain any move.

A regression can be identified quickly.

Evaluation changes become measurable.

Engine improvements become evidence-based.

Players learn from Coach.

---

# Final Vision

Traditional chess engines calculate.

Coach calculates.

Coach Lab understands.

Together they create something different:

An engine that not only finds the strongest move...

...but can explain the reasoning behind it.

That is the defining feature of Coach.