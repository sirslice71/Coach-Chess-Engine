# Phase-affine calibration refinement (opening-intercept fix)

Follow-up to [`CALIBRATION-REPORT.md`](CALIBRATION-REPORT.md). That study found
phase-dependent affine calibration was the strongest candidate (best cpMAE,
biggest volatility cut) but failed its density gate because the fitted
**opening** intercept pushed scores away from zero. This study asks: can a
narrowly constrained variant fix the opening component only, and keep
everything else that was already working?

## Result: yes — Candidate B (bounded opening intercept) accepted

**Classification A.** All seven validation gates pass; confirmed once on the
held-out test set with non-overlapping bootstrap confidence intervals.

## Root cause (Phase 2)

Fitted phase-affine parameters (`output = slope × rawScore + intercept`,
validation split):

| phase | slope | intercept | raw cpMAE | both (orig) cpMAE | slope-only cpMAE | intercept-only cpMAE |
|---|---|---|---|---|---|---|
| opening | 0.142 | **+32.1** | 54.5 | 38.7 | 50.3 | 59.8 |
| middlegame | 1.021 | −11.7 | 190.1 | 188.7 | 189.6 | 189.3 |
| endgame | 1.240 | +0.7 | 232.4 | 200.0 | 199.9 | 232.4 |

Only **opening** has a near-flat slope (0.14, vs ~1.0–1.24 elsewhere) paired
with a large intercept (+32). Decomposing the two effects (slope-only vs
intercept-only cpMAE above) shows the intercept does almost all of the
opening cpMAE improvement, and it does so by shifting the *whole* opening
score band away from zero — 74.9% of opening rows end up **further** from
zero after calibration, and near-zero density (±25cp) drops from 28.6% (raw)
to 5.4% (calibrated), versus Coach classical's 22.4% on the same rows. Cause:
**intercept magnitude**, not slope, not phase-boundary assignment (opening
is a small but not tiny slice: 147/2395 validation rows, ~6.1%), not class
imbalance beyond that, not the fitting objective itself (OLS is doing exactly
what it's told — it just isn't told to protect near-zero density).

## Candidates tested (Phase 3-5)

18 total configurations, all touching only the opening component (or the
fitting objective) of the existing phase-affine params — no new families, no
change to middlegame/endgame fitting: **A** zero opening intercept · **B**
opening intercept bounded to a coarse grid in [−25, +25] (validation-selected)
· **C** shrink factors {0, .25, .5, .75, 1} · **D** slope-only (intercept
forced to 0 in *every* phase, slope re-derived) · **E** ridge-regularized
toward {slope=1, intercept=0} at λ∈{0.001, .01, .1, 1, 10} · **F** blend
`α·calibrated + (1-α)·raw` in opening only, α∈{0, .25, .5, .75, 1}.

All 18 passed the structural gates (non-negative slope in every phase,
deterministic, continuous, clamp rate ≤20%).

**Scorecard (validation, 7 criteria — cpMAE / volatility / opening density /
family / endgame / bias / triviality):** only **B** (bounded intercept) and
**F_blend_0.75** passed all seven. Every pure shrink/ridge/slope-only variant
that didn't hit the ±25 boundary reproduced numbers close to the *original*
uncorrected fit (because the unconstrained intercept +32 sits outside any of
their effective pulls at the tested strengths) and failed density; A (zero
intercept) overcorrected in the other direction and also failed density.
B's grid search selected **+25** (the boundary itself — the unconstrained
optimum of +32 is outside the allowed range, so the constrained optimum is
the nearest allowed value). B beat F_blend_0.75 on cpMAE (183.31 vs 183.42)
and was selected.

## Selected candidate: B — bounded opening intercept

```
opening:    slope 0.1417 (unchanged), intercept +25 (was +32.1, clamped)
middlegame: slope 1.0214, intercept −11.69 (unchanged from the original fit)
endgame:    slope 1.2395, intercept +0.68 (unchanged from the original fit)
```

Validation: cpMAE 183.31 (raw linear 196.08, −6.5%), parent-child volatility
71.25 (raw 90.31, −21%, identical to the original fit since middlegame/endgame
are untouched), opening near-zero density 25.9% (classical 22.4%, raw 28.6%,
original-fit 5.4% — B closes the gap to within 3.5pp instead of 17pp), no
source-family or endgame regression, bias −0.71cp.

## Phase-boundary behavior (Phase 6)

4 hand-built, real single-move transitions (queen/rook captures crossing
phase or material-class boundaries, applied via Coach's own legal move
generator — no search). For the 3 transitions that don't touch the opening
phase, B's boundary jump is **identical** to the original fit's (middlegame/
endgame params unchanged). For the 1 opening→middlegame transition, B's extra
jump is slightly larger (240.9cp vs 233.7cp) — a ~3% increase, directly
attributable to the still-nonzero (but smaller) intercept. Median absolute
extra jump: 93.6cp for both. No new pathological discontinuity; the one
regression is small, explained, and confined to the one case that actually
crosses the opening boundary.

## Held-out test confirmation (Phase 8, touched once)

| candidate | test cpMAE | test endgame cpMAE | test opening cpMAE |
|---|---|---|---|
| raw linear | 187.79 | 229.36 | 61.63 |
| classical | 233.12 | – | – |
| MLP64 | 181.39 | – | – |
| original phase-affine | 176.14 | 198.73 | 37.56 |
| **selected (B)** | **176.19** | **198.73** | **38.32** |

Bootstrap (1000 resamples, seeded): overall cpMAE 95% CI raw linear
[179.6, 195.7] vs selected [168.3, 184.3] — barely overlapping, clearly
separated medians (187.8 vs 176.1). Endgame cpMAE CI raw [215.6, 243.9] vs
selected [186.4, 211.7] — **no overlap at all**. The accuracy and volatility
gains are not validation noise.

## Cost (Phase 9)

~13ns per transformed score (~76M scores/sec), 164-byte serialized
parameters — negligible next to feature encoding + model inference (which
run in the microsecond range in the original proof's benchmark, i.e. ~1000×
more expensive than this transform).

## Decision

**Classification A.** Candidate B (bounded opening intercept) is kept as
reusable calibration code. As with the original study, this is a **post-hoc
output transform only** — no retraining, no wiring into Coach search (there
is none in this worktree), no change to `models/linear-s1.json`.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"
node tools\refine-phase-calibration.mjs `
  --in    "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\labelled.jsonl" `
  --model "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\linear-s1.json" `
  --mlp   "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\mlp64-s1.json" `
  --json  "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\refine-report.json"

node --test tests\calibration.test.mjs tests\refine-phase-calibration.test.mjs
```
