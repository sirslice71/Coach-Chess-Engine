//======================================================
// refine-phase-calibration.test.mjs — pure-logic unit tests for the
// phase-calibration refinement tool's structural gates and scorecard
// (Phases 4-5). No dataset/model/engine dependency.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { structuralGates, scoreCandidate, classify } from "../tools/refine-phase-calibration.mjs";

test("structuralGates: passes a well-formed non-negative-slope phase-affine params object", () => {
    const params = { opening: { a: 0.14, b: 25 }, middlegame: { a: 1.02, b: -11.7 }, endgame: { a: 1.24, b: 0.7 } };
    const g = structuralGates("test", params, { clampPct: 4.4 });
    assert.equal(g.negativeSlope, false);
    assert.equal(g.monotonic, true);
    assert.equal(g.pass, true);
});

test("structuralGates: rejects a negative slope in any phase", () => {
    const params = { opening: { a: -0.1, b: 0 }, middlegame: { a: 1, b: 0 }, endgame: { a: 1, b: 0 } };
    const g = structuralGates("test", params, { clampPct: 4 });
    assert.equal(g.negativeSlope, true);
    assert.equal(g.monotonic, false);
    assert.equal(g.pass, false);
});

test("structuralGates: rejects excessive clamp saturation even with valid slopes", () => {
    const params = { opening: { a: 1, b: 0 }, middlegame: { a: 1, b: 0 }, endgame: { a: 1, b: 0 } };
    const g = structuralGates("test", params, { clampPct: 25 }); // > the 20% ceiling
    assert.equal(g.clampSaturationOk, false);
    assert.equal(g.pass, false);
});

function fakeCandidateReport({ cpMAE, bias, openingCpMAE, endgameCpMAE, families }) {
    return {
        overall: { cpMAE, bias },
        byPhase: { opening: { n: 10, cpMAE: openingCpMAE }, middlegame: { n: 10, cpMAE: 100 }, endgame: { n: 10, cpMAE: endgameCpMAE } },
        bySourceFamily: families || {},
    };
}

test("scoreCandidate: a candidate that improves accuracy/density without regressions passes c1/c3/c4/c5/c6", () => {
    const rawLinear = fakeCandidateReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230, families: { fam1: { cpMAE: 190 } } });
    const classical = fakeCandidateReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeCandidateReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeCandidateReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200, families: { fam1: { cpMAE: 195 } } });
    const gates = { pass: true };
    const openingNearZero = { candidate: 25, classical: 22, raw: 29, original: 5 }; // candidate much closer to classical than either baseline
    const s = scoreCandidate("cand", cand, rawLinear, classical, original, gates, openingNearZero);
    assert.equal(s.c1.ok, true, "cpMAE materially better than raw linear");
    assert.equal(s.c3.ok, true, "opening density closes most of the original gap and beats raw");
    assert.equal(s.c4.ok, true, "no family regression");
    assert.equal(s.c5.ok, true, "no endgame regression");
    assert.equal(s.c6.ok, true, "bias within bound");
});

test("scoreCandidate: flags a family regression exceeding the relative threshold", () => {
    const rawLinear = fakeCandidateReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230, families: { fam1: { cpMAE: 190 } } });
    const classical = fakeCandidateReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeCandidateReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeCandidateReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200, families: { fam1: { cpMAE: 230 } } }); // +21% vs raw's 190
    const openingNearZero = { candidate: 25, classical: 22, raw: 29, original: 5 };
    const s = scoreCandidate("cand", cand, rawLinear, classical, original, { pass: true }, openingNearZero);
    assert.equal(s.c4.ok, false);
    assert.equal(s.c4.regressions.length, 1);
    assert.equal(s.c4.regressions[0].family, "fam1");
});

test("scoreCandidate: flags an endgame regression exceeding the relative threshold", () => {
    const rawLinear = fakeCandidateReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230 });
    const classical = fakeCandidateReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeCandidateReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeCandidateReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 260 }); // well beyond +5% of 230
    const openingNearZero = { candidate: 25, classical: 22, raw: 29, original: 5 };
    const s = scoreCandidate("cand", cand, rawLinear, classical, original, { pass: true }, openingNearZero);
    assert.equal(s.c5.ok, false);
});

test("scoreCandidate: rejects opening density that overshoots past classical without closing the original gap", () => {
    const rawLinear = fakeCandidateReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230 });
    const classical = fakeCandidateReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeCandidateReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeCandidateReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200 });
    // original deficit = |5-22| = 17; candidate deficit must be <= 8.5 AND <= raw's deficit (|29-22|=7) to pass
    const openingNearZero = { candidate: 40, classical: 22, raw: 29, original: 5 }; // candidate deficit = 18, worse than both
    const s = scoreCandidate("cand", cand, rawLinear, classical, original, { pass: true }, openingNearZero);
    assert.equal(s.c3.ok, false);
});

test("classify: returns D when nothing was selected and no near-miss preserved both gains", () => {
    const scorecard = { x: { rejectedByStructuralGate: true, passesAll: false } };
    const c = classify(null, scorecard);
    assert.equal(c.label, "D");
});

test("classify: returns A when a candidate was selected", () => {
    const c = classify("B_boundedOpeningIntercept", { B_boundedOpeningIntercept: { passesAll: true } });
    assert.equal(c.label, "A");
});
