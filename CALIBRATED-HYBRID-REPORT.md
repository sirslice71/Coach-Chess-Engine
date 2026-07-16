# Calibrated neural hybrid — isolated search benchmark

Branch: `experiment/neural-hybrid-calibrated`, created from `experiment/neural-hybrid @ 8b418ee` (unmodified, untouched — this report's "raw" baseline is measured directly from that commit, not rewritten). **Not wired into production; disabled by default** (only active when `COACH_HYBRID_MODEL_PATH` is set, same as the original hybrid).

## Result: negative for search integration — Classification C

The constrained phase calibration (`opening: slope×raw+25 clamped`, `middlegame`/`endgame`: unconstrained fitted affine — see `neural/CALIBRATION-CONSTRAINED-OPENING-REPORT.md` in the neural-eval worktree) dramatically improves the **local, non-search score landscape** on the same four neural-heavy positions used in the original node-explosion diagnosis, but does **not** reliably reduce actual search-tree node growth, and makes one position markedly worse. The bounded success gate fails on three independent criteria. **No smoke match was run** (gate failure means matches are out of scope per the task's own rule).

## What changed (Phase 2)

`js/engine/hybridEval.js`: a single post-processing step after the raw neural forward pass, before the score is returned. Vendored constants only (no file reads, no model reload, no Python):

```js
const CALIBRATION = {
    opening:    { a: 0.14171033426246749, b: 25 },                 // fitted slope, intercept clamped +32.12 -> +25
    middlegame: { a: 1.0213814890315187,  b: -11.690688475647447 },
    endgame:    { a: 1.2395102995466445,  b: 0.6780419486463245 },
};
```

`calibrationPhase(placement, fullmove)` reproduces `neural/lib/position.mjs`'s `gamePhase()` exactly (endgame: phaseScore≤6; opening: phaseScore≥22 AND fullmove≤10; else middlegame) — a three-way split used **only** for calibration lookup, separate from the existing binary `isEndgamePhase()`/`shouldRouteToClassical()` routing, which is unchanged. `applyCalibration()` re-clamps to the model's own ±clipCp after the affine transform (double-clamp, same convention as the offline study). Diagnostics now expose `neuralRaw` and `neuralCalibrated` separately; `classicalRaw`/routing/material-class/score-perspective are untouched.

## Parity (Phase 3)

`tests/hybrid_eval.test.mjs`: 14 tests (13 pass, 1 skip when model unset), including the 113-fixture stratified check — **zero routing mismatches, exact classical parity, exact calibration parity** (calibrated output = `applyCalibration(fixture's recorded raw value, ...)`, bit-exact). New focused tests cover each phase's equation, the +25 clamp, sign symmetry, monotonicity, raw-vs-calibrated diagnostics, classical-route invariance, bad-model fallback, and determinism.

## Score-landscape audit (Phase 4) — same 4 roots + 121 ply-1 children, no search

| | classical | raw neural | calibrated neural |
|---|---|---|---|
| mean / median / std | 67.8 / 2 / 130.2 | 94.6 / 73.8 / 89.4 | 38.4 / 35.5 / **12.7** |
| near-zero (±25cp) | 38.0% | 18.2% | 10.7% |
| clamp saturation | 0% | 0% | 0% |
| parent-child Δstd | 41.7 | 76.9 | **10.9** |
| parent-child p95 |abs Δ| | 62.0 | 127.2 | **18.0** |
| sign-flip rate | 15.7% | 10.7% | **0.0%** |
| correlation w/ classical | – | 0.670 | 0.670 (identical — expected: Pearson r is invariant under a positive affine transform) |

Calibration cuts local parent-child volatility to ~1/7 of raw's (matches the opening slope 0.1417 almost exactly: 76.9×0.1417≈10.9) — because **all four** "neural-heavy" positions, including the two informally named "middlegame-1/2" in the earlier diagnosis, are classified as `opening` under the rigorous `gamePhase()` rule (phaseScore≥22, fullmove≤10). Per-position raw→calibrated Δstd: opening-1 76.5→10.8, opening-2 57.7→8.2, middlegame-1 63.3→9.0, middlegame-2 66.9→9.5.

## Bounded search benchmark (Phase 5) — depth 6, 120s hard cap, 1 warmup + 1 measured per mode

| position | classical nodes / time | raw nodes / time | calibrated nodes / time | cal/classical | cal/raw |
|---|---|---|---|---|---|
| opening-1 | 38,468 / 368ms | 92,114 / 1,059ms | 74,319 / 1,021ms | 1.932x | **0.807x** |
| opening-2 | 77,072 / 1,314ms | 74,723 / 1,325ms | 76,592 / 1,432ms | 0.994x | 1.025x |
| middlegame-1 | 50,991 / 618ms | 125,535 / 1,923ms | 120,612 / 2,154ms | 2.366x | 0.961x |
| middlegame-2 | 69,838 / 1,247ms | 134,774 / 2,966ms | 182,122 / 4,488ms | **2.608x** | **1.351x** |
| rook-endgame (classical-routed) | 27,147 / 85ms | 27,147 / 133ms | 27,147 / 136ms | 1.000x | 1.000x |
| minor-endgame | 16,589 / 75ms | 8,958 / 58ms | 8,952 / 64ms | 0.540x | 0.999x |

Best move / score: rook-endgame identical across all three modes (move, score, PV, node count) — confirms the classical route is untouched apart from small wrapper overhead. minor-endgame: same move across all three, calibrated's score (317cp) sits closer to classical's (333cp) than raw's (255cp). opening-1/opening-2/middlegame-1: raw and calibrated agree on the best move (opening-1's PV diverges at move 2). **middlegame-2: raw and calibrated disagree on the best move** (`d4-e5` vs `e4-d5`) with a structurally different, longer PV and a score that nearly halves (220cp → 112cp) — real PV instability, not a crash.

Route frequencies: 0% classical / 100% neural on all four opening/middlegame positions (both raw and calibrated); 100% classical on rook-endgame; ~99.6% classical on minor-endgame (a handful of neural-routed nodes at the phase boundary) — unchanged by calibration, confirming routing itself was not altered.

**Likely mechanism for middlegame-2's regression** (inferred, not directly instrumented): its qsearch tree is unusually deep (raw leafNodes 215,199 → calibrated 342,854, a 59% increase) — deep enough that the fullmove counter crosses the `calibrationPhase()` opening threshold (fullmove≤10) partway down some lines. That flips the applied slope from 0.14 to ~1.02 *mid-tree*, introducing a scale discontinuity that a single fixed evaluation formula (raw neural, or classical) never has. This is a plausible, mechanistically coherent explanation consistent with the pattern (the position with the deepest qsearch tail is exactly the one that got worse), but it was not independently instrumented/confirmed with a dedicated counter in this task.

## Success gate: FAILED

1. **Node reduction vs raw on ≥3/4 neural-heavy positions**: only 2/4 (opening-1, middlegame-1) improved. **FAIL.**
2. **Median neural-heavy ratio vs classical ≤~1.4x**: median of {1.932, 0.994, 2.366, 2.608} = **2.149x**. **FAIL.**
3. **No position above 2.0x**: middlegame-1 (2.366x) and middlegame-2 (2.608x) both exceed it. **FAIL.**
4. No severe score/PV instability: borderline — middlegame-2's move/PV/score change is real but not a crash/illegal-move class of instability.
5. Rook-endgame unchanged apart from wrapper overhead: **PASS** (identical nodes/move/score/PV; +51-53ms wrapper overhead, consistent with prior findings).

Per the task's own rule, **the smoke match (Phase 6) was not run** — the gate failed clearly.

## Correctness gates (Phase 7)

- `hybrid_eval.test.mjs`: 14 tests, 13 pass, 1 skip (model-independent test correctly skips when the model IS set, since it's superseded by the parity test).
- `uci.test.mjs, see.test.mjs, material.test.mjs, zobrist.test.mjs, engine_regressions.test.mjs, diagnostic_anchors.test.mjs`: 134 tests, **122 pass, 1 fail, 11 skip**. The one failure ("a normal winning position still reports score cp N, not mate") asserts UCI's `score cp` output is an integer; the hybrid's raw neural forward pass returns a float and nothing downstream rounds it. **Verified pre-existing**: reproduced identically on the unmodified `experiment/neural-hybrid @ 8b418ee` with the model configured (`score cp 90.94737655566223`) — this is a latent gap in the original hybrid's UCI reporting path, not something this calibration change introduced, and fixing it is out of scope here (it would mean touching `js/uci/uciengine.js`'s score formatting, not the calibration transform).
- `perft.test.mjs`: 34/34 pass. `nullmove.test.mjs`: 6/6 pass. `git diff --check`: clean.

## Classification: C — improves static shape, not search behavior

The calibration is a genuine, twice-validated offline accuracy/volatility improvement, and Phase 4 confirms it also sharply reduces *local* (non-search) parent-child volatility on these exact positions. But Phase 5 shows this does not translate into consistently better search-tree behavior: node counts worsen on 2 of 4 neural-heavy positions (one severely), the median ratio versus classical is roughly 2.1x (target ~1.4x), and a plausible mechanism (fullmove-triggered mid-tree scale discontinuity from the phase-dependent calibration) is identified though not independently instrumented. Even a full pass here would not have authorized search integration; this result does not reach that bar regardless.

## Reproduce

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Hybrid"
$env:COACH_HYBRID_MODEL_PATH = "<USERPROFILE>\OneDrive\Desktop\Coach Neural Data\combined-005-sf2000-rodent-300games\models\linear-s1.json"
node --test tests\hybrid_eval.test.mjs
```
