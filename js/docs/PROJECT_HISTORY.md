# PROJECT_HISTORY.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document records the engineering history of the Coach Chess Engine.

Unlike the roadmap, which describes the future, this document preserves the past.

The goal is to answer questions such as:

- Why was this feature added?
- Why was this approach chosen?
- What alternatives were considered?
- What lessons were learned?
- Which ideas succeeded?
- Which ideas failed?

Every major architectural decision should eventually be recorded here.

Future developers—including AI assistants—should be able to understand not only what changed, but why.

---

# Philosophy

Code explains **how** something works.

History explains **why** it exists.

Whenever possible, preserve the reasoning behind important decisions.

The reasoning is often more valuable than the implementation.

---

# Timeline

---

## June 2026

### Project Direction Clarified

Coach's identity became well defined.

Rather than pursuing raw playing strength alone, the project adopted dual objectives:

• Strong classical chess engine

• World-class educational chess engine

Project Motto established:

> "Strong enough to compete. Smart enough to teach."

---

## Search Architecture Stabilized

Major search features completed:

✓ Alpha-Beta Negamax

✓ Iterative Deepening

✓ Quiescence Search

✓ Aspiration Windows

✓ Transposition Table

✓ TT Move Ordering

✓ Principal Variation Extraction

Search became stable enough that evaluation quality became the primary bottleneck.

---

## Verification Suite Completed

The project adopted a strict engineering rule:

Nothing is merged unless it passes verification.

Verification includes:

✓ verify()

✓ perft()

✓ make/undo validation

✓ hash verification

This significantly reduced debugging time.

---

## Incremental Zobrist Hashing

Incremental hashing replaced repeated full hash generation.

Benefits:

- Faster search
- Faster repetition detection
- Foundation for future optimization

Lesson:

Maintain information incrementally whenever practical.

---

## Piece Lists

Incremental piece lists became the standard representation.

Benefits:

- Faster evaluation
- Faster move generation
- Foundation for incremental evaluation

Lesson:

Never search the entire board if the information already exists.

---

## Evaluation Expansion

Evaluation grew beyond material.

Added:

Development

Center Control

Piece-Square Tables

Passed Pawns

Connected Pawns

Isolated Pawns

Doubled Pawns

This marked Coach's transition from tactical engine toward positional engine.

---

## First Major Realization

Playing strength did not improve as quickly as expected.

Observation:

Coach repeatedly

- shuffled knights
- delayed castling
- ignored center
- activated rooks too early

Initial assumption:

Search weakness.

Actual cause:

Evaluation weakness.

Lesson:

Search was no longer the bottleneck.

---

## Birth of Coach Lab

This became one of the most significant architectural moments in the project.

Question asked:

"Why is Coach choosing this move?"

Instead of guessing,

Coach Lab was created.

Purpose:

Explain evaluation.

Measure heuristics.

Support regression analysis.

Future self-play analysis.

Future parameter tuning.

Lesson:

Visibility accelerates development.

---

## Coach Lab's First Discovery

Using Coach Lab:

Starting Position

e4

Evaluation

-29

Nc3

Evaluation

+60

This immediately explained why Coach strongly preferred developing knights before occupying the center.

Lesson:

Never tune evaluation blindly.

Measure first.

---

## Development Philosophy Changed

Old workflow:

Observe

↓

Guess

↓

Code

New workflow:

Observe

↓

Measure

↓

Coach Lab

↓

Understand

↓

Code

↓

Verify

↓

Benchmark

↓

Play

This remains the preferred workflow.

---

## Search Stability Achieved

Repeated benchmark inconsistencies were traced to Transposition Table reuse.

Benchmarks became deterministic after clearing:

TT

History

Killers

Statistics

Lesson:

Benchmark reproducibility is essential.

---

## Roadmap Evolution

Originally:

Focus on adding evaluation features.

Now:

Focus on measurable evaluation improvements.

Coach Lab became a first-class project.

---

# Major Engineering Lessons

## Lesson 1

Architecture compounds.

Good architecture makes future improvements easier.

Poor architecture makes every feature harder.

---

## Lesson 2

Correctness is more valuable than speed.

Optimization without correctness wastes time.

---

## Lesson 3

Benchmarks do not measure strength.

Benchmarks measure speed.

Real games reveal chess understanding.

---

## Lesson 4

Perft is not a benchmark.

Perft verifies move generation correctness.

Never confuse correctness with performance.

---

## Lesson 5

Every heuristic has a computational cost.

Small costs become enormous during search.

Always consider search-wide impact.

---

## Lesson 6

Explainability is a feature.

Coach Lab is not merely a debugging tool.

It is a defining characteristic of the engine.

---

## Lesson 7

The best debugging tool is evidence.

Coach Lab frequently identifies problems within minutes that might otherwise require days of investigation.

---

# Engineering Milestones

Future entries should include:

Date

Version

Feature

Reason

Measured Result

Lessons Learned

Future Work

---

# Future Historical Milestones

Expected future additions:

Version 0.8

Mobility evaluation

Version 0.9

Game phase interpolation

Version 1.0

Coach Lab Dashboard

Version 1.x

Self-play framework

Opening book generation

Regression testing

Parameter tuning

Version 2.x

NNUE evaluation

---

# Long-Term Vision

Years from now this document should tell the complete engineering story of Coach.

Not simply:

"What code was written?"

Instead:

"What ideas shaped the engine?"

"What mistakes taught us the most?"

"What breakthroughs changed our direction?"

The history of Coach should be preserved as carefully as the code itself.

---

# Closing Thought

Great software is more than source code.

It is the accumulation of thousands of engineering decisions.

PROJECT_HISTORY.md exists to ensure those decisions—and the lessons behind them—are never lost.

---

## Version 0.4 Alpha

### Search Performance Breakthrough

One of the largest search optimizations in Coach's early development.

#### Benchmark (Depth 6)

| Metric | Before | After | Improvement |
|---------|--------|-------|------------:|
| Nodes | 781,798 | 433,505 | -44.5% |
| Time | 13.85 s | 7.43 s | -46.4% |
| Move Ordering | 1014 ms | 78 ms | -92.3% |
| NPS | ~56k | ~58k | +3.6% |

### Lessons Learned

The largest performance gain did **not** come from increasing NPS.

Instead it came from:

- Better move ordering
- Better pruning
- Searching significantly fewer nodes

This reinforced one of Coach's core engineering principles:

> **The fastest node is the one you never search.**

# Performance Milestones

## v0.4 Alpha

✓ 46% faster search

✓ 44% fewer searched nodes

✓ 92% reduction in move ordering overhead

Major Causes

- Improved move ordering
- Better pruning
- Cleaner search architecture

---

## Version 0.7 Alpha

### Coach Begins to Understand Positional Chess

Version 0.7 marked a shift away from pure search improvements and toward
teaching Coach how to play more natural chess.

Major additions included:

✓ Opening development evaluation

✓ Center control

✓ Passed pawns

✓ Connected pawns

✓ Doubled pawns

✓ Isolated pawns

✓ Expanded Piece-Square Tables

✓ Coach Lab

This version also introduced a new engineering philosophy:

> Measure first. Improve second.

Rather than adding heuristics blindly, Coach Lab became the primary tool
for understanding engine decisions.

---

### Benchmark Snapshot

Depth 6

| Metric | Value |
|---------|------:|
| Best Move | Nc3 |
| Evaluation | +0.83 |
| Nodes | 382,276 |
| Leaf Nodes | 384,128 |
| Time | 9.55 s |
| NPS | 40,025 |
| Cutoffs | 46,923 |
| Killer Cutoffs | 41,245 |
| Aspiration Re-searches | 4 |

Principal Variation

```
Nc3
Nf6
Nb5
Nc6
Nc7+
Qxc7
```

---

### Search Profile

| Stage | Time | Percentage |
|--------|------|-----------:|
| Move Generation | 3721.8 ms | 79.0% |
| Move Ordering | 62.5 ms | 1.3% |
| Make Move | 499.7 ms | 10.6% |
| Undo Move | 426.9 ms | 9.1% |

---

### Major Observation

Move generation remains the largest computational cost.

Approximately **79%** of total search time is spent generating legal moves.

This reinforces the long-term roadmap:

- Incremental evaluation
- Faster move generation
- Better pruning (PVS, Null Move, LMR)
- Reduced search tree size

---

### Important Discovery

Although Coach now searches fewer positions than earlier versions,
its Nodes Per Second has decreased.

This is expected.

The evaluation function now performs significantly more positional work,
including:

- Pawn structure analysis
- Opening development
- Center control
- Coach Lab instrumentation

The project philosophy now prioritizes:

> **Stronger evaluation per node**

over

> **More nodes per second**

The ultimate objective is stronger chess rather than faster search.

---

### Remaining Weaknesses

Human testing revealed several recurring issues:

- Repeated knight moves
- Delayed castling
- Weak bishop development
- Passive center play
- Early rook movement

These became the primary focus of Version 0.8.

---

### Legacy

Version 0.7 established the architectural foundation that will support
all future development:

- Explainable evaluation
- Coach Lab
- Evidence-driven tuning
- Long-term self-play
- Overnight regression testing

This version marked the transition from building a chess engine to
building an explainable chess engine.

---

## Version 0.8 Alpha

### Major Engine Regression Fixed - Pawn PST Orientation

While developing Coach Lab 3.0, a major regression was discovered in
the Piece-Square Table (PST) evaluation for pawns.

### Root Cause

White and Black pawns were being evaluated using the wrong board
orientation.

Previous code:

```javascript
// White
score += PawnTable[mirror(square)];

// Black
score -= PawnTable[square];
```

Corrected code:

```javascript
// White
score += PawnTable[square];

// Black
score -= PawnTable[mirror(square)];
```

### Symptoms

- Coach repeatedly developed knights instead of occupying the center.
- 1.Nc3 consistently outranked 1.e4 and 1.d4.
- Coach frequently shuffled knights in the opening.
- Opening evaluations became increasingly unnatural.

### Investigation

Coach Lab 3.0 was expanded to report:

- Search evaluation
- Total evaluation delta
- Opening delta
- Center control delta
- Piece-Square Table deltas
- Pawn structure changes

This immediately revealed that:

- Knight development gained **+50 PST**
- Central pawn pushes were incorrectly losing **25 PST**
- e4 and d4 were being penalized instead of rewarded

By comparing the PawnTable against actual board indices, it was determined
that White and Black pawn indexing had become reversed.

### Results

Before fix:

- Starting PST evaluation: **-390**
- Coach preferred **1.Nc3**
- Depth 6 PV:
  ```
  1. Nc3 Nf6
  2. Nb5 Nc6
  3. Nc7+
  ```

After fix:

- Starting PST evaluation: **0**
- Coach correctly prefers **1.e4**
- Depth 6 PV begins:
  ```
  1. e4 e6
  ```
- Central pawn advances now receive approximately **+40 PST**
- Static evaluation now aligns with opening principles.

### Benchmark

Depth 6

Before:
- Best Move: **Nc3**

After:
- Best Move: **e4**
- Evaluation: **+0.59**
- Nodes: 447,744
- NPS: ~36k

### Project Milestone

Coach Lab 3.0 successfully isolated a real engine regression that had
gone unnoticed for multiple versions.

This validates Coach Lab as the primary diagnostics framework for:

- evaluation tuning
- regression detection
- move explanation
- engine development
- future Elo improvements