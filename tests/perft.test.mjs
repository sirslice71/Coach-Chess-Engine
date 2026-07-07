//======================================
// tests/perft.test.mjs
//
// Dedicated perft / legality regression harness. Verifies legal
// move generation, make/undo correctness, castling rights, en
// passant, promotion, check evasions, pins, and board-state
// restoration.
//
// This file is CORRECTNESS INFRASTRUCTURE ONLY. It does not
// tune evaluation, pruning, move ordering, search depth, time
// management, or engine playing strength, and it does not
// modify any existing test file.
//
//----------------------------------
// Move-generation path parity with search (required item #8)
//----------------------------------
//
// Every perft count below runs through js/engine/perft.js's
// Perft class, constructed with a LegalMoveGenerator wrapping a
// MoveGenerator -- the exact same pair js/engine/search.js
// receives (see js/uci/uciengine.js's createEngineCore() and
// tests/engine_regressions.test.mjs's createEngine()). Coach
// has exactly one move-generation pipeline: MoveGenerator
// produces pseudo-legal moves, LegalMoveGenerator filters them
// by making each move, asking Attack.isSquareAttacked() whether
// the moving side's own king is now attacked, and undoing --
// then Perft (and Search) both just call
// legalMoveGenerator.generateMoves() and recurse through
// board.makeMove()/board.undoMove(). There is no separate
// "perft-only" or "search-only" legality path to reconcile.
//
//----------------------------------
// A note on promotions
//----------------------------------
//
// An earlier revision of Coach's pawn-move generator
// (js/engine/movegen.js, generatePawnMoves()) produced only
// QUEEN promotions -- push and capture alike -- so the
// original version of this file had to avoid promotion-
// reachable depths for the standard positions and used
// queen-only hand-derived totals for the promotion category.
// That bug is fixed: all four promotion choices (Q, R, B, N)
// are generated for both push- and capture-promotions, for
// both colors. Every total below is now the standard
// published value where a published value exists
// (https://www.chessprogramming.org/Perft_Results), including
// Kiwipete depth 4, which only matches once underpromotions
// exist. The promotion-category totals are hand-derived in
// full (all four pieces) and cross-checked against the
// engine's divide() breakdown, recorded in the comment.
//
// No perft total in this file was invented.
//======================================

import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";

import {
    createPerftEngine,
    assertPerft
} from "./helpers/perft-helpers.mjs";

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

    return { board, zobrist, moveGenerator, legalMoveGenerator };

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

//======================================
// Category 1: Start position
//======================================
//
// Source: https://www.chessprogramming.org/Perft_Results --
// the standard, independently-verified reference table
// reproduced by essentially every chess engine's own test
// suite. No promotion is reachable by either side within 5
// plies from the start position (the fastest a pawn can reach
// the 8th/1st rank is considerably deeper than that), so
// Coach's queen-only promotion behavior (see file header)
// cannot affect any of these five counts. All five were also
// directly re-verified against this exact checkout before being
// written here.
//======================================

const START_POSITION =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("perft: start position depth 1 (20 nodes)", () => {
    assertPerft(START_POSITION, 1, 20, "start position");
});

test("perft: start position depth 2 (400 nodes)", () => {
    assertPerft(START_POSITION, 2, 400, "start position");
});

test("perft: start position depth 3 (8,902 nodes)", () => {
    assertPerft(START_POSITION, 3, 8902, "start position");
});

test("perft: start position depth 4 (197,281 nodes)", () => {
    assertPerft(START_POSITION, 4, 197281, "start position");
});

test("perft: start position depth 5 (4,865,609 nodes)", () => {
    assertPerft(START_POSITION, 5, 4865609, "start position");
});

//======================================
// Category 2: Kiwipete
// (castling / pins / checks complexity)
//======================================
//
// The standard "Kiwipete" stress position -- deliberately built
// to exercise all four castling rights simultaneously, multiple
// pinned pieces, en passant, and mid-game tactical complexity.
// Source: https://www.chessprogramming.org/Perft_Results.
//
// Depth 4 is the underpromotion sentinel for this file: a
// Black pawn on h3 reaches h1 within 4 plies, so the count
// only matches the published 4,085,603 when rook/bishop/
// knight promotions are generated alongside the queen (the
// old queen-only generator produced 4,074,224). Runtime is a
// few seconds -- comparable to the start-position depth-5
// test already in this suite.
//======================================

const KIWIPETE =
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

test("perft: Kiwipete depth 1 (48 nodes)", () => {
    assertPerft(KIWIPETE, 1, 48, "Kiwipete");
});

test("perft: Kiwipete depth 2 (2,039 nodes)", () => {
    assertPerft(KIWIPETE, 2, 2039, "Kiwipete");
});

test("perft: Kiwipete depth 3 (97,862 nodes)", () => {
    assertPerft(KIWIPETE, 3, 97862, "Kiwipete");
});

test("perft: Kiwipete depth 4 (4,085,603 nodes, underpromotion sentinel)", () => {
    assertPerft(KIWIPETE, 4, 4085603, "Kiwipete");
});

//======================================
// Category 3: En passant legality
// (chessprogramming.org "Position 3")
//======================================
//
// This position is the standard reference for tricky en
// passant legality, including the classic case where an en
// passant capture would remove both the capturing and captured
// pawns from the same rank and expose the king to a rook check
// along that rank (see also the dedicated "en passant that
// exposes the king along the rank is illegal" unit test in
// tests/engine_regressions.test.mjs, which pins the same rule
// with a different, hand-built position -- this perft test
// gives that rule broad, leaf-count-level coverage instead of a
// single hand-picked line).
//
// Source: https://www.chessprogramming.org/Perft_Results.
// Depths 1-5 are confirmed promotion-free for this position by
// direct computation against this checkout (both near-promotion
// pawns -- White's on b5, Black's on f4 -- need 3 more pushes
// each, and it takes until White's 3rd move, ply 5, before any
// path even reaches a promotion square; the actual depth-5 leaf
// count matches the published total exactly, confirming no
// promotion-divergent line is actually counted within depth 5).
//======================================

const POSITION_3 =
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";

test("perft: Position 3 (en passant) depth 1 (14 nodes)", () => {
    assertPerft(POSITION_3, 1, 14, "Position 3");
});

test("perft: Position 3 (en passant) depth 2 (191 nodes)", () => {
    assertPerft(POSITION_3, 2, 191, "Position 3");
});

test("perft: Position 3 (en passant) depth 3 (2,812 nodes)", () => {
    assertPerft(POSITION_3, 3, 2812, "Position 3");
});

test("perft: Position 3 (en passant) depth 4 (43,238 nodes)", () => {
    assertPerft(POSITION_3, 4, 43238, "Position 3");
});

test("perft: Position 3 (en passant) depth 5 (674,624 nodes)", () => {
    assertPerft(POSITION_3, 5, 674624, "Position 3");
});

//======================================
// Category 4: Promotion
// (push + capture, all four promotion pieces)
//======================================
//
// 1n6/P7/8/8/8/8/8/k6K w - - 0 1
//   White: Kh1, Pa7.  Black: Ka1, Nb8.
//
// Hand-derivation, depth 1 (White to move):
//   Pawn a7: pushes a7-a8=Q/R/B/N (a8 empty) and captures
//            a7xb8=Q/R/B/N -- 8 moves.
//   King h1: g1, g2, h2 are all empty and unattacked -- 3.
//   Total: 11.
//
// Depth 2 (adds Black's replies), derived by hand and
// cross-checked against the engine's own divide() breakdown
// (recorded here so the reasoning is auditable):
//   a7-a8=Q and a7-a8=R both check Ka1 down the open a-file:
//     legal replies are Kb1, Kb2, and the block Nb8-a6 --
//     3 replies each (6).
//   a7-a8=B gives no check (a8's diagonal runs b7..h1, and b8
//     is not on it, so the knight is not pinned): king a2/b1/b2
//     + knight a6/c6/d7 -- 6 replies. a7-a8=N likewise gives
//     no check (Na8 attacks only b6/c7) -- 6 replies (12).
//   a7xb8=Q boxes the king in (b-file and the b8 diagonals):
//     only Ka2 -- 1 reply. a7xb8=R controls the b-file the
//     same way: only Ka2 -- 1 reply (2).
//   a7xb8=B (diagonals b8-a7 and b8-h2 miss a2/b1/b2): 3
//     king replies. a7xb8=N (attacks a6/c6/d7): 3 (6).
//   h1-g1 / h1-g2 / h1-h2: 3 king + 3 knight replies each (18).
//   Total: 6 + 12 + 2 + 6 + 18 = 44.
//
// divide(2) cross-check against this exact checkout:
//   a8=Q 3, a8=R 3, a8=B 6, a8=N 6,
//   xb8=Q 1, xb8=R 1, xb8=B 3, xb8=N 3,
//   Kg1 6, Kg2 6, Kh2 6.
//======================================

const PROMOTION_POSITION =
    "1n6/P7/8/8/8/8/8/k6K w - - 0 1";

test("perft: promotion (push + capture, all four pieces) depth 1 (11 nodes)", () => {
    assertPerft(PROMOTION_POSITION, 1, 11, "promotion push+capture");
});

test("perft: promotion (push + capture, all four pieces) depth 2 (44 nodes)", () => {
    assertPerft(PROMOTION_POSITION, 2, 44, "promotion push+capture");
});

//======================================
// Category 5: Check evasion
//======================================
//
// 4k3/8/8/8/8/8/4r3/4K3 w - - 0 1
//   White: Ke1.  Black: Ke8, Re2.
//
// White's king on e1 is in check from the rook on e2 (adjacent,
// same file). Hand-derivation of White's only 3 legal replies:
//   Kxe2 -- captures the checking rook (no other Black piece
//           attacks e2, so this is safe).
//   Kd1  -- off the e-file and the checking rook's rank, and
//           not attacked by anything else.
//   Kf1  -- symmetric to Kd1, also safe.
//   Kd2 and Kf2 are both on rank 2, still attacked by the rook,
//   and are correctly excluded.
// Total: 3.
//======================================

const CHECK_EVASION_POSITION =
    "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1";

test("perft: check evasion depth 1 (3 nodes)", () => {
    assertPerft(CHECK_EVASION_POSITION, 1, 3, "check evasion");
});

//======================================
// Category 6: Pinned piece
//======================================
//
// 4k3/b7/8/8/8/8/5N2/6K1 w - - 0 1
//   White: Kg1, Nf2.  Black: Ke8, Ba7.
//
// The bishop on a7 pins the knight on f2 to the king on g1
// along the a7-g1 diagonal (a7-b6-c5-d4-e3-f2-g1). Hand-
// derivation of White's legal replies at depth 1:
//   Knight f2: EVERY knight move leaves the a7-g1 diagonal,
//              exposing the king to the bishop -- 0 legal
//              moves (the pin is absolute).
//   King g1: f1, g2, h1, h2 are all off that diagonal, empty,
//            and unattacked by anything else -- 4 moves.
// Total: 4.
//
// Depth 2 (44 nodes) was cross-checked against the engine's own
// divide() breakdown: each of the 4 White king moves gives
// Black 11 replies (6 bishop moves along its two open diagonals
// plus 5 king moves from e8), and 4 x 11 = 44.
//======================================

const PIN_POSITION =
    "4k3/b7/8/8/8/8/5N2/6K1 w - - 0 1";

test("perft: pinned piece depth 1 (4 nodes)", () => {
    assertPerft(PIN_POSITION, 1, 4, "pinned knight");
});

test("perft: pinned piece depth 2 (44 nodes)", () => {
    assertPerft(PIN_POSITION, 2, 44, "pinned knight");
});

//======================================
// Category 7: Castling rights lost / restored through make/undo
//======================================
//
// Direct board-state assertions (not perft leaf counts) so a
// regression here fails on the exact rule that broke, rather
// than surfacing only as a distant node-count mismatch.
//======================================

test("castling rights: a king move clears both of that side's rights, undo restores them", () => {

    const { board, legalMoveGenerator } =
        createEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");

    const before = { ...board.castlingRights };

    const move = findMove(legalMoveGenerator, "e1-d1");

    board.makeMove(move);

    assert.deepEqual(board.castlingRights, {
        whiteKingSide: false,
        whiteQueenSide: false,
        blackKingSide: true,
        blackQueenSide: true
    });

    board.undoMove();

    assert.deepEqual(board.castlingRights, before);

});

test("castling rights: moving the king-side rook clears only that side's right, undo restores it", () => {

    const { board, legalMoveGenerator } =
        createEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");

    const before = { ...board.castlingRights };

    const move = findMove(legalMoveGenerator, "h1-g1");

    board.makeMove(move);

    assert.deepEqual(board.castlingRights, {
        whiteKingSide: false,
        whiteQueenSide: true,
        blackKingSide: true,
        blackQueenSide: true
    });

    board.undoMove();

    assert.deepEqual(board.castlingRights, before);

});

test("castling rights: moving the queen-side rook clears only that side's right, undo restores it", () => {

    const { board, legalMoveGenerator } =
        createEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");

    const before = { ...board.castlingRights };

    const move = findMove(legalMoveGenerator, "a1-b1");

    board.makeMove(move);

    assert.deepEqual(board.castlingRights, {
        whiteKingSide: true,
        whiteQueenSide: false,
        blackKingSide: true,
        blackQueenSide: true
    });

    board.undoMove();

    assert.deepEqual(board.castlingRights, before);

});

test("castling rights: capturing the enemy king-side rook clears their right, undo restores it", () => {

    // White rook h7 can capture Black's h8 rook outright. White
    // itself has no castling rights in this FEN (KQ intentionally
    // omitted) so only Black's rights are meaningful here.
    const { board, legalMoveGenerator } =
        createEngine("r3k2r/7R/8/8/8/8/8/4K3 w kq - 0 1");

    const before = { ...board.castlingRights };

    const move = findMove(legalMoveGenerator, "h7-h8");

    board.makeMove(move);

    assert.equal(board.castlingRights.blackKingSide, false);
    assert.equal(board.castlingRights.blackQueenSide, true);

    board.undoMove();

    assert.deepEqual(board.castlingRights, before);

});

//======================================
// Category 7 (continued): en passant square, halfmove clock,
// fullmove number, hash key, and repetition state through
// make/undo.
//======================================

test("en passant square is set by a double pawn push and cleared/restored correctly through make/undo", () => {

    const { board, legalMoveGenerator } =
        createEngine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

    const before = board.enPassantSquare;

    assert.equal(before, -1, "no en passant square at the start position");

    const move = findMove(legalMoveGenerator, "e2-e4");

    board.makeMove(move);

    assert.notEqual(
        board.enPassantSquare,
        -1,
        "a double pawn push must set an en passant square"
    );

    board.undoMove();

    assert.equal(
        board.enPassantSquare,
        before,
        "undo must restore the pre-move en passant square"
    );

});

test("halfmove clock and fullmove number round-trip exactly through make/undo", () => {

    //----------------------------------
    // NOTE on current behavior (discovered while building this
    // harness, not something this task changes): board.js's
    // makeMove()/undoMove() save and restore halfMoveClock and
    // fullMoveNumber in the move history exactly as they save
    // and restore castling rights or the en passant square --
    // but neither field is ever incremented or reset forward
    // during makeMove() itself. fullMoveNumber's gap is already
    // known and worked around one layer up, in
    // js/uci/uciengine.js's UciSession.currentFullMoveNumber
    // (see the comments there). halfMoveClock's gap does not
    // currently have an equivalent workaround anywhere, which
    // means Board.isFiftyMoveDraw() (halfMoveClock >= 100) can
    // never actually trigger during play -- flagged here as a
    // finding for a separate task, not fixed in this one.
    //
    // This test therefore checks what IS true today: undo
    // restores both fields to their exact pre-move values, i.e.
    // the save/restore plumbing itself is correct, independent
    // of whether the forward value ever changes.
    //----------------------------------

    const { board, legalMoveGenerator } =
        createEngine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 7 12");

    const halfMoveClockBefore = board.halfMoveClock;
    const fullMoveNumberBefore = board.fullMoveNumber;

    assert.equal(halfMoveClockBefore, 7);
    assert.equal(fullMoveNumberBefore, 12);

    const move = findMove(legalMoveGenerator, "g1-f3");

    board.makeMove(move);
    board.undoMove();

    assert.equal(board.halfMoveClock, halfMoveClockBefore);
    assert.equal(board.fullMoveNumber, fullMoveNumberBefore);

});

test("hash key and repetition table round-trip exactly through make/undo (quiet move and capture)", () => {

    const { board, zobrist, legalMoveGenerator } =
        createEngine("r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 4 8");

    const hashBefore = board.hashKey;
    const tableLengthBefore = board.repetitionTable.length;

    //----------------------------------
    // Quiet move
    //----------------------------------

    const quietMove = findMove(legalMoveGenerator, "d2-e3");

    board.makeMove(quietMove);

    assert.notEqual(
        board.hashKey,
        hashBefore,
        "hash key must change after a move"
    );

    assert.equal(
        board.hashKey,
        zobrist.generate(board),
        "incrementally-updated hash must match a from-scratch regeneration"
    );

    assert.equal(
        board.repetitionTable.length,
        tableLengthBefore + 1
    );

    board.undoMove();

    assert.equal(board.hashKey, hashBefore);
    assert.equal(board.repetitionTable.length, tableLengthBefore);

    //----------------------------------
    // Capture
    //----------------------------------

    const captureMove = findMove(legalMoveGenerator, "d4-e5");

    board.makeMove(captureMove);

    assert.notEqual(board.hashKey, hashBefore);

    assert.equal(
        board.hashKey,
        zobrist.generate(board),
        "incrementally-updated hash must match a from-scratch regeneration after a capture"
    );

    assert.equal(
        board.repetitionTable.length,
        tableLengthBefore + 1
    );

    board.undoMove();

    assert.equal(board.hashKey, hashBefore);
    assert.equal(board.repetitionTable.length, tableLengthBefore);

});
