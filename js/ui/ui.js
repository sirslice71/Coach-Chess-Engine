//==================================================
// Coach Chess
// js/ui/ui.js
//==================================================

import { Piece } from "../core/piece.js";
import { FILE_NAMES } from "../core/square.js";
import EngineDebug from "../dev/enginedebug.js";
import EnginePanel
    from "./enginepanel.js";

export function capturedPiecesFromMoves(gameMoves = []) {

    const captured = {
        white: [],
        black: []
    };

    for (const entry of gameMoves) {

        const piece = Number(entry?.captured || Piece.EMPTY);

        if (piece > Piece.EMPTY) {
            captured.white.push(piece);
        }
        else if (piece < Piece.EMPTY) {
            captured.black.push(piece);
        }

    }

    return captured;

}

export default class UI {

    constructor(board, legalMoveGenerator) {

        this.board = board;

        this.legalMoveGenerator = legalMoveGenerator;

        this.boardElement = document.getElementById("board");
        this.moveHistoryElement =
            document.getElementById("moveHistory");
        this.gameStatusElement =
            document.getElementById("gameStatus");
        this.capturedWhiteElement =
            document.getElementById("capturedWhite");
        this.capturedBlackElement =
            document.getElementById("capturedBlack");

        this.selectedSquare = -1;

        this.interactionMode = "drag";

        this.moveHintsEnabled = true;

        this.dragSourceSquare = -1;

        this.dragImageElement = null;

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

        this.createBoard();

        this.draw();

        this.updateMoveHistory([], 0);

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

                square.addEventListener("dragstart", event => {

                    this.dragStarted(
                        event,
                        this.displaySquareToBoardSquare(
                            displayIndex
                        )
                    );

                });

                square.addEventListener("dragover", event => {

                    this.dragOver(event);

                });

                square.addEventListener("dragleave", event => {

                    event.currentTarget.classList.remove(
                        "dropTarget"
                    );

                });

                square.addEventListener("drop", event => {

                    this.dropMove(
                        event,
                        this.displaySquareToBoardSquare(
                            displayIndex
                        )
                    );

                });

                square.addEventListener("dragend", () => {

                    this.dragEnded();

                });

                this.boardElement.appendChild(square);

            }

        }

    }

    squareClicked(square) {

        if (this.interactionMode !== "click") {
            return;
        }

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

    dragStarted(event, square) {

        if (this.interactionMode !== "drag") {
            event.preventDefault();
            return;
        }

        if (!this.canStartHumanMove(square)) {
            event.preventDefault();
            return;
        }

        this.dragSourceSquare = square;
        this.clearSelection();
        this.selectedSquare = square;
        this.showLegalMoves(square);

        event.currentTarget.classList.add("dragging");

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
                "text/plain",
                String(square)
            );

            const image =
                event.currentTarget.querySelector(".piece");

            if (image) {

                this.dragImageElement =
                    image.cloneNode(true);

                this.dragImageElement.classList.add(
                    "dragPreview"
                );

                document.body.appendChild(
                    this.dragImageElement
                );

                event.dataTransfer.setDragImage(
                    this.dragImageElement,
                    image.offsetWidth / 2,
                    image.offsetHeight / 2
                );

            }
        }

    }

    dragOver(event) {

        if (
            this.interactionMode !== "drag" ||
            this.dragSourceSquare === -1
        ) {
            return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        if (this.moveHintsEnabled) {
            event.currentTarget.classList.add("dropTarget");
        }

    }

    dropMove(event, square) {

        if (
            this.interactionMode !== "drag" ||
            this.dragSourceSquare === -1
        ) {
            return;
        }

        event.preventDefault();
        event.currentTarget.classList.remove("dropTarget");

        const fromSquare = this.dragSourceSquare;

        this.dragSourceSquare = -1;
        this.tryMove(fromSquare, square);

    }

    dragEnded() {

        this.dragSourceSquare = -1;

        [...this.boardElement.children].forEach(square => {

            square.classList.remove("dragging");
            square.classList.remove("dropTarget");

        });

        this.clearSelection();
        this.removeDragImage();

    }

    removeDragImage() {

        if (!this.dragImageElement) {
            return;
        }

        this.dragImageElement.remove();
        this.dragImageElement = null;

    }

    canStartHumanMove(square) {

        if (
            !window.chess ||
            !window.chess.gameController ||
            !window.chess.gameController.isHumanTurn()
        ) {
            return false;
        }

        const piece = this.board.pieceAt(square);

        if (piece === Piece.EMPTY) {
            return false;
        }

        if (this.board.sideToMove > 0 && piece < 0) {
            return false;
        }

        if (this.board.sideToMove < 0 && piece > 0) {
            return false;
        }

        return true;

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

                this.setGameStatus("Coach is thinking...", "working");

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

        const outcome =
            result.winner > 0
                ? "White wins"
                : result.winner < 0
                    ? "Black wins"
                    : "Draw";

        this.setGameStatus(
            `${outcome}. ${result.reason} (${result.result}).`,
            "result"
        );

    }

    setGameStatus(message, tone = "neutral") {

        if (!this.gameStatusElement) {
            return;
        }

        this.gameStatusElement.textContent = message;
        this.gameStatusElement.dataset.tone = tone;

    }

    showHint(move) {

        this.clearHint();

        if (!move) {
            return;
        }

        const from =
            this.boardSquareToDisplaySquare(move.fromSquare);
        const to =
            this.boardSquareToDisplaySquare(move.toSquare);

        this.boardElement.children[from]?.classList.add("hintFrom");
        this.boardElement.children[to]?.classList.add("hintTo");

    }

    clearHint() {

        [...this.boardElement.children].forEach(square => {
            square.classList.remove("hintFrom", "hintTo");
        });

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
            square.draggable = false;
            square.classList.remove("dragging");
            square.classList.remove("dropTarget");
            square.classList.remove("hintFrom");
            square.classList.remove("hintTo");

            if (piece === Piece.EMPTY)
                continue;

            const img = document.createElement("img");

            img.src = this.pieceImages[piece];

            img.className = "piece";

            img.draggable = false;

            square.appendChild(img);
            square.draggable =
                this.canDragPiece(boardSquare);

        }

    }

    setInteractionMode(mode) {

        this.interactionMode =
            mode === "click"
                ? "click"
                : "drag";

        this.dragSourceSquare = -1;
        this.selectedSquare = -1;

        this.boardElement.classList.toggle(
            "clickInput",
            this.interactionMode === "click"
        );

        this.boardElement.classList.toggle(
            "dragInput",
            this.interactionMode === "drag"
        );

        this.draw();
        this.setGameStatus(
            mode === "click"
                ? "Click move input selected."
                : "Drag move input selected.",
            "neutral"
        );

    }

    setMoveHintsEnabled(enabled) {

        this.moveHintsEnabled = !!enabled;

        this.boardElement.classList.toggle(
            "hideMoveHints",
            !this.moveHintsEnabled
        );

        this.clearSelection();

        this.setGameStatus(
            this.moveHintsEnabled
                ? "Move hints enabled."
                : "Move hints hidden.",
            "neutral"
        );

        if (
            this.moveHintsEnabled &&
            this.selectedSquare !== -1
        ) {
            this.selectSquare(this.selectedSquare);
            this.showLegalMoves(this.selectedSquare);
        }

    }

    canDragPiece(square) {

        return (
            this.interactionMode === "drag" &&
            this.canStartHumanMove(square)
        );

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

        this.clearHint();

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
            .classList.toggle(
                "selected",
                this.moveHintsEnabled
            );

        this.selectedSquare = squareNumber;

    }

    showLegalMoves(square) {

        if (!this.moveHintsEnabled) {
            return;
        }

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

    updateMoveHistory(
        gameMoves = [],
        activePly = gameMoves.length
    ) {

        this.updateCapturedPieces(gameMoves);

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

            if (
                activePly === index + 1 ||
                activePly === index + 2
            ) {
                row.classList.add("active");
            }

            const moveNumber =
                document.createElement("span");

            moveNumber.className =
                "moveHistoryNumber";

            moveNumber.textContent =
                `${Math.floor(index / 2) + 1}.`;

            const whiteText =
                document.createElement("button");

            whiteText.className =
                "moveHistoryMove";

            whiteText.type = "button";

            if (activePly === index + 1) {
                whiteText.classList.add("active");
            }

            whiteText.textContent =
                whiteMove ? whiteMove.move : "";

            whiteText.disabled = !whiteMove;

            if (whiteMove) {
                whiteText.addEventListener(
                    "click",
                    () => window.chess?.gameController?.reviewToPly(index + 1)
                );
            }

            const blackText =
                document.createElement("button");

            blackText.className =
                "moveHistoryMove";

            blackText.type = "button";

            if (activePly === index + 2) {
                blackText.classList.add("active");
            }

            blackText.textContent =
                blackMove ? blackMove.move : "...";

            blackText.disabled = !blackMove;

            if (blackMove) {
                blackText.addEventListener(
                    "click",
                    () => window.chess?.gameController?.reviewToPly(index + 2)
                );
            }

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

    updateCapturedPieces(gameMoves = []) {

        const captured =
            capturedPiecesFromMoves(gameMoves);

        this.renderCapturedPieces(
            this.capturedWhiteElement,
            captured.white
        );
        this.renderCapturedPieces(
            this.capturedBlackElement,
            captured.black
        );

    }

    renderCapturedPieces(element, pieces) {

        if (!element) {
            return;
        }

        element.innerHTML = "";

        if (pieces.length === 0) {

            const empty = document.createElement("span");

            empty.className = "capturedEmpty";
            empty.textContent = "None";
            element.appendChild(empty);
            return;

        }

        for (const piece of pieces) {

            const image = document.createElement("img");

            image.className = "capturedPiece";
            image.src = this.pieceImages[piece];
            image.alt = "Captured chess piece";
            image.draggable = false;
            element.appendChild(image);

        }

    }

}
