import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import Zobrist from "../js/engine/zobrist.js";
import {
    applyUciMove,
    allocateMoveTime,
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
    assert.ok(lines.includes("id author Sir Slice"));
    assert.ok(lines.includes("option name Hash type spin default 32 min 1 max 512"));
    assert.ok(lines.includes("option name Move Overhead type spin default 50 min 0 max 1000"));
    assert.ok(lines.includes("option name Clear Hash type button"));
    assert.ok(lines.includes("uciok"));
    assert.ok(lines.includes("readyok"));

    assert.ok(
        lines.indexOf("option name Hash type spin default 32 min 1 max 512") <
        lines.indexOf("uciok")
    );
    assert.ok(
        lines.indexOf("option name Move Overhead type spin default 50 min 0 max 1000") <
        lines.indexOf("uciok")
    );

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

test("UCI process movetime search returns a legal bestmove", async () => {

    const child = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";

    child.stdout.setEncoding("utf8");

    child.stdout.on("data", chunk => {
        stdout += chunk;
    });

    child.stdin.write("position startpos moves e2e4 e7e5\n");
    child.stdin.write("go movetime 100\n");
    child.stdin.write("quit\n");
    child.stdin.end();

    await new Promise((resolve, reject) => {

        child.on("error", reject);
        child.on("close", resolve);

    });

    const lines =
        stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

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

test("UCI process tiny movetime still returns protocol-safe bestmove", async () => {

    const child = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";

    child.stdout.setEncoding("utf8");

    child.stdout.on("data", chunk => {
        stdout += chunk;
    });

    child.stdin.write("position startpos\n");
    child.stdin.write("go movetime 1\n");
    child.stdin.write("quit\n");
    child.stdin.end();

    await new Promise((resolve, reject) => {

        child.on("error", reject);
        child.on("close", resolve);

    });

    const lines =
        stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

    const bestMoveLine =
        lines.find(line => line.startsWith("bestmove "));

    assert.ok(bestMoveLine);

    const bestMove =
        bestMoveLine.slice("bestmove ".length);

    const engine =
        createEngineCore();

    assert.ok(
        bestMove === "0000" ||
        legalUciMoves(engine).has(bestMove),
        `Expected legal bestmove or 0000, got ${bestMove}`
    );

});

test("time allocation uses the correct side clock and increment", () => {

    const whiteBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 1000,
            winc: 2000,
            binc: 0
        });

    const blackBudget =
        allocateMoveTime({
            sideToMove: -1,
            wtime: 300000,
            btime: 1000,
            winc: 2000,
            binc: 0
        });

    assert.equal(whiteBudget, 11495);
    assert.equal(blackBudget, 30);

});

test("time allocation is capped and stays safe in low time", () => {

    const cappedBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 1000,
            btime: 1000,
            winc: 5000,
            binc: 5000
        });

    const lowTimeBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 60,
            btime: 60,
            winc: 0,
            binc: 0
        });

    const severeLowTimeBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300,
            btime: 300,
            winc: 0,
            binc: 0
        });

    assert.equal(cappedBudget, 90);
    assert.equal(lowTimeBudget, 1);
    assert.equal(severeLowTimeBudget, 10);

});

test("time allocation returns sensible budgets for common time controls", () => {

    assert.equal(
        allocateMoveTime({
            sideToMove: 1,
            wtime: 60000,
            btime: 60000,
            winc: 0,
            binc: 0
        }),
        1995
    );

    assert.equal(
        allocateMoveTime({
            sideToMove: 1,
            wtime: 60000,
            btime: 60000,
            winc: 1000,
            binc: 1000
        }),
        2745
    );

    assert.equal(
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0
        }),
        9995
    );

    assert.equal(
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000
        }),
        11495
    );

    assert.equal(
        allocateMoveTime({
            sideToMove: 1,
            wtime: 900000,
            btime: 900000,
            winc: 5000,
            binc: 5000
        }),
        33745
    );

});

test("time allocation with higher move overhead reduces the clock budget", () => {

    const defaultBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 60000,
            btime: 60000,
            winc: 0,
            binc: 0
        });

    const overheadBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 60000,
            btime: 60000,
            winc: 0,
            binc: 0,
            moveOverheadMs: 250
        });

    assert.ok(overheadBudget <= defaultBudget);
    assert.equal(overheadBudget, 1988);

});

test("movestogo changes the clock allocation when valid", () => {

    const moves10Budget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: 10
        });

    const moves40Budget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: 40
        });

    assert.equal(moves10Budget, 29985);
    assert.equal(moves40Budget, 8996);
    assert.ok(moves10Budget > moves40Budget);

});

test("missing or invalid movestogo falls back to the /30 default", () => {

    const defaultBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000
        });

    const zeroBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: 0
        });

    const negativeBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: -5
        });

    const nullBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: null
        });

    assert.equal(defaultBudget, 11495);
    assert.equal(zeroBudget, defaultBudget);
    assert.equal(negativeBudget, defaultBudget);
    assert.equal(nullBudget, defaultBudget);

});

test("movestogo is clamped to a safe maximum", () => {

    const maxClampedBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: 999
        });

    const explicit100Budget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 2000,
            binc: 2000,
            movestogo: 100
        });

    assert.equal(maxClampedBudget, explicit100Budget);
    assert.equal(explicit100Budget, 4498);

});

test("UCI process clock-based search returns a legal bestmove", async () => {

    const child = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";

    child.stdout.setEncoding("utf8");

    child.stdout.on("data", chunk => {
        stdout += chunk;
    });

    child.stdin.write("position startpos\n");
    child.stdin.write("go wtime 1000 btime 1000 winc 0 binc 0\n");
    child.stdin.write("quit\n");
    child.stdin.end();

    await new Promise((resolve, reject) => {

        child.on("error", reject);
        child.on("close", resolve);

    });

    const lines =
        stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

    const bestMoveLine =
        lines.find(line => line.startsWith("bestmove "));

    assert.ok(bestMoveLine);

    const bestMove =
        bestMoveLine.slice("bestmove ".length);

    const engine =
        createEngineCore();

    assert.ok(
        legalUciMoves(engine).has(bestMove),
        `Expected legal bestmove, got ${bestMove}`
    );

});

test("UCI process increment-based clock search returns a legal bestmove", async () => {

    const child = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";

    child.stdout.setEncoding("utf8");

    child.stdout.on("data", chunk => {
        stdout += chunk;
    });

    child.stdin.write("position startpos moves e2e4 e7e5\n");
    child.stdin.write("go wtime 300000 btime 300000 winc 2000 binc 2000\n");
    child.stdin.write("quit\n");
    child.stdin.end();

    await new Promise((resolve, reject) => {

        child.on("error", reject);
        child.on("close", resolve);

    });

    const lines =
        stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

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

test("unsupported go forms remain UCI-safe", () => {

    const session =
        new UciSession();

    const responses =
        session.handleCommand(
            "go nodes 1000"
        );

    assert.deepEqual(
        responses,
        [
            "info string This go variant is not supported in the current UCI mode",
            "bestmove 0000"
        ]
    );

});

test("go infinite remains protocol-safe and does not start an endless search", () => {

    const session =
        new UciSession();

    const responses =
        session.handleCommand(
            "go infinite"
        );

    assert.deepEqual(
        responses,
        [
            "info string Infinite search is not supported in the current synchronous UCI mode",
            "bestmove 0000"
        ]
    );

});

test("stop is harmless when no search is running", () => {

    const session =
        new UciSession();

    assert.deepEqual(
        session.handleCommand("stop"),
        []
    );

});

test("setoption does not crash even if ignored", () => {

    const session =
        new UciSession();

    assert.deepEqual(
        session.handleCommand(
            "setoption name Unknown Option value 64"
        ),
        []
    );

});

test("setoption Hash updates internal TT size safely", () => {

    const session =
        new UciSession();

    assert.equal(
        session.hashSizeMB,
        32
    );

    session.handleCommand(
        "setoption name Hash value 64"
    );

    assert.equal(
        session.hashSizeMB,
        64
    );

    assert.equal(
        session.engine.search.tt.sizeMB,
        64
    );

});

test("setoption Hash clamps low, high, and non-numeric values safely", () => {

    const session =
        new UciSession();

    session.handleCommand(
        "setoption name Hash value 0"
    );

    assert.equal(
        session.hashSizeMB,
        1
    );

    session.handleCommand(
        "setoption name Hash value 9999"
    );

    assert.equal(
        session.hashSizeMB,
        512
    );

    session.handleCommand(
        "setoption name Hash value nope"
    );

    assert.equal(
        session.hashSizeMB,
        32
    );

});

test("setoption Move Overhead updates internal session state", () => {

    const session =
        new UciSession();

    assert.equal(
        session.moveOverheadMs,
        50
    );

    session.handleCommand(
        "setoption name Move Overhead value 250"
    );

    assert.equal(
        session.moveOverheadMs,
        250
    );

});

test("setoption Move Overhead clamps low, high, and non-numeric values safely", () => {

    const session =
        new UciSession();

    session.handleCommand(
        "setoption name Move Overhead value -25"
    );

    assert.equal(
        session.moveOverheadMs,
        0
    );

    session.handleCommand(
        "setoption name Move Overhead value 9999"
    );

    assert.equal(
        session.moveOverheadMs,
        1000
    );

    session.handleCommand(
        "setoption name Move Overhead value nope"
    );

    assert.equal(
        session.moveOverheadMs,
        1000
    );

});

test("Move Overhead does not affect go movetime", () => {

    const originalNow =
        performance.now;

    try {

        performance.now = () => 5000;

        const session =
            new UciSession();

        const move =
            session.engine.legalMoveGenerator
                .generateMoves()[0];

        let lastDeadlineMs = null;

        session.engine.search.bestMove =
            (_depth, options = {}) => {

                lastDeadlineMs =
                    options.deadlineMs;

                session.engine.search.lastSearchScore = 0;

                return {
                    move,
                    pv: [move],
                    depth: 1,
                    nodes: 1
                };

            };

        session.handleCommand(
            "setoption name Move Overhead value 250"
        );

        session.handleCommand(
            "go movetime 100"
        );

        assert.equal(lastDeadlineMs, 5095);

    }

    finally {

        performance.now = originalNow;

    }

});

test("movestogo does not affect go movetime", () => {

    const originalNow =
        performance.now;

    try {

        performance.now = () => 7000;

        const session =
            new UciSession();

        const move =
            session.engine.legalMoveGenerator
                .generateMoves()[0];

        let lastDeadlineMs = null;

        session.engine.search.bestMove =
            (_depth, options = {}) => {

                lastDeadlineMs =
                    options.deadlineMs;

                session.engine.search.lastSearchScore = 0;

                return {
                    move,
                    pv: [move],
                    depth: 1,
                    nodes: 1
                };

            };

        session.handleCommand(
            "go movetime 100 movestogo 5"
        );

        assert.equal(lastDeadlineMs, 7095);

    }

    finally {

        performance.now = originalNow;

    }

});

test("setoption Clear Hash clears TT safely", () => {

    const session =
        new UciSession();

    session.engine.search.tt.store(
        1n,
        1,
        0,
        0,
        null
    );

    assert.equal(
        session.engine.search.tt.stores,
        1
    );

    session.handleCommand(
        "setoption name Clear Hash"
    );

    assert.equal(
        session.engine.search.tt.stores,
        0
    );

    assert.equal(
        session.engine.search.tt.hits,
        0
    );

    assert.equal(
        session.engine.search.tt.probes,
        0
    );

});

test("debug on and debug off do not crash", () => {

    const session =
        new UciSession();

    assert.deepEqual(
        session.handleCommand("debug on"),
        []
    );

    assert.equal(
        session.debugEnabled,
        true
    );

    assert.deepEqual(
        session.handleCommand("debug off"),
        []
    );

    assert.equal(
        session.debugEnabled,
        false
    );

});

test("register and ponderhit do not crash", () => {

    const session =
        new UciSession();

    assert.deepEqual(
        session.handleCommand("register later"),
        []
    );

    assert.deepEqual(
        session.handleCommand("ponderhit"),
        []
    );

});

//----------------------------------
// Mate-score UCI reporting (formatUciScore in
// js/uci/uciengine.js): forced mates must be sent as
// "score mate N" (N = full moves, signed), never as a raw
// mate-class centipawn value, and ordinary positions must
// still report plain "score cp N".
//----------------------------------

test("forced mate for the side to move reports positive score mate N", () => {

    const session =
        new UciSession();

    // Bare black king cornered on h8; White king g6 covers
    // g7/h7, White rook a1 delivers Ra8# next move.
    session.handleCommand(
        "position fen 7k/8/6K1/8/8/8/8/R7 w - - 0 1"
    );

    const lines =
        session.handleCommand("go depth 4");

    const infoLine =
        lines.find(line => line.startsWith("info "));

    assert.ok(infoLine, "expected an info line");
    assert.match(infoLine, /score mate 1(?=\s|$)/);
    assert.doesNotMatch(infoLine, /score cp(?=\s|$)/);

    assert.equal(lines[lines.length - 1], "bestmove a1a8");

});

test("forced mate against the side to move reports negative score mate N", () => {

    const session =
        new UciSession();

    // Same corner-mate net, but Black to move: Black's only
    // legal move is ...Kg8, after which Ra8# is forced --
    // mate in 1 for White is "mated in 1" from Black's (the
    // side-to-move-at-the-root) point of view.
    session.handleCommand(
        "position fen 7k/8/6K1/8/8/8/8/R7 b - - 0 1"
    );

    const lines =
        session.handleCommand("go depth 4");

    const infoLine =
        lines.find(line => line.startsWith("info "));

    assert.ok(infoLine, "expected an info line");
    assert.match(infoLine, /score mate -1(?=\s|$)/);
    assert.doesNotMatch(infoLine, /score cp(?=\s|$)/);

    assert.equal(lines[lines.length - 1], "bestmove h8g8");

});

test("a normal winning position still reports score cp N, not mate", () => {

    const session =
        new UciSession();

    session.handleCommand(
        "position startpos moves e2e4 e7e5"
    );

    const lines =
        session.handleCommand("go depth 5");

    const infoLine =
        lines.find(line => line.startsWith("info "));

    assert.ok(infoLine, "expected an info line");
    assert.match(infoLine, /score cp -?\d+(?=\s|$)/);
    assert.doesNotMatch(infoLine, /score mate(?=\s|$)/);

});
