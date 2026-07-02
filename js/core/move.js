//=====================================
// move.js
//=====================================

import { algebraic } from "./square.js";

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

        return (this.flags & MoveFlags.CAPTURE) !== 0;

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

        return {

            from: this.from(),

            to: this.to(),

            notation: this.toString()

        };

    }

}