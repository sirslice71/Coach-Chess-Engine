import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";

const START_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function createEngine(fen) {

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

    const evaluation =
        new Evaluation(board);

    const search =
        new Search(
            board,
            legalMoveGenerator,
            evaluation
        );

    return { search };

}

test("opening depth-1 search returns a central move", () => {

    const { search } =
        createEngine(START_FEN);

    const result =
        search.bestMove(1);

    assert.ok(result.move);
    assert.ok(
        [
            "e2-e4",
            "d2-d4"
        ].includes(result.move.toString())
    );

});
