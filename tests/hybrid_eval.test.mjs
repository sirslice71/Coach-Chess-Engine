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
    const { materialClass, isEndgamePhase, shouldRouteToClassical } = await import("../js/engine/hybridEval.js");
    return { createEngineCore, materialClass, isEndgamePhase, shouldRouteToClassical };
}

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

test("113-fixture stratified parity: zero routing mismatches, classical exactness, neural reproducibility", async (t) => {
    if (!modelSet) return t.skip("COACH_HYBRID_MODEL_PATH not set -- external model required for this check");
    const { createEngineCore, materialClass: mc, isEndgamePhase, shouldRouteToClassical } = await loadHarness();
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "hybrid-eval-parity.json"), "utf8"));
    assert.ok(fx.fixtures.length >= 100, "fixture set must cover at least 100 positions");

    let routingMismatches = 0, classicalMismatches = 0, neuralMismatches = 0;
    const byRoute = { classical: 0, neural: 0 };
    for (const f of fx.fixtures) {
        const placement = f.fen.split(" ")[0];
        const actualRoute = shouldRouteToClassical(placement) ? "classical" : "neural";
        if (actualRoute !== f.expectedRoute) routingMismatches++;
        byRoute[actualRoute]++;

        const core = createEngineCore(f.fen);
        const standaloneClassical = core.evaluation.evaluate().total;
        // classical parity is exact regardless of route (evaluation.js is untouched)
        if (standaloneClassical !== f.standaloneClassical) classicalMismatches++;

        const hybridOut = core.search.whiteRelativeEval();
        if (hybridOut !== f.expectedHybridOutput) neuralMismatches++;
    }
    console.log(`routed=${byRoute.classical} non-routed=${byRoute.neural}`);
    assert.equal(routingMismatches, 0, "routing decision must never disagree with the recorded expectation");
    assert.equal(classicalMismatches, 0, "standalone classical evaluation must be byte-exact vs the fixture (evaluation.js untouched)");
    assert.equal(neuralMismatches, 0, "hybrid output must exactly reproduce the recorded expectation (deterministic model + encoder)");
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
