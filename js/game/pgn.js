//======================================
// pgn.js
//======================================
//
// Browser-only PGN / SAN helpers.
//
// Pure functions only. No board mutation,
// no engine calls, no UI calls.
//
// Used by GameController to build:
// - chess.exportPgn()
// - the "san" field stored per ply for
//   chess.evalHistory()
//
// Does NOT touch UCI, search, or evaluation.
//======================================

import {
    FILE_NAMES,
    RANK_NAMES,
    file,
    rank,
    algebraic
} from "../core/square.js";

import { Piece } from "../core/piece.js";
import { MoveFlags } from "../core/move.js";

//----------------------------------
// Piece Letter
//----------------------------------

function pieceLetter(piece) {

    switch (Math.abs(piece)) {

        case Piece.WN: return "N";
        case Piece.WB: return "B";
        case Piece.WR: return "R";
        case Piece.WQ: return "Q";
        case Piece.WK: return "K";

        default: return "";

    }

}

//----------------------------------
// Disambiguation
//
// legalMoves must be the legal move
// list generated in the PRE-MOVE
// position (same side to move as
// the move being described).
//----------------------------------

function disambiguation(move, legalMoves) {

    // Exclude by fromSquare, not object identity:
    // legalMoves is regenerated fresh by the caller,
    // so the move being described will never be the
    // exact same object instance even though it is
    // the same move.

    const candidates = legalMoves.filter(candidate =>

        candidate.fromSquare !== move.fromSquare &&
        candidate.piece === move.piece &&
        candidate.toSquare === move.toSquare

    );

    if (candidates.length === 0) {
        return "";
    }

    const fromFile = file(move.fromSquare);
    const fromRank = rank(move.fromSquare);

    const shareFile = candidates.some(
        candidate => file(candidate.fromSquare) === fromFile
    );

    const shareRank = candidates.some(
        candidate => rank(candidate.fromSquare) === fromRank
    );

    if (!shareFile) {
        return FILE_NAMES[fromFile];
    }

    if (!shareRank) {
        return RANK_NAMES[fromRank];
    }

    return FILE_NAMES[fromFile] + RANK_NAMES[fromRank];

}

//----------------------------------
// SAN for a single move.
//
// Must be called BEFORE board.makeMove(move),
// using the legal move list generated in that
// same pre-move position (needed for
// disambiguation).
//
// Does NOT include the check (+) or
// checkmate (#) suffix. Callers add that
// after the move has actually been made,
// since that requires the post-move position.
//----------------------------------

export function sanForMove(move, legalMoves) {

    if (move.isCastle()) {

        return (move.flags & MoveFlags.CASTLE_KING)
            ? "O-O"
            : "O-O-O";

    }

    const isPawn =
        Math.abs(move.piece) === Piece.WP;

    const capture = move.isCapture();

    const destination = algebraic(move.toSquare);

    if (isPawn) {

        let san = "";

        if (capture) {
            san += FILE_NAMES[file(move.fromSquare)] + "x";
        }

        san += destination;

        if (move.isPromotion()) {
            san += "=" + pieceLetter(move.promotedPiece);
        }

        return san;

    }

    const letter = pieceLetter(move.piece);
    const disambig = disambiguation(move, legalMoves);

    return letter + disambig + (capture ? "x" : "") + destination;

}

//----------------------------------
// Date Header (YYYY.MM.DD)
//----------------------------------

export function formatDate(date = new Date()) {

    const year = date.getFullYear();

    const month =
        String(date.getMonth() + 1).padStart(2, "0");

    const day =
        String(date.getDate()).padStart(2, "0");

    return `${year}.${month}.${day}`;

}

//----------------------------------
// PGN Headers
//----------------------------------

export function buildHeaders({ humanSide, result }) {

    const white =
        humanSide > 0
            ? "Human"
            : "Coach";

    const black =
        humanSide > 0
            ? "Coach"
            : "Human";

    return [

        `[Event "Coach Browser Game"]`,
        `[Site "Local Browser"]`,
        `[Date "${formatDate()}"]`,
        `[Round "1"]`,
        `[White "${white}"]`,
        `[Black "${black}"]`,
        `[Result "${result}"]`

    ].join("\n");

}

//----------------------------------
// PGN Move Text
//
// gameMoves entries must each already
// have a "san" field (see gamecontroller.js
// recordMove()).
//----------------------------------

export function buildMoveText(gameMoves) {

    let text = "";

    for (let i = 0; i < gameMoves.length; i += 2) {

        const moveNumber = Math.floor(i / 2) + 1;

        const white = gameMoves[i];
        const black = gameMoves[i + 1];

        text += `${moveNumber}. ${white ? white.san : ""}`;

        if (black) {
            text += ` ${black.san}`;
        }

        text += " ";

    }

    return text.trim();

}

//----------------------------------
// Full PGN String
//----------------------------------

export function buildPgnString({ gameMoves, humanSide, result }) {

    const headers = buildHeaders({ humanSide, result });

    const moveText = buildMoveText(gameMoves);

    return `${headers}\n\n${moveText} ${result}`.trim();

}

const PGN = {

    sanForMove,
    formatDate,
    buildHeaders,
    buildMoveText,
    buildPgnString

};

export default PGN;
