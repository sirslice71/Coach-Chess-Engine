//======================================
// gamecontroller.js
//======================================

import EngineDebug from "../dev/enginedebug.js";
import Attack from "../engine/attack.js";
import PGN from "./pgn.js";

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

        this.positionCursor = 0;

        this.humanSide = 1;

        this.interval = null;

        this.coachMovePending = false;

        this.manualResult = null;

        this.infiniteAnalysisTimer = null;
        this.infiniteAnalysisDepth = 1;

    }

    //----------------------------------
    // Human Side
    //----------------------------------

    setHumanSide(side) {

        this.humanSide =
            side > 0 ? 1 : -1;

    }

    isHumanTurn() {

        if (this.isGameOver()) {
            return false;
        }

        return this.board.sideToMove ===
            this.humanSide;

    }

    shouldCoachPlay() {

        return (
            this.autoCoach &&
            !this.isGameOver() &&
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

            this.goToCurrentPosition();

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
        result.note = "opening variety";

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
        this.positionCursor = 0;

        this.coachMovePending = false;
        this.manualResult = null;
        this.stopInfiniteAnalysis();

        this.ui.selectedSquare = -1;
        this.ui.flipped = this.humanSide < 0;
        this.ui.draw();
        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );
        this.ui.enginePanel.setStatus("Ready");

        this.ui.setGameStatus?.(
            this.humanSide > 0
                ? "Your turn as White."
                : "Coach is thinking...",
            this.humanSide > 0 ? "neutral" : "working"
        );

        this.scheduleCoachMove(depth);

    }

    //----------------------------------
    // Coach Moves
    //----------------------------------

    coachMove(depth = 5) {

        this.stopInfiniteAnalysis();
        this.goToCurrentPosition();

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

        const coachMeta =
            this.buildCoachMeta(
                result,
                rootSideToMove
            );

        const ok =
            this.playMove(result.move, coachMeta);

        console.timeEnd("Play Move");

        if (!ok) {

            console.timeEnd("Coach TOTAL");

            return false;

        }

        if (!this.currentResult().gameOver) {
            this.ui.setGameStatus?.("Your turn.", "neutral");
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
    // Coach Move Metadata
    //
    // Captures the search telemetry that
    // corresponds to the move Coach is
    // about to play, for chess.evalHistory().
    //----------------------------------

    buildCoachMeta(result, rootSideToMove) {

        const evalWhite =
            Number(result.evaluation);

        const evalCoach =
            rootSideToMove > 0
                ? evalWhite
                : -evalWhite;

        return {

            depth: result.depth,

            evalWhite,

            evalCoach,

            nodes: result.nodes,

            timeMs: Number(result.elapsedMs),

            nps: result.nps,

            pv: (result.pv || [])
                .map(pvMove => pvMove.toString())
                .join(" "),

            note: result.note || ""

        };

    }

    //----------------------------------
    // Play Move
    //----------------------------------

    playMove(move, coachMeta = null) {

        this.stopInfiniteAnalysis();

        if (this.isGameOver()) {
            return false;
        }

        this.trimFutureMoves();

        //----------------------------------
        // SAN (Pre-Move Legal Position)
        //----------------------------------
        // Must run before board.makeMove()
        // so disambiguation sees the actual
        // pre-move legal move list.
        //----------------------------------

        const legalMoves =
            this.gameState.legalMoveGenerator
                .generateMoves();

        const baseSan =
            PGN.sanForMove(move, legalMoves);

        //----------------------------------
        // Execute Move
        //----------------------------------

        this.board.makeMove(move);

        //----------------------------------
        // Check / Checkmate Suffix
        // (post-move position)
        //----------------------------------

        const san =
            baseSan + this.checkSuffix();

        //----------------------------------
        // Record Move
        //----------------------------------

        this.recordMove(move, san, coachMeta);
        this.positionCursor = this.gameMoves.length;
        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );

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
            this.currentResult();

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
    // Check / Checkmate Suffix
    //
    // Must run AFTER board.makeMove(),
    // using the post-move position, and
    // must NOT undo the move -- the move
    // just made is the real game move.
    //----------------------------------

    checkSuffix() {

        if (!this.board.isInCheck()) {
            return "";
        }

        const opponentMoves =
            this.gameState.legalMoveGenerator
                .generateMoves();

        return opponentMoves.length === 0
            ? "#"
            : "+";

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

    startInfiniteAnalysis() {

        if (!this.canUseReviewAnalysis()) {

            return {
                result: "NOT_READY",
                message:
                    "Use analysis while reviewing a past position or after the game ends."
            };

        }

        this.stopInfiniteAnalysis();

        this.infiniteAnalysisDepth = 1;
        this.ui.enginePanel.setStatus("Analyzing...");

        const analyzeNextDepth = () => {

            const depth =
                this.infiniteAnalysisDepth;

            const result =
                this.search.bestMove(
                    depth,
                    {
                        quiet: true,
                        deadlineMs:
                            performance.now() + 1500
                    }
                );

            this.ui.enginePanel.update(result);
            this.ui.enginePanel.setStatus(
                `Analyzing depth ${depth}`
            );

            this.infiniteAnalysisDepth++;

            this.infiniteAnalysisTimer =
                setTimeout(analyzeNextDepth, 50);

        };

        analyzeNextDepth();

        return {
            result: "PASS"
        };

    }

    stopInfiniteAnalysis() {

        if (this.infiniteAnalysisTimer !== null) {

            clearTimeout(this.infiniteAnalysisTimer);
            this.infiniteAnalysisTimer = null;

        }

        this.ui.enginePanel.setStatus("Ready");

    }

    canUseReviewAnalysis() {

        return (
            this.currentResult().gameOver ||
            this.positionCursor < this.gameMoves.length
        );

    }

    goToPly(ply) {

        const target =
            Math.max(
                0,
                Math.min(ply, this.gameMoves.length)
            );

        while (this.positionCursor > target) {

            this.board.undoMove();
            this.positionCursor--;

        }

        while (this.positionCursor < target) {

            const entry =
                this.gameMoves[this.positionCursor];

            if (!entry || !entry.rawMove) {
                break;
            }

            this.board.makeMove(entry.rawMove);
            this.positionCursor++;

        }

        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );
        this.ui.draw();

    }

    //----------------------------------
    // Check Game Over
    //----------------------------------

    checkGameOver() {

        const result =
            this.currentResult();

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
    //
    // One record per ply, for both human
    // and Coach moves. Coach moves carry
    // search metadata (coachMeta); human
    // moves leave those fields blank.
    //
    // This same array backs:
    // - the existing move history panel (.move)
    // - chess.evalHistory()
    // - chess.exportPgn() (.san)
    // so Undo (which pops this array) keeps
    // all three in sync automatically.
    //----------------------------------

    recordMove(move, san, coachMeta = null) {

        const ply =
            this.gameMoves.length + 1;

        const moveNumber =
            Math.ceil(ply / 2);

        const side =
            (ply % 2 === 1) ? "White" : "Black";

        this.gameMoves.push({

            rawMove: move,

            move: move.toString(),

            piece: move.piece,

            captured: move.capturedPiece,

            promoted: move.promotedPiece,

            flags: move.flags,

            fen: this.board.repetitionKey(),

            san,

            moveNumber,

            side,

            coach: !!coachMeta,

            depth: coachMeta ? coachMeta.depth : null,

            evalWhite: coachMeta ? coachMeta.evalWhite : null,

            evalCoach: coachMeta ? coachMeta.evalCoach : null,

            nodes: coachMeta ? coachMeta.nodes : null,

            timeMs: coachMeta ? coachMeta.timeMs : null,

            nps: coachMeta ? coachMeta.nps : null,

            pv: coachMeta ? coachMeta.pv : null,

            note: coachMeta ? (coachMeta.note || "") : ""

        });

    }

    isGameOver() {

        return !!(
            this.manualResult &&
            this.manualResult.gameOver
        );

    }

    currentResult() {

        return this.manualResult ||
            this.gameState.getResult();

    }

    resignHuman() {

        if (this.isGameOver()) {
            return false;
        }

        this.goToCurrentPosition();
        this.coachMovePending = false;

        const coachWinsAsWhite =
            this.humanSide < 0;

        this.manualResult = {

            gameOver: true,
            winner: -this.humanSide,
            result: coachWinsAsWhite
                ? "1-0"
                : "0-1",
            reason: "Human resigned"

        };

        this.ui.clearSelection();
        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );
        this.ui.enginePanel.setStatus("Game Over");
        this.ui.showGameOver(this.manualResult);

        return true;

    }

    trimFutureMoves() {

        if (this.positionCursor >= this.gameMoves.length) {
            return;
        }

        this.gameMoves =
            this.gameMoves.slice(0, this.positionCursor);

    }

    goToCurrentPosition() {

        while (this.positionCursor < this.gameMoves.length) {

            const entry =
                this.gameMoves[this.positionCursor];

            if (!entry || !entry.rawMove) {
                break;
            }

            this.board.makeMove(entry.rawMove);
            this.positionCursor++;

        }

        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );

        this.ui.draw();

    }

    reviewPreviousMove() {

        this.stopInfiniteAnalysis();

        if (
            !this.canReviewMoveHistory() ||
            this.positionCursor <= 0
        ) {
            return false;
        }

        this.board.undoMove();
        this.positionCursor--;

        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );

        this.ui.draw();
        this.showReviewEvaluation();

        return true;

    }

    reviewToPly(ply) {

        this.stopInfiniteAnalysis();

        if (this.coachMovePending || this.gameMoves.length === 0) {
            return false;
        }

        this.goToPly(ply);
        this.showReviewEvaluation();
        this.ui.setGameStatus?.(
            `Reviewing position after ply ${this.positionCursor}.`,
            "neutral"
        );

        return true;

    }

    reviewNextMove() {

        this.stopInfiniteAnalysis();

        if (
            !this.canReviewMoveHistory() ||
            this.positionCursor >= this.gameMoves.length
        ) {
            return false;
        }

        const entry =
            this.gameMoves[this.positionCursor];

        if (!entry || !entry.rawMove) {
            return false;
        }

        this.board.makeMove(entry.rawMove);
        this.positionCursor++;

        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );

        this.ui.draw();
        this.showReviewEvaluation();

        return true;

    }

    canReviewMoveHistory() {

        if (this.coachMovePending) {
            return false;
        }

        return (
            this.positionCursor < this.gameMoves.length ||
            this.isHumanTurn()
        );

    }

    undoLastMove() {

        this.stopInfiniteAnalysis();
        this.goToCurrentPosition();

        let lastHumanMoveIndex = -1;

        for (let index = this.gameMoves.length - 1; index >= 0; index--) {

            const side =
                this.gameMoves[index]?.side === "White" ? 1 : -1;

            if (side === this.humanSide) {
                lastHumanMoveIndex = index;
                break;
            }

        }

        if (lastHumanMoveIndex < 0) {
            return false;
        }

        this.goToPly(lastHumanMoveIndex);
        this.gameMoves =
            this.gameMoves.slice(0, lastHumanMoveIndex);
        this.positionCursor = this.gameMoves.length;
        this.coachMovePending = false;
        this.manualResult = null;

        this.ui.draw();
        this.ui.updateMoveHistory(
            this.gameMoves,
            this.positionCursor
        );
        this.ui.enginePanel.clear();
        this.ui.setGameStatus?.("Your previous move was undone.", "success");

        return true;

    }

    showReviewEvaluation() {

        const evaluation =
            this.search.evaluation.evaluate().total / 100;

        this.ui.enginePanel.showStaticEvaluation(evaluation);

    }

    analyzeGameQuick(depth = 3) {

        this.stopInfiniteAnalysis();

        if (!this.currentResult().gameOver) {

            return {
                result: "NOT_READY",
                message: "Game analysis is available after the game ends.",
                findings: []
            };

        }

        const originalCursor =
            this.positionCursor;

        const findings = [];

        this.goToPly(0);

        for (
            let index = 0;
            index < this.gameMoves.length;
            index++
        ) {

            const entry =
                this.gameMoves[index];

            if (!entry || !entry.rawMove) {
                continue;
            }

            const side =
                entry.side === "White" ? 1 : -1;

            if (side === this.humanSide) {

                const bestBefore =
                    this.search.bestMove(
                        depth,
                        { quiet: true }
                    );

                this.board.makeMove(entry.rawMove);
                this.positionCursor = index + 1;

                const actualAfter =
                    this.search.bestMove(
                        Math.max(1, depth - 1),
                        { quiet: true }
                    );

                const bestEval =
                    Number(bestBefore.evaluation);

                const actualEval =
                    Number(actualAfter.evaluation);

                const loss =
                    this.humanSide > 0
                        ? bestEval - actualEval
                        : actualEval - bestEval;

                if (loss >= 0.75) {

                    findings.push({
                        ply: index + 1,
                        moveNumber: entry.moveNumber,
                        side: entry.side,
                        played: entry.san || entry.move,
                        suggested: bestBefore.notation,
                        swing: Number(loss.toFixed(2)),
                        beforeEval: bestBefore.evaluation,
                        afterEval: actualAfter.evaluation
                    });

                }

            } else {

                this.board.makeMove(entry.rawMove);
                this.positionCursor = index + 1;

            }

        }

        this.goToPly(originalCursor);

        findings.sort((a, b) => b.swing - a.swing);

        return {
            result: "PASS",
            depth,
            analyzedHumanMoves:
                this.gameMoves.filter(
                    entry => (
                        entry.side === "White" ? 1 : -1
                    ) === this.humanSide
                ).length,
            findingCount: findings.length,
            findings: findings.slice(0, 6)
        };

    }

    //----------------------------------
    // Coach Eval History
    // (console command: chess.evalHistory())
    //----------------------------------

    evalHistory() {

        const rows =
            this.gameMoves.map(entry => ({

                moveNumber: entry.moveNumber,

                side: entry.side,

                played: entry.move,

                san: entry.san,

                depth: entry.depth,

                evalWhite: entry.evalWhite,

                evalCoach: entry.evalCoach,

                nodes: entry.nodes,

                timeMs: entry.timeMs,

                nps: entry.nps,

                pv: entry.pv,

                note: entry.note

            }));

        console.table(rows);

        return rows;

    }

    //----------------------------------
    // PGN Export
    // (console command: chess.exportPgn())
    //----------------------------------

    exportPgn() {

        const result =
            this.currentResult().result;

        const pgn =
            PGN.buildPgnString({

                gameMoves: this.gameMoves,

                humanSide: this.humanSide,

                result

            });

        console.log(pgn);

        return pgn;

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
