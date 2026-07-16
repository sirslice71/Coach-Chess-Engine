//======================================================
// hybrid_eval.test.mjs
// EXPERIMENTAL, isolated evaluation-hybrid parity test. Not part of the
// production correctness suite. Requires COACH_HYBRID_MODEL_PATH to point
// at the accepted external linear model (never committed) -- if unset, all
// tests here are skipped with a clear reason rather than failing, since the
// model is intentionally kept external to the repository.
//
// Verifies, against tests/fixtures/hybrid-eval-parity.json (113 positions
// stratified across source family, phase, side to move, in-check,
// queenless, castling rights, en passant, mate/non-mate, and routed vs
// non-routed): zero routing mismatches, exact classical parity on routed
// positions (up to the documented scale-clamp), and exact reproducibility
// of the hybrid's own recorded output on non-routed positions.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelSet = !!process.env.COACH_HYBRID_MODEL_PATH;

async function loadHarness() {
    const { createEngineCore } = await import("../js/uci/uciengine.js");
    const { materialClass, isEndgamePhase, shouldRouteToClassical, calibrationPhase, applyCalibration } = await import("../js/engine/hybridEval.js");
    return { createEngineCore, materialClass, isEndgamePhase, shouldRouteToClassical, calibrationPhase, applyCalibration };
}

// Full precision, matching the vendored CALIBRATION constant in hybridEval.js
// (selected candidate "C_clamp_25"; see neural/CALIBRATION-CONSTRAINED-OPENING-REPORT.md).
const EXPECTED_CALIBRATION = {
    opening: { a: 0.14171033426246749, b: 25 },
    middlegame: { a: 1.0213814890315187, b: -11.690688475647447 },
    endgame: { a: 1.2395102995466445, b: 0.6780419486463245 },
};
const CLIP_CP = 1000;

test("hybrid routing rule is a pure function of material class + phase (no model needed)", async () => {
    const { materialClass, isEndgamePhase, shouldRouteToClassical } = await loadHarness();
    // K+P vs K -> pawn-only, phaseScore 0 -> endgame -> routed
    assert.equal(materialClass("4k3/8/8/8/8/8/4P3/4K3"), "pawn-only");
    assert.equal(isEndgamePhase("4k3/8/8/8/8/8/4P3/4K3"), true);
    assert.equal(shouldRouteToClassical("4k3/8/8/8/8/8/4P3/4K3"), true);
    // start position -> mixed, not endgame -> not routed
    assert.equal(shouldRouteToClassical("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"), false);
    // a single minor + rook each side, no queen, phaseScore = 1*2+2*1=... let's use
    // a clean bare rook ending: K+R vs K+R, minors=0, phaseScore = 2+2=4 <= 6 -> endgame, class "rook" -> routed
    assert.equal(materialClass("4k2r/8/8/8/8/8/8/R3K3"), "rook");
    assert.equal(shouldRouteToClassical("4k2r/8/8/8/8/8/8/R3K3"), true);
    // rule is symmetric / colour-independent (material counts both sides together)
    assert.equal(materialClass("4k3/8/8/8/8/8/4p3/4K3"), materialClass("4k3/8/8/8/8/8/4P3/4K3"));
});

test("hybrid evaluate() falls back to pure classical when no model is configured", async (t) => {
    if (modelSet) return t.skip("COACH_HYBRID_MODEL_PATH is set in this run; covered by the parity tests below");
    const { createEngineCore } = await loadHarness();
    const core = createEngineCore("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    assert.equal(core.search.hybridEvaluator, null, "default construction must not build a hybrid evaluator");
    assert.equal(core.search.whiteRelativeEval(), core.evaluation.evaluate().total);
});

// The fixture's `expectedHybridOutput` was recorded against the RAW
// (pre-calibration) hybrid on the original experiment/neural-hybrid branch.
// On this calibrated branch: classical-routed rows must still match it
// exactly (calibration never touches the classical route); neural-routed
// rows must match applyCalibration(<fixture's stored raw value>, ...) --
// i.e. the calibrated output is a deterministic function of the SAME raw
// value the fixture already pins, so this remains a true parity check
// against the committed fixture, not a freshly-invented expectation.
test("113-fixture stratified parity: zero routing mismatches, classical exactness, exact calibration parity", async (t) => {
    if (!modelSet) return t.skip("COACH_HYBRID_MODEL_PATH not set -- external model required for this check");
    const { createEngineCore, shouldRouteToClassical, calibrationPhase, applyCalibration } = await loadHarness();
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "hybrid-eval-parity.json"), "utf8"));
    assert.ok(fx.fixtures.length >= 100, "fixture set must cover at least 100 positions");

    let routingMismatches = 0, classicalMismatches = 0, neuralRawMismatches = 0, calibrationMismatches = 0;
    const byRoute = { classical: 0, neural: 0 };
    for (const f of fx.fixtures) {
        const fields = f.fen.trim().split(/\s+/);
        const placement = fields[0];
        const fullmove = fields[5] !== undefined ? Number(fields[5]) : 1;
        const actualRoute = shouldRouteToClassical(placement) ? "classical" : "neural";
        if (actualRoute !== f.expectedRoute) routingMismatches++;
        byRoute[actualRoute]++;

        const core = createEngineCore(f.fen);
        const standaloneClassical = core.evaluation.evaluate().total;
        if (standaloneClassical !== f.standaloneClassical) classicalMismatches++;

        core.search.hybridEvaluator.diagnosticsEnabled = true;
        const hybridOut = core.search.whiteRelativeEval();
        const d = core.search.hybridEvaluator.lastDiagnostics;

        if (actualRoute === "classical") {
            if (hybridOut !== f.expectedHybridOutput) classicalMismatches++;
        } else {
            // raw neural forward pass is untouched by this change
            if (d.neuralRaw !== f.expectedHybridOutput) neuralRawMismatches++;
            const expectedCalibrated = applyCalibration(f.expectedHybridOutput, calibrationPhase(placement, fullmove), CLIP_CP);
            if (hybridOut !== expectedCalibrated) calibrationMismatches++;
        }
    }
    console.log(`routed=${byRoute.classical} non-routed=${byRoute.neural}`);
    assert.equal(routingMismatches, 0, "routing decision must never disagree with the recorded expectation");
    assert.equal(classicalMismatches, 0, "classical-routed output must be byte-exact vs the fixture (calibration never touches this route)");
    assert.equal(neuralRawMismatches, 0, "raw neural forward pass must exactly reproduce the fixture's recorded value (unchanged by calibration)");
    assert.equal(calibrationMismatches, 0, "calibrated output must exactly equal applyCalibration() of the fixture's raw value");
});

test("calibration equation: opening uses the fitted slope and the +25 clamped intercept (not the unconstrained +32.12)", async () => {
    const { applyCalibration } = await loadHarness();
    const { a, b } = EXPECTED_CALIBRATION.opening;
    assert.equal(b, 25, "opening intercept must be the clamped +25, not the unconstrained fit");
    for (const cp of [-500, -100, 0, 42, 300, 900]) {
        const expected = Math.max(-CLIP_CP, Math.min(CLIP_CP, a * cp + b));
        assert.equal(applyCalibration(cp, "opening", CLIP_CP), expected);
    }
});

test("calibration equation: middlegame uses its unconstrained fitted slope/intercept verbatim", async () => {
    const { applyCalibration } = await loadHarness();
    const { a, b } = EXPECTED_CALIBRATION.middlegame;
    for (const cp of [-500, -100, 0, 42, 300, 900]) {
        const expected = Math.max(-CLIP_CP, Math.min(CLIP_CP, a * cp + b));
        assert.equal(applyCalibration(cp, "middlegame", CLIP_CP), expected);
    }
});

test("calibration equation: endgame uses its unconstrained fitted slope/intercept verbatim", async () => {
    const { applyCalibration } = await loadHarness();
    const { a, b } = EXPECTED_CALIBRATION.endgame;
    for (const cp of [-500, -100, 0, 42, 300, 900]) {
        const expected = Math.max(-CLIP_CP, Math.min(CLIP_CP, a * cp + b));
        assert.equal(applyCalibration(cp, "endgame", CLIP_CP), expected);
    }
});

test("calibrationPhase: byte-for-byte match to neural/lib/position.mjs gamePhase() thresholds", async () => {
    const { calibrationPhase } = await loadHarness();
    // endgame: phaseScore <= 6 regardless of fullmove
    assert.equal(calibrationPhase("4k3/8/8/8/8/8/4P3/4K3", 40), "endgame");
    // opening: phaseScore >= 22 AND fullmove <= 10
    assert.equal(calibrationPhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", 1), "opening");
    // same material, but fullmove > 10 -> falls through to middlegame
    assert.equal(calibrationPhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", 11), "middlegame");
    // moderate material, not endgame, not opening-eligible -> middlegame
    assert.equal(calibrationPhase("r1bqk2r/ppp2ppp/2n2n2/3p4/1b1P4/2N1PN2/PP3PPP/R1BQKB1R", 20), "middlegame");
});

test("sign symmetry: calibration is a pure affine map about its own zero-point (odd deviation, away from the clip boundary)", async () => {
    const { applyCalibration } = await loadHarness();
    for (const phase of ["opening", "middlegame", "endgame"]) {
        const zero = applyCalibration(0, phase, CLIP_CP);
        for (const cp of [10, 50, 150, 400]) {
            const up = applyCalibration(cp, phase, CLIP_CP) - zero;
            const down = applyCalibration(-cp, phase, CLIP_CP) - zero;
            assert.ok(Math.abs(up + down) < 1e-9, `${phase} deviation from its own zero-point must be odd/symmetric at cp=${cp}`);
        }
    }
});

test("monotonicity: calibrated output is non-decreasing in raw cp for every phase", async () => {
    const { applyCalibration } = await loadHarness();
    for (const phase of ["opening", "middlegame", "endgame"]) {
        let prev = -Infinity;
        for (let cp = -1000; cp <= 1000; cp += 25) {
            const v = applyCalibration(cp, phase, CLIP_CP);
            assert.ok(v >= prev - 1e-9, `${phase} must be monotonic non-decreasing at cp=${cp}`);
            prev = v;
        }
    }
});

test("diagnostics: raw and calibrated neural scores are both visible and generally distinct; classicalRaw is null on the neural route", async (t) => {
    if (!modelSet) return t.skip("COACH_HYBRID_MODEL_PATH not set -- external model required for this check");
    const { createEngineCore } = await loadHarness();
    // start position -> non-endgame -> neural route
    const core = createEngineCore("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    core.search.hybridEvaluator.diagnosticsEnabled = true;
    const out = core.search.whiteRelativeEval();
    const d = core.search.hybridEvaluator.lastDiagnostics;
    assert.equal(d.route, "neural");
    assert.equal(typeof d.neuralRaw, "number");
    assert.equal(typeof d.neuralCalibrated, "number");
    assert.equal(d.classicalRaw, null, "classical branch must not run on the neural route");
    assert.equal(d.hybridOutput, d.neuralCalibrated, "the returned value must be the calibrated score, not the raw score");
    assert.equal(out, d.hybridOutput);
});

test("routed classical positions are unaffected by calibration: output equals clip(standalone classical)", async (t) => {
    if (!modelSet) return t.skip("COACH_HYBRID_MODEL_PATH not set -- external model required for this check");
    const { createEngineCore } = await loadHarness();
    // bare K+P vs K -> pawn-only, endgame -> routed to classical
    const core = createEngineCore("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    core.search.hybridEvaluator.diagnosticsEnabled = true;
    const out = core.search.whiteRelativeEval();
    const d = core.search.hybridEvaluator.lastDiagnostics;
    assert.equal(d.route, "classical");
    assert.equal(d.neuralRaw, null);
    assert.equal(d.neuralCalibrated, null);
    const expected = Math.max(-CLIP_CP, Math.min(CLIP_CP, core.evaluation.evaluate().total));
    assert.equal(out, expected);
});

test("bad-model fallback is unaffected by the calibration change: evaluate() still falls back to pure classical", async () => {
    const { createEngineCore } = await import("../js/uci/uciengine.js");
    // Constructing a core WITHOUT COACH_HYBRID_MODEL_PATH set in this process
    // env exercises the same "no model" path exercised by the no-model test
    // above; hybridEvaluator itself is only ever constructed when the env
    // var is set (see js/uci/uciengine.js), so absence of the var is the
    // fallback path this test pins.
    const savedPath = process.env.COACH_HYBRID_MODEL_PATH;
    delete process.env.COACH_HYBRID_MODEL_PATH;
    try {
        const core = createEngineCore("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert.equal(core.search.hybridEvaluator, null);
        assert.equal(core.search.whiteRelativeEval(), core.evaluation.evaluate().total);
    } finally {
        if (savedPath !== undefined) process.env.COACH_HYBRID_MODEL_PATH = savedPath;
    }
});

test("deterministic output: repeated evaluation of the same position yields byte-identical raw and calibrated scores", async (t) => {
    if (!modelSet) return t.skip("COACH_HYBRID_MODEL_PATH not set -- external model required for this check");
    const { createEngineCore } = await loadHarness();
    const fen = "r2qk2r/ppp2ppp/2n1bn2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 1";
    const results = [];
    for (let i = 0; i < 5; i++) {
        const core = createEngineCore(fen);
        core.search.hybridEvaluator.diagnosticsEnabled = true;
        const out = core.search.whiteRelativeEval();
        results.push({ out, raw: core.search.hybridEvaluator.lastDiagnostics.neuralRaw });
    }
    for (const r of results) { assert.equal(r.out, results[0].out); assert.equal(r.raw, results[0].raw); }
});

test("mirrored positions route identically regardless of colour (label-independent, symmetric rule)", async () => {
    const { shouldRouteToClassical } = await loadHarness();
    const pairs = [
        ["8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "8/8/8/4K3/8/8/4p3/4k3 b - - 0 1"],
        ["4k2r/8/8/8/8/8/8/R3K3 w - - 0 1", "r3k3/8/8/8/8/8/8/4K2R b - - 0 1"],
    ];
    for (const [a, b] of pairs) {
        assert.equal(shouldRouteToClassical(a.split(" ")[0]), shouldRouteToClassical(b.split(" ")[0]));
    }
});
