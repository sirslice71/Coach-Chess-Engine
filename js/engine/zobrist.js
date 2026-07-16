//======================================
// zobrist.js
//======================================

import { Piece } from "../core/piece.js";
import { Squares } from "../core/square.js";
import Move, { MoveFlags } from "../core/move.js";

export default class Zobrist {

    constructor() {

        //----------------------------------
        // Piece Keys
        //----------------------------------
        // [piece][square]
        //----------------------------------

        this.pieces = [];

        //----------------------------------
        // Side To Move
        //----------------------------------

        this.side = 0n;

        //----------------------------------
        // Castling Rights
        //----------------------------------

        this.castling = [];

        //----------------------------------
        // En Passant Files
        //----------------------------------

        this.enPassant = [];

        //----------------------------------
        // Random Generator
        //----------------------------------
        // Deterministic PRNG Seed
        //----------------------------------
        // Fixed seed so Zobrist keys are
        // identical every run.
        //----------------------------------

        this.seed = 0xC9345525;

    }

    //----------------------------------
    // Initialize
    //----------------------------------

    initialize() {

        //----------------------------------
        // Piece Keys
        //----------------------------------

        this.pieces =

            Array.from(

                { length: 12 },

                () => Array(64)

            );

        for (let piece = 0; piece < 12; piece++) {

            for (let square = 0; square < 64; square++) {

                this.pieces[piece][square] = this.random64();

            }

        }

        //----------------------------------
        // Side
        //----------------------------------

        this.side = this.random64();

        //----------------------------------
        // Castling
        //----------------------------------

        this.castling = Array(16);

        for (let i = 0; i < 16; i++) {

            this.castling[i] = this.random64();

        }

        //----------------------------------
        // En Passant
        //----------------------------------

        this.enPassant = Array(8);

        for (let i = 0; i < 8; i++) {

            this.enPassant[i] = this.random64();

        }

    }

    random64() {

        const hi = BigInt(this.nextRandom());

        const lo = BigInt(this.nextRandom());

        return (hi << 32n) | lo;

    }

    nextRandom() {

        let x = this.seed >>> 0;

        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;

        this.seed = x >>> 0;

        return this.seed;

    }

    //----------------------------------
    // Piece Index
    //----------------------------------

    pieceIndex(piece) {

        switch (piece) {

            case Piece.WP: return 0;
            case Piece.WN: return 1;
            case Piece.WB: return 2;
            case Piece.WR: return 3;
            case Piece.WQ: return 4;
            case Piece.WK: return 5;

            case Piece.BP: return 6;
            case Piece.BN: return 7;
            case Piece.BB: return 8;
            case Piece.BR: return 9;
            case Piece.BQ: return 10;
            case Piece.BK: return 11;

        }

        return -1;

    }

    //----------------------------------
    // Piece -> Zobrist Index
    //----------------------------------

    pieceIndex(piece) {

        switch (piece) {

            case Piece.WP: return 0;
            case Piece.WN: return 1;
            case Piece.WB: return 2;
            case Piece.WR: return 3;
            case Piece.WQ: return 4;
            case Piece.WK: return 5;

            case Piece.BP: return 6;
            case Piece.BN: return 7;
            case Piece.BB: return 8;
            case Piece.BR: return 9;
            case Piece.BQ: return 10;
            case Piece.BK: return 11;

            default:
                return -1;

        }

    }

    //----------------------------------
    // Generate Hash
    //----------------------------------

    generate(board) {

        let hash = 0n;

        //----------------------------------
        // Pieces
        //----------------------------------

        for (let square = 0; square < 64; square++) {

            const piece = board.squares[square];

            if (piece === Piece.EMPTY)
                continue;

            const index = this.pieceIndex(piece);

            hash ^= this.pieces[index][square];

        }

        //----------------------------------
        // Side to Move
        //----------------------------------

        if (board.sideToMove < 0) {

            hash ^= this.side;

        }

        //----------------------------------
        // Castling
        //----------------------------------

        hash ^= this.castling[
            this.castlingIndex(board)
        ];

        //----------------------------------
        // En Passant
        //----------------------------------

        if (board.enPassantSquare !== -1) {

            const file = board.enPassantSquare & 7;

            hash ^= this.enPassant[file];

        }

        return hash;

    }

    verify(board) {

        return board.hashKey === this.generate(board);

    }

    //----------------------------------
    // Castling Index
    //----------------------------------

    castlingIndex(position) {

        if (Number.isInteger(position.castlingRightsBefore)) {

            return position.castlingRightsBefore;

        }

        const rights =
            position.castlingRights;

        let index = 0;

        if (rights.whiteKingSide)
            index |= 1;

        if (rights.whiteQueenSide)
            index |= 2;

        if (rights.blackKingSide)
            index |= 4;

        if (rights.blackQueenSide)
            index |= 8;

        return index;

    }

    //----------------------------------
    // Verify Hash
    //----------------------------------

    verify(board) {

        return board.hashKey === this.generate(board);

    }

    //----------------------------------
    // Toggle Piece
    //----------------------------------

    togglePiece(

        hash,

        piece,

        square

    ) {

        const index = this.pieceIndex(piece);

        return hash ^ this.pieces[index][square];

    }

    //----------------------------------
    // Toggle Side
    //----------------------------------

    toggleSide(hash) {

        return hash ^ this.side;

    }

    //----------------------------------
    // Toggle Castling
    //----------------------------------

    toggleCastling(

        hash,

        board

    ) {

        return hash ^

            this.castling[

                this.castlingIndex(board)

            ];

    }

    //----------------------------------
    // Toggle En Passant
    //----------------------------------

    toggleEnPassant(

        hash,

        file

    ) {

        return hash ^ this.enPassant[file];

    }

    //----------------------------------
    // Update Hash
    //----------------------------------

    updateHash(

        hash,

        move,

        history,

        board

    ) {

        hash = this.updatePieces(

            hash,

            move

        );

        hash = this.updatePositionState(

            hash,

            history,

            board

        );

        hash = this.updateSpecialMoves(

            hash,

            move

        );

        return hash;

    }

    //----------------------------------
    // Update Pieces
    //----------------------------------

    updatePieces(

        hash,

        move

    ) {

        //----------------------------------
        // Moving Piece
        //----------------------------------

        hash = this.togglePiece(

            hash,

            move.piece,

            move.fromSquare

        );

        hash = this.togglePiece(

            hash,

            move.piece,

            move.toSquare

        );

        //----------------------------------
        // Capture
        //----------------------------------

        if (

            move.capturedPiece !== Piece.EMPTY &&

            !(move.flags & MoveFlags.EN_PASSANT)

        ) {

            hash = this.togglePiece(

                hash,

                move.capturedPiece,

                move.toSquare

            );

        }

        return hash;

    }

    //----------------------------------
    // Position State
    //----------------------------------

    updatePositionState(

        hash,

        history,

        board

    ) {

        //----------------------------------
        // Castling
        //----------------------------------

        hash ^= this.castling[
            this.castlingIndex(history)
        ];

        hash ^= this.castling[
            this.castlingIndex(board)
        ];

        //----------------------------------
        // En Passant
        //----------------------------------

        if (history.enPassantSquare !== -1) {

            hash ^= this.enPassant[
                history.enPassantSquare & 7
            ];

        }

        if (board.enPassantSquare !== -1) {

            hash ^= this.enPassant[
                board.enPassantSquare & 7
            ];

        }

        //----------------------------------
        // Side
        //----------------------------------

        hash ^= this.side;

        return hash;

    }

    //----------------------------------
    // Special Moves
    //----------------------------------

    updateSpecialMoves(

        hash,

        move

    ) {

        //----------------------------------
        // Castling
        //----------------------------------

        if (move.flags & MoveFlags.CASTLE_KING) {

            if (move.piece === Piece.WK) {

                hash = this.togglePiece(
                    hash,
                    Piece.WR,
                    Squares.H1
                );

                hash = this.togglePiece(
                    hash,
                    Piece.WR,
                    Squares.F1
                );

            }

            else {

                hash = this.togglePiece(
                    hash,
                    Piece.BR,
                    Squares.H8
                );

                hash = this.togglePiece(
                    hash,
                    Piece.BR,
                    Squares.F8
                );

            }

        }

        if (move.flags & MoveFlags.CASTLE_QUEEN) {

            if (move.piece === Piece.WK) {

                hash = this.togglePiece(
                    hash,
                    Piece.WR,
                    Squares.A1
                );

                hash = this.togglePiece(
                    hash,
                    Piece.WR,
                    Squares.D1
                );

            }

            else {

                hash = this.togglePiece(
                    hash,
                    Piece.BR,
                    Squares.A8
                );

                hash = this.togglePiece(
                    hash,
                    Piece.BR,
                    Squares.D8
                );

            }

        }

        //----------------------------------
        // Promotion
        //----------------------------------

        if (move.flags & MoveFlags.PROMOTION) {

            //----------------------------------
            // Remove promoted pawn
            //----------------------------------

            hash = this.togglePiece(

                hash,

                move.piece,

                move.toSquare

            );

            //----------------------------------
            // Add promoted piece
            //----------------------------------

            hash = this.togglePiece(

                hash,

                move.promotedPiece,

                move.toSquare

            );

        }

        //----------------------------------
        // En Passant Capture
        //----------------------------------

        if (move.flags & MoveFlags.EN_PASSANT) {

            if (move.piece === Piece.WP) {

                hash = this.togglePiece(

                    hash,

                    Piece.BP,

                    move.toSquare + 8

                );

            }

            else {

                hash = this.togglePiece(

                    hash,

                    Piece.WP,

                    move.toSquare - 8

                );

            }

        }

        return hash;

    }


}
