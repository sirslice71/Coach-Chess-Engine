import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";
import { Piece } from "../js/core/piece.js";
import { SearchConstants } from "../js/engine/searchconstants.js";

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

function withMutedConsole(fn) {

    const original = {
        clear: console.clear,
        error: console.error,
        log: console.log,
        table: console.table,
        trace: console.trace,
        warn: console.warn
    };

    console.clear = () => {};
    console.error = () => {};
    console.log = () => {};
    console.table = () => {};
    console.trace = () => {};
    console.warn = () => {};

    try {

        return fn();

    }

    finally {

        console.clear = original.clear;
        console.error = original.error;
        console.log = original.log;
        console.table = original.table;
        console.trace = original.trace;
        console.warn = original.warn;

    }

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

function snapshotBoard(board) {

    return {
        fen: FEN.export(board),
        hashKey: board.hashKey,
        whiteMaterial: board.whiteMaterial,
        blackMaterial: board.blackMaterial,
        whitePieces: structuredClone(board.whitePieces),
        blackPieces: structuredClone(board.blackPieces)
    };

}

function assertBoardSnapshot(board, expected) {

    assert.equal(FEN.export(board), expected.fen);
    assert.equal(board.hashKey, expected.hashKey);
    assert.equal(board.whiteMaterial, expected.whiteMaterial);
    assert.equal(board.blackMaterial, expected.blackMaterial);
    assert.deepEqual(board.whitePieces, expected.whitePieces);
    assert.deepEqual(board.blackPieces, expected.blackPieces);

}

function evaluatePosition(fen) {

    const { evaluation } =
        createEngine(fen);

    return evaluation.evaluate().total;

}

function searchBestMove(fen, depth) {

    const { search } =
        createEngine(fen);

    return withMutedConsole(
        () => search.bestMove(depth)
    );

}

function searchMoveScore(fen, notation, depth) {

    const {
        board,
        search,
        legalMoveGenerator
    } = createEngine(fen);

    const rootSideToMove =
        board.sideToMove;

    const move =
        findMove(
            legalMoveGenerator,
            notation
        );

    board.makeMove(move);

    const score =
        withMutedConsole(
            () => -search.negamax(
                depth - 1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                1
            )
        );

    board.undoMove();

    return search.toWhiteRelativeScore(
        score,
        rootSideToMove
    );

}

test("static evaluation stays White-relative regardless of side to move", () => {

    const whiteUpQueenWhiteToMove =
        evaluatePosition(
            "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1"
        );

    const whiteUpQueenBlackToMove =
        evaluatePosition(
            "4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1"
        );

    const blackUpQueenWhiteToMove =
        evaluatePosition(
            "4k3/4q3/8/8/8/8/8/4K3 w - - 0 1"
        );

    const blackUpQueenBlackToMove =
        evaluatePosition(
            "4k3/4q3/8/8/8/8/8/4K3 b - - 0 1"
        );

    assert.ok(
        whiteUpQueenWhiteToMove > 800,
        "White-up-queen position should evaluate positive"
    );

    assert.equal(
        whiteUpQueenWhiteToMove,
        whiteUpQueenBlackToMove
    );

    assert.ok(
        blackUpQueenWhiteToMove < -800,
        "Black-up-queen position should evaluate negative"
    );

    assert.equal(
        blackUpQueenWhiteToMove,
        blackUpQueenBlackToMove
    );

});

test("queen capture regression keeps Qg2 from scoring as a Black win", () => {

    const fen =
        "r3k2r/ppp2ppp/2n5/8/1PBpP3/P4PP1/1B5q/R2Q1KN1 b kq - 0 1";

    const {
        board,
        evaluation,
        legalMoveGenerator
    } = createEngine(fen);

    const queenCheck =
        findMove(
            legalMoveGenerator,
            "h2-g2"
        );

    board.makeMove(queenCheck);

    const queenTake =
        findMove(
            legalMoveGenerator,
            "f1-g2"
        );

    assert.equal(queenTake.capturedPiece, Piece.BQ);

    board.makeMove(queenTake);

    assert.ok(
        board.whiteMaterial - board.blackMaterial > 500,
        "White should be materially ahead after taking the queen"
    );

    assert.ok(
        evaluation.evaluate().total > 300,
        "Static evaluation should be strongly White-favorable"
    );

    board.undoMove();
    board.undoMove();

    assert.ok(
        searchMoveScore(fen, "h2-g2", 1) > 0,
        "Depth-1 search should not think Qg2 wins for Black"
    );

    assert.ok(
        searchMoveScore(fen, "h2-g2", 2) > 0,
        "Depth-2 search should not think Qg2 wins for Black"
    );

});

test("bishop capture regression preserves material, hash, and piece lists through make and undo", () => {

    const fen =
        "r3k2r/ppp2ppp/2n1b3/8/1PPpP3/P4PP1/1B3K2/R2Q1BNq b kq - 1 1";

    const {
        board,
        legalMoveGenerator
    } = createEngine(fen);

    const before =
        snapshotBoard(board);

    const bishopCapture =
        findMove(
            legalMoveGenerator,
            "e6-c4"
        );

    board.makeMove(bishopCapture);

    const afterBlackMove =
        snapshotBoard(board);

    const bishopRecapture =
        findMove(
            legalMoveGenerator,
            "f1-c4"
        );

    assert.equal(bishopRecapture.capturedPiece, Piece.BB);

    board.makeMove(bishopRecapture);

    assert.equal(
        board.blackMaterial,
        afterBlackMove.blackMaterial - 310
    );

    board.undoMove();

    assertBoardSnapshot(
        board,
        afterBlackMove
    );

    board.undoMove();

    assertBoardSnapshot(
        board,
        before
    );

});

test("depth-5 regression position does not return to early Qh5", () => {

    const result =
        searchBestMove(
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
            5
        );

    assert.notEqual(result.notation, "d1-h5");

});

test("depth-5 castling regression prefers castling over the king walk", () => {

    const result =
        searchBestMove(
            "r3k2r/ppp1nppp/2n1pq2/3p4/3P1P2/2PQ1NP1/PP1N1P1P/R3K2R b KQkq - 0 1",
            5
        );

    assert.ok(
        [
            "e8-g8",
            "e8-c8"
        ].includes(result.notation),
        `Expected Black to castle, got ${result.notation}`
    );

});

test("depth-5 Nxe5 rook regression keeps the tactical bishop move", () => {

    const result =
        searchBestMove(
            "2k2b1r/ppp2ppp/5n2/4Nb2/8/1PNrP3/PB1P1PPP/2R1K2R b K - 0 1",
            5
        );

    assert.equal(result.notation, "f8-b4");

});
