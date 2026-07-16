# Offline score-recalibration study (781-feature linear model)

Parallel, isolated analysis. **No retraining, no new input features, no
search/eval integration, no engine matches.** Investigates whether the
accepted 781-feature linear value model (`models/linear-s1.json`, trained on
`combined-005-sf2000-rodent-300games`) can be recalibrated **offline**, as a
simple deterministic post-hoc transform of its centipawn *output*, so its
score distribution sits closer to Coach's classical evaluation landscape —
without materially hurting predictive accuracy.

## Result: negative — model left unchanged

None of the four candidate transforms satisfied all four acceptance criteria
on the validation split. Per the task's own rule, no calibration is applied
and `models/linear-s1.json` is unchanged. One transform (**phase-dependent
affine**) is a genuine near-miss, documented in detail below so this doesn't
need re-investigating from scratch later.

## Method

- Tool: `tools/analyze-calibration.mjs` (read-only, deterministic). Library:
  `lib/calibration.mjs` (pure `fit`/`apply` pairs, no I/O).
- All four transforms are fit **once**, on the **validation split only**
  (2,395 rows of `combined-005-sf2000-rodent-300games/labelled.jsonl`), using
  (linear-model cp, Stockfish cp) pairs. Selection uses validation results
  only. **Test (2,166 rows) is touched exactly once**, only for the transform
  the validation-only criteria selected — here, none, so test numbers below
  are baseline reference only (raw linear / classical / MLP64), not part of
  any selection decision.
- cp convention matches the model's existing contract exactly: `cp =
  atanh(clamp(tanh_output)) * 400`, clipped to ±1000 (the same value the
  isolated hybrid evaluator exposes; this study has no search dependency).
  Stockfish ground truth is clipped the same way (mate → ±1000 signed).
- Parent-child volatility: 45 root positions (15 per phase: opening,
  middlegame, endgame), sampled deterministically by sorting each phase's
  validation rows by FEN and taking an even stride — not just the
  alphabetically-first rows. All legal ply-1 children of each root are
  generated via Coach's legal move generator (`createEngineCore`,
  read-only, **no search**), giving 1,209 parent→child pairs. Delta =
  child value − parent value, computed per candidate on the *same* pairs.

## Candidates

1. **Global affine** — `cp' = a·cp + b`, one pair fit by OLS over all rows.
2. **Phase-dependent affine** — separate `{a,b}` per game phase (falls back
   to identity if a phase has <20 rows).
3. **Symmetric monotonic power compression/expansion** — `cp' = sign(cp)·a·|cp|^p`,
   `p` from a fixed grid search, `a` closed-form per `p`.
4. **Bounded piecewise-linear** — 13 fixed knots from −1000 to 1000; each
   knot's y-value is the mean Stockfish score of the nearest validation rows
   (nearest-knot = midpoint partition for a sorted knot list), pooled to be
   monotonic non-decreasing (weighted PAVA/isotonic), linearly interpolated,
   flat (bounded) extrapolation beyond the outer knots.

All four are deterministic, closed-form or fixed-grid, and O(1)–O(#knots) to
apply — "computationally trivial" by construction.

## Acceptance criteria (stated thresholds)

A transform must pass **all four** to be preserved:

| # | Criterion | Threshold used |
|---|---|---|
| 1 | Does not materially worsen validation cpMAE | `cpMAE(transform) ≤ cpMAE(rawLinear) × 1.03` |
| 2 | Meaningfully reduces parent-child volatility | `deltaStd(transform) ≤ deltaStd(rawLinear) × 0.85` (≥15% relative reduction) |
| 3 | Moves score density toward classical | distance-to-classical on **near-zero%** must strictly improve vs raw linear, and beyond-100%/beyond-300% distance must not worsen by more than 2pp |
| 4 | Deterministic and computationally trivial | satisfied by construction for all four families |

These thresholds were fixed in code **before** running against real data
(not tuned after seeing results).

## Validation results

| candidate | cpMAE | bias | Pearson | Spearman | parent-child Δstd | sign-flip% | near-zero% | beyond100% | beyond300% | clamp% |
|---|---|---|---|---|---|---|---|---|---|---|
| raw linear (unchanged) | 196.08 | +8.39 | – | – | 90.31 | 21.2 | 9.2 | 64.9 | 29.5 | 2.8 |
| classical (Coach) | 243.85 | +23.09 | – | – | 66.94 | 9.3 | 10.3 | 66.8 | 37.4 | 7.6 |
| MLP64 (reference only, not calibrated) | 192.23 | +3.64 | – | – | – | – | – | – | – | – |
| **globalAffine** | 187.47 | – | – | – | 100.97 | 22.3 | 8.8 | 67.8 | 34.7 | 4.1 |
| **phaseAffine** | **183.30** | – | – | – | **71.25** | **6.3** | 7.5 | 65.2 | 33.1 | 4.4 |
| **powerCompression** | 188.17 | – | – | – | 113.36 | 21.2 | 4.3 | 76.4 | 39.6 | 3.3 |
| **piecewiseLinear** | 188.06 | – | – | – | 112.70 | 20.3 | 4.9 | 73.2 | 41.1 | 0.0 |

**Raw linear already beats classical on cpMAE** (196 vs 244) — the neural
model is not the accuracy problem; MLP64 is marginally better again (192).

**Pass/fail per criterion (validation):**

| candidate | cpMAE ok | volatility ok | density ok | **all pass** |
|---|---|---|---|---|
| globalAffine | ✅ (187.47) | ❌ (+11.8% vol, wrong direction) | ❌ | ❌ |
| phaseAffine | ✅ (183.30, best of all 4) | ✅ (−21.1% vol) | ❌ (see below) | ❌ |
| powerCompression | ✅ (188.17) | ❌ (+25.5% vol) | ❌ | ❌ |
| piecewiseLinear | ✅ (188.06) | ❌ (+24.8% vol) | ❌ | ❌ |

Three of four transforms (global affine, power compression, piecewise
linear) **increase** parent-child volatility relative to raw linear despite
improving cpMAE — an affine/power/knot fit that pulls the *mean* prediction
closer to Stockfish's wider score range does so partly by scaling up the
*swing* between positions, which is exactly the opposite of what "closer to
classical's landscape" is after. Only phase-dependent affine escapes this
trade-off.

### The phase-affine near-miss

`phaseAffine` passes criteria 1 and 2 decisively — best-of-all-candidates
cpMAE (183.3, beating even MLP64's 192.2), a 21% cut in parent-child
volatility (90.31→71.25, actually going *below* classical's own 66.94), and
a sign-flip rate that drops from 21.2% to **6.3%** (better than classical's
9.3%). Endgame cpMAE improves from 232.4 to 200.0; opening cpMAE from 54.5 to
38.7 (better than MLP64's 43.3).

It fails criterion 3 only on the **near-zero%** sub-metric: raw linear is
already close to classical here (9.2% vs classical's 10.3%, a 1.1pp gap),
and phaseAffine's fitted per-phase intercepts pull it further away (7.5%, a
2.8pp gap) rather than closer — an over-correction in the wrong direction on
this one sub-metric, even though it clearly improves the other two density
sub-metrics (beyond100%/beyond300% distance-to-classical both shrink).

Fitted phase parameters (opening intercept `b≈+32` inflates small-magnitude
opening scores away from zero) are the direct cause: openings are already
Stockfish's most centered phase, and a positive intercept systematically
shifts them off zero.

**Per the task's stated rule — a transform must satisfy all four criteria to
be preserved — phaseAffine does not qualify**, despite being a strong result
on 3 of 4 sub-checks. This is reported as a near-miss, not selected. No
after-the-fact loosening of the pre-declared threshold was applied.

## Test set (touched once, reference only — no transform was selected)

| candidate | cpMAE | bias | Pearson | Spearman |
|---|---|---|---|---|
| raw linear | 187.79 | −9.10 | 0.8417 | 0.7907 |
| classical | 233.12 | −2.78 | 0.7876 | 0.7241 |
| MLP64 | 181.39 | −12.10 | 0.8405 | 0.7764 |

## Decision

**Negative result. `models/linear-s1.json` is unchanged.** The reusable
calibration library (`lib/calibration.mjs`), analysis tool
(`tools/analyze-calibration.mjs`), and tests (`tests/calibration.test.mjs`)
are kept because they are directly reusable if a future model iteration
(different training run, larger corpus, different feature set) makes the
phase-affine near-miss clear the density bar, or surfaces a different
winning transform. If phase-affine calibration is revisited, the fix implied
by this analysis is narrow: constrain or drop the opening-phase intercept
term specifically (the one component identified as pulling density in the
wrong direction) rather than re-deriving the whole family from scratch.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"
node tools\analyze-calibration.mjs `
  --in    "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\labelled.jsonl" `
  --model "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\linear-s1.json" `
  --mlp   "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\mlp64-s1.json" `
  --json  "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\calibration-report.json"

node --test tests\calibration.test.mjs
```
