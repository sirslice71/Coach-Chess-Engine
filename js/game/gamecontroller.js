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

        this.humanSide = 1;

        this.interval = null;

        this.coachMovePending = false;

    }

    //----------------------------------
    // Human Side
    //----------------------------------

    setHumanSide(side) {

        this.humanSide =
            side > 0 ? 1 : -1;

    }

    isHumanTurn() {

        return this.board.sideToMove ===
            this.humanSide;

    }

    shouldCoachPlay() {

        return (
            this.autoCoach &&
            !this.isHumanTurn()
        );

    }

    scheduleCoachMove(depth = 5) {

        if (
            !this.shouldCoachPlay() ||
            this.coachMovePending
        ) {
            return;
        }

        this.coachMovePending = true;

        setTimeout(() => {

            this.coachMovePending = false;

            if (this.shouldCoachPlay()) {
                this.coachMove(depth);
            }

        }, 50);

    }

    isFirstCoachWhiteMove() {

        return (
            this.humanSide < 0 &&
            this.board.sideToMove > 0 &&
            this.gameMoves.length === 0
        );

    }

    isFirstCoachBlackReply() {

        return (
            this.humanSide > 0 &&
            this.board.sideToMove < 0 &&
            this.gameMoves.length === 1
        );

    }

    openingVarietyLimit() {

        if (this.isFirstCoachWhiteMove()) {
            return 5;
        }

        if (this.isFirstCoachBlackReply()) {
            return 3;
        }

        return 0;

    }

    approvedWhiteOpeningMoves() {

        return new Set([
            "e2-e4",
            "d2-d4",
            "g1-f3",
            "b1-c3",
            "c2-c4"
        ]);

    }

    rankOpeningVarietyMoves(rootMoves, rootSideToMove) {

        return rootMoves
            .map(candidate => ({
                ...candidate,
                staticScore:
                    this.openingVarietyStaticScore(
                        candidate.move,
                        rootSideToMove
                    )
            }))
            .sort((a, b) => {

                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                return b.staticScore - a.staticScore;

            });

    }

    chooseOpeningVarietyMove(result, rootSideToMove) {

        const limit =
            this.openingVarietyLimit();

        if (
            limit === 0 ||
            !result.rootMoves ||
            result.rootMoves.length === 0
        ) {
            return result;
        }

        const rankedMoves =
            this.rankOpeningVarietyMoves(
                result.rootMoves,
                rootSideToMove
            );

        let candidates;

        if (this.isFirstCoachWhiteMove()) {

            const approvedMoves =
                this.approvedWhiteOpeningMoves();

            candidates =
                rankedMoves.filter(candidate =>
                    approvedMoves.has(
                        candidate.move.toString()
                    )
                );

            if (candidates.length === 0) {

                console.warn(
                    "Coach opening variety found no approved White first moves; using normal best move."
                );

                return result;

            }

        } else {

            candidates =
                rankedMoves.slice(0, limit);

        }

        const bestScore =
            candidates[0].score;

        const safeMoves =
            candidates.filter(candidate =>
                candidate.score >=
                bestScore - 75
            );

        const pool =
            safeMoves.length > 0
                ? safeMoves
                : [candidates[0]];

        const choice =
            pool[
                Math.floor(
                    Math.random() * pool.length
                )
            ];

        result.move = choice.move;
        result.notation = choice.notation;
        result.evaluation =
            (
                this.search.toWhiteRelativeScore(
                    choice.score,
                    rootSideToMove
                ) / 100
            ).toFixed(2);
        result.pv = [choice.move];

        console.debug(
            "Coach opening variety pool",
            pool.map(candidate => ({
                move: candidate.notation,
                score: candidate.score,
                staticScore: candidate.staticScore
            }))
        );

        return result;

    }

    openingVarietyStaticScore(move, rootSideToMove) {

        this.board.makeMove(move);

        const whiteScore =
            this.search.evaluation.evaluate().total;

        this.board.undoMove();

        return this.search.toSideToMoveScore(
            whiteScore,
            rootSideToMove
        );

    }

    //----------------------------------
    // New Game
    //----------------------------------

    startNewGame(
        humanSide = 1,
        depth = 5
    ) {

        this.stopCoachVsCoach();

        this.setHumanSide(humanSide);

        this.board.initializePosition();

        this.gameMoves = [];

        this.coachMovePending = false;

        this.ui.selectedSquare = -1;
        this.ui.flipped = this.humanSide < 0;
        this.ui.draw();
        this.ui.updateMoveHistory(this.gameMoves);
        this.ui.enginePanel.setStatus("Ready");

        this.scheduleCoachMove(depth);

    }

    //----------------------------------
    // Coach Moves
    //----------------------------------

    coachMove(depth = 5) {

        console.time("Coach TOTAL");

        const rootSideToMove =
            this.board.sideToMove;

        //----------------------------------
        // Search
        //----------------------------------

        console.time("Search");

        this.ui.enginePanel.setStatus("Thinking...");

        const result =
            this.search.bestMove(
                depth,
                { quiet: true }
            );

        this.chooseOpeningVarietyMove(
            result,
            rootSideToMove
        );

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
        this.ui.updateMoveHistory(this.gameMoves);

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

        depth = 5,

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
