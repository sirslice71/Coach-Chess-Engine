//==================================================
// gamestate.js
//==================================================

export default class GameState {

    constructor(board, legalMoveGenerator) {

        this.board = board;
        this.legalMoveGenerator = legalMoveGenerator;

    }

    //----------------------------------
    // Main
    //----------------------------------

    getResult() {

        if (this.isCheckmate()) {

            return {

                gameOver: true,
                winner: -this.board.sideToMove,
                result: this.board.sideToMove > 0
                    ? "0-1"
                    : "1-0",
                reason: "Checkmate"

            };

        }

        if (this.isStalemate()) {

            return {

                gameOver: true,
                winner: 0,
                result: "½-½",
                reason: "Stalemate"

            };

        }

        if (this.board.isThreefoldRepetition()) {

            return {

                gameOver: true,
                winner: 0,
                result: "½-½",
                reason: "Threefold Repetition"

            };

        }

        if (this.board.isFiftyMoveDraw()) {

            return {

                gameOver: true,
                winner: 0,
                result: "½-½",
                reason: "50-Move Rule"

            };

        }

        if (this.board.isInsufficientMaterial()) {

            return {

                gameOver: true,
                winner: 0,
                result: "½-½",
                reason: "Insufficient Material"

            };

        }

        return {

            gameOver: false,
            winner: 0,
            result: "*",
            reason: ""

        };

    }

    //----------------------------------

    isCheckmate() {

        if (!this.board.isInCheck())
            return false;

        return this.legalMoveGenerator
            .generateMoves().length === 0;

    }

    //----------------------------------

    isStalemate() {

        if (this.board.isInCheck())
            return false;

        return this.legalMoveGenerator
            .generateMoves().length === 0;

    }

}