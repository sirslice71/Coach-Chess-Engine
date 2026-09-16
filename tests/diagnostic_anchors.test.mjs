import test from "node:test";
import assert from "node:assert/strict";

import {
    compareResultSets,
    loadAnchorSuite,
    runAnchorSearch
} from "../scripts/diagnostic-anchor-utils.mjs";
import { createEngineCore, moveToUci } from "../js/uci/uciengine.js";

const suite =
    await loadAnchorSuite();

test("diagnostic anchor suite has stable ids and required coverage", () => {

    assert.equal(suite.schemaVersion, 1);
    assert.equal(suite.baselineCommit, "87062e3");
    assert.ok(suite.anchors.length >= 30);

    const ids =
        suite.anchors.map(anchor => anchor.id);

    assert.equal(new Set(ids).size, ids.length);

    const requiredIds = [
        "early-minor-g44",
        "early-minor-g48",
        "early-minor-g58",
        "early-minor-g32",
        "early-minor-g56",
        "early-minor-g20",
        "sentinel-game8",
        "sentinel-game10",
        "sentinel-game4",
        "sentinel-queen-rook-mate",
        "sentinel-quiet-defense",
        "sentinel-promotion-race",
        "sentinel-attacking-conversion",
        "arena-shallowblue-3sec-rxa7",
        "arena-shallowblue-3sec-kb8",
        "arena-shallowblue-3sec-kd7",
        "arena-shallowblue-3sec-ka5",
        "arena-shallowblue-3sec-qxa6",
        "arena-shallowblue-5min-g4",
        "arena-shallowblue-5min-ree1",
        "arena-shallowblue-5min-rxh4",
        "arena-shallowblue-5min-rh2",
        "lucas-pawn-center-g13-i31",
        "lucas-pawn-center-g13-i38",
        "lucas-pawn-center-g13-i43",
        "lucas-pawn-center-g13-i58",
        "lucas-open-files-g2-i3",
        "lucas-open-files-g2-i4",
        "lucas-open-files-g2-i9",
        "lucas-open-files-g2-i12",
        "lucas-square-vacancy-g4-i40",
        "lucas-square-vacancy-g4-i73",
        "lucas-square-vacancy-g4-i75",
        "lucas-square-vacancy-g4-i96",
        "lucas-simplification-g10-i14",
        "lucas-simplification-g10-i35",
        "lucas-simplification-g10-i58",
        "lucas-simplification-g10-i66"
    ];

    for (const id of requiredIds) {
        assert.ok(ids.includes(id), `${id} is present`);
    }

});

test("all diagnostic anchors import and expected moves are legal", () => {

    for (const anchor of suite.anchors) {
        const engine =
            createEngineCore(anchor.fen);

        const legalMoves =
            engine.legalMoveGenerator
                .generateMoves()
                .map(moveToUci);

        assert.ok(
            legalMoves.length > 0,
            `${anchor.id} has at least one legal move`
        );

        for (const move of anchor.expected?.moves || []) {
            assert.ok(
                legalMoves.includes(move),
                `${anchor.id} expected move ${move} is legal`
            );
        }

        for (const move of anchor.reference?.moves || []) {
            assert.ok(
                legalMoves.includes(move),
                `${anchor.id} reference move ${move} is legal`
            );
        }
    }

});

test("single shallow anchor run produces deterministic stable fields", () => {

    const anchor =
        suite.anchors.find(candidate => candidate.id === "control-startpos");

    const result =
        runAnchorSearch(anchor, 1, { includeTiming: false });

    assert.equal(result.stable.id, "control-startpos");
    assert.equal(result.stable.fen, "startpos");
    assert.equal(result.stable.depth, 1);
    assert.equal(result.stable.requestedDepth, 1);
    assert.equal(result.stable.completedDepth, 1);
    assert.equal(typeof result.stable.bestMove, "string");
    assert.equal(typeof result.stable.score, "string");
    assert.equal(typeof result.stable.nodes, "number");
    assert.equal(typeof result.stable.qsearchEntries, "number");
    assert.ok(Array.isArray(result.stable.pv));
    assert.equal(result.elapsedMs, undefined);

});

test("search equivalence comparison distinguishes exact and functional drift", () => {

    const baseline = {
        results: [
            {
                id: "x",
                depth: 4,
                requestedDepth: 4,
                completedDepth: 4,
                bestMove: "e2e4",
                score: "0.10",
                nodes: 12,
                qsearchEntries: 7,
                pv: ["e2e4", "e7e5"]
            }
        ]
    };

    const candidate = {
        results: [
            {
                id: "x",
                depth: 4,
                requestedDepth: 4,
                completedDepth: 4,
                bestMove: "e2e4",
                score: "0.10",
                nodes: 13,
                qsearchEntries: 7,
                pv: ["e2e4", "e7e5"]
            }
        ]
    };

    assert.equal(
        compareResultSets(baseline, candidate, { level: "functional" }).ok,
        true
    );

    const exact =
        compareResultSets(baseline, candidate, { level: "exact-tree" });

    assert.equal(exact.ok, false);
    assert.equal(exact.differences[0].field, "nodes");

});

test("search equivalence comparison detects stable field mismatches", () => {

    const baseline = {
        results: [
            {
                id: "x",
                depth: 4,
                completedDepth: 4,
                bestMove: "e2e4",
                score: "0.10",
                nodes: 12,
                qsearchEntries: 7,
                pv: ["e2e4", "e7e5"],
                elapsedMs: 1
            }
        ]
    };

    const changed = field => ({
        results: [
            {
                ...baseline.results[0],
                ...field,
                elapsedMs: 999
            }
        ]
    });

    for (const field of [
        { bestMove: "d2d4" },
        { score: "0.11" },
        { completedDepth: 3 },
        { nodes: 13 },
        { qsearchEntries: 8 },
        { pv: ["e2e4"] }
    ]) {
        assert.equal(
            compareResultSets(baseline, changed(field), { level: "exact-tree" }).ok,
            false
        );
    }

    assert.equal(
        compareResultSets(baseline, changed({ elapsedMs: 999 }), { level: "exact-tree" }).ok,
        true
    );

});
