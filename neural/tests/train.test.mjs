//======================================================
// train.test.mjs — offline value-network proof: dataset,
// model, export/import, inference, and JS↔stored parity.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { encodeFen, FEATURE_DIM } from "../lib/features.mjs";
import { makeTarget, targetToCp, loadDataset, DEFAULT_TARGET } from "../train/dataset.mjs";
import { initModel, forward, exportModel, importModel } from "../train/model.mjs";
import { loadModel, evalFen } from "../train/infer.mjs";

const tmp = (n) => path.join(os.tmpdir(), `neural-train-${process.pid}-${n}`);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test("feature dimension is 781", () => {
    assert.equal(FEATURE_DIM, 781);
    assert.equal(encodeFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").every((i) => i >= 0 && i < 781), true);
});

test("target transforms: cp/tanh/wdl + inversion", () => {
    const cp = { scoreCpWhite: 200, mate: null, wdl: [300, 600, 100] };
    assert.equal(makeTarget(cp, { kind: "cp", clipCp: 1000 }), 200);
    assert.equal(makeTarget({ scoreCpWhite: 5000, mate: null }, { kind: "cp", clipCp: 1000 }), 1000); // clipped
    assert.ok(near(makeTarget(cp, { kind: "tanh", scale: 400, clipCp: 1000 }), Math.tanh(0.5)));
    // mate policy
    assert.equal(makeTarget({ mate: 3, scoreCpWhite: null }, { kind: "tanh", scale: 400, clipCp: 1000, mateValue: 0.999 }), 0.999);
    assert.equal(makeTarget({ mate: -1, scoreCpWhite: null }, { kind: "tanh", scale: 400, clipCp: 1000, mateValue: 0.999 }), -0.999);
    // wdl expected score
    assert.ok(near(makeTarget(cp, { kind: "wdl", scale: 400 }), (300 + 0.5 * 600) / 1000));
    // tanh inversion round-trips within the linear region
    assert.ok(near(targetToCp(Math.tanh(300 / 400), { kind: "tanh", scale: 400 }), 300, 1e-6));
});

test("model forward: linear = tanh(sum of active weights + b)", () => {
    const m = { kind: "linear", dim: 781, hidden: 0, outputActivation: "tanh", W: new Float64Array(781), b: 0 };
    m.W[5] = 0.5; m.W[10] = 0.5;
    assert.ok(near(forward(m, [5, 10]).o, Math.tanh(1.0)));
    m.b = 0.25;
    assert.ok(near(forward(m, [10]).o, Math.tanh(0.75)));
});

test("model forward: relu zeroes negative pre-activations", () => {
    const mk = (b1) => ({ kind: "mlp", dim: 781, hidden: 1, outputActivation: "tanh", W1: new Float64Array(781), b1: new Float64Array([b1]), W2: new Float64Array([1]), b2: 0 });
    assert.ok(near(forward(mk(-5), [0, 1, 2]).o, 0));          // pre=-5 -> relu 0 -> tanh(0)=0
    assert.ok(near(forward(mk(5), [0, 1, 2]).o, Math.tanh(5))); // pre=5 -> h=5 -> tanh(5)
});

test("export/import round trip preserves outputs", () => {
    const m = initModel({ dim: 781, hidden: 4, seed: 3, initScale: 0.2 });
    const m2 = importModel(JSON.parse(JSON.stringify(exportModel(m, { targetTransform: DEFAULT_TARGET }))));
    for (const idx of [[0, 64, 768], [5, 200, 400, 769, 772], encodeFen("8/5k2/8/8/8/8/3K4/6R1 w - - 0 1")]) {
        assert.ok(near(forward(m, idx).o, forward(m2, idx).o, 1e-12), "roundtrip idx " + idx);
    }
});

test("deterministic seed: same seed -> identical weights", () => {
    const a = initModel({ dim: 781, hidden: 8, seed: 42 });
    const b = initModel({ dim: 781, hidden: 8, seed: 42 });
    assert.deepEqual(Array.from(a.W1), Array.from(b.W1));
    assert.deepEqual(Array.from(a.W2), Array.from(b.W2));
    const c = initModel({ dim: 781, hidden: 8, seed: 43 });
    assert.notDeepEqual(Array.from(a.W1), Array.from(c.W1));
});

test("importModel rejects malformed models", () => {
    assert.throws(() => importModel({ featureDim: 100, kind: "linear", layers: { W: [], b: 0 } }), /featureDim/);
    assert.throws(() => importModel({ featureDim: 781, kind: "linear", layers: { W: [1, 2, 3], b: 0 } }), /W length/);
    assert.throws(() => importModel({ featureDim: 781, kind: "mlp", hidden: 4, layers: { W1: [1, 2, 3], b1: [0, 0, 0, 0], W2: [0, 0, 0, 0], b2: 0 } }), /W1 length/);
    assert.throws(() => importModel({ featureDim: 781, kind: "bogus", layers: {} }), /unknown kind/);
    assert.throws(() => importModel({ featureDim: 781, kind: "mlp", hidden: 2, layers: { W1: new Array(1562).fill(0), b1: [0], W2: [0, 0], b2: 0 } }), /b1 length/);
});

test("loadDataset preserves stored splits and never reads labels as features", () => {
    const p = tmp("ds.jsonl");
    const rec = (key, split, cp) => JSON.stringify({
        fen: "8/8/8/8/8/8/8/K6k w - - 0 1", positionKey: key,
        source: { file: "a.pgn", id: "d/a.pgn", gameIndex: 0, gameKey: "G" + key, ply: 10 },
        sideToMove: "w", gamePhase: "endgame", materialSignature: "K|k", result: "*", inCheck: false,
        coachClassicalCpWhite: 0, split,
        stockfish: { version: "Stockfish 18", scoreCpWhite: cp, mate: null, wdl: [10, 980, 10], bestMove: "a1a2", pv: ["a1a2"] },
        labelling: { scorePerspective: "white" },
    });
    fs.writeFileSync(p, [rec("A", "train", 100), rec("B", "val", -50), rec("C", "test", 0)].join("\n") + "\n");
    const { splits } = loadDataset(p, DEFAULT_TARGET);
    assert.equal(splits.train.length, 1);
    assert.equal(splits.val.length, 1);
    assert.equal(splits.test.length, 1);
    // features come only from the FEN (identical fen -> identical indices regardless of label)
    assert.deepEqual(splits.train[0].idx, encodeFen("8/8/8/8/8/8/8/K6k w - - 0 1"));
    fs.unlinkSync(p);
});

test("JS inference matches the committed parity fixture (JS↔stored, transitively JS↔Python)", () => {
    const fxDir = new URL("../train/fixtures/", import.meta.url);
    const parity = JSON.parse(fs.readFileSync(new URL("inference-parity.json", fxDir)));
    const loaded = loadModel(JSON.parse(fs.readFileSync(new URL("proof-model-fixture.json", fxDir))));
    let worst = 0;
    for (const c of parity.cases) worst = Math.max(worst, Math.abs(evalFen(loaded, c.fen) - c.out));
    assert.ok(worst <= parity.tolerance, `max|diff| ${worst} > tol ${parity.tolerance}`);
    assert.ok(parity.cases.length >= 27, "fixture should cover >= 27 positions");
});
