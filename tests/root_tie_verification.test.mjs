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

test("sparse rook-pawn root ties prefer conversion over pawn pushes", () => {

    const search =
        createSearch(
            "6k1/7p/4K3/6p1/5r2/8/8/8 b - - 1 72"
        );

    const result =
        search.bestMove(6, { quiet: true });

    assert.equal(
        moveToUci(result.move),
        "f4f8"
    );

});

test("sparse ending root tie tolerance stays scoped by material", () => {

    const sparseSearch =
        createSearch(
            "6k1/7p/4K3/6p1/5r2/8/8/8 b - - 1 72"
        );

    assert.equal(
        sparseSearch.rootTieVerificationScoreTolerance(),
        25
    );

    const richerSearch =
        createSearch(
            "8/7Q/5k1p/p7/1b1K1P2/6P1/2p5/7q b - - 6 57"
        );

    assert.equal(
        richerSearch.rootTieVerificationScoreTolerance(),
        10
    );

});

test("SF-confirmed Lucas pawn-center ties prefer central breaks", () => {

    const cases = [
        {
            fen:
                "2r1r1k1/5npp/3q4/1QpP1p2/1p6/4PP2/1B2R1PP/2R3K1 w - - 0 1",
            expected: "e3e4",
            depth: 5
        },
        {
            fen:
                "2rbr1k1/1p1nqp1p/4bn1P/pP2p1p1/N7/P1NRPP2/1Q2BBP1/1K5R w - - 0 1",
            expected: "e3e4",
            depth: 5
        },
        {
            fen:
                "3r1k2/5p2/1p2q1p1/p2p4/P7/1P1Q3P/4nPP1/B2R3K b - - 0 1",
            expected: "d5d4",
            depth: 6
        },
        {
            fen:
                "5rk1/1r2bpp1/pp2qn1p/2p5/P7/2N1PPP1/1PQB2KP/2RR4 w - - 0 1",
            expected: "e3e4",
            depth: 5
        }
    ];

    for (const { fen, expected, depth } of cases) {

        const search =
            createSearch(fen);

        const result =
            search.bestMove(depth, { quiet: true });

        assert.equal(
            moveToUci(result.move),
            expected
        );

    }

});
