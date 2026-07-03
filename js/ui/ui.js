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
        this.moveHistoryElement =
            document.getElementById("moveHistory");

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

                const displayIndex = row * 8 + col;

                const square = document.createElement("div");

                square.className = "square";

                square.dataset.square = displayIndex;

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

                    this.squareClicked(
                        this.displaySquareToBoardSquare(
                            displayIndex
                        )
                    );

                });

                this.boardElement.appendChild(square);

            }

        }

    }

    squareClicked(square) {

        if (!window.chess.gameController.isHumanTurn()) {
            return;
        }

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

                window.chess.gameController.scheduleCoachMove(
                    this.currentCoachDepth()
                );

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

        for (let displayIndex = 0; displayIndex < 64; displayIndex++) {

            const boardSquare =
                this.displaySquareToBoardSquare(
                    displayIndex
                );

            const piece =
                this.board.pieceAt(boardSquare);

            const square = squares[displayIndex];

            square.dataset.square =
                boardSquare;

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

        this.setFlipped(!this.flipped);

        this.draw();

    }

    setFlipped(flipped) {

        this.flipped = !!flipped;

    }

    displaySquareToBoardSquare(displaySquare) {

        return this.flipped
            ? 63 - displaySquare
            : displaySquare;

    }

    boardSquareToDisplaySquare(boardSquare) {

        return this.flipped
            ? 63 - boardSquare
            : boardSquare;

    }

    currentCoachDepth() {

        if (
            window.chess &&
            typeof window.chess.getCoachDepth === "function"
        ) {
            return window.chess.getCoachDepth();
        }

        return 5;

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

        this.boardElement.children[
            this.boardSquareToDisplaySquare(
                squareNumber
            )
        ]
            .classList.add("selected");

        this.selectedSquare = squareNumber;

    }

    showLegalMoves(square) {

        const moves = this.legalMoveGenerator.generateMoves();

        for (const move of moves) {

            if (move.fromSquare !== square)
                continue;

            if (move.isCapture()) {

                this.boardElement.children[
                    this.boardSquareToDisplaySquare(
                        move.toSquare
                    )
                ]
                    .classList.add("capture");

            } else {

                this.boardElement.children[
                    this.boardSquareToDisplaySquare(
                        move.toSquare
                    )
                ]
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

    updateMoveHistory(gameMoves = []) {

        if (!this.moveHistoryElement) {
            return;
        }

        this.moveHistoryElement.innerHTML = "";

        if (gameMoves.length === 0) {

            const emptyState =
                document.createElement("div");

            emptyState.className =
                "moveHistoryEmpty";

            emptyState.textContent =
                "No moves yet.";

            this.moveHistoryElement.appendChild(
                emptyState
            );

            return;

        }

        for (
            let index = 0;
            index < gameMoves.length;
            index += 2
        ) {

            const whiteMove = gameMoves[index];
            const blackMove = gameMoves[index + 1];

            const row =
                document.createElement("div");

            row.className = "moveHistoryRow";

            const moveNumber =
                document.createElement("span");

            moveNumber.className =
                "moveHistoryNumber";

            moveNumber.textContent =
                `${Math.floor(index / 2) + 1}.`;

            const whiteText =
                document.createElement("span");

            whiteText.className =
                "moveHistoryMove";

            whiteText.textContent =
                whiteMove ? whiteMove.move : "";

            const blackText =
                document.createElement("span");

            blackText.className =
                "moveHistoryMove";

            blackText.textContent =
                blackMove ? blackMove.move : "...";

            row.appendChild(moveNumber);
            row.appendChild(whiteText);
            row.appendChild(blackText);

            this.moveHistoryElement.appendChild(
                row
            );

        }

        this.moveHistoryElement.scrollTop =
            this.moveHistoryElement.scrollHeight;

    }

}
