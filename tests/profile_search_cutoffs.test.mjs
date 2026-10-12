import test from "node:test";
import assert from "node:assert/strict";

import {
    instrumentSearch,
    parseArgs
} from "../tools/profile-search-cutoffs.mjs";

test("search cutoff profiler parses focused corpus options", () => {
    const args = parseArgs([
        "--corpus", "positions.json",
        "--classification", "all",
        "--depth", "8",
        "--max-positions", "3",
        "--out", "profile.json"
    ]);

    assert.deepEqual(args, {
        corpus: "positions.json",
        classification: "all",
        depth: 8,
        maxPositions: 3,
        out: "profile.json",
        help: false
    });
});

test("search cutoff profiler preserves scores and records cold first-move cutoffs", () => {
    const move = {
        seeScore: 25,
        isCapture: () => true
    };
    const unusedMove = {
        seeScore: 0,
        isCapture: () => false
    };
    const search = {
        board: {
            isInCheck: () => false
        },
        tt: {
            probe: () => null
        },
        createMovePicker() {
            let used = false;

            return {
                next() {
                    if (used) return null;
                    used = true;
                    return move;
                }
            };
        },
        negamax(depth, alpha, beta) {
            this.tt.probe(123n);
            const picker = this.createMovePicker([move, unusedMove]);
            picker.next();
            return beta;
        }
    };
    const telemetry = instrumentSearch(search);

    assert.equal(search.negamax(6, 0, 1), 1);

    const stats = telemetry.snapshot().totals;
    assert.equal(stats.nodes, 1);
    assert.equal(stats.ttMisses, 1);
    assert.equal(stats.deepNoTtMoveNodes, 1);
    assert.equal(stats.betaCutoffs, 1);
    assert.equal(stats.firstMoveCutoffs, 1);
    assert.equal(stats.generatedMoves, 2);
    assert.equal(stats.searchedMoves, 1);
    assert.equal(stats.unusedGeneratedMovesAtCutoff, 1);
    assert.equal(stats.generatedMoveUseRate, 0.5);
    assert.equal(stats.captureCutoffs, 1);
    assert.equal(stats.nonLosingCaptureCutoffs, 1);
    assert.equal(stats.meanCutoffMoveIndex, 1);
});

test("search cutoff profiler finds reusable qsearch bounds without changing scores", () => {
    const move = {
        isCapture: () => true
    };
    const search = {
        board: {
            hashKey: 456n,
            isInCheck: () => false
        },
        hasRepetitionHistory: () => false,
        tt: {
            probe: () => null
        },
        createMovePicker(moves) {
            let index = 0;

            return {
                next: () => moves[index++] ?? null
            };
        },
        quiescence(alpha, beta) {
            const picker = this.createMovePicker([move]);
            picker.next();
            return beta;
        },
        negamax: () => 0
    };
    const telemetry = instrumentSearch(search);

    assert.equal(search.quiescence(0, 1, 3, 2), 1);
    assert.equal(search.quiescence(0, 1, 5, 2), 1);
    assert.equal(search.quiescence(0, 1, 5, 3), 1);

    const qsearch = telemetry.snapshot().qsearch.totals;
    assert.equal(qsearch.entries, 3);
    assert.equal(qsearch.repeatedEntries, 1);
    assert.equal(qsearch.reusableEntries, 1);
    assert.equal(qsearch.reusableLower, 1);
    assert.equal(qsearch.unshadowedReusableEntries, 1);
    assert.equal(qsearch.generatedMoveLists, 3);
    assert.equal(qsearch.generatedMoves, 3);
    assert.equal(qsearch.estimatedEntriesAvoidable, 1);
    assert.equal(qsearch.estimatedGeneratedMovesAvoidable, 1);
});

test("search cutoff profiler bypasses repetition-sensitive qsearch entries", () => {
    let repetitionHistory = true;
    const search = {
        board: {
            hashKey: 789n,
            isInCheck: () => false
        },
        hasRepetitionHistory: () => repetitionHistory,
        tt: {
            probe: () => null
        },
        createMovePicker() {
            return { next: () => null };
        },
        quiescence: () => 0,
        negamax: () => 0
    };
    const telemetry = instrumentSearch(search);

    search.quiescence(-1, 1, 1, 0);
    repetitionHistory = false;
    search.quiescence(-1, 1, 1, 0);

    const qsearch = telemetry.snapshot().qsearch.totals;
    assert.equal(qsearch.repetitionBypasses, 1);
    assert.equal(qsearch.eligibleEntries, 1);
    assert.equal(qsearch.repeatedEntries, 0);
    assert.equal(qsearch.reusableEntries, 0);
});
