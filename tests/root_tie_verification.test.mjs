import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";
import { moveToUci } from "../js/uci/uciengine.js";

function createSearch(fen) {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();
    board.attachZobrist(zobrist);
    FEN.import(board, fen);

    const moveGenerator =
        new MoveGenerator(board);
    const legalMoveGenerator =
        new LegalMoveGenerator(board, moveGenerator);
    const evaluation =
        new Evaluation(board);

    return new Search(
        board,
        legalMoveGenerator,
        evaluation
    );

}

test("root tie verification covers queen-rich low-piece endings", () => {

    const search =
        createSearch(
            "8/7Q/5k1p/p7/1b1K1P2/6P1/2p5/7q b - - 6 57"
        );

    const result =
        search.bestMove(6, { quiet: true });

    assert.equal(
        moveToUci(result.move),
        "b4c5"
    );

});

test("sparse rook-pawn root tie rollback preserves stable pawn push", () => {

    const search =
        createSearch(
            "6k1/7p/4K3/6p1/5r2/8/8/8 b - - 1 72"
        );

    const result =
        search.bestMove(6, { quiet: true });

    assert.equal(
        moveToUci(result.move),
        "g5g4"
    );

});

test("rollback removes sparse root-tie tolerance helper", () => {

    const search =
        createSearch(
            "6k1/7p/4K3/6p1/5r2/8/8/8 b - - 1 72"
        );

    assert.equal(
        typeof search.rootTieVerificationScoreTolerance,
        "undefined"
    );

});

test("rollback disables SF-confirmed Lucas pawn-center root override", () => {

    const cases = [
        {
            fen:
                "2r1r1k1/5npp/3q4/1QpP1p2/1p6/4PP2/1B2R1PP/2R3K1 w - - 0 1",
            previousOverride: "e3e4",
            expected: "b5c4",
            depth: 5
        },
        {
            fen:
                "2rbr1k1/1p1nqp1p/4bn1P/pP2p1p1/N7/P1NRPP2/1Q2BBP1/1K5R w - - 0 1",
            previousOverride: "e3e4",
            expected: "b1c1",
            depth: 5
        },
        {
            fen:
                "3r1k2/5p2/1p2q1p1/p2p4/P7/1P1Q3P/4nPP1/B2R3K b - - 0 1",
            previousOverride: "d5d4",
            expected: "f8e8",
            depth: 6
        },
        {
            fen:
                "5rk1/1r2bpp1/pp2qn1p/2p5/P7/2N1PPP1/1PQB2KP/2RR4 w - - 0 1",
            previousOverride: "e3e4",
            expected: "g2g1",
            depth: 5
        }
    ];

    for (const { fen, previousOverride, expected, depth } of cases) {

        const search =
            createSearch(fen);

        const result =
            search.bestMove(depth, { quiet: true });

        assert.equal(
            moveToUci(result.move),
            expected
        );

        assert.notEqual(
            moveToUci(result.move),
            previousOverride
        );

    }

});

test("rollback removes root central-pawn preference override", () => {

    const search =
        createSearch(
            "2r1r1k1/5npp/3q4/1QpP1p2/1p6/4PP2/1B2R1PP/2R3K1 w - - 0 1"
        );

    assert.equal(
        typeof search.selectRootSearchPreferredMove,
        "undefined"
    );

});

test("early opening root ties prefer development over fifth-rank pawn thrusts", () => {

    const cases = [
        {
            fen:
                "rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            avoided: "e4e5",
            expected: "g1f3"
        },
        {
            fen:
                "rnbqkbnr/pp1p1ppp/4p3/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
            avoided: "e4e5",
            expected: "f3d4"
        }
    ];

    for (const { fen, avoided, expected } of cases) {

        const search =
            createSearch(fen);

        const result =
            search.bestMove(5, { quiet: true });

        assert.equal(
            moveToUci(result.move),
            expected
        );

        assert.notEqual(
            moveToUci(result.move),
            avoided
        );

    }

});
