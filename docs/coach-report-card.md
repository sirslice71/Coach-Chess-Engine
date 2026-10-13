# Coach Report Card

This file tracks repeatable Coach Chess Engine strength tests over time.

The Lucas Chess R estimate should be treated as a **position-test estimate**, not guaranteed engine-vs-engine Elo. Arena tournament Elo may be lower because full-game play includes time management, opening handling, endgame conversion, repetition avoidance, and practical tactical consistency.

---

## Latest: Lucas Chess R Test Suite

**Date:** 2026-10-13  
**Engine:** Coach 1.0.0  
**Engine file loaded:** `Coach-1.0.0.exe`  
**Lucas Chess R estimated Elo:** 1585  
**Overall category average:** 6930 / 15000 = 46.2%  

The result is effectively level with the July baseline: 10 suite points lower
out of 15,000 (0.1 percentage point) and 2 estimated Elo lower. The settings
shown in the completed-results capture did not include hash or depth; the
comparison below assumes the same Lucas suite and fixed-depth setup as the
July run, and should be treated as directional until those settings are
recorded with a future run.

| Group | July 2026 | Coach 1.0.0 | Change |
|---|---:|---:|---:|
| Undermining | 43.0% | 44.9% | +1.9 |
| Open Files and Diagonals | 35.0% | 31.7% | -3.3 |
| Knight Outposts | 41.6% | 43.7% | +2.1 |
| Square Vacancy | 50.4% | 42.8% | -7.6 |
| Bishop vs Knight | 65.4% | 69.1% | +3.7 |
| Re-Capturing | 70.4% | 70.8% | +0.4 |
| Offer of Simplification | 36.9% | 39.7% | +2.8 |
| Advancement of f/g/h Pawns | 32.8% | 34.8% | +2.0 |
| Advancement of a/b/c Pawns | 32.9% | 32.2% | -0.7 |
| Simplification | 65.0% | 59.7% | -5.3 |
| Activity of the King | 39.5% | 41.6% | +2.1 |
| Center Control | 37.7% | 41.5% | +3.8 |
| Pawn Play in the Center | 55.9% | 46.5% | -9.4 |
| Queens and Rooks to the 7th Rank | 50.6% | 55.8% | +5.2 |
| Avoid Pointless Exchange | 36.9% | 38.2% | +1.3 |

### What Changed

Largest gains:
- Queens and Rooks to the 7th Rank: +5.2 points.
- Center Control: +3.8 points.
- Bishop vs Knight: +3.7 points.
- Offer of Simplification: +2.8 points.

Largest losses:
- Pawn Play in the Center: -9.4 points.
- Square Vacancy: -7.6 points.
- Simplification: -5.3 points.
- Open Files and Diagonals: -3.3 points.

The results say Coach 1.0.0 has redistributed its fixed-depth position-test
strength rather than clearly gained or lost overall. The two sharpest drops,
Pawn Play in the Center and Square Vacancy, are useful regression-watch areas;
the gains in seventh-rank activity, center control, and bishop-versus-knight
play are worth preserving in future changes.

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

