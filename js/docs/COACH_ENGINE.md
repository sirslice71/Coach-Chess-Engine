# COACH_ENGINE.md

Version: 1.0 Draft
Project: Coach Chess Engine
Author: Sir Slice & ChatGPT
Started: June 2026

---

# Coach Chess Engine

> **Strong enough to compete. Smart enough to teach.**

Coach is a modern chess engine written from scratch with two equally important goals:

1. Become a strong classical chess engine.
2. Become the world's best engine for learning chess.

Unlike most engines, Coach is not designed solely to find the best move.

Coach should eventually explain:

• What is the best move?

• Why is it best?

• What plans does it create?

• What mistakes does it avoid?

The long-term vision is an engine that approaches master-level strength while remaining transparent enough to teach players of every level.

---

# Core Philosophy

Coach follows several engineering principles.

These principles are considered permanent unless explicitly revised.

## 1. Correctness Before Speed

Incorrect fast code is worthless.

Every optimization must preserve correctness.

Every search optimization must pass:

- verify()
- perft()
- make/undo validation
- hash verification

before it is accepted.

---

## 2. Architecture Before Features

Coach is intended to be developed for years.

A clean architecture is worth more than a quick feature.

Avoid hacks.

Avoid duplicate code.

Favor reusable systems over one-off solutions.

---

## 3. Every Heuristic Must Earn Its Cost

Every evaluation feature consumes CPU time.

Before adding a heuristic ask:

- Does it improve playing strength?
- Is the improvement measurable?
- Is there a cheaper implementation?
- Can Coach Lab explain it?

If the answer is no, reconsider the feature.

---

## 4. Measure Everything

Never assume an improvement.

Every significant change should be measured using:

verify()

bench()

Coach Lab

Real games

Self play (future)

Elo regression (future)

If it cannot be measured, it cannot be trusted.

---

## 5. Explain Everything

The biggest long-term difference between Coach and traditional engines is explainability.

Every major evaluation feature should eventually appear inside Coach Lab.

Coach should never become a "black box."

Instead it should answer:

Why did I choose this move?

rather than only:

This is the move.

---

# The Five Pillars

Every release should improve at least one pillar.

## Strength

Play stronger chess.

Examples

- Better search
- Better evaluation
- Better move ordering
- Better endgame knowledge

---

## Performance

Search more positions.

Examples

- Faster move generation
- Better pruning
- Better hashing
- Incremental evaluation

---

## Understanding

Teach Coach positional chess.

Examples

- Pawn structure
- King safety
- Planning
- Piece activity
- Game phases

---

## Reliability

Nothing ships until verified.

Required:

✓ Perft

✓ Verify

✓ Hash validation

✓ Make/Undo validation

✓ Benchmarks

---

## Teaching

Coach should become an instructional engine.

Eventually Coach should explain:

- Best move
- Best plan
- Tactical ideas
- Positional ideas
- Long-term goals

---

# Development Philosophy

Coach should evolve scientifically.

The workflow is:

Observe

↓

Measure

↓

Hypothesize

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

Guesswork is discouraged.

Evidence is preferred.

---

# Coach Lab

Coach Lab is the analytical heart of the engine.

Its purpose is not to search.

Its purpose is to explain.

Coach Lab answers questions like:

Why did Coach play this move?

Which evaluation terms changed?

Which heuristic caused this decision?

What changed after the move?

Coach Lab is expected to become one of the defining features of Coach.

Every future evaluation feature should integrate with Coach Lab.

---

# Search Philosophy

Search should calculate.

Evaluation should understand.

Coach Lab should explain.

These responsibilities should remain separate.

Search should not contain positional heuristics.

Evaluation should not contain search logic.

Coach Lab should never influence search.

It only observes.

---

# Evaluation Philosophy

Evaluation should gradually evolve from simple heuristics toward genuine positional understanding.

Current direction:

Material

↓

Piece Square Tables

↓

Pawn Structure

↓

Opening Principles

↓

King Safety

↓

Game Phase

↓

Planning

↓

NNUE (future)

Every evaluation term should be measurable.

Every evaluation term should be explainable.

---

# Performance Philosophy

Speed matters.

Correctness matters more.

Optimizations should be prioritized by measured impact.

Current philosophy:

Avoid unnecessary allocations.

Prefer incremental updates.

Reuse existing information.

Measure before optimizing.

Do not sacrifice readability for insignificant gains.

---

# Future Vision

Coach is expected to grow through several major eras.

Phase 1

Modern classical engine

✓ Current

---

Phase 2

Coach Lab

Explain every move.

Measure every heuristic.

Regression testing.

---

Phase 3

Self Play

Automated tournaments.

Opening discovery.

Parameter tuning.

PGN database.

---

Phase 4

Learning

Overnight training.

Position database.

Automatic regression reports.

Opening preparation.

---

Phase 5

NNUE

Self-generated datasets.

Network training.

Hybrid evaluation.

---

# Long-Term Dream

One day the daily workflow should look like this.

8:00 PM

↓

Coach begins overnight training.

↓

Thousands of self-play games.

↓

Coach Lab analyzes results.

↓

Regression testing.

↓

Parameter tuning.

↓

Morning report generated.

↓

Developer reviews findings.

↓

Only meaningful improvements are merged.

Coach should improve continuously while its developer sleeps.

---

# Engineering Standards

Before every merge:

✓ verify()

✓ perft()

✓ bench()

✓ Coach Lab (when evaluation changed)

✓ At least one real game played

Major search changes should also include benchmark comparisons.

---

# What Makes Coach Different?

Many engines answer:

"What is the best move?"

Coach aims to answer:

"What is the best move?"

"Why?"

"What is the plan?"

"What would happen if I didn't play it?"

That vision guides every architectural decision.

---

# Final Principle

Every line of code should move Coach closer to one of two goals:

Become stronger.

Become a better teacher.

If it accomplishes neither, reconsider whether it belongs.
