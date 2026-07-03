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

export default class Board {

    constructor() {

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
        this.repetitionTable = [];

        this.initializePosition();

        this.profileMakeMove = 0;
        this.profileUndoMove = 0;
        this.profileUpdatePieceLists = 0;
        this.profileVerify = 0;

        this.hashKey = 0n;
        
        //----------------------------------
        // Move History
        //----------------------------------

        this.moveHistory = [];

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
            this.repetitionKey()
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
                list.pawns.push(square);
                break;

            case 2:
                list.knights.push(square);
                break;

            case 3:
                list.bishops.push(square);
                break;

            case 4:
                list.rooks.push(square);
                break;

            case 5:
                list.queens.push(square);
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

    isThreefoldRepetition() {

        const current =
            this.repetitionKey();

        let count = 0;

        for (const key of this.repetitionTable) {

            if (key === current)
                count++;

        }

        return count >= 3;

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

    makeMove(move) {

        const start = performance.now();

        const history = {

            from: move.fromSquare,
            to: move.toSquare,

            movedPiece: this.squares[move.fromSquare],
            capturedPiece: this.squares[move.toSquare],

            promotedPiece: move.promotedPiece,

            flags: move.flags,

            whiteKing: this.whiteKing,
            blackKing: this.blackKing,

            castlingRights: { ...this.castlingRights },

            enPassantSquare: this.enPassantSquare,

            halfMoveClock: this.halfMoveClock,

            fullMoveNumber: this.fullMoveNumber

        };

        if (EngineDebug.verifyMakeUndo) {

            history.fenBefore = this.repetitionKey();

        }

        history.move = move.toString();

        history.side = this.sideToMove;

        this.moveHistory.push(history);

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

        let t = performance.now();

        // this.updatePieceLists();

        this.profileUpdatePieceLists +=
            performance.now() - t;

        this.sideToMove *= -1;

        if (EngineDebug.verifyBoard) {

            this.verify();

        }

        this.repetitionTable.push(
            this.repetitionKey()
        );

        this.profileMakeMove += performance.now() - start;

        this.hashKey =
            window.chess.zobrist.updateHash(

                this.hashKey,

                move,

                history,

                this

            );

    }

    undoMove() {

        const start = performance.now();

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
                history.capturedPiece;

            this.squares[history.from] =
                history.movedPiece;

            this.addPiece(
                history.from,
                history.movedPiece
            );

        }  
        else {

        this.squares[history.from] = history.movedPiece;
        this.squares[history.to] = history.capturedPiece;

        }

        //======================================
        // Undo En Passant
        //======================================

        if (EngineDebug.undoMove) {
            console.log("Undo En Passant");
        }

        if (history.flags & MoveFlags.EN_PASSANT) {

            if (history.movedPiece === Piece.WP) {

                this.squares[history.to + 8] = Piece.BP;
                this.addPiece(
                    history.to + 8,
                    Piece.BP
                );

            }
            else {

                this.squares[history.to - 8] = Piece.WP;
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

        this.castlingRights = { ...history.castlingRights };

        this.enPassantSquare = history.enPassantSquare;

        this.halfMoveClock = history.halfMoveClock;

        this.fullMoveNumber = history.fullMoveNumber;

        this.repetitionTable.pop();

        this.sideToMove *= -1;

        let t = performance.now();

        this.updatePieceLists();

        this.profileUpdatePieceLists +=
            performance.now() - t;

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

        this.profileUndoMove += performance.now() - start;

        this.hashKey =
            window.chess.zobrist.generate(this);

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
