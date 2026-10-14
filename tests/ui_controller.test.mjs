import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Board from "../js/core/board.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import GameController from "../js/game/gamecontroller.js";
import { Piece } from "../js/core/piece.js";
import UI, {
    capturedPiecesFromMoves
} from "../js/ui/ui.js";

function createBoardHarness() {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();
    board.attachZobrist(zobrist);
    board.initializePosition();

    const moveGenerator = new MoveGenerator(board);
    const legalMoveGenerator =
        new LegalMoveGenerator(board, moveGenerator);

    return { board, legalMoveGenerator };

}

function play(board, legalMoveGenerator, notation) {

    const move =
        legalMoveGenerator
            .generateMoves()
            .find(candidate => candidate.toString() === notation);

    assert.ok(move, `Expected legal move ${notation}`);
    board.makeMove(move);
    return move;

}

function moveEntry(rawMove, side) {

    return {
        rawMove,
        move: rawMove.toString(),
        side,
        captured: rawMove.capturedPiece
    };

}

function createUiStub() {

    const calls = {
        clear: 0,
        draw: 0,
        histories: [],
        staticEvaluations: [],
        statuses: []
    };

    return {
        calls,
        clearSelection() {},
        draw() {
            calls.draw++;
        },
        updateMoveHistory(moves, cursor) {
            calls.histories.push({ length: moves.length, cursor });
        },
        setGameStatus(message, tone) {
            calls.statuses.push({ message, tone });
        },
        enginePanel: {
            clear() {
                calls.clear++;
            },
            setStatus() {},
            showStaticEvaluation(value) {
                calls.staticEvaluations.push(value);
            }
        }
    };

}

function createController(board, ui) {

    return new GameController(
        board,
        ui,
        {
            evaluation: {
                evaluate() {
                    return { total: 125 };
                }
            }
        },
        null
    );

}

test("captured piece summary separates white and black losses", () => {

    const captured = capturedPiecesFromMoves([
        { captured: Piece.BP },
        { captured: Piece.WN },
        { captured: Piece.EMPTY },
        null,
        { captured: Piece.BQ }
    ]);

    assert.deepEqual(captured.white, [Piece.WN]);
    assert.deepEqual(captured.black, [Piece.BP, Piece.BQ]);

});

test("game-over feedback is written to the visible status region", () => {

    const ui = Object.create(UI.prototype);

    ui.gameStatusElement = {
        textContent: "",
        dataset: {}
    };

    ui.showGameOver({
        winner: -1,
        reason: "Checkmate",
        result: "0-1"
    });

    assert.equal(
        ui.gameStatusElement.textContent,
        "Black wins. Checkmate (0-1)."
    );
    assert.equal(ui.gameStatusElement.dataset.tone, "result");

});

test("visible hints highlight both move squares", () => {

    const classes =
        Array.from({ length: 64 }, () => new Set());
    const ui = Object.create(UI.prototype);

    ui.flipped = false;
    ui.boardElement = {
        children: classes.map(classNames => ({
            classList: {
                add(...names) {
                    names.forEach(name => classNames.add(name));
                },
                remove(...names) {
                    names.forEach(name => classNames.delete(name));
                }
            }
        }))
    };

    ui.showHint({ fromSquare: 12, toSquare: 28 });

    assert.equal(classes[12].has("hintFrom"), true);
    assert.equal(classes[28].has("hintTo"), true);

});

test("UI initialization renders empty move and capture states", () => {

    const calls = [];
    const ui = Object.create(UI.prototype);

    ui.createBoard = () => calls.push("board");
    ui.draw = () => calls.push("draw");
    ui.updateMoveHistory = (moves, activePly) => {
        calls.push({ moves, activePly });
    };

    ui.initialize();

    assert.deepEqual(calls, [
        "board",
        "draw",
        { moves: [], activePly: 0 }
    ]);

});

test("undo removes the human move and Coach reply for a White player", () => {

    const { board, legalMoveGenerator } = createBoardHarness();
    const ui = createUiStub();
    const controller = createController(board, ui);
    const white = play(board, legalMoveGenerator, "e2-e4");
    const black = play(board, legalMoveGenerator, "e7-e5");

    controller.humanSide = 1;
    controller.gameMoves = [
        moveEntry(white, "White"),
        moveEntry(black, "Black")
    ];
    controller.positionCursor = 2;

    assert.equal(controller.undoLastMove(), true);
    assert.equal(controller.gameMoves.length, 0);
    assert.equal(controller.positionCursor, 0);
    assert.equal(board.sideToMove, 1);
    assert.equal(ui.calls.clear, 1);
    assert.match(ui.calls.statuses.at(-1).message, /undone/i);

});

test("undo preserves Coach's opening move and restores a Black player's turn", () => {

    const { board, legalMoveGenerator } = createBoardHarness();
    const ui = createUiStub();
    const controller = createController(board, ui);
    const coachOpening = play(board, legalMoveGenerator, "e2-e4");
    const humanMove = play(board, legalMoveGenerator, "e7-e5");
    const coachReply = play(board, legalMoveGenerator, "g1-f3");

    controller.humanSide = -1;
    controller.gameMoves = [
        moveEntry(coachOpening, "White"),
        moveEntry(humanMove, "Black"),
        moveEntry(coachReply, "White")
    ];
    controller.positionCursor = 3;

    assert.equal(controller.undoLastMove(), true);
    assert.equal(controller.gameMoves.length, 1);
    assert.equal(controller.positionCursor, 1);
    assert.equal(board.sideToMove, -1);
    assert.equal(controller.gameMoves[0].move, "e2-e4");

});

test("undo does nothing before the Black player has moved", () => {

    const { board, legalMoveGenerator } = createBoardHarness();
    const ui = createUiStub();
    const controller = createController(board, ui);
    const coachOpening = play(board, legalMoveGenerator, "e2-e4");

    controller.humanSide = -1;
    controller.gameMoves = [moveEntry(coachOpening, "White")];
    controller.positionCursor = 1;

    assert.equal(controller.undoLastMove(), false);
    assert.equal(controller.gameMoves.length, 1);
    assert.equal(board.sideToMove, -1);

});

test("move-history review uses static evaluation without starting search", () => {

    const { board, legalMoveGenerator } = createBoardHarness();
    const ui = createUiStub();
    const controller = createController(board, ui);
    const white = play(board, legalMoveGenerator, "e2-e4");
    const black = play(board, legalMoveGenerator, "e7-e5");

    controller.gameMoves = [
        moveEntry(white, "White"),
        moveEntry(black, "Black")
    ];
    controller.positionCursor = 2;

    assert.equal(controller.reviewToPly(1), true);
    assert.equal(controller.positionCursor, 1);
    assert.deepEqual(ui.calls.staticEvaluations, [1.25]);

});

test("player UI omits blocking analysis controls and labels depth honestly", async () => {

    const html =
        await readFile(new URL("../index.html", import.meta.url), "utf8");

    assert.doesNotMatch(html, /infiniteAnalysisBtn/);
    assert.doesNotMatch(html, /stopAnalysisBtn/);
    assert.doesNotMatch(html, /gameAnalysisBtn/);
    assert.doesNotMatch(html, /Evaluation Breakdown/);
    assert.match(html, /<title>Coach 1\.0\.0 Chess Engine<\/title>/);
    assert.match(html, /Coach <span class="appVersion">1\.0\.0<\/span>/);
    assert.match(html, /Depth 5 \(Default\)/);
    assert.match(html, /id="gameStatus"/);
    assert.match(html, /White pieces lost/);
    assert.match(html, /Black pieces lost/);

});

test("every static button has a handler path and the board has responsive bounds", async () => {

    const [html, mainSource, labSource, uiSource, css] =
        await Promise.all([
            readFile(new URL("../index.html", import.meta.url), "utf8"),
            readFile(new URL("../js/main.js", import.meta.url), "utf8"),
            readFile(new URL("../js/ui/coachlabpanel.js", import.meta.url), "utf8"),
            readFile(new URL("../js/ui/ui.js", import.meta.url), "utf8"),
            readFile(new URL("../style.css", import.meta.url), "utf8")
        ]);

    const buttonIds =
        [...html.matchAll(/<button\b[^>]*\bid="([^"]+)"[^>]*>/gs)]
            .map(match => match[1]);
    const handlerSources = `${mainSource}\n${labSource}\n${uiSource}`;

    assert.deepEqual(buttonIds, [
        "newGameBtn",
        "newGameWhiteBtn",
        "newGameBlackBtn",
        "newGameCancelBtn",
        "undoBtn",
        "flipBtn",
        "hintBtn",
        "resignBtn",
        "dragMoveModeBtn",
        "clickMoveModeBtn",
        "gameTabBtn",
        "labTabBtn"
    ]);

    for (const id of buttonIds) {
        assert.match(handlerSources, new RegExp(`\\b${id}\\b`));
    }

    assert.match(uiSource, /document\.createElement\("button"\)/);
    assert.match(uiSource, /reviewToPly/);
    assert.match(css, /\.capturedGroup\s*\{[^}]*\}\s*\.capturedGroup\s*>\s*span\s*\{/s);
    assert.match(css, /width:min\(640px, calc\(100vw - 40px\), calc\(100vh - 40px\)\)/);
    assert.match(css, /@media\(max-width:720px\)/);
    assert.match(css, /aside,\s*main\s*\{\s*flex-shrink:0;/s);
    assert.match(css, /main\s*\{\s*order:1;/s);
    assert.match(css, /#leftPanel\s*\{\s*order:2;/s);
    assert.match(css, /#rightPanel\s*\{\s*order:3;/s);
    assert.match(css, /#moveHistory\s*\{[^}]*height:220px;[^}]*min-height:160px;/s);

});
