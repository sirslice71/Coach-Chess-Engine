# AI_CONTEXT.md

Version: 1.0 Draft
Project: Coach Chess Engine
Audience: AI Coding Assistants (ChatGPT, Codex, Claude, Claude Code, Gemini, Future Agents)

---

# Purpose

This document is the onboarding guide for every AI assistant working on the
Coach Chess Engine.

Its purpose is to provide enough context that an AI can immediately become a
productive contributor without first reverse-engineering the project.

Coach is expected to be developed for many years.

Architectural consistency is more important than rapid feature development.

Read COACH_ENGINE.md before making changes.

---

# Project Summary

Coach is a modern JavaScript chess engine written completely from scratch.

The long-term goals are:

• Become a strong classical chess engine.

• Become the world's best educational chess engine.

Coach is NOT attempting to clone Stockfish.

Instead, Coach borrows proven classical techniques while emphasizing:

- Explainability
- Clean architecture
- Reliability
- Long-term maintainability
- Teaching

---

# Current Estimated Strength

Approximately

1200–1400 Elo

This estimate changes frequently.

Known weaknesses are documented separately.

---

# Current Engine Architecture

Current major systems

Board

↓

Move Generation

↓

Attack Detection

↓

Evaluation

↓

Search

↓

Game Controller

↓

UI

↓

Coach Lab

Each subsystem has a clearly defined responsibility.

---

# Major Components

board.js

Owns:

- Board representation
- Make Move
- Undo Move
- Piece lists
- Incremental updates
- Castling rights
- En passant
- Move history
- Zobrist updates

Board should NEVER contain evaluation logic.

---

movegen.js

Responsible for generating pseudo-legal moves.

---

legalmovegen.js

Filters pseudo-legal moves into legal moves.

Search should only use legal moves.

---

attack.js

Determines whether squares are attacked.

Used for:

- Check detection
- Castling validation
- Evaluation

---

evaluation.js

Responsible ONLY for static evaluation.

No search logic belongs here.

Current evaluation categories include:

Material

Opening

Position

Pawns

King

Mobility

These categories will continue expanding.

---

search.js

Responsible for:

Alpha-Beta Negamax

Iterative Deepening

Quiescence

Aspiration Windows

Transposition Table

Move Ordering

Search Profiling

Benchmarking

Coach Lab integration

Search should never become responsible for positional understanding.

Search calculates.

Evaluation understands.

Coach Lab explains.

---

ui.js

Responsible only for presentation.

No chess logic belongs inside the UI.

---

main.js

Application bootstrap.

Developer console commands.

Engine wiring.

---

# Current Search Features

Implemented

✓ Alpha-Beta Negamax

✓ Iterative Deepening

✓ Quiescence Search

✓ Killer Moves

✓ Aspiration Windows

✓ Transposition Table

✓ TT Move Ordering

✓ Principal Variation

Current roadmap includes:

History Heuristic

PVS

Null Move Pruning

LMR

SEE

Incremental evaluation

---

# Current Evaluation Features

Material

Piece Square Tables

Opening Development

Center Control

Passed Pawns

Connected Pawns

Doubled Pawns

Isolated Pawns

Future additions should integrate into Coach Lab.

---

# Current Developer Commands

verify()

Verifies board correctness.

---

perft(depth)

Move generation verification.

---

divide(depth)

Perft divide.

---

bench(depth)

Search benchmark.

---

debugEvaluation()

Evaluation breakdown.

---

compare(depth)

Compare root moves.

---

lab(move)

Coach Lab evaluation analysis.

Coach Lab is expected to become the primary evaluation debugging tool.

---

# Coach Lab Philosophy

Coach Lab exists to explain decisions.

It should answer:

Why was this move selected?

Which evaluation terms changed?

Which heuristic caused the score difference?

Coach Lab should NEVER influence engine strength.

It is purely observational.

Future Coach Lab capabilities include:

- Search comparison
- Evaluation comparison
- Move diagnostics
- Regression reports
- Self-play analysis
- Opening statistics
- Elo reports

---

# Coding Standards

Prefer complete functions over snippets.

Prefer readability over cleverness.

Avoid duplicate code.

Prefer reusable systems.

Favor architecture over hacks.

Measure improvements.

Never guess.

---

# Performance Philosophy

Every heuristic has a cost.

Before proposing one ask:

How many nodes will this execute?

Can it be cached?

Can it be incremental?

Can it be delayed?

Would Stockfish perform a similar calculation every node?

Avoid expensive operations inside evaluation whenever possible.

---

# AI Responsibilities

When proposing changes:

Explain:

WHY

Expected Elo improvement

Expected computational cost

Alternative approaches

Trade-offs

Do not simply provide code.

Provide engineering reasoning.

---

# Never Do These Things

Never duplicate move generation.

Never bypass make/undo.

Never bypass verification.

Never ignore verify() failures.

Never sacrifice correctness for speed.

Never add expensive heuristics without justification.

Never introduce evaluation logic into board.js.

Never mix search and evaluation responsibilities.

---

# Preferred Development Workflow

Observe a weakness.

↓

Reproduce it.

↓

Measure it using Coach Lab.

↓

Identify the responsible heuristic.

↓

Modify ONE thing.

↓

verify()

↓

perft()

↓

bench()

↓

Play real games.

↓

Measure improvement.

Repeat.

---

# Current Known Weaknesses

Opening

Repeated knight moves.

Delayed castling.

Weak bishop development.

Weak rook activity.

Weak center play.

King wandering.

Limited long-term planning.

Coach Lab should be used before attempting fixes.

---

# Long-Term Vision

Coach is expected to evolve through several stages.

Classical Engine

↓

Coach Lab

↓

Self Play

↓

Parameter Tuning

↓

Opening Book Generation

↓

Position Database

↓

NNUE Dataset Generation

↓

NNUE Evaluation

↓

Master-Level Explainable Chess

---

# AI Success Criteria

A successful contribution should improve at least one of:

Strength

Performance

Understanding

Reliability

Teaching

If it improves none of these, reconsider the proposal.

---

# Final Instruction

Do not optimize blindly.

Do not guess.

Measure.

Explain.

Verify.

Then improve.
