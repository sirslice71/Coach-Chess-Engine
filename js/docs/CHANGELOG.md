# Changelog

All notable changes to Coach will be documented here.

---

# v1.0.0 - Public Engine Release
Released: October 2026

## Added

- Self-contained Windows x64 UCI executable build.
- Default 256 MB UCI hash configuration.
- MIT license and public-source release metadata.

## Changed

- Public engine identity is now `Coach 1.0.0`.
- Release documentation now distinguishes historical position-test estimates
  from a future CCRL-calibrated rating.

---

# v0.3.0 - Foundation
Released: June 2026

## Added

- Board representation
- Piece lists
- Material tracking
- Legal move generation
- Attack detection
- Check detection
- Castling
- En passant
- Promotion
- Undo
- FEN import/export
- Perft testing
- Evaluation framework
- Logger
- Developer panel

## Changed

- Evaluation redesigned around chess principles instead of piece-specific bonuses.

## Fixed

- Capture highlighting
- Castling rights restoration
- Piece list synchronization
- Undo consistency
- FEN loading

## Maintenance Releases
Coach v0.3.1 – Stability
June 2026

Fixed
✅ Material evaluation no longer changes when pieces move.
✅ addPiece() is now used strictly for board state updates.
✅ Material changes occur only during setup, captures, promotions, and FEN loading.

Coach v0.4.2
June 2026

✓ Negamax search complete
✓ Alpha-Beta pruning
✓ Checkmate detection
✓ Stalemate detection
✓ Search statistics
✓ Cutoff counter

Coach v0.4.4-alpha
June 26, 2026

Engine Core
✅ Board representation
✅ FEN loading
✅ Make/Undo
✅ Legal move generation
✅ Check detection
✅ Evaluation
✅ Negamax
✅ Alpha-Beta pruning
✅ Basic move ordering
✅ Search statistics
Gameplay
✅ CPU can make a move
✅ CPU can play both White and Black
✅ CPU vs CPU works from the console



# Coach Chess Engine

## v1.1 (In Progress)
June 27, 2026

### Added

- GameState manager

### Planned

- Threefold repetition
- Fifty-move rule
- Insufficient material
- Game over dialog
- Engine information panel
- Principal variation

========================
Coach v0.3.0

June 28, 2026

Board v2 - Incremental piece list updates

- Removed updatePieceLists() from makeMove()
- Preserved Perft correctness
- Preserved Search Integrity
- ~20x faster search in tested positions
