//======================================
// see.js
//======================================

import { Piece, PieceValue } from "../core/piece.js";

const KNIGHT_OFFSETS = [
    -17, -15, -10, -6,
    6, 10, 15, 17
];

const KING_OFFSETS = [
    -9, -8, -7,
    -1, 1,
    7, 8, 9
];

const BISHOP_DIRECTIONS = [
    -9, -7, 7, 9
];

const ROOK_DIRECTIONS = [
    -8, -1, 1, 8
];

export default class SEE {

    static evaluateCapture(board, move) {

        if (!move.isCapture()) {

            return 0;

        }

        const occupied =
            board.squares.slice();

        const capturedPiece =
            move.isEnPassant()

                ? move.piece > 0
                    ? Piece.BP
                    : Piece.WP

                : move.capturedPiece;

        const promotionGain =
            move.isPromotion()

                ? this.pieceValue(move.promotedPiece) -
                    this.pieceValue(move.piece)

                : 0;

        const gains = [
            this.pieceValue(capturedPiece) +
            promotionGain
        ];

        const captureSquare =
            move.toSquare;

        let pieceOnSquare =
            move.isPromotion()
                ? move.promotedPiece
                : move.piece;

        occupied[move.fromSquare] = Piece.EMPTY;

        if (move.isEnPassant()) {

            const pawnSquare =
                move.piece > 0
                    ? move.toSquare + 8
                    : move.toSquare - 8;

            occupied[pawnSquare] = Piece.EMPTY;

        }

        occupied[captureSquare] =
            pieceOnSquare;

        let side =
            move.piece > 0
                ? -1
                : 1;

        let depth = 0;

        while (true) {

            const attacker =
                this.findLeastValuableAttacker(
                    occupied,
                    captureSquare,
                    side
                );

            if (!attacker) {

                break;

            }

            depth++;

            gains[depth] =
                this.pieceValue(pieceOnSquare) -
                gains[depth - 1];

            occupied[attacker.square] =
                Piece.EMPTY;

            pieceOnSquare =
                attacker.piece;

            occupied[captureSquare] =
                pieceOnSquare;

            side *= -1;

        }

        while (depth > 0) {

            gains[depth - 1] =
                -Math.max(
                    -gains[depth - 1],
                    gains[depth]
                );

            depth--;

        }

        return gains[0] || 0;

    }

    static findLeastValuableAttacker(occupied, square, side) {

        return (

            this.findPawnAttacker(
                occupied,
                square,
                side
            ) ||

            this.findKnightAttacker(
                occupied,
                square,
                side
            ) ||

            this.findSlidingAttacker(
                occupied,
                square,
                side,
                BISHOP_DIRECTIONS,
                side > 0
                    ? Piece.WB
                    : Piece.BB
            ) ||

            this.findSlidingAttacker(
                occupied,
                square,
                side,
                ROOK_DIRECTIONS,
                side > 0
                    ? Piece.WR
                    : Piece.BR
            ) ||

            this.findQueenAttacker(
                occupied,
                square,
                side
            ) ||

            this.findKingAttacker(
                occupied,
                square,
                side
            )

        );

    }

    static findPawnAttacker(occupied, square, side) {

        const offsets =
            side > 0
                ? [7, 9]
                : [-7, -9];

        const targetFile = square & 7;
        const pawn =
            side > 0
                ? Piece.WP
                : Piece.BP;

        for (const offset of offsets) {

            const attackerSquare =
                square + offset;

            if (attackerSquare < 0 || attackerSquare > 63) {

                continue;

            }

            const attackerFile =
                attackerSquare & 7;

            if (Math.abs(attackerFile - targetFile) !== 1) {

                continue;

            }

            if (occupied[attackerSquare] === pawn) {

                return {
                    square: attackerSquare,
                    piece: pawn
                };

            }

        }

        return null;

    }

    static findKnightAttacker(occupied, square, side) {

        const startRank = square >> 3;
        const startFile = square & 7;
        const knight =
            side > 0
                ? Piece.WN
                : Piece.BN;

        for (const offset of KNIGHT_OFFSETS) {

            const attackerSquare =
                square + offset;

            if (attackerSquare < 0 || attackerSquare > 63) {

                continue;

            }

            const attackerRank =
                attackerSquare >> 3;

            const attackerFile =
                attackerSquare & 7;

            if (Math.abs(attackerRank - startRank) > 2) {

                continue;

            }

            if (Math.abs(attackerFile - startFile) > 2) {

                continue;

            }

            if (occupied[attackerSquare] === knight) {

                return {
                    square: attackerSquare,
                    piece: knight
                };

            }

        }

        return null;

    }

    static findSlidingAttacker(

        occupied,

        square,

        side,

        directions,

        attackerPiece

    ) {

        for (const direction of directions) {

            const attackerSquare =
                this.findRayAttacker(
                    occupied,
                    square,
                    direction,
                    attackerPiece
                );

            if (attackerSquare !== -1) {

                return {
                    square: attackerSquare,
                    piece: attackerPiece
                };

            }

        }

        return null;

    }

    static findQueenAttacker(occupied, square, side) {

        const queen =
            side > 0
                ? Piece.WQ
                : Piece.BQ;

        for (const direction of [
            ...BISHOP_DIRECTIONS,
            ...ROOK_DIRECTIONS
        ]) {

            const attackerSquare =
                this.findRayAttacker(
                    occupied,
                    square,
                    direction,
                    queen
                );

            if (attackerSquare !== -1) {

                return {
                    square: attackerSquare,
                    piece: queen
                };

            }

        }

        return null;

    }

    static findRayAttacker(

        occupied,

        square,

        direction,

        attackerPiece

    ) {

        let current = square;

        while (true) {

            const previous =
                current;

            current += direction;

            if (current < 0 || current >= 64) {

                return -1;

            }

            if (!this.isStepLegal(
                previous,
                current,
                direction
            )) {

                return -1;

            }

            const piece =
                occupied[current];

            if (piece === Piece.EMPTY) {

                continue;

            }

            return piece === attackerPiece
                ? current
                : -1;

        }

    }

    static findKingAttacker(occupied, square, side) {

        const startRank = square >> 3;
        const startFile = square & 7;
        const king =
            side > 0
                ? Piece.WK
                : Piece.BK;

        for (const offset of KING_OFFSETS) {

            const attackerSquare =
                square + offset;

            if (attackerSquare < 0 || attackerSquare > 63) {

                continue;

            }

            const attackerRank =
                attackerSquare >> 3;

            const attackerFile =
                attackerSquare & 7;

            if (Math.abs(attackerRank - startRank) > 1) {

                continue;

            }

            if (Math.abs(attackerFile - startFile) > 1) {

                continue;

            }

            if (occupied[attackerSquare] === king) {

                return {
                    square: attackerSquare,
                    piece: king
                };

            }

        }

        return null;

    }

    static isStepLegal(previous, current, direction) {

        const prevRank = previous >> 3;
        const prevFile = previous & 7;

        const currRank = current >> 3;
        const currFile = current & 7;

        switch (direction) {

            case -1:
                return (
                    currRank === prevRank &&
                    currFile === prevFile - 1
                );

            case 1:
                return (
                    currRank === prevRank &&
                    currFile === prevFile + 1
                );

            case -8:
                return (
                    currRank === prevRank - 1 &&
                    currFile === prevFile
                );

            case 8:
                return (
                    currRank === prevRank + 1 &&
                    currFile === prevFile
                );

            case -9:
                return (
                    currRank === prevRank - 1 &&
                    currFile === prevFile - 1
                );

            case -7:
                return (
                    currRank === prevRank - 1 &&
                    currFile === prevFile + 1
                );

            case 7:
                return (
                    currRank === prevRank + 1 &&
                    currFile === prevFile - 1
                );

            case 9:
                return (
                    currRank === prevRank + 1 &&
                    currFile === prevFile + 1
                );

            default:
                return false;

        }

    }

    static pieceValue(piece) {

        return PieceValue[Math.abs(piece)] || 0;

    }

}
