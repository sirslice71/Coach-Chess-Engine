//==================================================
// Coach Chess
// js/ui/ui.js
//==================================================

import { Piece } from "../core/piece.js";
import { FILE_NAMES } from "../core/square.js";
import EngineDebug from "../dev/enginedebug.js";
import EnginePanel
    from "./enginepanel.js";

export default class UI {

    constructor(board, legalMoveGenerator) {

        this.board = board;

        this.legalMoveGenerator = legalMoveGenerator;

        this.boardElement = document.getElementById("board");

        this.selectedSquare = -1;

        this.flipped = false;

        this.enginePanel = new EnginePanel();

        this.pieceImages = {

            [Piece.WP]: "assets/pieces/cburnett/wp.svg",
            [Piece.WN]: "assets/pieces/cburnett/wn.svg",
            [Piece.WB]: "assets/pieces/cburnett/wb.svg",
            [Piece.WR]: "assets/pieces/cburnett/wr.svg",
            [Piece.WQ]: "assets/pieces/cburnett/wq.svg",
            [Piece.WK]: "assets/pieces/cburnett/wk.svg",

            [Piece.BP]: "assets/pieces/cburnett/bp.svg",
            [Piece.BN]: "assets/pieces/cburnett/bn.svg",
            [Piece.BB]: "assets/pieces/cburnett/bb.svg",
            [Piece.BR]: "assets/pieces/cburnett/br.svg",
            [Piece.BQ]: "assets/pieces/cburnett/bq.svg",
            [Piece.BK]: "assets/pieces/cburnett/bk.svg"

        };

    }

    initialize() {

	console.log("UI INITIALIZED");

        this.createBoard();

        this.draw();

    }

    createBoard() {

        this.boardElement.innerHTML = "";

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const squareIndex = row * 8 + col;

                const square = document.createElement("div");

                square.className = "square";

                square.dataset.square = squareIndex;

                if ((row + col) % 2 === 0) {
                    square.classList.add("light");
                } else {
                    square.classList.add("dark");
                }

                // --------------------------
                // File Labels (a-h)
                // --------------------------

                // --------------------------
                // Click Event
                // --------------------------

                square.addEventListener("click", () => {

                    this.squareClicked(squareIndex);

                });

                this.boardElement.appendChild(square);

            }

        }

    }

    squareClicked(square) {

        const piece = this.board.pieceAt(square);

        // Nothing selected yet
        if (this.selectedSquare === -1) {

            if (piece === Piece.EMPTY)
                return;

            // Only allow moving the side to move
            if (this.board.sideToMove > 0 && piece < 0)
                return;

            if (this.board.sideToMove < 0 && piece > 0)
                return;

            this.selectSquare(square);
            this.showLegalMoves(square);

            return;

        }

        // Same square deselects

        if (square === this.selectedSquare) {

            this.clearSelection();

            this.selectedSquare = -1;

            return;

        }

        this.tryMove(this.selectedSquare, square);

    }

    tryMove(fromSquare, toSquare) {

    const moves =
        this.legalMoveGenerator.generateMoves();

        for (const move of moves) {

            if (

                move.fromSquare === fromSquare &&

                move.toSquare === toSquare

            ) {

                //----------------------------------
                // Make Player Move
                //----------------------------------

                this.selectedSquare = -1;

                this.clearSelection();

                if (

                    !window.chess.gameController.playMove(move)

                ) {

                    return;

                }

                //----------------------------------
                // Auto Coach Move
                //----------------------------------

                if (

                    window.chess.gameController.autoCoach &&

                    this.board.sideToMove < 0

                ) {

                    // Let browser repaint first

                    setTimeout(() => {

                        window.chess.gameController.coachMove();

                    }, 50);

                }

                return;

            }

        }

        //----------------------------------
        // Illegal Move
        //----------------------------------

        this.clearSelection();

        this.selectedSquare = -1;

    }

    //-----------------------------------------
    // Game Over
    //-----------------------------------------

    showGameOver(result) {

        console.log("");

        console.log("==========================");

        console.log("GAME OVER");

        console.log(result.reason);

        console.log(result.result);

        console.log("==========================");

    }

    draw() {

        //console.log("DRAW CALLED");

        this.clearSelection();

        const squares = this.boardElement.children;

        for (let i = 0; i < 64; i++) {

            const piece = this.board.pieceAt(i);

            const square = squares[i];

            square.innerHTML = "";

            if (piece === Piece.EMPTY)
                continue;

            const img = document.createElement("img");

            img.src = this.pieceImages[piece];

            img.className = "piece";

            img.draggable = false;

            square.appendChild(img);

        }

        this.updateDeveloperPanel();

    }

    flipBoard() {

        this.flipped = !this.flipped;

        this.draw();

    }

    clearSelection() {

        [...this.boardElement.children].forEach(square => {

            square.classList.remove("selected");
            square.classList.remove("legal");
            square.classList.remove("capture");

        });

    }

    selectSquare(squareNumber) {

        this.clearSelection();

        this.boardElement.children[squareNumber]
            .classList.add("selected");

        this.selectedSquare = squareNumber;

    }

    showLegalMoves(square) {

        const moves = this.legalMoveGenerator.generateMoves();

        for (const move of moves) {

            if (move.fromSquare !== square)
                continue;

            if (move.isCapture()) {

                this.boardElement.children[move.toSquare]
                    .classList.add("capture");

            } else {

                this.boardElement.children[move.toSquare]
                    .classList.add("legal");

            }

        }

    }

    updateDeveloperPanel() {

        const evalScore = window.chess.eval();

        document.getElementById("devMaterial").textContent =
            (evalScore.material.total / 100).toFixed(2);

        document.getElementById("devOpening").textContent =
            (evalScore.opening.total / 100).toFixed(2);

        document.getElementById("devPosition").textContent =
            (evalScore.position.total / 100).toFixed(2);

        document.getElementById("devKing").textContent =
            (evalScore.king.total / 100).toFixed(2);

        document.getElementById("devPawns").textContent =
            (evalScore.pawns.total / 100).toFixed(2);

        document.getElementById("devMobility").textContent =
            (evalScore.mobility.total / 100).toFixed(2);

        document.getElementById("devTactics").textContent =
            (evalScore.tactics.total / 100).toFixed(2);

        document.getElementById("devPieceSquares").textContent =
            (evalScore.position.pieceSquares / 100).toFixed(2);

    }

}