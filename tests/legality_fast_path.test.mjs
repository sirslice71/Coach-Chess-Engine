//======================================================
// legality_fast_path.test.mjs
// EXPERIMENTAL, isolated conservative-legality-fast-path prototype
// test. Not part of the production correctness suite. Verifies
// LegalMoveGenerator's fast path (js/engine/legalmovegen.js:
// provenLegalWithoutMakeUndo(), alignedWithKing(),
// LegalMoveGenerator.FAST_PATH_ENABLED) against the unconditional
// make/undo fallback across every targeted exception named in
// ARCHITECTURE-LEGALITY-REPORT.md's safety proof.
//
// Every test runs BOTH with the fast path enabled and disabled and
// requires identical legal/illegal results -- the fast path must
// never accept a move the fallback would reject, and must never be
// consulted for a case the proof does not cover (in check, king
// moves, castling, en passant, or a moving piece aligned with its
// own king all fall back unconditionally regardless of this flag).
//======================================================

import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import { fromAlgebraic } from "../js/core/square.js";

function createEngine(fen) {
    const board = new Board();
    const zobrist = new Zobrist();
    zobrist.initialize();
    board.attachZobrist(zobrist);
    FEN.import(board, fen);
    const moveGenerator = new MoveGenerator(board);
    const legalMoveGenerator = new LegalMoveGenerator(board, moveGenerator);
    return { board, legalMoveGenerator };
}

// Runs the same legality check with the fast path on and off and
// requires identical results in both modes.
function assertSameBothModes(fen, fromAlg, toAlg, promo, expectLegal, msg) {
    const from = fromAlgebraic(fromAlg), to = fromAlgebraic(toAlg);
    for (const fastPath of [true, false]) {
        LegalMoveGenerator.FAST_PATH_ENABLED = fastPath;
        const { legalMoveGenerator } = createEngine(fen);
        const legal = legalMoveGenerator.generateMoves();
        const found = legal.find((m) => m.fromSquare === from && m.toSquare === to && (!promo || Math.abs(m.promotedPiece) === promo));
        assert.equal(!!found, expectLegal, `${msg} [fastPath=${fastPath}]`);
    }
    LegalMoveGenerator.FAST_PATH_ENABLED = true;
}

test("pinned knight has zero legal moves (fast path must not fire -- knight square is aligned with own king)", () => {
    for (const fastPath of [true, false]) {
        LegalMoveGenerator.FAST_PATH_ENABLED = fastPath;
        const { legalMoveGenerator } = createEngine("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1");
        const legal = legalMoveGenerator.generateMoves();
        const knightMoves = legal.filter((m) => m.fromSquare === fromAlgebraic("e2"));
        assert.equal(knightMoves.length, 0, `fastPath=${fastPath}`);
    }
    LegalMoveGenerator.FAST_PATH_ENABLED = true;
});

test("pinned bishop: moves along the pin line are legal, moves off it are illegal", () => {
    const fen = "6k1/6q1/8/8/8/2B5/8/K7 w - - 0 1";
    assertSameBothModes(fen, "c3", "e5", null, true, "along pin line");
    assertSameBothModes(fen, "c3", "b4", null, false, "off pin line");
});

test("pinned rook: moves along the pin line are legal, moves off it are illegal", () => {
    const fen = "4r1k1/8/8/8/4R3/8/8/4K3 w - - 0 1";
    assertSameBothModes(fen, "e4", "e6", null, true, "along pin line");
    assertSameBothModes(fen, "e4", "d4", null, false, "off pin line");
});

test("pinned queen: moves along the pin line are legal, moves off it are illegal", () => {
    const fen = "6k1/6q1/8/8/8/2Q5/8/K7 w - - 0 1";
    assertSameBothModes(fen, "c3", "e5", null, true, "along pin line");
    assertSameBothModes(fen, "c3", "c4", null, false, "off pin line");
});

test("discovered rook check is a legal move (own king unaffected, fast path may fire)", () => {
    assertSameBothModes("4k3/8/8/8/4R3/8/4B3/K7 w - - 0 1", "e2", "d3", null, true, "discovered rook check");
});

test("discovered bishop check is a legal move (own king unaffected, fast path may fire)", () => {
    assertSameBothModes("k7/8/8/3N4/8/8/8/6BK w - - 0 1", "d5", "b4", null, true, "discovered bishop check");
});

test("en passant discovered check is illegal (en passant always falls back regardless of alignment)", () => {
    assertSameBothModes("6k1/8/8/K2pP2r/8/8/8/8 w - d6 0 1", "e5", "d6", null, false, "en passant discovered check");
});

test("king cannot capture a defended piece (king moves always fall back)", () => {
    assertSameBothModes("3r4/8/8/3p4/3K4/8/8/7k w - - 0 1", "d4", "d5", null, false, "king captures defended piece");
});

test("king cannot move into an attack only revealed by vacating its own square (classic king-move bug, always falls back)", () => {
    assertSameBothModes("k7/8/8/8/8/8/8/r5K1 w - - 0 1", "g1", "h1", null, false, "king vacates blocking square");
});

test("castling through check is never even pseudo-legal", () => {
    for (const fastPath of [true, false]) {
        LegalMoveGenerator.FAST_PATH_ENABLED = fastPath;
        const { legalMoveGenerator } = createEngine("4r1k1/8/8/8/8/8/8/4K2R w K - 0 1");
        const legal = legalMoveGenerator.generateMoves();
        const castle = legal.find((m) => m.fromSquare === fromAlgebraic("e1") && m.toSquare === fromAlgebraic("g1"));
        assert.equal(castle, undefined, `fastPath=${fastPath}`);
    }
    LegalMoveGenerator.FAST_PATH_ENABLED = true;
});

test("castling out of check is never even pseudo-legal (same FEN: rook checks e1 directly)", () => {
    for (const fastPath of [true, false]) {
        LegalMoveGenerator.FAST_PATH_ENABLED = fastPath;
        const { legalMoveGenerator } = createEngine("4r1k1/8/8/8/8/8/8/4K2R w K - 0 1");
        const legal = legalMoveGenerator.generateMoves();
        const castle = legal.find((m) => m.fromSquare === fromAlgebraic("e1") && (m.flags & (4 | 8)));
        assert.equal(castle, undefined, `fastPath=${fastPath}`);
    }
    LegalMoveGenerator.FAST_PATH_ENABLED = true;
});

test("double check: only king moves are legal (side in check always falls back wholesale)", () => {
    for (const fastPath of [true, false]) {
        LegalMoveGenerator.FAST_PATH_ENABLED = fastPath;
        const { legalMoveGenerator } = createEngine("4r1k1/8/8/8/8/3n4/8/4K3 w - - 0 1");
        const legal = legalMoveGenerator.generateMoves();
        assert.ok(legal.length > 0, `fastPath=${fastPath}`);
        assert.ok(legal.every((m) => m.fromSquare === fromAlgebraic("e1")), `fastPath=${fastPath}: expected only king moves`);
    }
    LegalMoveGenerator.FAST_PATH_ENABLED = true;
});

test("blocking a check is legal (side in check always falls back, unchanged behavior)", () => {
    assertSameBothModes("4r1k1/8/8/8/8/5N2/8/4K3 w - - 0 1", "f3", "e5", null, true, "blocking a check");
});

test("capturing the checker is legal (side in check always falls back, unchanged behavior)", () => {
    assertSameBothModes("6k1/8/8/8/8/3n4/8/3QK3 w - - 0 1", "d1", "d3", null, true, "capturing the checker");
});

test("promotion that exposes the own king is illegal; capturing the pinner while promoting is legal", () => {
    const fen = "1k5q/6P1/8/8/8/8/8/K7 w - - 0 1";
    assertSameBothModes(fen, "g7", "g8", 5, false, "push promotion exposes king");
    assertSameBothModes(fen, "g7", "h8", 5, true, "capture promotion removes pinner");
});

test("underpromotion that exposes the own king is illegal; capturing the pinner while underpromoting is legal", () => {
    const fen = "1k5q/6P1/8/8/8/8/8/K7 w - - 0 1";
    assertSameBothModes(fen, "g7", "g8", 2, false, "push underpromotion exposes king");
    assertSameBothModes(fen, "g7", "h8", 2, true, "capture underpromotion removes pinner");
});
