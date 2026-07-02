# RELEASE_PROCESS.md

Version: 1.0
Project: Coach Chess Engine

---

# Purpose

This document defines the official release process for the Coach Chess Engine.

Every release should represent a measurable improvement in one or more of the project's five pillars:

- Strength
- Performance
- Understanding
- Reliability
- Teaching

A release is more than new code.

A release is verified progress.

---

# Release Philosophy

Coach is developed using evidence.

Features are never considered complete simply because they compile.

Every release must demonstrate measurable improvement.

Examples include:

- Stronger play
- Faster search
- Better evaluation
- Improved explainability
- Better developer tools

---

# Release Types

## Patch Release

Examples

0.7.1

Purpose

Bug fixes

Documentation

Developer tools

Minor optimizations

No significant architecture changes.

---

## Minor Release

Examples

0.8

0.9

Purpose

Major evaluation improvements

Major search improvements

New engine capabilities

Coach Lab improvements

Performance improvements

---

## Major Release

Examples

1.0

2.0

Purpose

Significant milestones.

Examples

Tournament strength achieved.

NNUE introduced.

Self-play completed.

Coach Trainer completed.

---

# Development Cycle

```
Idea

↓

Design

↓

Implement

↓

Verify

↓

Benchmark

↓

Play Games

↓

Coach Lab

↓

Regression

↓

Documentation

↓

Release
```

No step should be skipped.

---

# Pre-Release Checklist

## Board

✓ verify()

✓ Hash verification

✓ Make/Undo verification

✓ Board verification

---

## Move Generation

✓ Perft

✓ Divide

✓ Regression positions

---

## Search

✓ bench()

✓ benchAll()

✓ Search profile reviewed

✓ Principal variation reviewed

---

## Evaluation

✓ Coach Lab

✓ compare()

✓ debugEvaluation()

✓ Human game testing

---

## Performance

Benchmark compared against previous release.

Record

Nodes

Time

NPS

Move ordering

Search profile

---

## Documentation

Update

README.md

ROADMAP.md

PROJECT_HISTORY.md

KNOWN_WEAKNESSES.md

SEARCH_GUIDE.md (if needed)

EVALUATION_GUIDE.md (if needed)

---

# Human Testing

Minimum recommendation

Play at least:

10 complete games

Observe

Opening

King safety

Piece activity

Endgame

Record unusual behavior.

---

# Regression Testing

Verify previously fixed problems remain fixed.

Examples

Knight shuffling

Delayed castling

Hash consistency

Move generation

Every resolved issue should eventually have a regression position.

---

# Release Notes

Every release should answer

What changed?

Why?

Expected Elo gain?

Expected performance impact?

Known limitations?

Roadmap changes?

---

# Benchmark History

Record

Version

Depth

Nodes

Time

NPS

Search Profile

Example

| Version | Depth | Nodes | Time | NPS |
|---------|------:|------:|------:|------:|
| 0.4 | 6 | 433,505 | 7.43 s | 58k |
| 0.7 | 6 | 382,276 | 9.55 s | 40k |

Benchmarks provide historical context.

---

# Project History

After every release update

PROJECT_HISTORY.md

Record

Major features

Lessons learned

Architectural decisions

Important discoveries

Performance milestones

---

# Roadmap Review

After every release

Move completed items

Identify new priorities

Reorder roadmap

Record future goals

---

# Version Naming

Recommended convention

0.1  Genesis

0.2  Legality

0.3  Search

0.4  Acceleration

0.5  Evaluation

0.6  Insight

0.7  Understanding

0.8  Positional Play

0.9  Tournament

1.0  Coach

Names are optional but encouraged.

---

# Release Criteria

A release should satisfy at least one:

Stronger chess

Faster search

Better architecture

Better explainability

Better developer experience

If none are true,

delay the release.

---

# Long-Term Release Goals

Version 1.x

Club-strength engine

Coach Lab mature

Opening understanding

Version 2.x

NNUE

Self-play

Trainer

Opening statistics

Version 3.x

Autonomous overnight analysis

Regression framework

Parameter tuning

Coach Trainer

---

# Final Rule

Never release because enough time has passed.

Release because Coach has genuinely improved.

Quality always takes priority over schedule.