//======================================================
// constrain-opening-calibration.test.mjs — pure-logic unit tests for
// the constrained-opening-calibration tool's scorecard (6 criteria),
// extended distribution bands, paired volatility bootstrap, and
// classification. No dataset/model/engine dependency.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { extendedDistribution, scoreCandidate, pairedVolatilityBootstrap, classifyResult } from "../tools/constrain-opening-calibration.mjs";

test("extendedDistribution: computes +/-10/25/50 bands, beyond100/300, and clamp rate", () => {
    const values = [0, 5, -8, 20, -30, 150, -400, 1000, -1000];
    const d = extendedDistribution(values, 1000);
    assert.equal(d.n, 9);
    assert.equal(d.nearZero10, +(100 * 3 / 9).toFixed(1));   // 0, 5, -8
    assert.equal(d.nearZero25, +(100 * 4 / 9).toFixed(1));   // + 20
    assert.equal(d.nearZero50, +(100 * 5 / 9).toFixed(1));   // + -30 (|30|<=50)
    assert.equal(d.clampPct, +(100 * 2 / 9).toFixed(1));     // +/-1000
});

test("extendedDistribution: returns null for an empty set", () => {
    assert.equal(extendedDistribution([], 1000), null);
});

function fakeReport({ cpMAE, bias, openingCpMAE, endgameCpMAE, families }) {
    return { overall: { cpMAE, bias }, byPhase: { opening: { n: 10, cpMAE: openingCpMAE }, middlegame: { n: 10, cpMAE: 100 }, endgame: { n: 10, cpMAE: endgameCpMAE } }, bySourceFamily: families || {} };
}

test("scoreCandidate: passes when accuracy/volatility/density/family/endgame/gates are all healthy", () => {
    const rawLinear = fakeReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230, families: { f1: { cpMAE: 190 } } });
    const classical = fakeReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200, families: { f1: { cpMAE: 195 } } });
    const s = scoreCandidate("c", cand, rawLinear, classical, original, { pass: true },
        { candidate: 25, classical: 22, raw: 29, original: 5 },
        { candidate: 74, raw: 90 }); // 17.8% reduction, clears the 15% bar
    assert.equal(s.c1.ok, true); assert.equal(s.c2.ok, true); assert.equal(s.c3.ok, true);
    assert.equal(s.c4.ok, true); assert.equal(s.c5.ok, true); assert.equal(s.c6.ok, true);
    assert.equal(s.passesAll, true);
});

test("scoreCandidate: c2 fails when volatility reduction is below the 15% bar", () => {
    const rawLinear = fakeReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230 });
    const classical = fakeReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200 });
    const s = scoreCandidate("c", cand, rawLinear, classical, original, { pass: true },
        { candidate: 25, classical: 22, raw: 29, original: 5 },
        { candidate: 88, raw: 90 }); // only 2.2% reduction
    assert.equal(s.c2.ok, false);
    assert.equal(s.passesAll, false);
});

test("scoreCandidate: c6 fails when the structural gate itself failed", () => {
    const rawLinear = fakeReport({ cpMAE: 200, bias: 8, openingCpMAE: 55, endgameCpMAE: 230 });
    const classical = fakeReport({ cpMAE: 240, bias: 23, openingCpMAE: 70, endgameCpMAE: 235 });
    const original = fakeReport({ cpMAE: 185, bias: -5, openingCpMAE: 38, endgameCpMAE: 200 });
    const cand = fakeReport({ cpMAE: 183, bias: -1, openingCpMAE: 38, endgameCpMAE: 200 });
    const s = scoreCandidate("c", cand, rawLinear, classical, original, { pass: false },
        { candidate: 25, classical: 22, raw: 29, original: 5 },
        { candidate: 74, raw: 90 });
    assert.equal(s.c6.ok, false);
    assert.equal(s.passesAll, false);
});

test("pairedVolatilityBootstrap: a candidate with uniformly smaller |delta| yields a negative CI (real reduction)", () => {
    const raw = []; const cand = [];
    for (let i = 0; i < 500; i++) { const v = (i % 50) - 25; raw.push(v * 2); cand.push(v); } // candidate deltas are half the magnitude
    const ci = pairedVolatilityBootstrap(raw, cand, 500, 42);
    assert.ok(ci.hi < 0, "the whole CI should sit below zero when the candidate is consistently less volatile");
});

test("pairedVolatilityBootstrap: identical arrays give a CI centered on zero", () => {
    const arr = Array.from({ length: 200 }, (_, i) => (i % 40) - 20);
    const ci = pairedVolatilityBootstrap(arr, arr, 500, 7);
    assert.ok(Math.abs(ci.median) < 1e-6);
});

test("classifyResult: returns A when a candidate was selected", () => {
    const c = classifyResult("C_clamp_25", { C_clamp_25: { passesAll: true } });
    assert.equal(c.label, "A");
});

test("classifyResult: returns D when nothing passed and no candidate kept both accuracy and volatility", () => {
    const scorecard = { x: { c1: { ok: false }, c2: { ok: false } } };
    assert.equal(classifyResult(null, scorecard).label, "D");
});

test("classifyResult: returns B when near-misses all fail the same single remaining gate", () => {
    const scorecard = {
        x: { c1: { ok: true }, c2: { ok: true }, c3: { ok: false }, c4: { ok: true }, c5: { ok: true }, c6: { ok: true } },
        y: { c1: { ok: true }, c2: { ok: true }, c3: { ok: false }, c4: { ok: true }, c5: { ok: true }, c6: { ok: true } },
    };
    assert.equal(classifyResult(null, scorecard).label, "B");
});

test("classifyResult: returns C when near-misses fail different gates", () => {
    const scorecard = {
        x: { c1: { ok: true }, c2: { ok: true }, c3: { ok: false }, c4: { ok: true }, c5: { ok: true }, c6: { ok: true } },
        y: { c1: { ok: true }, c2: { ok: true }, c3: { ok: true }, c4: { ok: false }, c5: { ok: true }, c6: { ok: true } },
    };
    assert.equal(classifyResult(null, scorecard).label, "C");
});
