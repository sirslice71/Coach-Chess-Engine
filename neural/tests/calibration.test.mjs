//======================================================
// calibration.test.mjs — offline post-hoc score-recalibration
// transforms. Pure functions, no model/dataset dependency: fit +
// apply on small synthetic {cp, sf, phase} fixtures.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    fitGlobalAffine, applyGlobalAffine,
    fitPhaseAffine, applyPhaseAffine,
    fitPowerCompression, applyPowerCompression,
    fitPiecewiseLinear, applyPiecewiseLinear,
    DEFAULT_KNOTS, TRANSFORMS, PHASES,
    zeroOpeningIntercept, fitBoundedOpeningIntercept, shrinkOpeningIntercept,
    fitPhaseSlopeOnly, fitPhaseAffineRegularized, applyPhaseAffineBlended,
} from "../lib/calibration.mjs";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

function linearRows(a, b, { n = 41, lo = -1000, hi = 1000, phase = () => "middlegame" } = {}) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        const cp = lo + (hi - lo) * (i / (n - 1));
        rows.push({ cp, sf: a * cp + b, phase: phase(cp) });
    }
    return rows;
}

test("global affine: recovers exact a/b from a noiseless linear relationship", () => {
    const rows = linearRows(0.6, 15);
    const params = fitGlobalAffine(rows);
    assert.ok(near(params.a, 0.6, 1e-9));
    assert.ok(near(params.b, 15, 1e-6));
    for (const r of rows) assert.ok(near(applyGlobalAffine(r.cp, params, 100000), r.sf, 1e-4));
});

test("global affine: output is clipped to +/-clipCp", () => {
    const params = { a: 2, b: 0 };
    assert.equal(applyGlobalAffine(900, params, 1000), 1000);
    assert.equal(applyGlobalAffine(-900, params, 1000), -1000);
    assert.equal(applyGlobalAffine(100, params, 1000), 200);
});

test("global affine: degenerate (all-identical cp) input falls back to identity-ish, never throws/NaNs", () => {
    const rows = [{ cp: 50, sf: 10 }, { cp: 50, sf: -30 }, { cp: 50, sf: 5 }];
    const params = fitGlobalAffine(rows);
    assert.ok(Number.isFinite(params.a));
    assert.ok(Number.isFinite(params.b));
});

test("phase affine: fits distinct a/b per phase and falls back to identity for a sparse phase", () => {
    const rows = [
        ...linearRows(2.0, 0, { n: 30, phase: () => "opening" }),
        ...linearRows(0.5, 20, { n: 30, phase: () => "middlegame" }),
        // endgame: fewer than the minimum-rows-per-phase safety threshold
        { cp: 100, sf: 999, phase: "endgame" },
        { cp: -100, sf: -999, phase: "endgame" },
    ];
    const params = fitPhaseAffine(rows);
    assert.ok(near(params.opening.a, 2.0, 1e-6));
    assert.ok(near(params.middlegame.a, 0.5, 1e-6));
    // sparse phase: identity fallback, not fit to the two noisy points
    assert.equal(params.endgame.a, 1);
    assert.equal(params.endgame.b, 0);
    assert.ok(near(applyPhaseAffine(100, "endgame", params, 100000), 100));
});

test("phase affine: unknown phase applies identity fallback", () => {
    const params = fitPhaseAffine(linearRows(1.5, 5, { n: 25 }));
    assert.ok(near(applyPhaseAffine(40, "unknownPhase", params, 100000), 40));
});

test("power compression: recovers p=1 on an exactly linear relation", () => {
    const rows = linearRows(0.5, 0, { n: 41 });
    const params = fitPowerCompression(rows);
    assert.ok(near(params.p, 1, 0.05));
    assert.ok(near(params.a, 0.5, 0.05));
});

test("power compression: is odd/symmetric (sign preserved) and monotonic in |cp|", () => {
    const params = { a: 2, p: 0.8 };
    assert.equal(applyPowerCompression(0, params, 1000), 0);
    assert.ok(applyPowerCompression(100, params, 1000) > 0);
    assert.equal(applyPowerCompression(-100, params, 1000), -applyPowerCompression(100, params, 1000));
    assert.ok(applyPowerCompression(200, params, 1000) > applyPowerCompression(100, params, 1000));
});

test("piecewise linear: monotonic non-decreasing knot values (isotonic pooling)", () => {
    // deliberately noisy/non-monotonic per-bin means
    const rows = [
        { cp: -1000, sf: -900 }, { cp: -500, sf: -520 }, { cp: -300, sf: -100 } /* violator */,
        { cp: -150, sf: -140 }, { cp: -75, sf: -60 }, { cp: -25, sf: -10 },
        { cp: 0, sf: 0 }, { cp: 25, sf: 10 }, { cp: 75, sf: 60 },
        { cp: 150, sf: 140 }, { cp: 300, sf: 90 } /* violator */, { cp: 500, sf: 520 }, { cp: 1000, sf: 900 },
    ];
    const params = fitPiecewiseLinear(rows, DEFAULT_KNOTS);
    for (let i = 1; i < params.values.length; i++) {
        assert.ok(params.values[i] >= params.values[i - 1] - 1e-9, `knot ${i} must be >= knot ${i - 1}`);
    }
});

test("piecewise linear: interpolates between knots and clamps flat beyond the outer knots", () => {
    const params = { knots: [-100, 0, 100], values: [-50, 0, 50] };
    assert.ok(near(applyPiecewiseLinear(50, params, 1000), 25));
    assert.ok(near(applyPiecewiseLinear(-50, params, 1000), -25));
    assert.equal(applyPiecewiseLinear(0, params, 1000), 0);
    assert.equal(applyPiecewiseLinear(5000, params, 1000), 50);   // flat extrapolation, then clipped
    assert.equal(applyPiecewiseLinear(-5000, params, 1000), -50);
});

test("all four transforms are deterministic (same input -> same output, repeated calls)", () => {
    const rows = linearRows(0.7, -10, { n: 60 });
    for (const [name, { fit, apply }] of Object.entries(TRANSFORMS)) {
        const p1 = fit(rows), p2 = fit(rows);
        assert.deepEqual(JSON.parse(JSON.stringify(p1)), JSON.parse(JSON.stringify(p2)), name + " fit must be deterministic");
        const out1 = apply(137, p1, 1000, "middlegame"), out2 = apply(137, p2, 1000, "middlegame");
        assert.equal(out1, out2, name + " apply must be deterministic");
    }
});

test("all four transforms respect the clip bound for extreme inputs", () => {
    const rows = linearRows(1, 0, { n: 40 });
    for (const [name, { fit, apply }] of Object.entries(TRANSFORMS)) {
        const params = fit(rows);
        const hi = apply(1e6, params, 1000, "endgame");
        const lo = apply(-1e6, params, 1000, "endgame");
        assert.ok(Math.abs(hi) <= 1000 + 1e-9, name + " must clip large positive input");
        assert.ok(Math.abs(lo) <= 1000 + 1e-9, name + " must clip large negative input");
    }
});

//======================================================
// Narrow, constrained phase-affine variants (refinement study:
// candidates A-F targeting the opening-intercept over-correction).
//======================================================

function mixedPhaseRows() {
    return [
        ...linearRows(0.15, 32, { n: 30, lo: -200, hi: 200, phase: () => "opening" }),
        ...linearRows(1.0, -12, { n: 30, phase: () => "middlegame" }),
        ...linearRows(1.2, 1, { n: 30, phase: () => "endgame" }),
    ];
}

test("Candidate A (zero opening intercept): keeps the fitted opening slope, zeroes only the intercept", () => {
    const rows = mixedPhaseRows();
    const original = fitPhaseAffine(rows);
    const a = zeroOpeningIntercept(original);
    assert.equal(a.opening.a, original.opening.a);
    assert.equal(a.opening.b, 0);
    assert.deepEqual(a.middlegame, original.middlegame);
    assert.deepEqual(a.endgame, original.endgame);
});

test("Candidate B (bounded opening intercept): grid search stays within [lo,hi] and keeps the original slope", () => {
    const rows = mixedPhaseRows();
    const original = fitPhaseAffine(rows);
    const b = fitBoundedOpeningIntercept(original, rows.filter((r) => r.phase === "opening"), { lo: -25, hi: 25, step: 5 });
    assert.equal(b.opening.a, original.opening.a);
    assert.ok(b.opening.b >= -25 - 1e-9 && b.opening.b <= 25 + 1e-9, "intercept must respect the grid bound");
    assert.deepEqual(b.middlegame, original.middlegame);
});

test("Candidate B: when the unconstrained intercept is within bounds, the grid recovers it (up to grid resolution)", () => {
    const rows = linearRows(0.5, 10, { n: 30, phase: () => "opening" });
    const original = { opening: fitGlobalAffine(rows), middlegame: { a: 1, b: 0 }, endgame: { a: 1, b: 0 } };
    const b = fitBoundedOpeningIntercept(original, rows, { lo: -25, hi: 25, step: 1 });
    assert.ok(Math.abs(b.opening.b - 10) <= 1, "grid should land within one step of the true intercept when it fits inside the bound");
});

test("Candidate C (shrink factor): 0 == candidate A, 1 == the original fit, intermediate values interpolate", () => {
    const rows = mixedPhaseRows();
    const original = fitPhaseAffine(rows);
    const shrunk0 = shrinkOpeningIntercept(original, 0);
    const shrunk1 = shrinkOpeningIntercept(original, 1);
    const shrunkHalf = shrinkOpeningIntercept(original, 0.5);
    assert.equal(shrunk0.opening.b, 0);
    assert.equal(shrunk1.opening.b, original.opening.b);
    assert.ok(near(shrunkHalf.opening.b, original.opening.b / 2));
});

test("Candidate D (slope-only): every phase intercept is exactly 0, slope re-derived under that constraint", () => {
    const rows = mixedPhaseRows();
    const d = fitPhaseSlopeOnly(rows);
    for (const phase of PHASES) assert.equal(d[phase].b, 0);
    assert.notEqual(d.opening.a, 0);
});

test("Candidate E (regularized): larger lambda pulls {a,b} toward {1,0}", () => {
    const rows = mixedPhaseRows();
    const weak = fitPhaseAffineRegularized(rows, 0.001);
    const strong = fitPhaseAffineRegularized(rows, 1000);
    // strong regularization should land much closer to the identity than weak
    const distWeak = Math.abs(weak.opening.a - 1) + Math.abs(weak.opening.b);
    const distStrong = Math.abs(strong.opening.a - 1) + Math.abs(strong.opening.b);
    assert.ok(distStrong < distWeak, "stronger lambda must move closer to the {a:1,b:0} identity prior");
});

test("Candidate F (blended opening): alpha=0 is raw passthrough in opening, alpha=1 is the full calibration, other phases untouched", () => {
    const rows = mixedPhaseRows();
    const params = fitPhaseAffine(rows);
    assert.ok(near(applyPhaseAffineBlended(50, "opening", params, 0, 100000), 50));
    assert.ok(near(applyPhaseAffineBlended(50, "opening", params, 1, 100000), applyPhaseAffine(50, "opening", params, 100000)));
    // middlegame/endgame are never blended -- always the full calibration regardless of alpha
    assert.ok(near(applyPhaseAffineBlended(50, "middlegame", params, 0, 100000), applyPhaseAffine(50, "middlegame", params, 100000)));
});

test("all constrained variants remain monotonic (non-negative fitted slope) on well-behaved synthetic data", () => {
    const rows = mixedPhaseRows();
    const original = fitPhaseAffine(rows);
    const variants = [
        zeroOpeningIntercept(original),
        fitBoundedOpeningIntercept(original, rows.filter((r) => r.phase === "opening")),
        shrinkOpeningIntercept(original, 0.5),
        fitPhaseSlopeOnly(rows),
        fitPhaseAffineRegularized(rows, 0.1),
    ];
    for (const v of variants) for (const phase of PHASES) assert.ok(v[phase].a >= 0, phase + " slope must stay non-negative");
});
