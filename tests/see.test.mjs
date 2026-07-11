import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import MoveOrdering from "../js/engine/moveordering.js";
import SEE from "../js/engine/see.js";
import { moveToUci } from "../js/uci/uciengine.js";

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

function findMoveByUci(legalMoveGenerator, notation) {

    const move =
        legalMoveGenerator
            .generateMoves()
            .find(candidate =>
                moveToUci(candidate) === notation
            );

    assert.ok(move, `Expected legal move ${notation}`);

    return move;

}

function promotionSeeTable(fen, prefix) {

    const {
        board,
        legalMoveGenerator,
        moveOrdering
    } = createEngine(fen);

    const moves =
        legalMoveGenerator.generateMoves();

    moveOrdering.order(moves);

    return moves
        .filter(move =>
            moveToUci(move).startsWith(prefix)
        )
        .map((move, index) => ({
            uci: moveToUci(move),
            see: SEE.evaluateCapture(board, move),
            orderScore: move.score,
            rank: index + 1
        }));

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

test("white capture-promotion SEE distinguishes Q/R/B/N siblings", () => {

    const family =
        promotionSeeTable(
            "1r4k1/2P5/8/8/8/8/8/4K3 w - - 0 1",
            "c7b8"
        );

    assert.deepEqual(
        family.map(entry => entry.uci),
        ["c7b8q", "c7b8r", "c7b8b", "c7b8n"]
    );

    assert.deepEqual(
        family.map(entry => entry.see),
        [1300, 900, 710, 700]
    );

    assert.ok(
        family[0].orderScore >
        family[1].orderScore &&
        family[1].orderScore >
        family[2].orderScore &&
        family[2].orderScore >
        family[3].orderScore
    );

});

test("black capture-promotion SEE distinguishes Q/R/B/N siblings symmetrically", () => {

    const family =
        promotionSeeTable(
            "4k3/8/8/8/8/8/2p5/1R4K1 b - - 0 1",
            "c2b1"
        );

    assert.deepEqual(
        family.map(entry => entry.uci),
        ["c2b1q", "c2b1r", "c2b1b", "c2b1n"]
    );

    assert.deepEqual(
        family.map(entry => entry.see),
        [1300, 900, 710, 700]
    );

});

test("promotion SEE uses the promoted piece value when the new piece is immediately recaptured", () => {

    const family =
        promotionSeeTable(
            "1r6/k1P5/8/8/8/8/8/4K3 w - - 0 1",
            "c7b8"
        );

    assert.deepEqual(
        family.map(entry => entry.see),
        [400, 400, 400, 400]
    );

});

test("promotion SEE includes x-ray recaptures revealed by the promotion capture", () => {

    const family =
        promotionSeeTable(
            "rn4k1/2P5/8/8/8/8/8/1R2K3 w - - 0 1",
            "c7b8"
        );

    assert.deepEqual(
        family.map(entry => entry.see),
        [700, 700, 510, 500]
    );

    const unrecapturable =
        promotionSeeTable(
            "1r4k1/2P5/8/8/8/8/8/4K3 w - - 0 1",
            "c7b8"
        );

    for (let i = 0; i < family.length; i++) {

        assert.ok(
            family[i].see < unrecapturable[i].see,
            `${family[i].uci} should lose SEE when the x-ray recapture exists`
        );

    }

});

test("quiet promotions get no SEE but checking promotions still order ahead", () => {

    const {
        legalMoveGenerator,
        moveOrdering
    } = createEngine(
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1"
    );

    const moves =
        legalMoveGenerator.generateMoves();

    moveOrdering.order(moves);

    const promotions =
        moves.filter(move =>
            moveToUci(move).startsWith("a7a8")
        );

    assert.deepEqual(
        promotions.map(move => moveToUci(move)),
        ["a7a8q", "a7a8r", "a7a8b", "a7a8n"]
    );

    assert.ok(
        promotions.every(move =>
            move.seeScore === undefined
        )
    );

    assert.deepEqual(
        promotions.map(move => move.score),
        [53000, 53000, 50000, 50000]
    );

});

test("capture-promotion siblings remain distinct even when found by exact UCI move lookup", () => {

    const {
        board,
        legalMoveGenerator
    } = createEngine(
        "1r4k1/2P5/8/8/8/8/8/4K3 w - - 0 1"
    );

    const queenPromotion =
        findMoveByUci(
            legalMoveGenerator,
            "c7b8q"
        );

    const knightPromotion =
        findMoveByUci(
            legalMoveGenerator,
            "c7b8n"
        );

    assert.notEqual(
        queenPromotion.key,
        knightPromotion.key
    );

    assert.ok(
        SEE.evaluateCapture(board, queenPromotion) >
        SEE.evaluateCapture(board, knightPromotion)
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
