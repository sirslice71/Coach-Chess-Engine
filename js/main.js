import Board from "./core/board.js";
import UI from "./ui/ui.js";
import MoveGenerator from "./engine/movegen.js";
import Attack from "./engine/attack.js";
import {
    fromAlgebraic,
    algebraic
} from "./core/square.js";
import LegalMoveGenerator from "./engine/legalmovegen.js";
import Perft from "./engine/perft.js";
import FEN from "./core/fen.js";
import Positions from "./core/testpositions.js";
import Evaluation from "./engine/evaluation.js";
import Search from "./engine/search.js";
import GameState from "./engine/gamestate.js";
import GameController
    from "./game/gamecontroller.js";

//----------------------------------
// Developer Tools
//----------------------------------

import Developer
    from "./dev/developer.js";
import EngineDebug
    from "./dev/enginedebug.js";
import CoachLab
    from "./dev/coachlab.js";

import Logger from "./dev/logger.js";


Logger.info("Coach v0.5 Alpha");

const board = new Board();
const moveGenerator = new MoveGenerator(board);
const legalMoveGenerator =
    new LegalMoveGenerator(board, moveGenerator);
const perft = new Perft(
    board,
    legalMoveGenerator
);
const ui = new UI(
    board,
    legalMoveGenerator
);
const evaluation =
    new Evaluation(board);
const search =
    new Search(
        board,
        legalMoveGenerator,
        evaluation
    );
const gameState =

    new GameState(

        board,

        legalMoveGenerator

    );
const gameController =
    new GameController(
        board,
        ui,
        search,
        gameState
    );

//----------------------------------
// Developer Tools
//----------------------------------

const developer =

    new Developer(

        board,

        ui,

        search,

        evaluation

    );

const coachLab = new CoachLab(

    board,

    search,

    evaluation

);    

console.log(search);

window.chess = {

    board,

    ui,

    moveGenerator,

    legalMoveGenerator,

    perft,

    Attack,

    fromAlgebraic,

    algebraic,

    search,

    gameController,

    gameState,

    debug: EngineDebug,

    dev: developer,

    //-----------------------------
    // Move Helpers
    //-----------------------------

    moves() {

        return legalMoveGenerator.generateMoves();

    },

    printMoves() {

        return legalMoveGenerator
            .generateMoves()
            .map(move => move.toString());

    },

    //-----------------------------
    // Engine State
    //-----------------------------

    turn() {

        return board.sideToMove > 0
            ? "White"
            : "Black";

    },

    enPassant() {

        return board.enPassantSquare === -1
            ? "None"
            : algebraic(board.enPassantSquare);

    },

    castling() {

        return {

            whiteKingSide:
                board.castlingRights.whiteKingSide,

            whiteQueenSide:
                board.castlingRights.whiteQueenSide,

            blackKingSide:
                board.castlingRights.blackKingSide,

            blackQueenSide:
                board.castlingRights.blackQueenSide

        };

    },

    bench(depth = 5) {

        return search.bench(depth);

    },

    benchAll() {

        search.benchAll();

    },

    getCoachDepth() {

        return selectedCoachDepth();

    },

    material() {

        return {

            white: board.whiteMaterial,

            black: board.blackMaterial,

            score: board.whiteMaterial - board.blackMaterial

        };

    },

    //-----------------------------
    // Attack Helpers
    //-----------------------------

    attacked(square, byWhite) {

        return Attack.isSquareAttacked(

            board,

            fromAlgebraic(square),

            byWhite

        );

    },

    //-----------------------------
    // Perft
    //-----------------------------

    perft(depth) {

        console.log("Verifying.....");
        return perft.run(depth);
        
    },

    divide(depth) {

        return perft.divide(depth);

    },

    verify(depth = 5) {

        return perft.verify(depth);

    },

    //-----------------------------
    // FEN
    //-----------------------------

    load(fen) {

        FEN.import(board, fen);

        ui.draw();

    },

    fen() {

        return FEN.export(board);

    },

    position(name) {

        const fen = Positions[name];

        if (!fen) {

            console.error(

                `Unknown position: ${name}`

            );

            console.log(

                "Available positions:",

                Object.keys(Positions)

            );

            return;

        }

        this.load(fen);
        return `✓ Position "${name}" loaded.`;
        
    },

    positions() {

        console.table(

            Object.keys(Positions)

                .map(name => ({

                    Position: name

                }))

        );

    },

    savePosition(name = "New Position") {

        console.log(

            `${name}:\n"${this.fen()}",`

        );

    },

    //-----------------------------
    // Evaluation
    //-----------------------------    

    evaluation,

    eval() {

        return evaluation.evaluate();

    },

    staticEval() {

        return this.eval();

    },

    searchEval() {

        return (

            search.lastSearchScore / 100

        ).toFixed(2);

    },

    divideAfter(move, depth) {

        return perft.divideAfter(move, depth);

    },

    attack(square, byWhite) {

        return Attack.debug(
            board,
            square,
            byWhite
        );

    },

    analyze(depth = 4) {

        return search.analyze(depth);

    },

    tt: search.tt,

    zobrist: search.zobrist,

    hash() {

        return search.zobrist.generate(board);

    },

    verifyHash() {

        return search.zobrist.verify(board);

    },

    engineEval() {

        return search.lastEvaluation;

    },

    debugKnightPST() {

        return evaluation.debugKnightPST();

    },

    debugEvaluation() {

        return evaluation.debugEvaluation();

    },

    compare(depth = 1) {

        return search.compareRootMoves(depth);

    },

    //-----------------------------
    // Game History
    //-----------------------------

    history() {

        return board.moveHistory.map((history, index) => ({

            ply: index + 1,

            move: history.move
                ? history.move.toString()
                : `${algebraic(history.from)}-${algebraic(history.to)}`

        }));

    },

    //----------------------------------
    // Coach Eval History / PGN Export
    // (browser-only diagnostics)
    //----------------------------------

    evalHistory() {

        return gameController.evalHistory();

    },

    exportPgn() {

        return gameController.exportPgn();

    },

    //----------------------------------
    // Coach Lab
    //----------------------------------

    lab(move = null, depth = 1) {

        return search.lab(move, depth);

    },

        logger: Logger

    };

console.log(window.chess);
console.log(window.chess.search);

ui.initialize();

function selectedCoachDepth() {

    const select =
        document.getElementById("difficulty");

    const depth =
        Number.parseInt(select.value, 10);

    return Number.isFinite(depth)
        ? depth
        : 5;

}

function chooseNewGameSide() {

    const answer = prompt(
        "New Game\n\nChoose your color:\nW = Play as White\nB = Play as Black\n\nPress Cancel to keep the current game."
    );

    if (answer === null) {
        return null;
    }

    const normalized =
        answer.trim().toLowerCase();

    if (
        normalized === "w" ||
        normalized === "white"
    ) {
        return 1;
    }

    if (
        normalized === "b" ||
        normalized === "black"
    ) {
        return -1;
    }

    alert(
        "New Game canceled.\n\nPlease enter W for White or B for Black."
    );

    return null;

}

//----------------------------------
// Button Events
//----------------------------------

//----------------------------------
// New Game
//----------------------------------

document

    .getElementById("newGameBtn")

    .addEventListener(

        "click",

        () => {

            const humanSide =
                chooseNewGameSide();

            if (humanSide === null)
                return;

            gameController.startNewGame(
                humanSide,
                selectedCoachDepth()
            );

        }

    );

//----------------------------------
// Flip Board
//----------------------------------

document

    .getElementById("flipBtn")

    .addEventListener(

        "click",

        () => {

            ui.flipBoard();

        }

    );

//----------------------------------
// Undo
//----------------------------------

document

    .getElementById("undoBtn")

    .addEventListener(

        "click",

        () => {

            board.undoMove();

            if (
                gameController.gameMoves.length > 0
            ) {
                gameController.gameMoves.pop();
            }

            ui.draw();
            ui.updateMoveHistory(
                gameController.gameMoves
            );

        }

    );

//----------------------------------
// Hint
//----------------------------------

document

    .getElementById("hintBtn")

    .addEventListener(

        "click",

        () => {

            const result =

                search.bestMove(4);

            console.log(

                "Coach Suggests:",

                result.notation,

                result.evaluation

            );

        }

    );


