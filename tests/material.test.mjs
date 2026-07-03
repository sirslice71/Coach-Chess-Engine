import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";

function createEngine(fen) {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    globalThis.window = {
        chess: {
            zobrist
        }
    };

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

    return {
        board,
        zobrist,
        evaluation,
        search,
        legalMoveGenerator
    };

}

function findMove(legalMoveGenerator, notation) {

    const move =
        legalMoveGenerator
            .generateMoves()
            .find(candidate =>
                candidate.toString() === notation
            );

    assert.ok(move, `Expected legal move ${notation}`);

    return move;

}

function assertMaterialRestored(board, expectedWhite, expectedBlack) {

    assert.equal(board.whiteMaterial, expectedWhite);
    assert.equal(board.blackMaterial, expectedBlack);

}

test("normal capture updates material and undo restores it", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "4k3/5p2/8/8/2B5/8/8/4K3 w - - 0 1"
    );

    const whiteBefore = board.whiteMaterial;
    const blackBefore = board.blackMaterial;

    const move =
        findMove(
            legalMoveGenerator,
            "c4-f7"
        );

    board.makeMove(move);

    assert.equal(board.whiteMaterial, whiteBefore);
    assert.equal(board.blackMaterial, blackBefore - 100);

    board.undoMove();

    assertMaterialRestored(
        board,
        whiteBefore,
        blackBefore
    );

});

test("en passant updates material and undo restores it", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"
    );

    const whiteBefore = board.whiteMaterial;
    const blackBefore = board.blackMaterial;

    const move =
        findMove(
            legalMoveGenerator,
            "e5-d6"
        );

    board.makeMove(move);

    assert.equal(board.whiteMaterial, whiteBefore);
    assert.equal(board.blackMaterial, blackBefore - 100);

    board.undoMove();

    assertMaterialRestored(
        board,
        whiteBefore,
        blackBefore
    );

});

test("promotion updates material and undo restores it", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"
    );

    const whiteBefore = board.whiteMaterial;
    const blackBefore = board.blackMaterial;

    const move =
        legalMoveGenerator
            .generateMoves()
            .find(candidate =>
                candidate.toString() === "a7-a8" &&
                candidate.promotedPiece !== 0
            );

    assert.ok(move, "Expected legal promotion move a7-a8");

    board.makeMove(move);

    assert.equal(board.blackMaterial, blackBefore);
    assert.equal(
        board.whiteMaterial,
        whiteBefore - 100 + 900
    );

    board.undoMove();

    assertMaterialRestored(
        board,
        whiteBefore,
        blackBefore
    );

});

test("played regression line matches FEN-loaded material and eval", () => {

    const startFen =
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

    const {
        board,
        evaluation,
        legalMoveGenerator
    } = createEngine(startFen);

    const line = [
        "d1-h5",
        "d8-f6",
        "g1-f3",
        "f6-f3"
    ];

    for (const notation of line) {

        board.makeMove(
            findMove(
                legalMoveGenerator,
                notation
            )
        );

    }

    const playedFen = FEN.export(board);
    const playedEval = evaluation.evaluate().total;
    const playedWhiteMaterial = board.whiteMaterial;
    const playedBlackMaterial = board.blackMaterial;

    const loaded =
        createEngine(playedFen);

    assert.equal(
        loaded.board.whiteMaterial,
        playedWhiteMaterial
    );

    assert.equal(
        loaded.board.blackMaterial,
        playedBlackMaterial
    );

    assert.equal(
        loaded.evaluation.evaluate().total,
        playedEval
    );

});
