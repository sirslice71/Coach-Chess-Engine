# SEARCH_GUIDE.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document describes the search architecture of the Coach Chess Engine.

Unlike the evaluation system, which attempts to understand chess,
the search system attempts to efficiently discover the strongest move.

The search should remain as simple, deterministic, and measurable as possible.

---

# Search Philosophy

Search is responsible for answering one question:

> "What is the best move?"

Search should **never** attempt to understand chess.

That is Evaluation's responsibility.

Coach separates these responsibilities intentionally.

```
Evaluation

"What is this position worth?"

↓

Search

"Which move leads to the best position?"

↓

Coach Lab

"Why?"
```

---

# Current Search Architecture

```
Search Root

↓

Iterative Deepening

↓

Aspiration Window

↓

Negamax

↓

Alpha-Beta

↓

Quiescence

↓

Static Evaluation
```

Every layer has a single responsibility.

---

# Search Flow

```
Root Position

↓

Generate Legal Moves

↓

Order Moves

↓

Search First Move

↓

Alpha Updated

↓

Search Remaining Moves

↓

Beta Cutoffs

↓

Best Move

↓

Principal Variation
```

---

# Current Search Features

Implemented

✓ Alpha-Beta Negamax

✓ Iterative Deepening

✓ Aspiration Windows

✓ Quiescence Search

✓ Killer Moves

✓ Principal Variation

✓ Transposition Table

✓ TT Move Ordering

✓ Search Profiling

✓ Benchmark Suite

---

# Negamax

Coach uses Negamax rather than Minimax.

Reason

Cleaner implementation.

Less duplicated code.

Symmetric evaluation.

Core equation

```
score = -search(child)
```

Every evaluation is always from the perspective of the side to move.

---

# Alpha-Beta Pruning

Purpose

Avoid searching moves that cannot affect the result.

Coach maintains

Alpha

Best score found.

Beta

Opponent's best alternative.

Whenever

```
alpha >= beta
```

Search terminates that branch.

---

# Iterative Deepening

Search order

Depth 1

↓

Depth 2

↓

Depth 3

↓

...

Benefits

Better move ordering.

Time management.

Stable PV.

Transposition table reuse.

Required for future enhancements such as PVS and aspiration windows.

---

# Aspiration Windows

Coach searches around the previous iteration's score.

Example

Previous

+34

Window

+14

↓

+54

Benefits

Smaller search window.

More cutoffs.

Higher speed.

If the search fails high or low, Coach performs a re-search with a wider window.

---

# Quiescence Search

Purpose

Avoid horizon effect.

Current

Capturing moves.

Future

Checks.

Promotions.

SEE ordering.

Quiescence should never become a full search.

---

# Move Ordering

Current priority

1.

TT Move

↓

2.

Winning Captures

↓

3.

Killer Moves

↓

4.

History Heuristic (future)

↓

5.

Remaining Quiet Moves

Good move ordering dramatically improves Alpha-Beta efficiency.

---

# Killer Moves

Coach stores two killer moves per ply.

Purpose

Improve ordering of quiet moves.

Only non-captures become killers.

Duplicate killers are avoided.

---

# History Heuristic

Current Status

Infrastructure complete.

Ordering support complete.

Future

Gravity updates.

Decay.

Malus.

Counter Move History.

Continuation History.

Expected benefit

Improved quiet move ordering.

Reduced search tree.

---

# Principal Variation

Coach stores the best line discovered during search.

Example

```
Nc3

Nf6

Nb5

Nc6

Nc7+

Qxc7
```

Future

Multi-PV.

PV display in Coach Lab.

---

# Transposition Table

Purpose

Reuse previously searched positions.

Current

Probe.

Store.

Move ordering.

Future

Replacement strategy.

Age tracking.

Statistics.

Cluster buckets.

---

# Planned Search Improvements

## Principal Variation Search

Expected

10–25% node reduction.

Priority

HIGH

---

## Null Move Pruning

Purpose

Identify obviously winning positions faster.

Expected

Large Elo improvement.

---

## Late Move Reductions

Purpose

Reduce search depth for unlikely moves.

Expected

Largest remaining speed improvement.

---

## Static Exchange Evaluation

Purpose

Reject obviously losing captures.

Improve capture ordering.

Reduce quiescence size.

---

## Internal Iterative Deepening

Purpose

Find good TT move when unavailable.

Future.

---

## Singular Extensions

Purpose

Search clearly best moves deeper.

Late-stage improvement.

---

# Search Profiling

Coach currently measures:

Move Generation

Ordering

Make Move

Undo Move

Future

TT hit rate

Quiescence nodes

Null move cutoffs

LMR reductions

Node type statistics

Search should always remain measurable.

---

# Benchmarking

Current command

```
chess.bench(6)
```

Records

Nodes

NPS

Time

PV

Profile

Benchmarks measure search performance.

They do **not** measure playing strength.

---

# Search Validation

Every significant search change requires:

✓ verify()

✓ perft()

✓ bench()

✓ Real games

Search improvements should never reduce correctness.

---

# Search Roadmap

Immediate

- Principal Variation Search
- Complete History Heuristic
- Null Move Pruning
- Late Move Reductions
- SEE

Future

- Multi-PV
- Time Management
- Search Extensions
- SMP (if ever pursued)

---

# Design Principles

Search should remain:

Deterministic.

Measurable.

Fast.

Simple.

Reusable.

Avoid embedding evaluation knowledge inside search.

---

# Long-Term Vision

Future search pipeline

```
Root

↓

Iterative Deepening

↓

PVS

↓

Alpha-Beta

↓

LMR

↓

Null Move

↓

TT

↓

SEE

↓

Quiescence

↓

Evaluation
```

Every layer should be independently testable.

---

# Final Thought

Search is the engine's calculator.

Evaluation is its chess understanding.

Coach Lab is its voice.

Keeping those three systems independent is one of the most important architectural decisions in Coach.