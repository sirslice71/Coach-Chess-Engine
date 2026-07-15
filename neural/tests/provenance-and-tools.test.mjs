//======================================================
// provenance-and-tools.test.mjs
// Tests for source-provenance / gameKey-authoritative split
// validation and the read-only analyze-dataset tool.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

import { sourceIdFor, normalizeSep } from "../extract-positions.mjs";
import { splitIntegrity } from "../validate-dataset.mjs";
import { analyzeDataset, stats, pearson, spearman } from "../tools/analyze-dataset.mjs";

const tmp = (name) => path.join(os.tmpdir(), `neural-prov-${process.pid}-${name}`);

// minimal valid record builder
let seq = 0;
function mk(o = {}) {
    seq++;
    return {
        fen: o.fen ?? "8/8/8/8/8/8/8/K6k w - - 0 1",
        positionKey: o.positionKey ?? ("K" + seq),
        source: o.source ?? { file: o.file ?? "a.pgn", id: o.id ?? "dir/a.pgn", gameIndex: o.gameIndex ?? 0, gameKey: o.gameKey ?? "GK0", ply: o.ply ?? 10 },
        sideToMove: o.stm ?? "w",
        gamePhase: o.phase ?? "middlegame",
        materialSignature: o.mat ?? "K|k",
        result: o.result ?? "*",
        inCheck: o.inCheck ?? false,
        coachClassicalCpWhite: o.coach ?? 0,
        split: o.split ?? "train",
        stockfish: o.stockfish === null ? null : (o.stockfish ?? { version: "Stockfish 18", depth: 10, seldepth: 15, nodes: 50000, scoreCpWhite: o.cp ?? 0, mate: o.mate ?? null, wdl: [100, 800, 100], bestMove: "a1a2", pv: ["a1a2"], timeMs: 1 }),
        labelling: o.labelling === null ? null : (o.labelling ?? { engine: "stockfish", version: "Stockfish 18", nodesLimit: 50000, depthLimit: null, hash: 64, threads: 1, multipv: 1, showWDL: true, hashResetPerPosition: true, scorePerspective: "white", labelledAt: "t" }),
    };
}

// ---------- provenance: source id ----------
test("sourceIdFor: same basename in different dirs -> distinct ids, '/'-normalized, no root/absolute path", () => {
    const root = "C:\\data\\pgns";
    const a = sourceIdFor("C:\\data\\pgns\\Coach AB\\baseline.pgn", root);
    const b = sourceIdFor("C:\\data\\pgns\\Coach Null AB\\baseline.pgn", root);
    assert.equal(a, "Coach AB/baseline.pgn");
    assert.equal(b, "Coach Null AB/baseline.pgn");
    assert.notEqual(a, b);
    assert.ok(!a.includes("\\") && !b.includes("\\"), "separators normalized to /");
    assert.ok(!a.includes("C:") && !a.includes("data"), "no absolute path / root retained");
    // deterministic
    assert.equal(a, sourceIdFor("C:\\data\\pgns\\Coach AB\\baseline.pgn", root));
});

test("sourceIdFor: fallback without root uses <parentDir>/<basename>; normalizeSep", () => {
    assert.equal(sourceIdFor("C:\\x\\Coach AB\\g.pgn", null), "Coach AB/g.pgn");
    assert.equal(normalizeSep("a\\b\\c"), "a/b/c");
    // path outside root falls back rather than emitting '..'
    const id = sourceIdFor("C:\\other\\g.pgn", "C:\\root");
    assert.ok(!id.startsWith(".."), id);
});

// ---------- splitIntegrity (gameKey authoritative) ----------
test("splitIntegrity: same gameKey, one split -> clean & authoritative", () => {
    const recs = [mk({ gameKey: "G1", split: "train" }), mk({ gameKey: "G1", split: "train" })];
    const r = splitIntegrity(recs);
    assert.equal(r.authoritative, true);
    assert.equal(r.failures.length, 0);
    assert.equal(r.gameLeak, 0);
    assert.equal(r.distinctGames, 1);
});

test("splitIntegrity: same gameKey spanning two splits -> failure", () => {
    const recs = [mk({ gameKey: "G1", split: "train" }), mk({ gameKey: "G1", split: "val" })];
    const r = splitIntegrity(recs);
    assert.equal(r.gameLeak, 1);
    assert.ok(r.failures.some(f => f.msg.includes("game spans multiple splits")));
});

test("splitIntegrity: different gameKeys sharing basename+gameIndex -> NO false failure (the fix)", () => {
    // Two DIFFERENT games that collide on basename+index but have distinct gameKeys.
    const recs = [
        mk({ file: "baseline.pgn", id: "Coach AB/baseline.pgn", gameIndex: 11, gameKey: "76d2bfbd", split: "train" }),
        mk({ file: "baseline.pgn", id: "Coach Null AB/baseline.pgn", gameIndex: 11, gameKey: "aba3baf9", split: "val" }),
    ];
    const r = splitIntegrity(recs);
    assert.equal(r.gameLeak, 0, "distinct gameKeys must not be reported as leakage");
    assert.equal(r.failures.length, 0);
    assert.equal(r.distinctGames, 2);
});

test("splitIntegrity: duplicate positionKey across splits -> failure", () => {
    const recs = [mk({ positionKey: "DUP", gameKey: "G1", split: "train" }), mk({ positionKey: "DUP", gameKey: "G2", split: "test" })];
    const r = splitIntegrity(recs);
    assert.ok(r.failures.some(f => f.msg === "positionKey occurs in multiple splits"));
    assert.ok(r.failures.some(f => f.msg === "duplicate positionKey"));
});

test("splitIntegrity: legacy dataset (no gameKey) with basename collision -> WARNING, not failure", () => {
    const recs = [
        mk({ source: { file: "baseline.pgn", game: 11, ply: 10 }, split: "train" }),
        mk({ source: { file: "baseline.pgn", game: 11, ply: 20 }, split: "val" }),
    ];
    const r = splitIntegrity(recs);
    assert.equal(r.authoritative, false);
    assert.equal(r.failures.length, 0, "legacy leakage is a warning, not a failure");
    assert.ok(r.warnings.some(w => w.includes("LEGACY") || w.includes("proxy")));
});

test("splitIntegrity: missing new-format provenance fields -> failure", () => {
    const recs = [mk({ gameKey: "G1" }), mk({ source: { file: "a.pgn", gameIndex: 0, ply: 5 } /* no id/gameKey */ })];
    const r = splitIntegrity(recs);
    assert.ok(r.failures.some(f => f.msg === "missing source.gameKey"));
    assert.ok(r.failures.some(f => f.msg === "missing source.id"));
});

// ---------- analyze tool math ----------
test("stats: known array", () => {
    const s = stats([1, 2, 3, 4, 5]);
    assert.equal(s.n, 5); assert.equal(s.mean, 3); assert.equal(s.median, 3);
    assert.equal(s.min, 1); assert.equal(s.max, 5); assert.equal(s.p25, 2); assert.equal(s.p75, 4);
});

test("pearson: perfect +/- correlation", () => {
    assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
    assert.equal(pearson([1, 2, 3], [6, 4, 2]), -1);
    assert.equal(spearman([1, 2, 3, 4], [1, 2, 3, 4]), 1);
});

// ---------- analyzeDataset ----------
test("analyzeDataset: exact counts, mate counts, basename collision, leakage true/false", () => {
    const recs = [
        mk({ positionKey: "A", gameKey: "G1", split: "train", cp: 50, coach: 40, file: "x.pgn", id: "d1/x.pgn" }),
        mk({ positionKey: "B", gameKey: "G1", split: "train", cp: -30, coach: -10, file: "x.pgn", id: "d1/x.pgn" }),
        mk({ positionKey: "C", gameKey: "G2", split: "val", mate: 2, cp: null, file: "x.pgn", id: "d2/x.pgn" }), // basename collision d1 vs d2
        mk({ positionKey: "D", gameKey: "G3", split: "test", mate: -1, cp: null, file: "y.pgn", id: "d1/y.pgn" }),
    ];
    const a = analyzeDataset(recs);
    assert.equal(a.integrity.recordCount, 4);
    assert.equal(a.integrity.uniquePositionKeys, 4);
    assert.equal(a.integrity.duplicateKeys, 0);
    assert.equal(a.integrity.distinctGameKeys, 3);
    assert.equal(a.integrity.gameLevelLeakageByGameKey, 0);
    assert.equal(a.scoreDistribution.mate.total, 2);
    assert.equal(a.scoreDistribution.mate.whiteMating, 1);
    assert.equal(a.scoreDistribution.mate.blackMating, 1);
    // basename "x.pgn" is shared by ids d1/x.pgn and d2/x.pgn -> collision reported (allowed)
    assert.equal(a.provenance.basenameCollisions.length, 1);
    assert.equal(a.provenance.basenameCollisions[0].basename, "x.pgn");
});

test("analyzeDataset: detects true gameKey leakage; avoids basename false-positive", () => {
    const leak = analyzeDataset([mk({ positionKey: "A", gameKey: "G1", split: "train" }), mk({ positionKey: "B", gameKey: "G1", split: "val" })]);
    assert.equal(leak.integrity.gameLevelLeakageByGameKey, 1);
    const noLeak = analyzeDataset([
        mk({ positionKey: "A", file: "b.pgn", id: "d1/b.pgn", gameIndex: 5, gameKey: "GA", split: "train" }),
        mk({ positionKey: "B", file: "b.pgn", id: "d2/b.pgn", gameIndex: 5, gameKey: "GB", split: "val" }),
    ]);
    assert.equal(noLeak.integrity.gameLevelLeakageByGameKey, 0);
});

test("analyzeDataset: coachVsStockfish pearson on a known series", () => {
    const recs = [
        mk({ positionKey: "A", gameKey: "G1", coach: 100, cp: 100 }),
        mk({ positionKey: "B", gameKey: "G2", coach: 200, cp: 200 }),
        mk({ positionKey: "C", gameKey: "G3", coach: 300, cp: 300 }),
    ];
    const a = analyzeDataset(recs);
    assert.equal(a.coachVsStockfish.overall.n, 3);
    assert.equal(a.coachVsStockfish.overall.MAE, 0);
    assert.equal(a.coachVsStockfish.overall.pearson, 1);
});

test("analyzeDataset: JSON report is deterministic", () => {
    const build = () => [
        mk({ positionKey: "A", gameKey: "G1", split: "train", cp: 10, coach: 5 }),
        mk({ positionKey: "B", gameKey: "G2", split: "val", cp: -40, coach: -20 }),
    ];
    seq = 0; const a1 = JSON.stringify(analyzeDataset(build()));
    seq = 0; const a2 = JSON.stringify(analyzeDataset(build()));
    assert.equal(a1, a2);
});

test("analyze read path leaves the input file byte-identical", () => {
    const p = tmp("in.jsonl");
    const recs = [mk({ positionKey: "A", gameKey: "G1" }), mk({ positionKey: "B", gameKey: "G2" })];
    fs.writeFileSync(p, recs.map(r => JSON.stringify(r)).join("\n") + "\n");
    const before = fs.readFileSync(p);
    const parsed = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    analyzeDataset(parsed);
    const after = fs.readFileSync(p);
    assert.ok(before.equals(after), "input file must not be modified by analysis");
    fs.unlinkSync(p);
});
