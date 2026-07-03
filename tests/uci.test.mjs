import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import Zobrist from "../js/engine/zobrist.js";
import {
    applyUciMove,
    createEngineCore,
    moveToUci,
    UciSession,
    uciToMove
} from "../js/uci/uciengine.js";

function legalUciMoves(engine) {

    return new Set(
        engine.legalMoveGenerator
            .generateMoves()
            .map(moveToUci)
    );

}

test("UCI move conversion handles quiet moves, castling, and promotion", () => {

    const startEngine =
        createEngineCore();

    const startMoves =
        startEngine.legalMoveGenerator.generateMoves();

    const e2e4 =
        uciToMove("e2e4", startMoves);

    assert.ok(e2e4);
    assert.equal(moveToUci(e2e4), "e2e4");

    const castleEngine =
        createEngineCore(
            "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"
        );

    const castleMove =
        uciToMove(
            "e1g1",
            castleEngine
                .legalMoveGenerator
                .generateMoves()
        );

    assert.ok(castleMove);
    assert.equal(moveToUci(castleMove), "e1g1");

    const promotionEngine =
        createEngineCore(
            "6k1/P7/8/8/8/8/8/4K3 w - - 0 1"
        );

    const promotionMove =
        uciToMove(
            "a7a8q",
            promotionEngine
                .legalMoveGenerator
                .generateMoves()
        );

    assert.ok(promotionMove);
    assert.equal(moveToUci(promotionMove), "a7a8q");

});

test("position startpos moves e2e4 e7e5 applies legal moves", () => {

    const engine =
        createEngineCore();

    applyUciMove(engine, "e2e4");
    applyUciMove(engine, "e7e5");

    assert.equal(engine.board.sideToMove, 1);
    assert.equal(engine.board.enPassantSquare, 20);
    assert.equal(
        FEN.export(engine.board),
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 1"
    );

});

test("UCI session loads explicit FEN positions", () => {

    const session =
        new UciSession();

    session.handleCommand(
        "position fen 4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1"
    );

    assert.equal(
        FEN.export(session.engine.board),
        "4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1"
    );

});

test("attachZobrist generates a consistent hash for the current board", () => {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    board.attachZobrist(zobrist);

    assert.notEqual(board.hashKey, 0n);
    assert.equal(zobrist.verify(board), true);
    assert.deepEqual(
        board.repetitionTable,
        [board.repetitionKey()]
    );

});

test("UCI process handshake and depth-1 search return protocol-safe output", async () => {

    const child = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", chunk => {
        stdout += chunk;
    });

    child.stderr.on("data", chunk => {
        stderr += chunk;
    });

    child.stdin.write("uci\n");
    child.stdin.write("isready\n");
    child.stdin.write("position startpos moves e2e4 e7e5\n");
    child.stdin.write("go depth 1\n");
    child.stdin.write("quit\n");
    child.stdin.end();

    const exitCode = await new Promise((resolve, reject) => {

        child.on("error", reject);

        child.on("close", resolve);

    });

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const lines =
        stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

    assert.ok(lines.includes("id name Coach Chess Engine"));
    assert.ok(lines.includes("id author Sir Slice / Sir Slice"));
    assert.ok(lines.includes("uciok"));
    assert.ok(lines.includes("readyok"));

    const infoLine =
        lines.find(line => line.startsWith("info depth 1 "));

    assert.ok(infoLine);

    const bestMoveLine =
        lines.find(line => line.startsWith("bestmove "));

    assert.ok(bestMoveLine);

    const bestMove =
        bestMoveLine.slice("bestmove ".length);

    const engine =
        createEngineCore();

    applyUciMove(engine, "e2e4");
    applyUciMove(engine, "e7e5");

    assert.ok(
        legalUciMoves(engine).has(bestMove),
        `Expected legal bestmove, got ${bestMove}`
    );

});
