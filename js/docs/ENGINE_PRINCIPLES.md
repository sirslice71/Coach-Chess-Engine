# ENGINE_PRINCIPLES.md

Version: 1.0 Draft
Project: Coach Chess Engine

---

# Purpose

This document defines the permanent engineering principles of the Coach Chess Engine.

Unlike the roadmap, these principles should remain relatively stable over the life of the project.

Every major design decision should be measured against these principles.

---

# Principle 1

## Correctness Before Performance

A chess engine that searches one billion incorrect positions is still wrong.

Correctness always comes first.

Before any optimization:

✓ verify()

✓ perft()

✓ make/undo validation

✓ hash verification

must all pass.

Never merge code that breaks verification.

---

# Principle 2

## Architecture Before Features

Coach is intended to exist for years.

A feature that damages the architecture is not worth adding.

Prefer:

Small reusable systems

over

Large special-case code.

Every subsystem should have a single responsibility.

---

# Principle 3

## Evidence Before Opinion

Do not improve the engine because something "feels stronger."

Instead:

Observe

↓

Measure

↓

Analyze

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

Coach Lab exists specifically to support this process.

---

# Principle 4

## Every Heuristic Must Justify Its Cost

Every evaluation feature executes millions of times during a search.

Before adding a heuristic ask:

How much CPU time does this cost?

Can it be cached?

Can it be incremental?

Can it be simplified?

How much Elo is expected?

The strongest evaluation is not necessarily the largest evaluation.

---

# Principle 5

## Separation of Responsibilities

Board

Owns board state.

Nothing else.

---

Move Generation

Generates legal moves.

Nothing else.

---

Search

Calculates.

Does not understand chess strategy.

---

Evaluation

Understands chess.

Does not search.

---

Coach Lab

Explains decisions.

Never influences decisions.

---

UI

Displays information.

Contains no chess logic.

---

# Principle 6

## Every Feature Must Be Explainable

Coach's defining feature is explainability.

If an evaluation feature cannot eventually be displayed in Coach Lab, reconsider the design.

Examples

Passed Pawn

Visible in Coach Lab

✓ Good

---

Complex hidden weight

Cannot be explained

✗ Poor design

---

# Principle 7

## Optimize Only After Measuring

Never optimize because code "looks slow."

Instead:

Profile.

Measure.

Optimize.

Measure again.

The benchmark is the source of truth.

---

# Principle 8

## One Change At A Time

Large changes are difficult to evaluate.

Prefer:

One meaningful change

↓

Measure

↓

Commit

↓

Repeat

This makes regressions much easier to identify.

---

# Principle 9

## Permanent Developer Workflow

Every search change

verify()

bench()

Play games

Compare nodes

Measure strength

---

Every evaluation change

verify()

Coach Lab

Play games

Observe decisions

Record findings

---

Every architecture change

verify()

perft()

Benchmark

Stress test

Review dependencies

---

# Principle 10

## Real Games Matter

Benchmarks measure speed.

Perft measures correctness.

Real games measure strength.

None of these alone are sufficient.

Every major feature should eventually be validated through actual gameplay.

---

# Principle 11

## Build Systems, Not Hacks

Coach should grow by adding reusable systems.

Examples

Good

Coach Lab

Incremental Evaluation

Endgame Evaluator

Pawn Hash

---

Poor

Special-case bonuses

Hard-coded opening tricks

Position-specific exceptions

Duplicated logic

---

# Principle 12

## Think Long-Term

Coach is not being written for next month.

Coach is being written for the next decade.

Every design decision should consider:

Will this still make sense when:

The engine is 50,000 lines?

NNUE exists?

Self-play exists?

Multiple developers contribute?

If not, reconsider the approach.

---

# Principle 13

## Respect Computational Complexity

A heuristic executed once is cheap.

A heuristic executed

300,000 nodes

×

30 legal moves

×

8 plies

is not.

Small costs become enormous during search.

Always consider the total search cost.

---

# Principle 14

## Prefer Incremental Data

Whenever practical:

Incrementally update information

instead of

Recomputing it every node.

Examples

✓ Piece Lists

✓ Zobrist Hash

Future

Incremental PST

Pawn Hash

Mobility

King Safety

---

# Principle 15

## Never Duplicate Knowledge

If the engine already knows something,

reuse it.

Examples

Piece lists

Attack maps

Game phase

Material counts

Hash keys

Avoid recalculating existing information.

---

# Principle 16

## What Would Stockfish Do?

Coach is not attempting to copy Stockfish.

However, Stockfish represents decades of engineering experience.

When uncertain ask:

Would Stockfish solve this using:

Search?

Evaluation?

Incremental data?

Caching?

Pruning?

If yes,

study why.

Then determine whether the same architectural idea fits Coach.

Borrow ideas.

Do not copy blindly.

---

# Principle 17

## Teach, Don't Just Play

Coach should eventually become more than a chess engine.

It should become a chess coach.

Every future feature should ask:

Does this help explain chess?

Can a player learn from this?

Can Coach explain its reasoning?

Teaching is a first-class feature.

---

# Principle 18

## Continuous Improvement

The long-term vision is an engine that improves while the developer sleeps.

Eventually Coach should:

Play itself.

Analyze losses.

Generate reports.

Measure Elo.

Tune parameters.

Create datasets.

Improve evaluation.

Repeat.

Today's architecture should support tomorrow's automation.

---

# Principle 19

## Self Explaining

"The Engine Must Be Able To Explain Itself."

Not just to humans.

To future versions of Coach.

When we eventually build overnight self-play and automatic tuning, the engine should be able to say:

"I lost 127 games because I consistently delayed castling."

or

"Increasing the bishop pair bonus by 5 centipawns gained 14 Elo."

---

# Final Principle

Every line of code should move Coach toward at least one of these goals:

✔ Stronger chess

✔ Faster search

✔ Better understanding

✔ Greater reliability

✔ Better teaching

If it accomplishes none of these,

it probably does not belong in Coach.
