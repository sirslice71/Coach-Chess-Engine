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
