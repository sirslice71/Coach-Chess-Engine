# KNOWN_WEAKNESSES.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document records every known weakness of the Coach Chess Engine.

Unlike the roadmap, these observations are based on evidence gathered from:

- Human games
- Self play (future)
- Coach Lab
- Benchmark testing
- Regression testing

Every weakness should eventually include:

• Evidence

• Root Cause

• Proposed Solution

• Status

Nothing should remain based solely on opinion.

---

# Status Definitions

OPEN

Issue exists.

---

INVESTIGATING

Evidence collected.

Root cause not yet confirmed.

---

IN PROGRESS

Currently being addressed.

---

VERIFIED

Solution implemented.

Requires continued monitoring.

---

CLOSED

Issue resolved.

Regression test added.

---

# Opening

---

## Knight Shuffling

Status

INVESTIGATING

Observed

Coach frequently develops knights correctly but repeatedly moves them multiple times instead of continuing development.

Example

Nc6

Nb4

Nc6

...

Root Cause

Likely evaluation imbalance.

Coach values knight PST improvements more highly than overall development.

Evidence

Multiple human games.

Coach Lab.

Priority

HIGH

---

## Delayed Castling

Status

OPEN

Observed

Coach often leaves the king in the center despite having safe castling available.

Sometimes the king walks manually.

Evidence

Multiple games.

Coach frequently plays:

Kd8

Kc7

instead of castling.

Possible Causes

Castling bonus too small.

King safety insufficient.

Opening phase not understood.

Priority

CRITICAL

---

## Weak Bishop Development

Status

OPEN

Observed

Coach often develops both knights before freeing bishops.

Bishops remain trapped for long periods.

Evidence

Human games.

Coach Lab.

Possible Causes

Opening principles incomplete.

Piece activity evaluation incomplete.

Priority

HIGH

---

## Early Rook Activity

Status

OPEN

Observed

Coach sometimes activates rooks before completing development.

Examples

Rb8

Ra8

...

Possible Causes

Rook PST.

Lack of opening understanding.

Weak development evaluation.

Priority

HIGH

---

## Weak Center Play

Status

INVESTIGATING

Observed

Coach often allows the opponent complete central control.

Coach Lab Example

Starting Position

e4

Total

-29

Nc3

Total

+60

Conclusion

Evaluation currently prefers knight development over immediate center occupation.

Priority

CRITICAL

---

## Early Queen Movement

Status

OPEN

Observed

Queen occasionally develops before bishops.

Frequency

Occasional.

Not yet quantified.

Priority

MEDIUM

---

# Evaluation

---

## Opening Principles Too Weak

Status

OPEN

Current

Development

Center

Need

Opening coordination.

Game phase awareness.

Castling urgency.

Priority

CRITICAL

---

## Piece-Square Tables Need Audit

Status

OPEN

Evidence

Coach Lab.

Starting position.

e4

-29

Nc3

+60

Possible Causes

Pawn PST.

Knight PST.

Weight imbalance.

Priority

CRITICAL

---

## No Opening Phase Scaling

Status

OPEN

Current

Opening bonuses remain active too long.

Need

Gradual interpolation.

Opening

↓

Middlegame

↓

Endgame

Priority

HIGH

---

## Piece Activity Limited

Status

OPEN

Missing

Knight activity.

Bishop activity.

Rook activity.

Queen activity.

Priority

HIGH

---

# Search

---

## History Heuristic Incomplete

Status

PLANNED

Current

History table exists.

Ordering exists.

Missing

Gravity updates.

Decay.

Malus.

Counter history.

Continuation history.

Priority

MEDIUM

---

## PVS

Status

PLANNED

Expected

10–25% node reduction.

Priority

HIGH

---

## Null Move

Status

PLANNED

Expected

Large Elo improvement.

Priority

HIGH

---

## LMR

Status

PLANNED

Expected

Largest remaining search gain.

Priority

HIGH

---

# Performance

---

## Move Generation

Status

OPEN

Current benchmark indicates move generation remains the largest search cost.

Current profile

Generate

~78%

Priority

HIGH

Notes

Do not optimize until evaluation improvements stabilize.

---

## Incremental Evaluation

Status

PLANNED

Potential

Large speed improvement.

Priority

HIGH

---

# Coach Lab

---

## Explain Individual Heuristics

Status

IN PROGRESS

Current

Opening

Position

Pawns

Need

Development

Center

Tempo

Coordination

Knight PST

Pawn PST

King PST

Priority

HIGH

---

## Search vs Static Comparison

Status

PLANNED

Need

Search Score

Static Score

Difference

Purpose

Separate search problems from evaluation problems.

Priority

HIGH

---

## Regression Positions

Status

PLANNED

Every discovered weakness should become a permanent regression position.

Examples

Knight shuffling.

Early rook movement.

Delayed castling.

Priority

HIGH

---

# Long-Term Weaknesses

Future work

Planning.

Pawn breaks.

Space.

Prophylaxis.

Fortresses.

Endgame technique.

NNUE.

These are expected.

They are not current priorities.

---

# Current Top Priorities

1.

Opening phase understanding.

---

2.

Castling urgency.

---

3.

Center control.

---

4.

Coach Lab expansion.

---

5.

Game phase interpolation.

---

6.

PVS.

---

7.

LMR.

---

# Guiding Rule

A weakness should never remain vague.

Every weakness should eventually answer:

What happened?

Why did it happen?

How do we know?

How will we measure improvement?

When those questions can be answered, the weakness is ready to be fixed.
