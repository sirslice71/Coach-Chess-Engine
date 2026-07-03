//======================================
// fen.js
//======================================

import { Piece } from "./piece.js";
import { WHITE, BLACK } from "./constants.js";
import { algebraic, fromAlgebraic } from "./square.js";

const PieceFromFen = {

    "P": Piece.WP,
    "N": Piece.WN,
    "B": Piece.WB,
    "R": Piece.WR,
    "Q": Piece.WQ,
    "K": Piece.WK,

    "p": Piece.BP,
    "n": Piece.BN,
    "b": Piece.BB,
    "r": Piece.BR,
    "q": Piece.BQ,
    "k": Piece.BK

};

const FenFromPiece = {

    [Piece.WP]:"P",
    [Piece.WN]:"N",
    [Piece.WB]:"B",
    [Piece.WR]:"R",
    [Piece.WQ]:"Q",
    [Piece.WK]:"K",

    [Piece.BP]:"p",
    [Piece.BN]:"n",
    [Piece.BB]:"b",
    [Piece.BR]:"r",
    [Piece.BQ]:"q",
    [Piece.BK]:"k"

};

export default class FEN {

    static export(board) {
        
        let fen = "";

        for (let rank = 0; rank < 8; rank++) {

            let empty = 0;

            for (let file = 0; file < 8; file++) {

                const sq = rank * 8 + file;

                const piece = board.squares[sq];

                if (piece === Piece.EMPTY) {

                    empty++;
                    continue;

                }

                if (empty > 0) {

                    fen += empty;
                    empty = 0;

                }

                fen += FenFromPiece[piece];

            }

            if (empty > 0)
                fen += empty;

            if (rank !== 7)
                fen += "/";

        }

        fen += board.sideToMove > 0 ? " w " : " b ";

        let castles = "";

        if (board.castlingRights.whiteKingSide)
            castles += "K";

        if (board.castlingRights.whiteQueenSide)
            castles += "Q";

        if (board.castlingRights.blackKingSide)
            castles += "k";

        if (board.castlingRights.blackQueenSide)
            castles += "q";

        fen += castles === "" ? "-" : castles;

        if (board.enPassantSquare === -1) {

            fen += " -";

        }
        else {

            fen +=
                " " +
                algebraic(board.enPassantSquare);

        }

        fen +=
            " " +
            board.halfMoveClock;

        fen +=
            " " +
            board.fullMoveNumber;

        return fen;

    }

    static import(board, fen) {

        board.clearBoard();
        board.resetGameState();

        const parts = fen.split(" ");
        const rows = parts[0].split("/");

        //----------------------------
        // Side to move
        //----------------------------

        board.sideToMove =
            parts[1] === "w" ? WHITE : BLACK;

        //----------------------------
        // Castling rights
        //----------------------------

        const castle = parts[2];

        board.castlingRights.whiteKingSide =
            castle.includes("K");

        board.castlingRights.whiteQueenSide =
            castle.includes("Q");

        board.castlingRights.blackKingSide =
            castle.includes("k");

        board.castlingRights.blackQueenSide =
            castle.includes("q");

        //----------------------------
        // En passant
        //----------------------------

        board.enPassantSquare =
            parts[3] === "-"
                ? -1
                : fromAlgebraic(parts[3]);

        //----------------------------
        // Clocks
        //----------------------------

        board.halfMoveClock =
            Number(parts[4]);

        board.fullMoveNumber =
            Number(parts[5]);

        let square = 0;

        for (const row of rows) {

            for (const c of row) {

                if (!isNaN(c)) {

                    square += Number(c);
                    continue;

                }

                board.addPiece(
                    square,
                    PieceFromFen[c]
                );

                square++;

            }

        }

        board.updatePieceLists();

        if (board.zobrist) {

            board.attachZobrist(
                board.zobrist
            );

        }

    }  
    
}
