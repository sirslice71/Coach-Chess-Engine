//======================================================
// architecture_pst_prototype.test.mjs
// EXPERIMENTAL, isolated architecture-foundation prototype test. Not
// part of the production correctness suite. Verifies the incremental
// non-king piece-square-table shadow state added to core/board.js
// (board.pstScore, pstDeltaForPiece(), recomputeNonKingPstScore()) and
// its opt-in consumer in engine/evaluation.js
// (Evaluation.USE_INCREMENTAL_PST / evaluatePieceSquaresIncremental()).
//
// See ARCHITECTURE-FOUNDATION-REPORT.md for the full audit, the
// measured timing result (net negative -- shipped default is false),
// and the staged roadmap.
//======================================================

import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import { fromAlgebraic } from "../js/core/square.js";

function createEngine(fen) {
    const board = new Board();
    const zobrist = new Zobrist();
    zobrist.initialize();
    board.attachZobrist(zobrist);
    FEN.import(board, fen);
    const moveGenerator = new MoveGenerator(board);
    const legalMoveGenerator = new LegalMoveGenerator(board, moveGenerator);
    const evaluation = new Evaluation(board);
    return { board, legalMoveGenerator, evaluation };
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test("Evaluation.USE_INCREMENTAL_PST defaults to false (shadow state maintained but not consumed)", () => {
    assert.equal(Evaluation.USE_INCREMENTAL_PST, false);
});

test("pstScore starts at 0 for an empty-of-non-king-material position and matches a fresh recompute", () => {
    const { board } = createEngine("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    assert.equal(board.pstScore, 0);
    assert.equal(board.pstScore, board.recomputeNonKingPstScore());
});

test("pstScore matches a fresh recompute at the start position and after FEN import of a mid-game position", () => {
    const start = createEngine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    assert.equal(start.board.pstScore, 0);
    assert.equal(start.board.pstScore, start.board.recomputeNonKingPstScore());

    const mid = createEngine("r1bqk2r/ppp2ppp/2n2n2/3p4/1b1P4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 7");
    assert.equal(mid.board.pstScore, mid.board.recomputeNonKingPstScore());
});

test("pstScore stays exact through a bounded random-move stress walk (make and undo, every ply)", () => {
    const positions = [
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
        "8/1P6/8/8/8/8/6p1/4k2K w - - 0 1",
    ];
    const rng = mulberry32(7);
    let checked = 0;
    for (const fen of positions) {
        const { board, legalMoveGenerator } = createEngine(fen);
        const played = [];
        for (let ply = 0; ply < 60; ply++) {
            const legal = legalMoveGenerator.generateMoves();
            if (!legal.length) break;
            const move = legal[Math.floor(rng() * legal.length)];
            board.makeMove(move);
            played.push(move);
            checked++;
            assert.equal(board.pstScore, board.recomputeNonKingPstScore(), `mismatch after make at ply ${ply}, fen ${fen}`);
        }
        for (let i = played.length - 1; i >= 0; i--) {
            board.undoMove();
            assert.equal(board.pstScore, board.recomputeNonKingPstScore(), `mismatch after undo unwinding ply ${i}, fen ${fen}`);
        }
    }
    assert.ok(checked > 50, "sanity: the stress walk must have actually made moves");
});

test("pstScore handles castling (both sides, both colors)", () => {
    for (const [fen, fromAlg, toAlg] of [
        ["r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1", "g1"],
        ["r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1", "c1"],
        ["r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", "e8", "g8"],
        ["r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", "e8", "c8"],
    ]) {
        const { board, legalMoveGenerator } = createEngine(fen);
        const from = fromAlgebraic(fromAlg), to = fromAlgebraic(toAlg);
        const move = legalMoveGenerator.generateMoves().find((m) => m.fromSquare === from && m.toSquare === to);
        assert.ok(move, `castling move ${fromAlg}-${toAlg} must be legal in ${fen}`);
        board.makeMove(move);
        assert.equal(board.pstScore, board.recomputeNonKingPstScore(), "pstScore must be exact after castling (king move is excluded, rook move must be reflected)");
        board.undoMove();
        assert.equal(board.pstScore, board.recomputeNonKingPstScore(), "pstScore must be restored exactly after undoing castling");
    }
});

test("pstScore handles en passant capture (both colors)", () => {
    for (const [fen, fromAlg, toAlg] of [
        ["4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5", "d6"],
        ["4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1", "e4", "d3"],
    ]) {
        const { board, legalMoveGenerator } = createEngine(fen);
        const from = fromAlgebraic(fromAlg), to = fromAlgebraic(toAlg);
        const move = legalMoveGenerator.generateMoves().find((m) => m.fromSquare === from && m.toSquare === to);
        assert.ok(move, `en passant ${fromAlg}-${toAlg} must be legal in ${fen}`);
        board.makeMove(move);
        assert.equal(board.pstScore, board.recomputeNonKingPstScore(), "pstScore must exclude the en-passant-captured pawn on its ACTUAL square");
        board.undoMove();
        assert.equal(board.pstScore, board.recomputeNonKingPstScore());
    }
});

test("pstScore handles promotion to every piece type, including under-promotion, both colors", () => {
    for (const promo of [2, 3, 4, 5]) {
        for (const [fen, fromAlg, toAlg] of [
            ["4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7", "a8"],
            ["4k3/8/8/8/8/8/p7/4K3 b - - 0 1", "a2", "a1"],
        ]) {
            const { board, legalMoveGenerator } = createEngine(fen);
            const from = fromAlgebraic(fromAlg), to = fromAlgebraic(toAlg);
            const move = legalMoveGenerator.generateMoves().find((m) => m.fromSquare === from && m.toSquare === to && Math.abs(m.promotedPiece) === promo);
            assert.ok(move, `promotion ${fromAlg}-${toAlg}=${promo} must be legal in ${fen}`);
            board.makeMove(move);
            assert.equal(board.pstScore, board.recomputeNonKingPstScore(), `pstScore must reflect the promoted piece's table, not the pawn's (promo=${promo})`);
            board.undoMove();
            assert.equal(board.pstScore, board.recomputeNonKingPstScore());
        }
    }
});

test("pstScore handles a rook captured on its original square by an enemy piece", () => {
    const { board, legalMoveGenerator } = createEngine("4k3/8/8/8/8/8/6b1/4K2R b K - 0 1");
    const from = fromAlgebraic("g2"), to = fromAlgebraic("h1");
    const move = legalMoveGenerator.generateMoves().find((m) => m.fromSquare === from && m.toSquare === to);
    assert.ok(move, "Bxh1 must be legal");
    board.makeMove(move);
    assert.equal(board.pstScore, board.recomputeNonKingPstScore());
    board.undoMove();
    assert.equal(board.pstScore, board.recomputeNonKingPstScore());
});

test("evaluatePieceSquares() and evaluatePieceSquaresIncremental() agree exactly across a bounded stress walk", () => {
    const rng = mulberry32(99);
    const { board, legalMoveGenerator, evaluation } = createEngine("r1bqk2r/ppp2ppp/2n2n2/3p4/1b1P4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 7");
    for (let ply = 0; ply < 80; ply++) {
        Evaluation.USE_INCREMENTAL_PST = false;
        const scanScore = evaluation.evaluatePieceSquares();
        Evaluation.USE_INCREMENTAL_PST = true;
        const incScore = evaluation.evaluatePieceSquares();
        Evaluation.USE_INCREMENTAL_PST = false; // restore shipped default before any assertion can throw
        assert.equal(scanScore, incScore, `evaluatePieceSquares() variants must agree at ply ${ply}`);
        const legal = legalMoveGenerator.generateMoves();
        if (!legal.length) break;
        board.makeMove(legal[Math.floor(rng() * legal.length)]);
    }
});
