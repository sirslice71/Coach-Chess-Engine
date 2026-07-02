# Chess Engine Performance Log

---

# v0.4 Alpha
**Date:** June 29, 2026

## Overview

v0.4 Alpha marks the transition from a functional chess engine to a performance-focused search engine. The emphasis of this release was improving search efficiency while maintaining complete Perft correctness and board stability.

Rather than making the board faster, the goal was to search fewer positions through better move ordering.

---

## Major Improvements

### Search
- Alpha-Beta search verified
- Quiescence Search verified
- Mate scoring improved (`-MATE + depth`)
- Leaf node counting corrected

### Move Ordering
- Scored each move once before sorting
- Eliminated repeated `scoreMove()` calls
- Replaced expensive string comparisons with integer move keys
- Added Killer Move heuristic
- Cached move scores prior to sorting

### Profiling
Added benchmarking and profiling tools:

- `chess.bench(depth)`
- `chess.benchAll(maxDepth)`

Profiler tracks:

- Move Generation
- Move Ordering
- Make Move
- Undo Move
- Board Update timing
- Nodes
- Leaf Nodes
- Beta Cutoffs
- Killer Cutoffs
- NPS

---

# Benchmark Results

## Before Optimization

Depth 6

Nodes
781,798

Elapsed Time
13.86 sec

Ordering
1014 ms

NPS
56,428

---

## After Optimization

Depth 6

Nodes
433,505

Elapsed Time
7.43 sec

Ordering
78 ms

NPS
58,326

---

## Overall Improvement

Search Time
-46%

Nodes Searched
-44%

Move Ordering Time
-92%

Killer Cutoffs
23,684

---

## Engine Status

Current engine features:

✔ Legal move generation

✔ Make/Undo integrity verified

✔ Perft verified (Depth 1–5)

✔ Alpha-Beta Search

✔ Quiescence Search

✔ Killer Moves

✔ Integer Move Keys

✔ Search Benchmarking

✔ Search Profiling

---

## Lessons Learned

One of the biggest discoveries during v0.4 was that improving move ordering produces significantly larger gains than attempting to micro-optimize board updates.

Initial efforts focused on reducing the cost of `updatePieceLists()`, but benchmarking demonstrated that searching fewer nodes through better move ordering provided substantially greater performance improvements while preserving engine stability.

The board implementation remains stable and correct and will not be optimized further until higher-impact search improvements have been completed.

---

# Next Goals (v0.5)

Priority 1
- MVV-LVA (Most Valuable Victim / Least Valuable Attacker)

Priority 2
- History Heuristic

Priority 3
- Transposition Table

Priority 4
- Zobrist Hashing

Priority 5
- Evaluation improvements

---

# Performance History

| Version | Depth | Nodes | Time | NPS | Notes |
|---------|------:|------:|-----:|----:|------|
| v0.3 Alpha | 6 | 781,798 | 13.86s | 56k | Stable search |
| v0.4 Alpha | 6 | 433,505 | 7.43s | 58k | Killer Moves + optimized ordering |