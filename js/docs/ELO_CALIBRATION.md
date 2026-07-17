# Coach Elo Calibration

This document records Coach's local engine-pool rating estimates and the
tournament conditions used to produce them.

These ratings are local engine-pool estimates. They are not directly
equivalent to FIDE, USCF, CCRL, or CEGT ratings.

## 2026-07-17 Coach RF Production Clean Gauntlet

### Assigned reference ratings

| Engine | Assigned Elo |
|---|---:|
| Stash 9.0 | 1330 |
| Shallow Blue 1.1 | 1455 |
| Shallow Blue 2.0 | 1617 |
| Eques 1.0 | 1750 |

### Overall result

```text
Wins:      172
Losses:    184
Draws:     44
Completed: 400 / 400
Score:     48.5%
```

### Results by opponent

| Opponent | Games | Wins | Losses | Draws | Score | Coach performance Elo |
|---|---:|---:|---:|---:|---:|---:|
| Stash 9.0 | 100 | 70 | 19 | 11 | 75.5% | 1526 |
| Shallow Blue 1.1 | 100 | 53 | 35 | 12 | 59.0% | 1518 |
| Shallow Blue 2.0 | 100 | 33 | 58 | 9 | 37.5% | 1528 |
| Eques 1.0 | 100 | 16 | 72 | 12 | 22.0% | 1530 |

### Rating conclusion

Combined logistic estimate:

```text
Coach RF Production: 1525 Elo
Approximate 95% range: 1488 to 1563
```

Working rating for future testing:

> **Coach RF Production 1525 Elo**

The four individual performance estimates ranged from 1518 to 1530, providing
strong internal consistency across the opponent ladder.

### Tournament conditions

- 100 games against each opponent
- 400 total Coach games
- CuteChess gauntlet
- Time control: 20 seconds plus 0.2 seconds per move
- Concurrency: 4
- Rodent Polyglot opening book
- Book depth: 8
- Paired openings with colors reversed
- Restart and recovery enabled

### Notes

- This was the replacement gauntlet after Casper rev4 was removed.
- Casper was excluded because it produced all 29 illegal moves in the earlier
  contaminated tournament.
- Coach itself did not reproduce a promotion-output defect.
- Use 1525 as Coach's current provisional local-pool rating until a later clean
  calibration supersedes it.
