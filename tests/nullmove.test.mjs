//======================================
// nullmove.test.mjs
//
// Board-state round-trip coverage for the search-only null
// move (makeNullMove / undoNullMove). A null move passes the
// turn without touching a piece; these tests pin down every
// state field it changes and restores:
//
//   - side to move flips (and its Zobrist key)
//   - en passant availability is cleared for the skipped turn
//     (and its Zobrist file key), restored exactly on undo
//   - legal draw state is untouched: halfMoveClock,
//     fullMoveNumber, and repetitionTable remain legal-history
//     state only, since a null move is not a legal chess move
//   - hashKey snapshot-restored bit-for-bit, and the
//     incremental null hash must equal a full Zobrist
//     regeneration of the post-null position
//   - piece lists, material, king squares, castling rights,
//     and moveHistory are untouched
//
// Also covers nesting (null + real move in both orders) and
// stack discipline (two nulls deep), since search interleaves
// null probes with ordinary make/undo.
//======================================

import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Search, { SearchTimeout } from "../js/engine/search.js";
import Evaluation from "../js/engine/evaluation.js";
import Zobrist from "../js/engine/zobrist.js";

const FENS = [

    // startpos
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",

    // en passant square set, white to move
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",

    // en passant square set, black to move
    "rnbqkbnr/ppp1pppp/8/8/3pP3/5N2/PPPP1PPP/RNBQKB1R b KQkq e3 0 3",

    // middlegame with full castling-rights mix
    "r3k2r/ppp1nppp/2n1pq2/3p4/3P1P2/2PQ1NP1/PP1N1P1P/R3K2R b KQkq - 0 1",

    // king-and-pawn zugzwang structure (Fine 70)
    "8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1",

    // heavy-piece mate-net middlegame
    "5r1k/6pp/5q2/1Rb1p3/4p3/1QP3Pb/P3RP1K/8 b - - 4 54",

    // low material rook vs pawn
    "8/8/8/8/2k5/2p5/8/3KR3 w - - 0 1"

];

function createBoard(fen) {

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

    return { board, zobrist, legalMoveGenerator };

}

function createSearch(fen) {

    const { board, zobrist, legalMoveGenerator } =
        createBoard(fen);

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
        legalMoveGenerator,
        evaluation,
        search
    };

}

function snapshot(board) {

    return {
        fen: FEN.export(board),
        hash: board.hashKey,
        side: board.sideToMove,
        enPassant: board.enPassantSquare,
        halfMove: board.halfMoveClock,
        fullMove: board.fullMoveNumber,
        repetitionLength: board.repetitionTable.length,
        moveHistoryLength: board.moveHistory.length,
        nullHistoryLength: board.nullMoveHistory.length,
        whiteKing: board.whiteKing,
        blackKing: board.blackKing,
        whiteMaterial: board.whiteMaterial,
        blackMaterial: board.blackMaterial,
        castling: JSON.stringify(board.castlingRights)
    };

}

test("null move flips side, clears en passant, and round-trips every state field", () => {

    for (const fen of FENS) {

        const { board, zobrist } = createBoard(fen);

        const before = snapshot(board);

        board.makeNullMove();

        assert.equal(board.sideToMove, -before.side, fen);
        assert.equal(board.enPassantSquare, -1, fen);
        assert.equal(board.halfMoveClock, before.halfMove, fen);
        assert.equal(board.fullMoveNumber, before.fullMove, fen);
        assert.equal(board.moveHistory.length, before.moveHistoryLength, fen);
        assert.equal(
            board.repetitionTable.length,
            before.repetitionLength,
            fen
        );

        board.undoNullMove();

        assert.deepEqual(snapshot(board), before, fen);

    }

});

test("null move does not create artificial fifty-move or repetition-draw state", () => {

    const { board } = createBoard(
        "8/8/8/8/8/8/4k3/4K3 w - - 99 1"
    );

    assert.equal(board.isFiftyMoveDraw(), false);
    assert.equal(board.repetitionCount(), 1);

    const tableBefore =
        [...board.repetitionTable];

    board.makeNullMove();

    assert.equal(board.halfMoveClock, 99);
    assert.equal(board.isFiftyMoveDraw(), false);
    assert.equal(board.repetitionCount(), 1);
    assert.deepEqual(board.repetitionTable, tableBefore);

    board.undoNullMove();

    assert.equal(board.halfMoveClock, 99);
    assert.equal(board.isFiftyMoveDraw(), false);
    assert.equal(board.repetitionCount(), 1);
    assert.deepEqual(board.repetitionTable, tableBefore);

});

test("incremental null-move hash matches a full Zobrist regeneration", () => {

    for (const fen of FENS) {

        const { board, zobrist } = createBoard(fen);

        board.makeNullMove();

        assert.equal(
            board.hashKey,
            zobrist.generate(board),
            fen
        );

        board.undoNullMove();

        assert.equal(
            board.hashKey,
            zobrist.generate(board),
            fen
        );

    }

});

test("null move nests correctly with real moves in both orders", () => {

    for (const fen of FENS) {

        const { board, zobrist, legalMoveGenerator } = createBoard(fen);

        const before = snapshot(board);

        // null, then a real move, undo both
        board.makeNullMove();

        const replies = legalMoveGenerator.generateMoves();

        if (replies.length > 0) {

            board.makeMove(replies[0]);

            assert.equal(
                board.hashKey,
                zobrist.generate(board),
                fen
            );

            board.undoMove();

        }

        board.undoNullMove();

        assert.deepEqual(snapshot(board), before, fen);

        // a real move, then null, undo both
        const moves = legalMoveGenerator.generateMoves();

        if (moves.length > 0) {

            board.makeMove(moves[0]);

            const middle = snapshot(board);

            board.makeNullMove();

            assert.equal(
                board.hashKey,
                zobrist.generate(board),
                fen
            );

            board.undoNullMove();

            assert.deepEqual(snapshot(board), middle, fen);

            board.undoMove();

        }

        assert.deepEqual(snapshot(board), before, fen);

    }

});

test("sequential and stacked null pairs leave no state behind", () => {

    for (const fen of FENS) {

        const { board, zobrist } = createBoard(fen);

        const before = snapshot(board);

        board.makeNullMove();
        board.undoNullMove();
        board.makeNullMove();
        board.undoNullMove();

        assert.deepEqual(snapshot(board), before, fen);

        board.makeNullMove();
        board.makeNullMove();

        assert.equal(
            board.hashKey,
            zobrist.generate(board),
            fen
        );

        board.undoNullMove();
        board.undoNullMove();

        assert.deepEqual(snapshot(board), before, fen);

    }

});

test("timeout during a null subtree always restores the board", () => {

    const {
        board,
        search
    } = createSearch(
        "r2qk2r/pQp3pp/3p4/6b1/8/8/PPP3PP/R3KB1R b KQkq - 0 15"
    );

    const before =
        snapshot(board);

    let injected = false;

    search.checkSearchDeadline = function () {

        if (
            !injected &&
            this.board.nullMoveHistory.length > 0
        ) {

            injected = true;
            throw new SearchTimeout();

        }

    };

    assert.throws(
        () => search.negamax(4, -1, 0),
        SearchTimeout
    );

    assert.deepEqual(snapshot(board), before);

});
