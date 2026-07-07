//======================================
// tests/helpers/perft-helpers.mjs
//
// Small, isolated helpers for the perft/legality regression
// harness (tests/perft.test.mjs). Deliberately kept separate
// from the engine's own js/engine/perft.js Perft class (which
// this file wraps, not replaces) so that:
//
//   - The test harness exercises the EXACT SAME legal-move
//     path js/engine/search.js uses: Perft is constructed with
//     a LegalMoveGenerator wrapping a MoveGenerator, identical
//     to how tests/engine_regressions.test.mjs's createEngine()
//     and js/uci/uciengine.js wire up Search. There is only one
//     move-generation/make-undo pipeline in this engine; nothing
//     here duplicates or reimplements it.
//   - Failures print FEN, depth, expected/actual node counts,
//     and a per-root-move divide() breakdown, without adding
//     any console noise on the happy path (the engine's own
//     Perft.divide() logs unconditionally via EngineDebug,
//     which is useful interactively but not desirable inside an
//     automated, otherwise-silent test run).
//======================================

import assert from "node:assert/strict";

import Board from "../../js/core/board.js";
import FEN from "../../js/core/fen.js";
import MoveGenerator from "../../js/engine/movegen.js";
import LegalMoveGenerator from "../../js/engine/legalmovegen.js";
import Zobrist from "../../js/engine/zobrist.js";
import Perft from "../../js/engine/perft.js";

//----------------------------------
// Build a fresh Board + LegalMoveGenerator + Perft from a FEN,
// matching the exact construction pattern used everywhere else
// in this repo (see tests/engine_regressions.test.mjs's
// createEngine() and js/uci/uciengine.js's createEngineCore()).
//----------------------------------

export function createPerftEngine(fen) {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    board.attachZobrist(zobrist);

    FEN.import(board, fen);

    const moveGenerator =
        new MoveGenerator(board);

    const legalMoveGenerator =
        new LegalMoveGenerator(
            board,
            moveGenerator
        );

    const perft =
        new Perft(board, legalMoveGenerator);

    return {
        board,
        zobrist,
        moveGenerator,
        legalMoveGenerator,
        perft
    };

}

//----------------------------------
// Silent per-root-move divide: identical traversal to the
// engine's own Perft.divide(), but returns plain data instead
// of printing through EngineDebug. Only ever called from
// assertPerft() below, and only once a mismatch has already
// been detected -- so it never runs (and never costs anything)
// on a passing test.
//----------------------------------

export function divideCounts(board, legalMoveGenerator, perft, depth) {

    const rootMoves =
        legalMoveGenerator.generateMoves();

    const rows = [];

    for (const move of rootMoves) {

        board.makeMove(move);

        const nodes =
            perft.search(depth - 1);

        board.undoMove();

        rows.push({
            move: move.toString(),
            nodes
        });

    }

    rows.sort(
        (a, b) => a.move.localeCompare(b.move)
    );

    return rows;

}

function formatDivide(rows) {

    return rows
        .map(row => `    ${row.move.padEnd(10)} ${row.nodes}`)
        .join("\n");

}

//----------------------------------
// assertPerft(fen, depth, expectedNodes, label)
//
// Runs Coach's own Perft.search(depth) from `fen` and asserts
// the leaf count equals `expectedNodes`. On mismatch, throws an
// AssertionError whose message spells out the FEN, depth,
// expected count, actual count, and a full per-root-move
// divide() breakdown at that depth -- everything needed to
// locate which root move's subtree diverged without re-running
// anything by hand.
//----------------------------------

export function assertPerft(fen, depth, expectedNodes, label = "") {

    const { board, legalMoveGenerator, perft } =
        createPerftEngine(fen);

    const actualNodes =
        perft.search(depth);

    if (actualNodes !== expectedNodes) {

        const rows =
            divideCounts(board, legalMoveGenerator, perft, depth);

        const divideText =
            formatDivide(rows);

        assert.fail(

            `Perft mismatch${label ? ` (${label})` : ""}\n` +
            `  FEN     : ${fen}\n` +
            `  Depth   : ${depth}\n` +
            `  Expected: ${expectedNodes}\n` +
            `  Actual  : ${actualNodes}\n` +
            `  Divide (per root move, depth ${depth}):\n${divideText}`

        );

    }

}
