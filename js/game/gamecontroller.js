//======================================
// gamecontroller.js
//======================================

import EngineDebug from "../dev/enginedebug.js";
import Attack from "../engine/attack.js";

export default class GameController {

    //----------------------------------
    // Constructor
    //----------------------------------

    constructor(

        board,

        ui,

        search,

        gameState

    ) {

        this.board = board;

        this.ui = ui;

        this.search = search;

        this.gameState = gameState;

        //----------------------------------
        // Auto Coach
        //----------------------------------

        this.autoCoach = true;

        this.gameMoves = [];

    }

    //----------------------------------
    // Coach Moves
    //----------------------------------

    coachMove(depth = 4) {

        console.time("Coach TOTAL");

        //----------------------------------
        // Search
        //----------------------------------

        console.time("Search");

        this.ui.enginePanel.setStatus("Thinking...");

        const result =
            this.search.bestMove(depth);

        console.timeEnd("Search");

        //----------------------------------
        // Engine Panel
        //----------------------------------

        console.time("Engine Panel");

        this.ui.enginePanel.update(result);

        this.ui.enginePanel.setStatus("Ready");

        console.timeEnd("Engine Panel");

        if (!result.move) {

            console.timeEnd("Coach TOTAL");

            console.log("No legal moves.");

            return false;

        }

        //----------------------------------
        // Play Move
        //----------------------------------

        console.time("Play Move");

        const ok =
            this.playMove(result.move);

        console.timeEnd("Play Move");

        if (!ok) {

            console.timeEnd("Coach TOTAL");

            return false;

        }

        //----------------------------------
        // Log
        //----------------------------------

        console.log(
            result.notation,
            result.evaluation
        );

        console.timeEnd("Coach TOTAL");

        return true;

    }

    //----------------------------------
    // Play Move
    //----------------------------------

    playMove(move) {

        //----------------------------------
        // Execute Move
        //----------------------------------

        this.board.makeMove(move);

        //----------------------------------
        // Record Move
        //----------------------------------

        this.recordMove(move);

        //----------------------------------
        // Redraw
        //----------------------------------

        this.ui.draw();

        //----------------------------------
        // Engine Panel
        //----------------------------------

        this.ui.enginePanel.setStatus("Ready");

        //----------------------------------
        // Game State
        //----------------------------------

        const game =
            this.gameState.getResult();

        if (game.gameOver) {

            this.ui.showGameOver(game);

            return false;

        }

        //----------------------------------
        // Extra Checks
        //----------------------------------

        this.checkGameOver();

        return true;

    }

    //----------------------------------
    // Start Coach vs Coach
    //----------------------------------

    startCoachVsCoach(

        depth = 4,

        delay = 500

    ) {

        this.stopCoachVsCoach();

        this.interval =

            setInterval(

                () => {

                    if (

                        !this.coachMove(depth)

                    ) {

                        this.stopCoachVsCoach();

                    }

                },

                delay

            );

    }

    //----------------------------------
    // Stop Coach vs Coach
    //----------------------------------

    stopCoachVsCoach() {

        if (

            this.interval !== null

        ) {

            clearInterval(

                this.interval

            );

            this.interval = null;

        }

    }

    //----------------------------------
    // Check Game Over
    //----------------------------------

    checkGameOver() {

        const result =
            this.gameState.getResult();

        if (!result.gameOver) {

            return false;

        }

        //----------------------------------
        // Show Result
        //----------------------------------

        this.ui.showGameOver(result);

        //----------------------------------
        // Console
        //----------------------------------

        console.log("");

        console.log("========================");

        console.log(result.message);

        console.log("========================");

        return true;

    }

    //----------------------------------
    // Record Move
    //----------------------------------

    recordMove(move) {

        this.gameMoves.push({

            move: move.toString(),

            piece: move.piece,

            captured: move.capturedPiece,

            promoted: move.promotedPiece,

            flags: move.flags,

            fen: this.board.repetitionKey()

        });

    }

    //----------------------------------
    // Print Move List
    //----------------------------------

    printMoves() {

        console.clear();

        console.log("Game Moves");

        console.log("----------------");

        for (let i = 0; i < this.gameMoves.length; i += 2) {

            const white = this.gameMoves[i];

            const black = this.gameMoves[i + 1];

            console.log(

                `${Math.floor(i / 2) + 1}.`,

                white ? white.move : "",

                black ? black.move : ""

            );

        }

    }

}