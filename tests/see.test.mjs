import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import MoveOrdering from "../js/engine/moveordering.js";
import SEE from "../js/engine/see.js";

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

    return {
        board,
        legalMoveGenerator,
        moveOrdering:
            new MoveOrdering(board)
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

test("SEE marks an obviously losing queen capture as negative", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "4k3/8/8/4q3/4P3/8/3N4/4K3 b - - 0 1"
    );

    const move =
        findMove(
            legalMoveGenerator,
            "e5-e4"
        );

    const seeScore =
        SEE.evaluateCapture(
            board,
            move
        );

    assert.ok(
        seeScore < -700,
        `Expected losing queen capture, got SEE ${seeScore}`
    );

});

test("SEE keeps equal rook recaptures near zero", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "8/8/5k2/4r3/4R3/8/8/4K3 w - - 0 1"
    );

    const move =
        findMove(
            legalMoveGenerator,
            "e4-e5"
        );

    const seeScore =
        SEE.evaluateCapture(
            board,
            move
        );

    assert.equal(
        seeScore,
        0
    );

});

test("capture ordering prefers a winning capture over a losing queen grab", () => {

    const {
        legalMoveGenerator,
        moveOrdering
    } = createEngine(
        "4k3/8/8/r3q3/4P3/8/P2N4/4K3 b - - 0 1"
    );

    const moves =
        legalMoveGenerator.generateMoves();

    moveOrdering.order(moves);

    const captures =
        moves.filter(move => move.isCapture());

    assert.ok(captures.length >= 2);

    assert.equal(
        captures[0].toString(),
        "a5-a2"
    );

    assert.equal(
        captures[captures.length - 1].toString(),
        "e5-e4"
    );

    assert.ok(
        captures[0].seeScore > 0
    );

    assert.ok(
        captures[captures.length - 1].seeScore < 0
    );

});
