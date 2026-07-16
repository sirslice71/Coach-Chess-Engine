//==================================================
// legalmovegen.js
//==================================================

import Attack from "./attack.js";
import FEN from "../core/fen.js";
import EngineDebug from "../dev/enginedebug.js";
import { MoveFlags } from "../core/move.js";
import { Piece } from "../core/piece.js";

//======================================================
// Conservative legality fast path ("Candidate B" -- see
// ARCHITECTURE-LEGALITY-REPORT.md for the full proof and audit).
//
// The authoritative legality test below (makeMove -> is-own-king-
// attacked -> undoMove) is unconditionally correct but pays a full
// board make/undo plus a ray-scan for every pseudo-legal move, even
// though most moves cannot possibly expose the mover's own king.
//
// PROOF (informal, see the architecture report for the full writeup):
// A move can only expose the mover's own king to check by one of:
//   (a) uncovering a rook/bishop/queen line to the king that the
//       moved piece was blocking -- requires the moved piece's ORIGIN
//       square to be collinear (same rank, file, or diagonal) with
//       the king, since a blocker must sit ON the line it blocks;
//   (b) the move being a response to an EXISTING check (only possible
//       if the side is already in check);
//   (c) a king move to a newly-unsafe square, including the square
//       the king itself just vacated;
//   (d) castling through/out of/into check;
//   (e) an en-passant double-pawn-removal opening a rank line to the
//       king that an ordinary capture never would.
// If the side is not currently in check, the move is not a king
// move, not castling, not en passant, and the moving piece's ORIGIN
// square is not collinear with the mover's own king, then none of
// (a)-(e) can apply, and the move cannot expose the mover's own king.
// It is therefore legal without make/undo.
//
// Every other move (in check, king move, castling, en passant, or
// origin square aligned with the own king) still uses the
// unconditional make/undo fallback below -- this fast path can only
// ever ACCEPT moves the fallback would also accept; it never rejects
// a move the fallback would accept, and it is never consulted for
// anything the proof does not cover.
//======================================================

function alignedWithKing(square, kingSquare) {
    const f1 = square & 7, r1 = square >> 3;
    const f2 = kingSquare & 7, r2 = kingSquare >> 3;
    if (f1 === f2 || r1 === r2) return true;
    return Math.abs(f1 - f2) === Math.abs(r1 - r2);
}

// Returns true only when legality is PROVEN by the argument above --
// see the proof conditions (i)-(v) in the architecture report. Pure,
// no board mutation, no allocation.
function provenLegalWithoutMakeUndo(move, ownKing) {
    if (move.piece === Piece.WK || move.piece === Piece.BK) return false;
    if (move.flags & (MoveFlags.CASTLE_KING | MoveFlags.CASTLE_QUEEN)) return false;
    if (move.flags & MoveFlags.EN_PASSANT) return false;
    return !alignedWithKing(move.fromSquare, ownKing);
}

export default class LegalMoveGenerator {

    // Master switch for the fast path proven above. True is this
    // candidate branch's shipped behavior; set to false to reproduce
    // the unconditional make/undo baseline within the same process
    // (used by the differential-testing harness for direct A/B
    // comparison without needing a second worktree).
    static FAST_PATH_ENABLED = true;

    // Lightweight, always-cheap counters (two integer increments),
    // disabled by default -- mirrors the pattern used elsewhere in
    // this codebase for optional route/diagnostic counters. Reset with
    // resetDiagnostics(). No effect on behavior either way.
    static diagnosticsEnabled = false;
    static diagnostics = { fastPathAccepts: 0, fallbackChecks: 0 };
    static resetDiagnostics() {
        LegalMoveGenerator.diagnostics.fastPathAccepts = 0;
        LegalMoveGenerator.diagnostics.fallbackChecks = 0;
    }

    constructor(board, moveGenerator) {

        this.board = board;
        this.moveGenerator = moveGenerator;

    }

    generateMoves(capturesOnly = false) {

        const legalMoves = [];

        //----------------------------------
        // Generate Pseudo Legal Moves
        //----------------------------------

        const pseudoMoves =

            this.moveGenerator.generateMoves(
                capturesOnly
            );

        //----------------------------------
        // Conservative fast path: computed once per call, not once
        // per move. If the side is in check, every move for this
        // call falls back to the authoritative check below --
        // response-to-check legality is out of this fast path's
        // proven scope entirely.
        //----------------------------------

        const sideInCheck = this.board.isInCheck();
        const ownKing =
            this.board.sideToMove > 0
                ? this.board.whiteKing
                : this.board.blackKing;

        //----------------------------------
        // Test Legality
        //----------------------------------

        for (const move of pseudoMoves) {

            if (LegalMoveGenerator.FAST_PATH_ENABLED && !sideInCheck && provenLegalWithoutMakeUndo(move, ownKing)) {

                legalMoves.push(move);

                if (LegalMoveGenerator.diagnosticsEnabled) {
                    LegalMoveGenerator.diagnostics.fastPathAccepts++;
                }

                continue;

            }

            if (LegalMoveGenerator.diagnosticsEnabled) {
                LegalMoveGenerator.diagnostics.fallbackChecks++;
            }

            this.board.makeMove(move);

            // sideToMove has already switched.
            // Test the king that just moved.

            const kingSquare =

                this.board.sideToMove > 0

                    ? this.board.blackKing

                    : this.board.whiteKing;

            const illegal =

                Attack.isSquareAttacked(

                    this.board,

                    kingSquare,

                    this.board.sideToMove > 0

                );

            this.board.undoMove();

            if (!illegal) {

                legalMoves.push(move);

            }

        }

        return legalMoves;

    }

    //----------------------------------
    // Generate Legal Captures
    //----------------------------------

    generateCaptures() {

        return this.generateMoves(true);

    }

}
