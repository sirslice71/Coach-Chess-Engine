# Coach Chess Engine ♟️

> **Strong enough to compete. Smart enough to teach.**

Coach is a modern chess engine written from scratch in JavaScript with an ambitious long-term vision:

- Build a strong classical chess engine.
- Build the world's best explainable chess engine.
- Build an engine that can improve itself through evidence-driven self-play.

Coach is designed not only to find the best move—but eventually to explain *why* it is the best move.

---

# Philosophy

Coach is built around five guiding principles.

💪 **Strength**

Become a stronger chess engine through better search and evaluation.

⚡ **Performance**

Search more positions through efficient algorithms and data structures.

🧠 **Understanding**

Develop genuine positional understanding rather than relying solely on brute force.

🛡 **Reliability**

Every improvement must be verified before it is accepted.

🎓 **Teaching**

Explain chess decisions in a way that helps people improve.

---

# What Makes Coach Different?

Most chess engines answer:

> **"What is the best move?"**

Coach aims to answer:

- What is the best move?
- Why is it best?
- What plans does it create?
- What weaknesses does it exploit?
- What can the player learn?

Explainability is considered a first-class feature.

---

# Current Features

## Search

- Alpha-Beta Negamax
- Iterative Deepening
- Quiescence Search
- Aspiration Windows
- Killer Move Heuristic
- Principal Variation
- Transposition Tables
- TT Move Ordering
- Search Profiling
- Benchmark Suite

---

## Evaluation

- Material
- Piece-Square Tables
- Development
- Center Control
- Passed Pawns
- Connected Pawns
- Doubled Pawns
- Isolated Pawns

Additional positional evaluation is under active development.

---

## Move Generation

- Fully legal move generation
- Castling
- En Passant
- Promotions
- Incremental Make/Undo
- Incremental Piece Lists
- Incremental Zobrist Hashing

Verified using Perft.

---

## Developer Tools

Coach includes a growing set of developer tools.

Examples:

```
chess.verify()

chess.perft(5)

chess.divide(5)

chess.bench(6)

chess.compare()

chess.lab("e2-e4")

chess.debugEvaluation()

chess.history()
```

These tools make debugging, evaluation tuning, and search analysis significantly easier.

---

# Coach Lab

One of Coach's defining features.

Coach Lab is an analysis system that explains **why** Coach prefers a move.

Example:

```
chess.lab("e2-e4")
```

Coach Lab compares evaluation categories before and after a move, helping developers understand exactly which heuristics influenced the decision.

Long-term goals include:

- Move explanations
- Evaluation breakdowns
- Search diagnostics
- Regression analysis
- Self-play reports
- Parameter tuning
- Opening statistics

Coach Lab is intended to become the heart of Coach's development process.

---

# Project Status

Current Version

**0.7 Alpha**

Estimated Playing Strength

**~1200–1400 Elo**

Current Development Focus

- Opening understanding
- King safety
- Piece activity
- Game phase evaluation
- Coach Lab expansion

---

# Documentation

Project documentation lives in `/docs`.

Major documents include:

- COACH_ENGINE.md
- ROADMAP.md
- ARCHITECTURE.md
- ENGINE_PRINCIPLES.md
- AI_CONTEXT.md
- COACH_LAB.md
- DEVELOPMENT_WORKFLOW.md
- PROJECT_HISTORY.md
- KNOWN_WEAKNESSES.md
- SELF_PLAY_VISION.md

These documents describe not only how Coach works, but why it was built the way it was.

---

# Long-Term Vision

Coach is being designed as more than a chess engine.

The long-term roadmap includes:

- Coach Lab
- Automated self-play
- Opening book generation
- Elo regression testing
- Parameter tuning
- Position databases
- NNUE dataset generation
- Neural evaluation

Ultimately, Coach should be capable of improving through evidence gathered during overnight self-play while keeping a human developer in control of architectural decisions.

---

# Contributing

Contributions are welcome.

Before making significant changes, please read:

- AGENTS.md
- COACH_ENGINE.md
- ARCHITECTURE.md
- ENGINE_PRINCIPLES.md

Every contribution should improve at least one of:

- Strength
- Performance
- Understanding
- Reliability
- Teaching

---

# Development Workflow

Typical workflow:

```
Observe

↓

Measure

↓

Coach Lab

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
```

Evidence is preferred over intuition.

---

# Roadmap

The current roadmap focuses on:

- Better opening play
- Stronger positional understanding
- Improved king safety
- Search optimizations (PVS, LMR, Null Move)
- Incremental evaluation
- Endgame knowledge
- Coach Lab
- Self-play

See `ROADMAP.md` for details.

---

# Vision Statement

Coach is not trying to become another black-box chess engine.

It is being built to become an engine that can:

- Play strong chess.
- Explain strong chess.
- Learn from strong chess.

That vision guides every architectural decision in the project.

---

# Project Motto

> **Strong enough to compete. Smart enough to teach.**
