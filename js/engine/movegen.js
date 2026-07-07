//==================================================
// movegen.js
//==================================================

import { Piece } from "../core/piece.js";
import { WHITE, BLACK } from "../core/constants.js";
import Move, { MoveFlags } from "../core/move.js";
import Attack from "./attack.js";


//----------------------------------
// Promotion Choices
//
// Every legal promotion offers FOUR pieces: queen, rook,
// bishop, and knight. Generation previously emitted only the
// queen, which is a legal-move-generation correctness bug
// (found by the perft harness: Kiwipete depth 4 was short of
// the published 4,085,603 because underpromotions were
// missing). Order queens first so move ordering's promotion
// bonus keeps the usual best candidate early.
//----------------------------------

const WHITE_PROMOTIONS = [Piece.WQ, Piece.WR, Piece.WB, Piece.WN];

const BLACK_PROMOTIONS = [Piece.BQ, Piece.BR, Piece.BB, Piece.BN];

export default class MoveGenerator {

    //==================================================
    // Direction Tables
    //==================================================

    KNIGHT_OFFSETS = [
        -17, -15, -10, -6,
        6,  10,  15, 17
    ];

    KING_OFFSETS = [
        -9, -8, -7,
        -1,     1,
        7,  8,  9
    ];

    BISHOP_DIRECTIONS = [
        -9, -7,
        7,  9
    ];

    ROOK_DIRECTIONS = [
        -8,
        -1, 1,
        8
    ];

    QUEEN_DIRECTIONS = [
        -9,-8,-7,
        -1,    1,
        7, 8, 9
    ];

    constructor(board) {

        this.board = board;

    }

    generateMoves(capturesOnly = false) {

        const moves = [];

        const side = this.board.sideToMove;

        const pieceList =
            side === WHITE
                ? this.board.whitePieces
                : this.board.blackPieces;

        for (const square of pieceList.knights)
            this.generateKnightMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        for (const square of pieceList.bishops)
            this.generateBishopMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        for (const square of pieceList.rooks)
            this.generateRookMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        for (const square of pieceList.queens)
            this.generateQueenMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        for (const square of pieceList.king)
            this.generateKingMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        for (const square of pieceList.pawns)
            this.generatePawnMoves(
                square,
                this.board.pieceAt(square),
                moves,
                capturesOnly
            );

        if (!capturesOnly) {

            this.generateCastlingMoves(moves);

        }

        return moves;

    }

    generatePawnMoves(
        square,
        piece,
        moves,
        capturesOnly = false
    ) {

        const white = piece > 0;

        const direction = white ? -8 : 8;

        const startRank = white ? 6 : 1;

        const promotionRank = white ? 0 : 7;

        const rank = square >> 3;

        //--------------------------------------------------
        // Single Push
        //--------------------------------------------------

        const oneForward = square + direction;

        if (
            !capturesOnly &&
            oneForward >= 0 &&
            oneForward < 64 &&
            this.board.pieceAt(oneForward) === Piece.EMPTY
        ) {

        if ((oneForward >> 3) === promotionRank) {

            const promotions =
                white ? WHITE_PROMOTIONS : BLACK_PROMOTIONS;

            for (const promotedPiece of promotions) {

                moves.push(

                    new Move(

                        square,

                        oneForward,

                        piece,

                        Piece.EMPTY,

                        promotedPiece,

                        MoveFlags.PROMOTION

                    )

                );

            }

        }
        else {

            moves.push(

                new Move(

                    square,

                    oneForward,

                    piece

                )

            );

        }

            //--------------------------------------------------
            // Double Push
            //--------------------------------------------------

            if (rank === startRank) {

                const twoForward = square + direction * 2;

                if (this.board.pieceAt(twoForward) === Piece.EMPTY) {

                    moves.push(

                        new Move(

                            square,

                            twoForward,

                            piece,

                            0,

                            0,

                            MoveFlags.DOUBLE_PAWN

                        )

                    );

                }

            }

        }

        //--------------------------------------------------
        // Captures (including En Passant)
        //--------------------------------------------------

        const captureOffsets = white
            ? [-9, -7]
            : [7, 9];

        for (const offset of captureOffsets) {

            const target = square + offset;

            if (target < 0 || target > 63)
                continue;

            const fromFile = square & 7;
            const targetFile = target & 7;

            if (Math.abs(targetFile - fromFile) !== 1)
                continue;

            //----------------------------------
            // En Passant Candidate
            //----------------------------------
            /*
            console.log(

                "EP candidate",

                {

                    from: square,

                    to: target,

                    epSquare: this.board.enPassantSquare

                }

            );
            */
            if (target === this.board.enPassantSquare) {
                /*
                console.error(

                    "GENERATING EP",

                    {

                        from: square,

                        to: target,

                        ep: this.board.enPassantSquare

                    }

                );    
                */
                moves.push(

                    new Move(

                        square,

                        target,

                        piece,

                        white ? Piece.BP : Piece.WP,

                        0,

                        MoveFlags.EN_PASSANT

                    )

                );

                continue;

            }

            //==========================
            // Normal Capture
            //==========================

            const targetPiece = this.board.pieceAt(target);

            if (targetPiece === Piece.EMPTY)
                continue;

            if (white && targetPiece < 0) {

                if ((target >> 3) === promotionRank) {

                    for (const promotedPiece of WHITE_PROMOTIONS) {

                        moves.push(

                            new Move(

                                square,

                                target,

                                piece,

                                targetPiece,

                                promotedPiece,

                                MoveFlags.CAPTURE | MoveFlags.PROMOTION

                            )

                        );

                    }

                }
                else {

                    moves.push(

                        new Move(

                            square,

                            target,

                            piece,

                            targetPiece,

                            0,

                            MoveFlags.CAPTURE

                        )

                    );

                }

            }

            if (!white && targetPiece > 0) {

                if ((target >> 3) === promotionRank) {

                    for (const promotedPiece of BLACK_PROMOTIONS) {

                        moves.push(

                            new Move(

                                square,

                                target,

                                piece,

                                targetPiece,

                                promotedPiece,

                                MoveFlags.CAPTURE | MoveFlags.PROMOTION

                            )

                        );

                    }

                }
                else {

                    moves.push(

                        new Move(

                            square,

                            target,

                            piece,

                            targetPiece,

                            0,

                            MoveFlags.CAPTURE

                        )

                    );

                }

            }

        }
    }


    generateKnightMoves(

        square,

        piece,

        moves,

        capturesOnly = false

    ) {

        const offsets = [

            -17, -15, -10, -6,

            6,  10,  15, 17

        ];

        const startRank = square >> 3;

        const startFile = square & 7;

        for (const offset of offsets) {

            const target = square + offset;

            if (target < 0 || target > 63)
                continue;

            const targetRank = target >> 3;

            const targetFile = target & 7;

            //----------------------------------
            // Prevent Wraparound
            //----------------------------------

            if (

                Math.abs(targetRank - startRank) > 2 ||

                Math.abs(targetFile - startFile) > 2

            ) {

                continue;

            }

            const targetPiece =

                this.board.pieceAt(target);

            //----------------------------------
            // Quiet Move
            //----------------------------------

            if (targetPiece === Piece.EMPTY) {

                if (!capturesOnly) {

                    moves.push(

                        new Move(

                            square,

                            target,

                            piece

                        )

                    );

                }

                continue;

            }

            //----------------------------------
            // White Capture
            //----------------------------------

            if (

                piece > 0 &&

                targetPiece < 0

            ) {

                moves.push(

                    new Move(

                        square,

                        target,

                        piece,

                        targetPiece,

                        0,

                        MoveFlags.CAPTURE

                    )

                );

                continue;

            }

            //----------------------------------
            // Black Capture
            //----------------------------------

            if (

                piece < 0 &&

                targetPiece > 0

            ) {

                moves.push(

                    new Move(

                        square,

                        target,

                        piece,

                        targetPiece,

                        0,

                        MoveFlags.CAPTURE

                    )

                );

            }

        }

    }
    

    generateSlidingMoves(
        square,
        piece,
        moves,
        directions,
        capturesOnly = false
    ) {

        const ownWhite = piece > 0;

        for (const direction of directions) {

            let target = square;

            while (true) {

                const previous = target;

                target += direction;

                if (target < 0 || target > 63)
                    break;

                const prevRank = previous >> 3;
                const prevFile = previous & 7;

                const targetRank = target >> 3;
                const targetFile = target & 7;

                let legalStep = false;

                switch (direction) {

                    case -1:
                        legalStep =
                            targetRank === prevRank &&
                            targetFile === prevFile - 1;
                        break;

                    case 1:
                        legalStep =
                            targetRank === prevRank &&
                            targetFile === prevFile + 1;
                        break;

                    case -8:
                        legalStep =
                            targetRank === prevRank - 1 &&
                            targetFile === prevFile;
                        break;

                    case 8:
                        legalStep =
                            targetRank === prevRank + 1 &&
                            targetFile === prevFile;
                        break;

                    case -9:
                        legalStep =
                            targetRank === prevRank - 1 &&
                            targetFile === prevFile - 1;
                        break;

                    case -7:
                        legalStep =
                            targetRank === prevRank - 1 &&
                            targetFile === prevFile + 1;
                        break;

                    case 7:
                        legalStep =
                            targetRank === prevRank + 1 &&
                            targetFile === prevFile - 1;
                        break;

                    case 9:
                        legalStep =
                            targetRank === prevRank + 1 &&
                            targetFile === prevFile + 1;
                        break;

                }

                if (!legalStep)
                    break;

                const targetPiece = this.board.pieceAt(target);

                if (targetPiece === Piece.EMPTY) {

                    if (!capturesOnly) {

                        moves.push(
                            new Move(square, target, piece)
                        );

                    }

                    continue;

                }

                if (ownWhite && targetPiece < 0) {

                    moves.push(
                        new Move(
                            square,
                            target,
                            piece,
                            targetPiece,
                            0,
                            MoveFlags.CAPTURE
                        )
                    );

                }

                if (!ownWhite && targetPiece > 0) {

                    moves.push(
                        new Move(
                            square,
                            target,
                            piece,
                            targetPiece,
                            0,
                            MoveFlags.CAPTURE
                        )
                    );

                }

                break;

            }

        }

    }

    generateBishopMoves(
        square,
        piece,
        moves,
        capturesOnly = false
    ) {

        this.generateSlidingMoves(
            square,
            piece,
            moves,
            this.BISHOP_DIRECTIONS,
            capturesOnly
        );

    }

    generateRookMoves(
        square,
        piece,
        moves,
        capturesOnly = false
    ) {

        this.generateSlidingMoves(
            square,
            piece,
            moves,
            this.ROOK_DIRECTIONS,
            capturesOnly
        );

    }

    generateQueenMoves(
        square,
        piece,
        moves,
        capturesOnly = false
    ) {

        this.generateSlidingMoves(
            square,
            piece,
            moves,
            this.QUEEN_DIRECTIONS,
            capturesOnly
        );

    }

    generateKingMoves(
        square,
        piece,
        moves,
        capturesOnly = false
    ) {

        const ownWhite = piece > 0;

        const startRank = square >> 3;
        const startFile = square & 7;

        for (const offset of this.KING_OFFSETS) {

            const target = square + offset;

            if (target < 0 || target > 63)
                continue;

            const targetRank = target >> 3;
            const targetFile = target & 7;

            if (Math.abs(targetRank - startRank) > 1)
                continue;

            if (Math.abs(targetFile - startFile) > 1)
                continue;

            const targetPiece = this.board.pieceAt(target);

            if (targetPiece === Piece.EMPTY) {

                if (!capturesOnly) {

                    moves.push(
                        new Move(
                            square,
                            target,
                            piece
                        )
                    );

                }

                continue;

            }

            if (ownWhite && targetPiece < 0) {

                moves.push(
                    new Move(
                        square,
                        target,
                        piece,
                        targetPiece,
                        0,
                        MoveFlags.CAPTURE
                    )
                );

            }

            if (!ownWhite && targetPiece > 0) {

                moves.push(
                    new Move(
                        square,
                        target,
                        piece,
                        targetPiece,
                        0,
                        MoveFlags.CAPTURE
                    )
                );

            }

        }

    }

    generateCastlingMoves(moves) {

        if (this.board.sideToMove > 0) {

            // White Kingside
            if (

                this.board.castlingRights.whiteKingSide &&

                this.board.pieceAt(61) === Piece.EMPTY &&
                this.board.pieceAt(62) === Piece.EMPTY &&

                !Attack.isSquareAttacked(this.board, 60, false) &&
                !Attack.isSquareAttacked(this.board, 61, false) &&
                !Attack.isSquareAttacked(this.board, 62, false)

            ) {

                moves.push(

                    new Move(

                        60,
                        62,
                        Piece.WK,
                        Piece.EMPTY,
                        0,
                        MoveFlags.CASTLE_KING

                    )

                );

            }

            // White Queenside
        if (

            this.board.castlingRights.whiteQueenSide &&

            this.board.pieceAt(59) === Piece.EMPTY &&
            this.board.pieceAt(58) === Piece.EMPTY &&
            this.board.pieceAt(57) === Piece.EMPTY &&

            !Attack.isSquareAttacked(this.board, 60, false) &&
            !Attack.isSquareAttacked(this.board, 59, false) &&
            !Attack.isSquareAttacked(this.board, 58, false)

        ) {

            moves.push(

                new Move(

                    60,
                    58,
                    Piece.WK,
                    Piece.EMPTY,
                    0,
                    MoveFlags.CASTLE_QUEEN

                )

            );

        }

        } else {

            // Black Kingside
            if (

                this.board.castlingRights.blackKingSide &&

                this.board.pieceAt(5) === Piece.EMPTY &&
                this.board.pieceAt(6) === Piece.EMPTY &&

                !Attack.isSquareAttacked(this.board, 4, true) &&
                !Attack.isSquareAttacked(this.board, 5, true) &&
                !Attack.isSquareAttacked(this.board, 6, true)

            ) {

                moves.push(

                    new Move(

                        4,
                        6,
                        Piece.BK,
                        Piece.EMPTY,
                        0,
                        MoveFlags.CASTLE_KING

                    )

                );

            }

            // Black Queenside
            if (

                this.board.castlingRights.blackQueenSide &&

                this.board.pieceAt(3) === Piece.EMPTY &&
                this.board.pieceAt(2) === Piece.EMPTY &&
                this.board.pieceAt(1) === Piece.EMPTY &&

                !Attack.isSquareAttacked(this.board, 4, true) &&
                !Attack.isSquareAttacked(this.board, 3, true) &&
                !Attack.isSquareAttacked(this.board, 2, true)

            ) {

                moves.push(

                    new Move(

                        4,
                        2,
                        Piece.BK,
                        Piece.EMPTY,
                        0,
                        MoveFlags.CASTLE_QUEEN

                    )

                );

            }

        }

    }

}
