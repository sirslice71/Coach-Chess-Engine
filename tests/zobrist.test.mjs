import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";

function createEngine(fen) {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    board.attachZobrist(zobrist);

    FEN.import(board, fen);

    return {
        board,
        zobrist,
        legalMoveGenerator:
            new LegalMoveGenerator(
                board,
                new MoveGenerator(board)
            )
    };

}

function verifyEnPassantHash(fen, notation) {

    const {
        board,
        zobrist,
        legalMoveGenerator
    } = createEngine(fen);

    const originalHash = board.hashKey;
    const move = legalMoveGenerator
        .generateMoves()
        .find(candidate => candidate.toString() === notation);

    assert.ok(move, `Expected legal move ${notation}`);

    board.makeMove(move);

    assert.equal(zobrist.verify(board), true);

    board.undoMove();

    assert.equal(board.hashKey, originalHash);
    assert.equal(zobrist.verify(board), true);

}

test("white en passant preserves the incremental hash", () => {

    verifyEnPassantHash(
        "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
        "e5-d6"
    );

});

test("black en passant preserves the incremental hash", () => {

    verifyEnPassantHash(
        "4k3/8/8/8/3pP3/8/4P3/4K3 b - e3 0 1",
        "d4-e3"
    );

});

test("FEN import with attached zobrist regenerates a valid hash", () => {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    board.attachZobrist(zobrist);

    FEN.import(
        board,
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 1"
    );

    assert.notEqual(board.hashKey, 0n);
    assert.equal(zobrist.verify(board), true);

});
