# Coach Chess Engine Report Card

This file tracks repeatable Coach Chess Engine strength tests over time.

The Lucas Chess R estimate should be treated as a **position-test estimate**, not guaranteed engine-vs-engine Elo. Arena tournament Elo may be lower because full-game play includes time management, opening handling, endgame conversion, repetition avoidance, and practical tactical consistency.

---

## Baseline: Lucas Chess R Test Suite

**Date:** 2026-07-04  
**Engine:** Coach Chess Engine  
**Engine file loaded:** `coach-uci.exe`  
**Hash:** 128 MB  
**Depth:** 5  
**Lucas Chess R estimated Elo:** 1587  
**Overall category average:** 6940 / 15000 = 46.3%  

| Group | Done | Coach Score |
|---|---:|---:|
| Undermining | 100/100 | 430/1000 - 43.0% |
| Open Files and Diagonals | 100/100 | 350/1000 - 35.0% |
| Knight Outposts | 100/100 | 416/1000 - 41.6% |
| Square Vacancy | 100/100 | 504/1000 - 50.4% |
| Bishop vs Knight | 100/100 | 654/1000 - 65.4% |
| Re-Capturing | 100/100 | 704/1000 - 70.4% |
| Off of Simplification | 100/100 | 369/1000 - 36.9% |
| Advancement of f/g Pawns | 100/100 | 328/1000 - 32.8% |
| Advancement of a/b/c Pawns | 100/100 | 329/1000 - 32.9% |
| Simplification | 100/100 | 650/1000 - 65.0% |
| Activity of the King | 100/100 | 395/1000 - 39.5% |
| Center Control | 100/100 | 377/1000 - 37.7% |
| Pawn Play in the Center | 100/100 | 559/1000 - 55.9% |
| Queens and Rooks to the 7th Rank | 100/100 | 506/1000 - 50.6% |
| Avoid Pointless Exchange | 100/100 | 369/1000 - 36.9% |

### Notes

Current strongest categories:
- Re-Capturing: 70.4%
- Bishop vs Knight: 65.4%
- Simplification: 65.0%

Current weakest categories:
- Advancement of f/g Pawns: 32.8%
- Advancement of a/b/c Pawns: 32.9%
- Open Files and Diagonals: 35.0%
- Off of Simplification: 36.9%
- Avoid Pointless Exchange: 36.9%

### Interpretation

Lucas Chess R estimated Coach at 1587 Elo in this fixed-depth position test.

Current Arena/tournament testing has suggested lower practical playing strength, closer to the low-to-mid 1400s. For tracking improvement, this file should focus on trend over time using the same test suite and same settings.

Future runs should keep settings consistent unless explicitly noted:
- Same machine
- Same Lucas Chess R test suite
- Same depth
- Same hash
- Same engine executable path
- Same commit tracking

