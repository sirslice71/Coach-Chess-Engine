//=====================================
// move.js
//=====================================

import { algebraic } from "./square.js";

//----------------------------------
// Debug-only promotion suffix (Q/R/B/N), keyed by the absolute
// piece value shared by both colors (see piece.js's Piece
// constants). Used only by debug() below -- toString() itself
// is left unchanged since it's relied on elsewhere (test helper
// findMove()s, board.js's history logging, UCI move formatting)
// for exact "from-to" string matching, including cases that
// intentionally disambiguate promotion choices via
// promotedPiece rather than the string itself (see
// tests/material.test.mjs's "promotion updates material and
// undo restores it" test).
//----------------------------------

const DEBUG_PROMOTION_LETTERS = {
    2: "N",
    3: "B",
    4: "R",
    5: "Q"
};

export const MoveFlags = {

    NONE: 0,

    CAPTURE: 1,

    EN_PASSANT: 2,

    CASTLE_KING: 4,

    CASTLE_QUEEN: 8,

    PROMOTION: 16,

    DOUBLE_PAWN: 32

};

export default class Move {

    constructor(

        fromSquare,
        toSquare,
        piece,
        capturedPiece = 0,
        promotedPiece = 0,
        flags = MoveFlags.NONE

    ){

        this.fromSquare = fromSquare;

        this.toSquare = toSquare;

        this.piece = piece;

        this.capturedPiece = capturedPiece;

        this.promotedPiece = promotedPiece;

        this.flags = flags;

        this.previousWhiteKingSide = false;
        this.previousWhiteQueenSide = false;

        this.previousBlackKingSide = false;
        this.previousBlackQueenSide = false;

        // Used by search engine
        this.score = 0;

        this.key = (fromSquare << 6) | toSquare;

    }

    toString() {
        return `${algebraic(this.fromSquare)}-${algebraic(this.toSquare)}`;
    }

    isCapture() {

        return (

            this.flags &

            (MoveFlags.CAPTURE | MoveFlags.EN_PASSANT)

        ) !== 0;

    }

    isPromotion() {

        return (this.flags & MoveFlags.PROMOTION) !== 0;

    }

    isCastle() {

        return (this.flags & (MoveFlags.CASTLE_KING | MoveFlags.CASTLE_QUEEN)) !== 0;

    }

    isEnPassant() {

        return (this.flags & MoveFlags.EN_PASSANT) !== 0;

    }

    debug() {

        //----------------------------------
        // Debug-only: append the promotion choice (=Q/=R/=B/=N)
        // so the four promotion moves from the same from/to
        // squares are distinguishable in logs/debug output.
        // toString() itself is unchanged -- see the comment on
        // DEBUG_PROMOTION_LETTERS above.
        //----------------------------------

        const promotionSuffix =
            this.isPromotion()
                ? `=${DEBUG_PROMOTION_LETTERS[Math.abs(this.promotedPiece)] || "?"}`
                : "";

        return {

            from: this.fromSquare,

            to: this.toSquare,

            notation: this.toString() + promotionSuffix,

            promotedPiece: this.promotedPiece

        };

    }

}
