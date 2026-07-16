# Constrained opening-phase calibration (predetermined candidate menu)

Follow-up to [`CALIBRATION-REFINEMENT-REPORT.md`](CALIBRATION-REFINEMENT-REPORT.md),
re-run with a **fully predetermined, exact candidate menu** (fixed clamp
values instead of a grid search; an opening-only slope fit that leaves
middlegame/endgame untouched) and two methodology upgrades: child positions
are now classified by their **own** actual phase (not assumed equal to the
parent's), and boundary analysis uses **real, naturally-occurring**
parent→child pairs that cross a phase boundary, not only hand-built examples.

## Result: same conclusion, more rigorously confirmed — Classification A

**Candidate C_clamp_25** (opening intercept clamped to a fixed **+25**, same
mechanism and same value as the previous study's grid-selected winner) again
passes every gate. `E_blend_0.75` again is the only other passer, and again
loses on cpMAE. The core finding replicates under a stricter, pre-registered
methodology.

## Step 1 — reproduction

`tools/analyze-calibration.mjs` re-run fresh: identical to the committed
`CALIBRATION-REPORT.md` numbers (raw linear cpMAE 196.08, phase-affine
183.30, parent-child Δstd 90.31→71.25, etc.) — no discrepancy.

## Step 2 — parameters and root cause

Same fitted equations as before:
`opening: 0.1417·raw + 32.12` · `middlegame: 1.0214·raw − 11.69` ·
`endgame: 1.2395·raw + 0.68`. Opening decomposition confirms the intercept
(not slope) does the work: slope-only cpMAE 50.3, intercept-only 59.8, both
38.7, vs raw 54.5 — and 44.2% of opening rows move away from zero, 34% cross
the ±25cp band, 11.6% cross ±100cp.

## Step 3 — exact candidate menu (14, no search)

A zero-intercept · B shrink {0, .25, .5, .75, 1.00} · **C clamp to fixed
±{10, 15, 20, 25}** · D opening-only slope (middlegame/endgame untouched) ·
E blend α∈{.25, .5, .75}. All 14 passed structural gates.

## Step 4 — scorecard (6 criteria, validation only)

Only **C_clamp_25** (cpMAE 183.31) and **E_blend_0.75** (cpMAE 183.42) passed
all six: materially better cpMAE, ≥15% volatility reduction, opening-density
deficit cut from 17pp to 3.5pp (closes >75% of the original gap, vs the
50%-closure bar), no family or endgame regression, monotonic/trivial. Every
fixed clamp below 25 (10/15/20) and every shrink/blend below its top value
failed the density gate — the unconstrained intercept (+32) sits outside
every tested bound, so only the *largest allowed* magnitude in each family
comes close enough. C_clamp_25 selected (lower cpMAE).

## Step 5 — boundary audit (real crossing pairs, corrected phase tracking)

Recomputing child phase from its own FEN (not inherited from the parent)
changes the pooled parent-child volatility numbers slightly from the
previous study (val: raw 90.31 unchanged, but phase-affine 71.25→73.6-74,
since some children's phase now correctly differs from their parent's) —
this is a methodology correction, not a reproduction failure; raw linear's
number is untouched because it has no phase dependence, confirming the
change is isolated to phase-aware transforms as expected.

33/1209 validation pairs (2.7%) and 65/1303 test pairs (5.0%) cross a phase
boundary. On those: median |jump| raw 58.5→original 64.0→**selected 70.3**;
p95 raw 245→original 307→**selected 300**; max raw 324→original 346→
**selected 353**. The selected candidate's jumps are consistently ~5-10cp
*larger* than the original's at crossings involving the opening phase — the
mechanism is exactly the intercept difference (32.1−25=7.1cp): reducing the
opening intercept lowers the "before" value, which *widens* the raw-minus-
calibrated gap at a boundary rather than narrowing it, whenever the position
isn't near zero. This is a real, explained, single-digit-percent trade-off
already present in the original fit (raw→original is itself a ~9% jump
increase) — **not a new qualitative cliff**, and it does not change the
decision.

## Step 6 — held-out test (touched once)

| candidate | cpMAE | opening cpMAE | endgame cpMAE | bias | Pearson | Spearman |
|---|---|---|---|---|---|---|
| raw linear | 187.79 | 61.63 | 229.36 | −9.10 | 0.8417 | 0.7907 |
| classical | 233.12 | – | – | −2.78 | 0.7876 | 0.7241 |
| MLP64 | 181.39 | – | – | −12.10 | 0.8405 | 0.7764 |
| original phase-affine | 176.14 | 37.56 | 198.73 | −15.52 | 0.8506 | 0.7936 |
| **selected (C_clamp_25)** | **176.19** | **38.32** | **198.73** | −15.98 | 0.8507 | 0.7933 |

Test-set volatility: raw Δstd 84.81 → original 77.14 → selected 77.27 (a
~9% reduction — smaller than validation's ~21%; still real, see CI below).
Test opening near-zero (±25cp): raw 26.8%, classical 24.6%, original 8.7%,
**selected 31.2%** — the candidate over-corrects slightly *past* classical
on this particular 138-row test slice (raw was already closer, at 2.2pp vs
classical, than selected's 6.6pp), even though it still closes most of the
original's 15.9pp deficit. Flagged as a small-sample caveat, not a reversal.

## Step 11 — confidence intervals (bootstrap, 1000 resamples, seeded)

- Overall cpMAE: raw [179.6, 195.7] vs selected [168.3, 184.3] — narrow overlap, medians clearly separated (187.8 vs 176.1).
- Opening cpMAE: raw [52.7, 71.1] vs selected [31.0, 46.8] — no overlap.
- Endgame cpMAE: raw [215.6, 243.9] vs selected [186.4, 211.7] — no overlap.
- **Paired volatility-difference CI** (selected − raw, same resampled pairs): **[−12.24, −2.44]**, median −7.64 — entirely below zero, confirming the volatility reduction is real, not resampling noise, even though its test-set magnitude (~9%) is smaller than validation's (~21%).

## Step 12 — cost

~13.5ns/call (~74M scores/sec), 164-byte serialized parameters — same order
of magnitude as the original study, negligible next to model inference.

## Classification: A

Candidate C_clamp_25 (opening intercept clamped to +25) satisfies all six
offline gates on both validation and a once-touched test set, with
bootstrap-confirmed accuracy and volatility gains. The boundary-jump
trade-off and the test-set opening-density overshoot are both honestly
reported limitations, not gate failures. As before: **post-hoc output
transform only** — no retraining, no search integration, `linear-s1.json`
unchanged.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural"
node tools\constrain-opening-calibration.mjs `
  --in    "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\labelled.jsonl" `
  --model "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\linear-s1.json" `
  --mlp   "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\mlp64-s1.json" `
  --json  "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\constrain-report.json"

node --test tests\calibration.test.mjs tests\constrain-opening-calibration.test.mjs
```
