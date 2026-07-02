# DEVELOPMENT_WORKFLOW.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document defines the standard engineering workflow for developing Coach.

Its purpose is to ensure every improvement is:

- Measurable
- Repeatable
- Verified
- Explainable

Every significant change to Coach should follow this workflow.

---

# Core Philosophy

Do not guess.

Do not optimize blindly.

Do not add heuristics because they sound reasonable.

Instead:

Observe

↓

Measure

↓

Understand

↓

Implement

↓

Verify

↓

Benchmark

↓

Play Games

↓

Repeat

Coach should improve through evidence, not intuition.

---

# Standard Development Cycle

## Step 1

Observe

Examples

Coach delays castling.

Coach repeats knight moves.

Coach misses tactics.

Coach develops rooks too early.

Coach prefers Nc3 over e4.

Never begin coding before understanding the problem.

---

## Step 2

Reproduce

Create a position that reliably demonstrates the issue.

Prefer:

Saved FEN

Developer command

Regression position

Self-play example

Avoid debugging from memory.

---

## Step 3

Measure

Use Coach Lab.

Questions to answer:

Which move is preferred?

Which evaluation terms changed?

Static score?

Search score?

Search depth?

Principal variation?

Never modify evaluation before measuring.

---

## Step 4

Identify Root Cause

Determine whether the issue belongs to:

Search

Evaluation

Move Ordering

Board

Bug

Never fix symptoms.

Always fix causes.

---

## Step 5

Design

Before writing code ask:

What is the cheapest solution?

Would Stockfish solve this similarly?

Can this become incremental later?

Does it belong in the correct subsystem?

Will Coach Lab expose it?

---

## Step 6

Implement

Implement ONE meaningful change.

Avoid combining unrelated improvements.

Examples

GOOD

Add passed pawn evaluation.

BAD

Passed pawns

+

King safety

+

Mobility

+

Null Move

in one commit.

---

## Step 7

Verify

Every change requires

verify()

Expected

PASS

---

perft(5)

Expected

PASS

---

Hash verification

Expected

PASS

Never continue if verification fails.

---

## Step 8

Benchmark

Search changes

bench(6)

Record

Nodes

NPS

Time

PV

Compare with previous version.

---

Evaluation changes

Run bench()

Only to ensure no unexpected regressions.

Bench does NOT measure strength.

---

## Step 9

Play Games

This is mandatory.

Real games reveal problems that benchmarks cannot.

Observe

Opening

Development

King safety

Planning

Piece activity

Endgames

Record unusual behavior.

---

## Step 10

Coach Lab

Whenever something looks wrong:

Stop.

Measure it.

Use:

chess.lab()

Never guess.

---

## Step 11

Record

Every meaningful discovery should be documented.

Examples

Coach prefers early rook movement.

Coach undervalues center.

Coach overvalues knight PST.

Coach delays castling.

These observations belong in:

KNOWN_WEAKNESSES.md

PROJECT_HISTORY.md

---

# Search Development Workflow

Observe

↓

Measure

↓

Benchmark

↓

Optimize

↓

Benchmark

↓

Verify

↓

Play Games

Search changes should primarily improve:

Node count

NPS

Elo

---

# Evaluation Development Workflow

Observe

↓

Coach Lab

↓

Identify heuristic

↓

Modify ONE heuristic

↓

Coach Lab

↓

Verify

↓

Play Games

↓

Regression Position

Evaluation should always remain explainable.

---

# Performance Workflow

Never optimize blindly.

Measure first.

Preferred order

1.

Board

↓

2.

Move Generation

↓

3.

Evaluation

↓

4.

Search

↓

5.

UI

Optimizing lower layers benefits the entire engine.

---

# Regression Workflow

Whenever a bug is fixed:

Save the position.

Future versions should verify that the bug never returns.

Over time this becomes Coach's regression suite.

---

# Daily Workflow

Typical development session

Open roadmap.

↓

Review known weaknesses.

↓

Select ONE objective.

↓

Measure.

↓

Implement.

↓

verify()

↓

bench()

↓

Play a game.

↓

Update documentation.

↓

Commit.

---

# Weekly Workflow

Review roadmap.

Review project history.

Review known weaknesses.

Review benchmark history.

Review Coach Lab findings.

Adjust priorities.

---

# Before Every Commit

Ask:

Does this improve:

Strength?

Performance?

Understanding?

Reliability?

Teaching?

If none,

reconsider the change.

---

# Before Every Release

Required

✓ verify()

✓ perft()

✓ bench()

✓ Coach Lab

✓ Multiple real games

✓ Documentation updated

✓ Roadmap updated

---

# Commit Philosophy

Each commit should represent one logical improvement.

Good examples

Improve bishop mobility evaluation.

Add pawn chains.

Optimize move ordering.

Poor examples

"Lots of fixes"

"Misc improvements"

Large commits make regressions difficult to identify.

---

# Coding Philosophy

Prefer:

Readable code

Reusable code

Measured improvements

Simple algorithms

Deterministic behavior

Avoid:

Magic numbers

Duplicated logic

Premature optimization

Hidden heuristics

Complex code without measurable benefit

---

# Coach Lab Rule

Every new evaluation feature should eventually appear inside Coach Lab.

If the developer cannot explain why the engine prefers a move...

...the engine cannot teach it.

---

# Long-Term Workflow

Future

```
Night

↓

Coach plays

5,000 games

↓

Coach Lab analyzes

↓

Regression report

↓

Parameter suggestions

↓

Developer review

↓

Merge improvements

↓

Repeat
```

This is the long-term development vision.

---

# Golden Rules

1.

Never guess.

Measure.

---

2.

Never skip verification.

---

3.

One meaningful improvement at a time.

---

4.

Protect the architecture.

---

5.

Evidence beats opinion.

---

# Final Thought

Coach is not being developed to become merely another chess engine.

Coach is being developed as an engineering platform capable of continuous improvement.

Every development session should leave the engine stronger...

...and every lesson should make future improvements easier.

The code is important.

The process is equally important.