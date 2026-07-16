//==================================================
// Modern Chess AI
// js/core/board.js
//==================================================

import { WHITE, BLACK } from "./constants.js";
import { Piece, PieceValue } from "./piece.js";
import { MoveFlags } from "./move.js";
import { Squares } from "./square.js";
import Attack from "../engine/attack.js";
import EngineDebug from "../dev/enginedebug.js";
import FEN from "./fen.js";

function insertSquareSorted(list, square) {

    let index = list.length;

    list.push(square);

    while (index > 0 && list[index - 1] > square) {

        list[index] = list[index - 1];
        index--;

    }

    list[index] = square;

}

function encodeCastlingRights(rights) {

    return (
        (rights.whiteKingSide ? 1 : 0) |
        (rights.whiteQueenSide ? 2 : 0) |
        (rights.blackKingSide ? 4 : 0) |
        (rights.blackQueenSide ? 8 : 0)
    );

}

function restoreCastlingRights(rights, mask) {

    rights.whiteKingSide = (mask & 1) !== 0;
    rights.whiteQueenSide = (mask & 2) !== 0;
    rights.blackKingSide = (mask & 4) !== 0;
    rights.blackQueenSide = (mask & 8) !== 0;

}

export default class Board {

    constructor(zobrist = null) {

        this.squares = new Array(64).fill(Piece.EMPTY);

        this.sideToMove = WHITE;

        this.whiteKing = Squares.E1;
        this.blackKing = Squares.E8;

        this.whiteMaterial = 0;
        this.blackMaterial = 0;

        this.whitePieces = {};
        this.blackPieces = {};

        this.castlingRights = {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        };

        this.enPassantSquare = -1;

        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;

        this.moveHistory = [];
        this.nullMoveHistory = [];
        this.repetitionTable = [];

        this.hashKey = 0n;

        this.zobrist = null;
        this.profileEnabled = false;

        this.initializePosition();

        this.profileMakeMove = 0;
        this.profileUndoMove = 0;
        this.profileUpdatePieceLists = 0;
        this.profileVerify = 0;

        if (zobrist) {

            this.attachZobrist(zobrist);

        }
        
        //----------------------------------
        // Move History
        //----------------------------------

        this.moveHistory = [];
        this.nullMoveHistory = [];

    }

    attachZobrist(zobrist) {

        this.zobrist = zobrist;

        this.hashKey =
            zobrist.generate(this);

        const currentKey =
            this.hashKey;

        if (this.repetitionTable.length === 0) {

            this.repetitionTable = [currentKey];

        }

        else {

            this.repetitionTable[
                this.repetitionTable.length - 1
            ] = currentKey;

        }

    }

    //-----------------------------------------
    // Initial Position
    //-----------------------------------------

    initializePosition() {

        this.clear();

        const whiteBack = [
            Piece.WR,
            Piece.WN,
            Piece.WB,
            Piece.WQ,
            Piece.WK,
            Piece.WB,
            Piece.WN,
            Piece.WR
        ];

        const blackBack = [
            Piece.BR,
            Piece.BN,
            Piece.BB,
            Piece.BQ,
            Piece.BK,
            Piece.BB,
            Piece.BN,
            Piece.BR
        ];

        for (let i = 0; i < 8; i++) {

            this.squares[i] = blackBack[i];
            this.squares[8 + i] = Piece.BP;

            this.squares[48 + i] = Piece.WP;
            this.squares[56 + i] = whiteBack[i];

        }

        this.whiteKing = Squares.E1;
        this.blackKing = Squares.E8;

        this.castlingRights = {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        };

        let t = performance.now();

        this.updatePieceLists();

        this.profileUpdatePieceLists +=
            performance.now() - t;

        this.repetitionTable = [
            this.hashKey
        ];

    }

    //-----------------------------------------
    // Reset
    //-----------------------------------------

    clear() {

        this.squares.fill(Piece.EMPTY);

        this.whiteMaterial = 0;
        this.blackMaterial = 0;

        this.whitePieces = {};
        this.blackPieces = {};

        this.moveHistory = [];
        this.nullMoveHistory = [];
        this.repetitionTable = [];

        this.sideToMove = WHITE;

        this.enPassantSquare = -1;

        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;

    }

    //-----------------------------------------
    // Piece Lists
    //-----------------------------------------

    updatePieceLists() {

        this.whitePieces = {
            pawns: [],
            knights: [],
            bishops: [],
            rooks: [],
            queens: [],
            king: []
        };

        this.blackPieces = {
            pawns: [],
            knights: [],
            bishops: [],
            rooks: [],
            queens: [],
            king: []
        };

        this.whiteMaterial = 0;
        this.blackMaterial = 0;

        for (let square = 0; square < 64; square++) {

            const piece = this.squares[square];

            switch (piece) {

                case Piece.WP:
                    this.whitePieces.pawns.push(square);
                    this.whiteMaterial += 100;
                    break;

                case Piece.WN:
                    this.whitePieces.knights.push(square);
                    this.whiteMaterial += 300;
                    break;

                case Piece.WB:
                    this.whitePieces.bishops.push(square);
                    this.whiteMaterial += 310;
                    break;

                case Piece.WR:
                    this.whitePieces.rooks.push(square);
                    this.whiteMaterial += 500;
                    break;

                case Piece.WQ:
                    this.whitePieces.queens.push(square);
                    this.whiteMaterial += 900;
                    break;

                case Piece.WK:
                    this.whitePieces.king.push(square);
                    this.whiteKing = square;
                    break;

                case Piece.BP:
                    this.blackPieces.pawns.push(square);
                    this.blackMaterial += 100;
                    break;

                case Piece.BN:
                    this.blackPieces.knights.push(square);
                    this.blackMaterial += 300;
                    break;

                case Piece.BB:
                    this.blackPieces.bishops.push(square);
                    this.blackMaterial += 310;
                    break;

                case Piece.BR:
                    this.blackPieces.rooks.push(square);
                    this.blackMaterial += 500;
                    break;

                case Piece.BQ:
                    this.blackPieces.queens.push(square);
                    this.blackMaterial += 900;
                    break;

                case Piece.BK:
                    this.blackPieces.king.push(square);
                    this.blackKing = square;
                    break;

            }

        }

    }

    //-----------------------------------------
    // Piece List Helpers
    //-----------------------------------------

    addPiece(square, piece) {

        // Place piece on board
        this.squares[square] = piece;

        const list = piece > 0 ? this.whitePieces : this.blackPieces;

        switch (Math.abs(piece)) {

            case 1:
                insertSquareSorted(list.pawns, square);
                break;

            case 2:
                insertSquareSorted(list.knights, square);
                break;

            case 3:
                insertSquareSorted(list.bishops, square);
                break;

            case 4:
                insertSquareSorted(list.rooks, square);
                break;

            case 5:
                insertSquareSorted(list.queens, square);
                break;

            case 6:

                list.king = [square];

                if (piece > 0)
                    this.whiteKing = square;
                else
                    this.blackKing = square;

                break;
        }

    }

    addMaterial(piece) {

        if (piece > 0)
            this.whiteMaterial += PieceValue[piece];
        else
            this.blackMaterial += PieceValue[-piece];

    }

    removeMaterial(piece) {

        if (piece > 0)
            this.whiteMaterial -= PieceValue[piece];
        else
            this.blackMaterial -= PieceValue[-piece];

    }

    removePiece(square, piece) {

        //----------------------------------
        // Debug
        //----------------------------------

        if (piece === Piece.EMPTY) {

            console.trace(

                "removePiece() called with EMPTY piece"

            );

            console.error(

                {

                    square,

                    piece,

                    boardPiece:

                        this.squares[square]

                }

            );

            this.panic(

                "removePiece() called with EMPTY piece"

            );

            debugger;

            return;

        }

        //----------------------------------
        // Debug
        //----------------------------------

        if (this.squares[square] !== piece) {

            console.trace(

                "Piece mismatch in removePiece()"

            );

            console.error(

                {

                    square,

                    expected: piece,

                    actual: this.squares[square]

                }

            );

            this.panic(

                "Piece mismatch in removePiece()"

            );

            debugger;

            return;

        }

        const list = piece > 0
            ? this.whitePieces
            : this.blackPieces;

        let pieceList = null;

        switch (Math.abs(piece)) {

            case 1:
                pieceList = list.pawns;
                break;

            case 2:
                pieceList = list.knights;
                break;

            case 3:
                pieceList = list.bishops;
                break;

            case 4:
                pieceList = list.rooks;
                break;

            case 5:
                pieceList = list.queens;
                break;

            case 6:

                list.king = [];

                if (piece > 0)
                    this.whiteKing = -1;
                else
                    this.blackKing = -1;

                return;

        }

        if (pieceList === null) {

            console.error(
                "removePiece()",
                {
                    square,
                    piece
                }
            );

            debugger;

        }

        const index = pieceList.indexOf(square);

        if (index === -1)
            return;

        pieceList.splice(index, 1);

    }

    //-----------------------------------------
    // Board Access
    //-----------------------------------------

    pieceAt(square) {

        return this.squares[square];

    }

    placePiece(square, piece) {

        this.squares[square] = piece;

    }

    clearSquare(square) {

        this.squares[square] = Piece.EMPTY;

    }

    clearBoard() {

        this.squares.fill(Piece.EMPTY);

        this.whitePieces = {

            pawns: [],
            knights: [],
            bishops: [],
            rooks: [],
            queens: [],
            king: []

        };

        this.blackPieces = {

            pawns: [],
            knights: [],
            bishops: [],
            rooks: [],
            queens: [],
            king: []

        };

        this.whiteKing = -1;
        this.blackKing = -1;

        this.whiteMaterial = 0;
        this.blackMaterial = 0;

    }   
    
    resetGameState() {

        this.castlingRights = {

            whiteKingSide: false,
            whiteQueenSide: false,
            blackKingSide: false,
            blackQueenSide: false

        };

        this.sideToMove = WHITE;

        this.enPassantSquare = -1;

        this.halfMoveClock = 0;

        this.fullMoveNumber = 1;

        this.moveHistory = [];
        this.nullMoveHistory = [];

    }

    //----------------------------------
    // Move Piece
    //----------------------------------

    movePiece(fromSquare, toSquare) {

        //----------------------------------
        // Validate Move
        //----------------------------------

        const piece = this.squares[fromSquare];

        if (piece === Piece.EMPTY) {
            /*
            console.error(

                "Attempting to move EMPTY square",

                {

                    fromSquare,

                    toSquare,

                    sideToMove: this.sideToMove,

                    lastMove:

                        this.moveHistory[
                            this.moveHistory.length - 1
                        ]

                }

            );
            */
            console.trace();

            debugger;

        }

        //console.log("movePiece remove");
        this.removePiece(fromSquare, piece);

        this.squares[toSquare] = piece;
        this.squares[fromSquare] = Piece.EMPTY;

        this.addPiece(toSquare, piece);

    }

    //-----------------------------------------
    // Repetition Key
    //-----------------------------------------

    repetitionKey() {

        let key = "";

        for (const piece of this.squares)
            key += piece + ",";

        key += this.sideToMove;

        key +=
            this.castlingRights.whiteKingSide ? "K" : "";

        key +=
            this.castlingRights.whiteQueenSide ? "Q" : "";

        key +=
            this.castlingRights.blackKingSide ? "k" : "";

        key +=
            this.castlingRights.blackQueenSide ? "q" : "";

        key += ":" + this.enPassantSquare;

        return key;

    }

    //-----------------------------------------
    // Game ends in Draw
    //-----------------------------------------

    repetitionCount() {

        if (
            this.repetitionTable.length === 0
        ) {
            return 0;
        }

        const current =
            this.repetitionTable[
                this.repetitionTable.length - 1
            ];

        let count = 0;

        for (
            let i = this.repetitionTable.length - 1;
            i >= 0;
            i -= 2
        ) {

            if (
                this.repetitionTable[i] === current
            ) {
                count++;
            }

        }

        return count;

    }

    isThreefoldRepetition() {

        return this.repetitionCount() >= 3;

    }

    isFiftyMoveDraw() {

        return this.halfMoveClock >= 100;

    }

    //-----------------------------------------
    // Insufficient Material
    //-----------------------------------------

    isInsufficientMaterial() {

        let whiteBishops = 0;
        let blackBishops = 0;

        let whiteKnights = 0;
        let blackKnights = 0;

        let whiteOther = 0;
        let blackOther = 0;

        for (const piece of this.squares) {

            switch (piece) {

                case Piece.WP:
                case Piece.WR:
                case Piece.WQ:

                    whiteOther++;
                    break;

                case Piece.BP:
                case Piece.BR:
                case Piece.BQ:

                    blackOther++;
                    break;

                case Piece.WB:

                    whiteBishops++;
                    break;

                case Piece.BB:

                    blackBishops++;
                    break;

                case Piece.WN:

                    whiteKnights++;
                    break;

                case Piece.BN:

                    blackKnights++;
                    break;

            }

        }

        //----------------------------------
        // Any pawn, rook or queen means
        // mating material exists.
        //----------------------------------

        if (whiteOther || blackOther) {

            return false;

        }

        //----------------------------------
        // King vs King
        //----------------------------------

        if (

            whiteBishops === 0 &&
            blackBishops === 0 &&
            whiteKnights === 0 &&
            blackKnights === 0

        ) {

            return true;

        }

        //----------------------------------
        // King + Bishop vs King
        //----------------------------------

        if (

            whiteBishops === 1 &&
            blackBishops === 0 &&
            whiteKnights === 0 &&
            blackKnights === 0

        ) {

            return true;

        }

        if (

            blackBishops === 1 &&
            whiteBishops === 0 &&
            whiteKnights === 0 &&
            blackKnights === 0

        ) {

            return true;

        }

        //----------------------------------
        // King + Knight vs King
        //----------------------------------

        if (

            whiteKnights === 1 &&
            blackKnights === 0 &&
            whiteBishops === 0 &&
            blackBishops === 0

        ) {

            return true;

        }

        if (

            blackKnights === 1 &&
            whiteKnights === 0 &&
            whiteBishops === 0 &&
            blackBishops === 0

        ) {

            return true;

        }

        return false;

    }

    //-----------------------------------------
    // Helpers
    //-----------------------------------------

    isValidSquare(square) {

        return square >= 0 && square < 64;

    }

    rank(square) {

        return Math.floor(square / 8);

    }

    file(square) {

        return square % 8;

    }

    index(rank, file) {

        return rank * 8 + file;

    }

    cloneSquares() {

        return this.squares.slice();

    }

    //-----------------------------------------
    // Material
    //-----------------------------------------

    materialScore() {

        return this.whiteMaterial - this.blackMaterial;

    }

    pieceCount() {

        return this.whitePieces.pawns.length +
               this.whitePieces.knights.length +
               this.whitePieces.bishops.length +
               this.whitePieces.rooks.length +
               this.whitePieces.queens.length +

               this.blackPieces.pawns.length +
               this.blackPieces.knights.length +
               this.blackPieces.bishops.length +
               this.blackPieces.rooks.length +
               this.blackPieces.queens.length;

    }

    //-----------------------------------------
    // Debug
    //-----------------------------------------

    printBoard() {

        console.clear();

        for (let r = 0; r < 8; r++) {

            let line = "";

            for (let c = 0; c < 8; c++) {

                line += this.squares[r * 8 + c]
                    .toString()
                    .padStart(3, " ");

            }

            console.log(line);

        }

    }

    //-----------------------------------------
    // Make / Undo Moves
    //-----------------------------------------

    //-----------------------------------------
    // Null Move (search-only)
    //
    // Passes the turn without moving a piece, for null-move
    // pruning in search. Never legal chess: only search may
    // call this, always paired with undoNullMove() via
    // try/finally. State handled exactly:
    //   - side to move flips (and its Zobrist key)
    //   - en passant availability is cleared for the skipped
    //     turn (and its Zobrist file key), restored on undo
    //   - halfMoveClock / fullMoveNumber are NOT changed:
    //     a null move is speculative search state, not a legal
    //     chess move, so it must not create or advance legal
    //     fifty-move-draw state
    //   - repetitionTable is NOT touched for the same reason:
    //     only legal positions belong in the legal repetition
    //     history used by draw adjudication
    //   - hashKey is snapshot-restored bit-for-bit like
    //     makeMove()/undoMove() already do
    // Piece lists, material, king squares, and castling rights
    // are untouched by a null move. Uses its own history stack
    // so moveHistory/undoMove() semantics stay untouched.
    //-----------------------------------------

    makeNullMove() {

        this.nullMoveHistory.push({

            enPassantSquare: this.enPassantSquare,

            hashBefore: this.hashKey

        });

        let hash = this.hashKey;

        if (this.enPassantSquare !== -1) {

            hash = this.zobrist.toggleEnPassant(
                hash,
                this.enPassantSquare & 7
            );

        }

        hash = this.zobrist.toggleSide(hash);

        this.hashKey = hash;

        this.enPassantSquare = -1;

        this.sideToMove *= -1;

    }

    undoNullMove() {

        const history = this.nullMoveHistory.pop();

        this.sideToMove *= -1;

        this.enPassantSquare = history.enPassantSquare;

        this.hashKey = history.hashBefore;

    }

    makeMove(move) {

        const start =
            this.profileEnabled
                ? performance.now()
                : 0;

        const history = {

            from: move.fromSquare,
            to: move.toSquare,

            movedPiece: this.squares[move.fromSquare],
            capturedPiece: this.squares[move.toSquare],

            promotedPiece: move.promotedPiece,

            flags: move.flags,

            whiteKing: this.whiteKing,
            blackKing: this.blackKing,

            whiteMaterial: this.whiteMaterial,
            blackMaterial: this.blackMaterial,

            castlingRightsBefore:
                encodeCastlingRights(this.castlingRights),

            enPassantSquare: this.enPassantSquare,

            halfMoveClock: this.halfMoveClock,

            fullMoveNumber: this.fullMoveNumber,

            //----------------------------------
            // Pre-move hash snapshot. undoMove() restores this
            // directly instead of regenerating the hash from
            // scratch (zobrist.generate was ~7% of search time,
            // measured with --cpu-prof on the middlegame
            // benchmark set). BigInts are immutable, so this is
            // an exact bit-for-bit restoration.
            //----------------------------------

            hashBefore: this.hashKey

        };

        if (EngineDebug.verifyMakeUndo) {

            history.fenBefore = this.repetitionKey();

        }

        //----------------------------------
        // The human-readable move string is only consumed by
        // debug output; building it on every makeMove() was
        // measurable allocation churn in search hot paths.
        //----------------------------------

        if (EngineDebug.verifyMakeUndo || EngineDebug.undoMove) {

            history.move = move.toString();

        }

        history.side = this.sideToMove;

        this.moveHistory.push(history);

        //----------------------------------
        // Halfmove Clock / Fullmove Number (forward update)
        //
        // history.halfMoveClock / history.fullMoveNumber above
        // already captured the pre-move snapshot that undoMove()
        // restores. This block is the missing forward half: apply
        // standard FEN semantics to the LIVE counters so the
        // engine's own halfMoveClock/fullMoveNumber stay correct
        // during play, not just across a single make/undo pair.
        //
        //   halfMoveClock resets to 0 after any pawn move
        //   (including promotions -- move.piece is still the pawn
        //   type on a promotion move) or any capture (including en
        //   passant, where history.capturedPiece is EMPTY since
        //   the captured pawn is not on move.toSquare -- hence the
        //   explicit EN_PASSANT flag check below). Otherwise it
        //   increments by 1.
        //
        //   fullMoveNumber increments only once Black's move
        //   completes. history.side was captured just above as
        //   this.sideToMove BEFORE the flip a few lines down, so
        //   history.side < 0 means Black just moved.
        //----------------------------------

        const isPawnMove =
            move.piece === Piece.WP ||
            move.piece === Piece.BP;

        const isCapture =
            history.capturedPiece !== Piece.EMPTY ||
            (move.flags & MoveFlags.EN_PASSANT) !== 0;

        this.halfMoveClock =
            (isPawnMove || isCapture)
                ? 0
                : this.halfMoveClock + 1;

        if (history.side < 0) {

            this.fullMoveNumber++;

        }

        //----------------------------------
        // Debug
        //----------------------------------
        /*
        if (EngineDebug.search) {

            console.log(

                "MAKE",

                move.toString(),

                {

                    flags: move.flags,

                    piece: move.piece,

                    captured: move.capturedPiece,

                    promoted: move.promotedPiece

                }

            );

        }
        */

        this.enPassantSquare = -1;

        if (

            move.piece === Piece.WP &&

            move.fromSquare - move.toSquare === 16

        ) {

            this.enPassantSquare = move.fromSquare - 8;

        }

        if (

            move.piece === Piece.BP &&

            move.toSquare - move.fromSquare === 16

        ) {

            this.enPassantSquare = move.fromSquare + 8;

        }

        // White king moved
        if (move.piece === Piece.WK) {
            this.castlingRights.whiteKingSide = false;
            this.castlingRights.whiteQueenSide = false;

        }

        // Black king moved
        if (move.piece === Piece.BK) {

            this.castlingRights.blackKingSide = false;
            this.castlingRights.blackQueenSide = false;

        }

        // White rook moved
        if (move.piece === Piece.WR) {

            if (move.fromSquare === Squares.H1)
                this.castlingRights.whiteKingSide = false;

            if (move.fromSquare === Squares.A1)
                this.castlingRights.whiteQueenSide = false;

        }

        // Black rook moved
        if (move.piece === Piece.BR) {

            if (move.fromSquare === Squares.H8)
                this.castlingRights.blackKingSide = false;

            if (move.fromSquare === Squares.A8)
                this.castlingRights.blackQueenSide = false;

        }  
        
        if (move.capturedPiece === Piece.WR) {

            if (move.toSquare === Squares.H1)
                this.castlingRights.whiteKingSide = false;

            if (move.toSquare === Squares.A1)
                this.castlingRights.whiteQueenSide = false;

        }

        if (move.capturedPiece === Piece.BR) {

            if (move.toSquare === Squares.H8)
                this.castlingRights.blackKingSide = false;

            if (move.toSquare === Squares.A8)
                this.castlingRights.blackQueenSide = false;

        }    

        if (history.capturedPiece !== Piece.EMPTY) {

            //console.log("makeMove remove");

            this.removePiece(
                move.toSquare,
                history.capturedPiece
            );

            this.removeMaterial(
                history.capturedPiece
            );

        }

        //======================================
        // En Passant Capture
        //======================================
        /*
        console.log(

            "MAKE",

            move.toString(),

            move.flags,

            {

                epSquare:

                    this.enPassantSquare

            }

        );
        */
        if (move.flags & MoveFlags.EN_PASSANT) {
            /*
            console.error(

                "EXECUTING EP",

                move.toString(),

                {

                    from:

                        move.fromSquare,

                    to:

                        move.toSquare,

                    epSquare:

                        this.enPassantSquare

                }

            );
            */
            if (move.piece === Piece.WP) {

                //console.log("En Passant Capture remove");

                this.removePiece(
                    move.toSquare + 8,
                    Piece.BP
                );

                this.removeMaterial(
                    Piece.BP
                );

                this.squares[move.toSquare + 8] =
                    Piece.EMPTY;

            }
            else {

                //console.log("En Passant Capture remove");

                this.removePiece(
                    move.toSquare - 8,
                    Piece.WP
                );

                this.removeMaterial(
                    Piece.WP
                );

                this.squares[move.toSquare - 8] =
                    Piece.EMPTY;

            }

        }

        //----------------------------------
        // Debug Move
        //----------------------------------

        if (this.squares[move.fromSquare] !== move.piece) {
            /*
            console.error(

                "Move piece mismatch",

                {

                    move,

                    boardPiece: this.squares[move.fromSquare],

                    movePiece: move.piece,

                    fromSquare: move.fromSquare,

                    toSquare: move.toSquare

                }

            );
            */
            debugger;

        }

        this.movePiece(move.fromSquare, move.toSquare);

        //======================================
        // Promotion
        //======================================

        if (move.flags & MoveFlags.PROMOTION) {

            //console.log("Promotion remove");

            // Remove the pawn from the piece lists
            this.removePiece(
                move.toSquare,
                move.piece
            );

            // Place the promoted piece
            this.squares[move.toSquare] =
                move.promotedPiece;

            // Add the new piece
            this.addPiece(
                move.toSquare,
                move.promotedPiece
            );

            this.removeMaterial(
                move.piece
            );

            this.addMaterial(
                move.promotedPiece
            );

        }

        //======================================
        // Castling
        //======================================

        if (move.flags & MoveFlags.CASTLE_KING) {

            // White
            if (move.piece === Piece.WK) {

                this.movePiece(Squares.H1, Squares.F1);

            }

            // Black
            if (move.piece === Piece.BK) {

                this.movePiece(Squares.H8, Squares.F8);

            }

        }

        if (move.flags & MoveFlags.CASTLE_QUEEN) {

            // White
            if (move.piece === Piece.WK) {

                this.movePiece(Squares.A1, Squares.D1);

            }

            // Black
            if (move.piece === Piece.BK) {

                this.movePiece(Squares.A8, Squares.D8);

            }

        }

        let t =
            this.profileEnabled
                ? performance.now()
                : 0;

        // this.updatePieceLists();

        if (this.profileEnabled) {

            this.profileUpdatePieceLists +=
                performance.now() - t;

        }

        this.sideToMove *= -1;

        if (EngineDebug.verifyBoard) {

            this.verify();

        }

        this.hashKey =
            this.zobrist.updateHash(

                this.hashKey,

                move,

                history,

                this

            );

        //----------------------------------
        // Repetition detection keys on the zobrist hash of the
        // position AFTER the move (hence pushed after the
        // incremental update above). Previously this pushed
        // repetitionKey(), a ~200-character string built with 64
        // concatenations on EVERY makeMove -- the single largest
        // search hotspot (15% self time plus a large share of GC,
        // measured with --cpu-prof). The zobrist hash covers the
        // same state (pieces, side to move, castling rights,
        // en passant file), and repetitionCount()'s equality
        // scans work unchanged on BigInts. repetitionKey() is
        // kept for debug/PGN use.
        //----------------------------------

        this.repetitionTable.push(this.hashKey);

        if (this.profileEnabled) {

            this.profileMakeMove +=
                performance.now() - start;

        }

    }

    undoMove() {

        const start =
            this.profileEnabled
                ? performance.now()
                : 0;

        if (this.moveHistory.length === 0)
            return;

        const history = this.moveHistory.pop();

        /*
        console.log(
            "UNDO:",
            history.move,
            "flags:",
            history.flags
        );
        */

        //----------------------------------
        // Undo Debug
        //----------------------------------

        if (EngineDebug.undoMove) {
            console.groupCollapsed("UNDO");
            console.log(history);

            console.log("Flags:", history.flags);

            console.log("Promotion:", (history.flags & MoveFlags.PROMOTION) !== 0);
            console.log("En Passant:", (history.flags & MoveFlags.EN_PASSANT) !== 0);
            console.log("Castle K:", (history.flags & MoveFlags.CASTLE_KING) !== 0);
            console.log("Castle Q:", (history.flags & MoveFlags.CASTLE_QUEEN) !== 0);
            console.log("Double Pawn:", (history.flags & MoveFlags.DOUBLE_PAWN) !== 0);
        }

        //======================================
        // Undo Promotion
        //======================================

        if (EngineDebug.undoMove) {
            console.log("Undo Promotion");
        }

        if (history.flags & MoveFlags.PROMOTION) {

            // Remove promoted piece first
            this.removePiece(
                history.to,
                history.promotedPiece
            );

            this.squares[history.to] =
                Piece.EMPTY;

            this.addPiece(
                history.from,
                history.movedPiece
            );

            if (history.capturedPiece !== Piece.EMPTY) {

                this.addPiece(
                    history.to,
                    history.capturedPiece
                );

            }

        }  
        else {

            this.removePiece(
                history.to,
                history.movedPiece
            );

            this.squares[history.to] =
                Piece.EMPTY;

            this.addPiece(
                history.from,
                history.movedPiece
            );

            if (
                history.capturedPiece !== Piece.EMPTY &&
                (history.flags & MoveFlags.EN_PASSANT) === 0
            ) {

                this.addPiece(
                    history.to,
                    history.capturedPiece
                );

            }

        }

        //======================================
        // Undo En Passant
        //======================================

        if (EngineDebug.undoMove) {
            console.log("Undo En Passant");
        }

        if (history.flags & MoveFlags.EN_PASSANT) {

            if (history.movedPiece === Piece.WP) {

                this.addPiece(
                    history.to + 8,
                    Piece.BP
                );

            }
            else {

                this.addPiece(
                    history.to - 8,
                    Piece.WP
                );

            }

        }

        //======================================
        // Undo Castling
        //======================================

        if (EngineDebug.undoMove) {
            console.log("Undo Castle King");
        }

        if (history.flags & MoveFlags.CASTLE_KING) {

            if (history.movedPiece === Piece.WK) {

                this.movePiece(Squares.F1, Squares.H1);

            }

            if (history.movedPiece === Piece.BK) {

                this.movePiece(Squares.F8, Squares.H8);

            }

        }

        if (EngineDebug.undoMove) { 
            console.log("Undo Castle Queen");
        }

        if (history.flags & MoveFlags.CASTLE_QUEEN) {

            if (history.movedPiece === Piece.WK) {

                this.movePiece(Squares.D1, Squares.A1);

            }

            if (history.movedPiece === Piece.BK) {

                this.movePiece(Squares.D8, Squares.A8);

            }

        }

        this.whiteKing = history.whiteKing;
        this.blackKing = history.blackKing;

        this.whiteMaterial = history.whiteMaterial;
        this.blackMaterial = history.blackMaterial;

        restoreCastlingRights(
            this.castlingRights,
            history.castlingRightsBefore
        );

        this.enPassantSquare = history.enPassantSquare;

        this.halfMoveClock = history.halfMoveClock;

        this.fullMoveNumber = history.fullMoveNumber;

        this.repetitionTable.pop();

        this.sideToMove *= -1;

        let t =
            this.profileEnabled
                ? performance.now()
                : 0;

        // Piece lists were repaired incrementally above.

        if (this.profileEnabled) {

            this.profileUpdatePieceLists +=
                performance.now() - t;

        }

        if (EngineDebug.verifyBoard) {

            this.verify();

        }
        
        if (EngineDebug.undoMove) {

            console.groupEnd();

        }

        //----------------------------------
        // Verify Make/Undo
        //----------------------------------

        if (EngineDebug.verifyMakeUndo) {

            const fenAfter = this.repetitionKey();

            if (history.fenBefore !== fenAfter) {

                console.error("MAKE/UNDO MISMATCH");

                console.log("Before:", history.fenBefore);

                console.log("After :", fenAfter);

                console.log("Move:", history);

                debugger;

            }

        }

        this.hashKey = history.hashBefore;

        if (this.profileEnabled) {

            this.profileUndoMove +=
                performance.now() - start;

        }

    }

    //----------------------------------
    // Is Side To Move In Check?
    //----------------------------------

    isInCheck() {

        const kingSquare =

            this.sideToMove > 0
                ? this.whiteKing
                : this.blackKing;

        return Attack.isSquareAttacked(

            this,
            kingSquare,

            // attacker is white?
            this.sideToMove < 0

        );

    }  
    
    verify() {

        const counts = {

            white: {
                pawns: 0,
                knights: 0,
                bishops: 0,
                rooks: 0,
                queens: 0,
                king: 0
            },

            black: {
                pawns: 0,
                knights: 0,
                bishops: 0,
                rooks: 0,
                queens: 0,
                king: 0
            }

        };

        for (let sq = 0; sq < 64; sq++) {

            switch (this.squares[sq]) {

                case Piece.WP: counts.white.pawns++; break;
                case Piece.WN: counts.white.knights++; break;
                case Piece.WB: counts.white.bishops++; break;
                case Piece.WR: counts.white.rooks++; break;
                case Piece.WQ: counts.white.queens++; break;
                case Piece.WK: counts.white.king++; break;

                case Piece.BP: counts.black.pawns++; break;
                case Piece.BN: counts.black.knights++; break;
                case Piece.BB: counts.black.bishops++; break;
                case Piece.BR: counts.black.rooks++; break;
                case Piece.BQ: counts.black.queens++; break;
                case Piece.BK: counts.black.king++; break;

            }

        }

        const errors = [];

        function compare(name, boardCount, listCount) {

            if (boardCount !== listCount) {

                errors.push(
                    `${name}: board=${boardCount} list=${listCount}`
                );

            }

        }

        compare("WP", counts.white.pawns, this.whitePieces.pawns.length);
        compare("WN", counts.white.knights, this.whitePieces.knights.length);
        compare("WB", counts.white.bishops, this.whitePieces.bishops.length);
        compare("WR", counts.white.rooks, this.whitePieces.rooks.length);
        compare("WQ", counts.white.queens, this.whitePieces.queens.length);
        compare("WK", counts.white.king, this.whitePieces.king.length);

        compare("BP", counts.black.pawns, this.blackPieces.pawns.length);
        compare("BN", counts.black.knights, this.blackPieces.knights.length);
        compare("BB", counts.black.bishops, this.blackPieces.bishops.length);
        compare("BR", counts.black.rooks, this.blackPieces.rooks.length);
        compare("BQ", counts.black.queens, this.blackPieces.queens.length);
        compare("BK", counts.black.king, this.blackPieces.king.length);

        if (errors.length) {

            console.error(errors);

            debugger;

        }

        //----------------------------------
        // Verify Piece Lists
        //----------------------------------

        const verifyList = (list, piece) => {

            for (const square of list) {

                if (this.squares[square] !== piece) {

                    console.error(

                        "Piece list corruption",

                        {

                            square,

                            expected: piece,

                            found: this.squares[square]

                        }

                    );

                    debugger;

                }

            }

        };

        verifyList(this.whitePieces.pawns, Piece.WP);
        verifyList(this.whitePieces.knights, Piece.WN);
        verifyList(this.whitePieces.bishops, Piece.WB);
        verifyList(this.whitePieces.rooks, Piece.WR);
        verifyList(this.whitePieces.queens, Piece.WQ);
        verifyList(this.whitePieces.king, Piece.WK);

        verifyList(this.blackPieces.pawns, Piece.BP);
        verifyList(this.blackPieces.knights, Piece.BN);
        verifyList(this.blackPieces.bishops, Piece.BB);
        verifyList(this.blackPieces.rooks, Piece.BR);
        verifyList(this.blackPieces.queens, Piece.BQ);
        verifyList(this.blackPieces.king, Piece.BK);

    }

    //----------------------------------
    // Panic Dump
    //----------------------------------

    panic(reason = "") {

        console.log("");

        console.log("==============================");

        console.log("BOARD PANIC");

        console.log(reason);

        console.log("==============================");

        console.log(

            "FEN:",

            FEN.export(this)

        );

        console.log(

            "History flags:",

            this.moveHistory.map(

                h => h.flags

            )

        );

        console.log(

            "Move History:",

            this.moveHistory.length

        );

        console.log(

            "Last Move:",

            this.moveHistory.length

                ? this.moveHistory[
                    this.moveHistory.length - 1
                ]

                : "None"

        );

        console.log(

            "Side:",

            this.sideToMove > 0

                ? "White"

                : "Black"

        );

        console.log(

            structuredClone(

                this.moveHistory

            )

        );

        console.log(
            "Black Knights:",
            this.blackPieces.knights
        );

        console.log(
            "White Knights:",
            this.whitePieces.knights
        );

        console.log(
            "Piece on g8:",
            this.squares[6]
        );

        console.log(
            "Piece on e7:",
            this.squares[12]
        );

        console.log(
            "Piece on f6:",
            this.squares[21]
        );

    }

    //----------------------------------
    // Clear Move History
    //----------------------------------

    clearMoveHistory() {

        this.moveHistory.length = 0;

    }

}
