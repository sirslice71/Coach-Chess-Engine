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

    //----------------------------------
    // Underpromotions: every suffix must parse to a distinct
    // legal move and format back to the same text.
    //----------------------------------

    for (const suffix of ["r", "b", "n"]) {

        const underpromotion =
            uciToMove(
                `a7a8${suffix}`,
                promotionEngine
                    .legalMoveGenerator
                    .generateMoves()
            );

        assert.ok(
            underpromotion,
            `a7a8${suffix} should be a legal move`
        );

        assert.equal(
            moveToUci(underpromotion),
            `a7a8${suffix}`
        );

        assert.notEqual(
            underpromotion.promotedPiece,
            promotionMove.promotedPiece
        );

    }

});

test("position startpos moves e2e4 e7e5 applies legal moves", () => {

    const engine =
        createEngineCore();

    applyUciMove(engine, "e2e4");
    applyUciMove(engine, "e7e5");

    assert.equal(engine.board.sideToMove, 1);
    assert.equal(engine.board.enPassantSquare, 20);

    //----------------------------------
    // Fullmove number is 2, not 1: board.js's makeMove() now
    // correctly advances fullMoveNumber forward (standard FEN
    // semantics increment it only once Black's move completes).
    // e2e4 (White) leaves it at 1; e7e5 (Black) advances it to
    // 2. The halfmove clock is 0 either way here since both
    // plies are pawn moves.
    //----------------------------------
    assert.equal(
        FEN.export(engine.board),
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"
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

//----------------------------------
// fullMoveNumber tracking for clock-based time management
// (UciSession.currentFullMoveNumber): at the time this was
// written, board.makeMove() never incremented board.fullMoveNumber
// -- it only saved the old value for undo history -- which is why
// UciSession tracks the real fullmove number independently instead
// of relying on board.fullMoveNumber directly. That gap in
// board.makeMove() has since been fixed (board.js now advances
// fullMoveNumber correctly during play), but this UCI-layer
// tracking is left in place unchanged, since reassessing/removing
// it is a time-management-adjacent change out of scope here. The
// original motivation: a real UCI GUI resends the entire move list
// on every "position" command, and relying on board.fullMoveNumber
// directly risked every fullMoveNumber-gated rule in
// complexityMultiplier() (the opening throttle, the late-opening/
// middlegame reinvestment window) permanently believing every move
// of the game is still move 1 -- exactly the pattern in the Arena
// evidence motivating this recalibration: Coach's time surplus
// over Old Coach only ever grew, never got reinvested.
//----------------------------------

test("fullMoveNumber advances correctly after replaying moves from startpos", () => {

    const session =
        new UciSession();

    // Ruy Lopez Breyer System, 20 plies (10 full moves each
    // side) -- White to move at move 11 afterward.
    session.handleCommand(
        "position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 " +
        "b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 " +
        "c6b8 d2d4 b8d7"
    );

    assert.equal(session.currentFullMoveNumber, 11);

});

test("fullMoveNumber advances correctly after replaying moves from an imported FEN", () => {

    const session =
        new UciSession();

    // Motivating FEN, move 19, White to move. Two plies (Kh1,
    // then a quiet Black reply) should land on move 20.
    session.handleCommand(
        "position fen r4rk1/ppp3pp/4p1q1/4P3/1nP3B1/8/PP3P1P/R2Q1RK1 w - - 1 19 " +
        "moves g1h1 b7b6"
    );

    assert.equal(session.currentFullMoveNumber, 20);

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
        [board.hashKey]
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

    assert.ok(lines.includes("id name Coach Chess Engine 2026.07.07"));
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

//----------------------------------
// Opening throttle (complexityMultiplier / allocateMoveTime):
// quiet early positions should spend less than the same
// position would once fullMoveNumber is past the throttle
// window, and tactical positions should be exempt at every
// fullMoveNumber.
//----------------------------------

test("opening throttle reduces the budget for quiet early positions", () => {

    const quietOpeningParams = {
        sideToMove: 1,
        wtime: 300000,
        btime: 300000,
        winc: 0,
        binc: 0,
        legalMoveCount: 28,
        captureCount: 1,
        inCheck: false
    };

    const strongThrottleBudget =
        allocateMoveTime({ ...quietOpeningParams, fullMoveNumber: 4 });

    const lightThrottleBudget =
        allocateMoveTime({ ...quietOpeningParams, fullMoveNumber: 7 });

    const unthrottledBudget =
        allocateMoveTime({ ...quietOpeningParams, fullMoveNumber: 9 });

    assert.ok(
        strongThrottleBudget < lightThrottleBudget,
        `Expected fullMoveNumber 4 (${strongThrottleBudget}) < fullMoveNumber 7 (${lightThrottleBudget})`
    );

    assert.ok(
        lightThrottleBudget < unthrottledBudget,
        `Expected fullMoveNumber 7 (${lightThrottleBudget}) < fullMoveNumber 9 (${unthrottledBudget})`
    );

    //----------------------------------
    // Recalibrated (Arena 5-minute no-increment evidence): the
    // opening throttle factors were lowered from 0.60/0.80 to
    // 0.30/0.55 -- move 1 alone was taking ~6s, and roughly the
    // first 5 moves were burning ~32s combined, both too much for
    // quiet, no-book openings. See the comment above
    // OPENING_THROTTLE_STRONG_FACTOR in js/uci/uciengine.js.
    //----------------------------------

    assert.equal(strongThrottleBudget, 3298);
    assert.equal(lightThrottleBudget, 6046);

    //----------------------------------
    // fullMoveNumber 9 now also falls inside the late-opening/
    // middlegame tactical-reinvestment window (see
    // lateOpeningMiddlegameBonus() in js/uci/uciengine.js): with
    // many pieces still on the board (default totalMaterial),
    // a moderate/high legal move count (28) and a capture
    // available (1), this position picks up two +0.05 signal
    // bonuses on top of the existing mobility bonus, raising the
    // multiplier from 1.10 to 1.20 and the budget from the prior
    // 10994 to 11994. fullMoveNumber 9 sits just outside the
    // core window (10-28), so it is unaffected by the core-window
    // widening below.
    //----------------------------------

    assert.equal(unthrottledBudget, 11994);

});

test("opening throttle no longer applies once fullMoveNumber is past the throttle window", () => {

    const quietOpeningParams = {
        sideToMove: 1,
        wtime: 300000,
        btime: 300000,
        winc: 0,
        binc: 0,
        legalMoveCount: 28,
        captureCount: 1,
        inCheck: false
    };

    //----------------------------------
    // The late-opening/middlegame "core" window (fullMoveNumber
    // 10-28, see lateOpeningMiddlegameBonus() in
    // js/uci/uciengine.js) now covers nearly the entire 9-28
    // reinvestment window by design, so there is no longer a pair
    // of distinct fullmove numbers both inside the reinvestment
    // window but outside the core window to compare for equality.
    // Instead, this test checks the throttle boundary directly:
    // fullMoveNumber 8 is still throttled (OPENING_THROTTLE_LIGHT_
    // FULLMOVE), fullMoveNumber 9 is not, so the budget should
    // jump upward at that transition.
    //----------------------------------

    const lightThrottleBudget =
        allocateMoveTime({ ...quietOpeningParams, fullMoveNumber: 8 });

    const unthrottledBudget =
        allocateMoveTime({ ...quietOpeningParams, fullMoveNumber: 9 });

    assert.ok(
        unthrottledBudget > lightThrottleBudget,
        `Expected fullMoveNumber 9 (${unthrottledBudget}) > fullMoveNumber 8 (${lightThrottleBudget})`
    );

});

test("move 1 / startpos allocates roughly 2-4 seconds on a 5-minute clock", () => {

    //----------------------------------
    // Arena evidence: move 1 alone was taking ~6s on a 5-minute
    // no-increment clock, which was too much for a quiet,
    // no-book starting position. This pins the recalibrated
    // opening throttle to the requested 2-4s range.
    //----------------------------------

    const moveOneBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 1,
            totalMaterial: 7840,
            legalMoveCount: 20,
            captureCount: 0,
            inCheck: false
        });

    assert.ok(
        moveOneBudget >= 2000 && moveOneBudget <= 4000,
        `Expected move 1's allocation (${moveOneBudget}) to fall in the 2-4s range on a 5-minute clock`
    );

});

test("a quiet opening position with a few pseudo-available captures is still throttled", () => {

    //----------------------------------
    // A perfectly normal quiet developing position (e.g. after
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6) commonly has 3+ pseudo-available
    // pawn/piece captures without being remotely tactical. The
    // old capture-count escape threshold (3) treated that as
    // "tactically urgent" and skipped the throttle entirely,
    // which was a real contributor to the ~32s spent across the
    // first 5 Arena moves. The threshold is now 5, so this
    // captureCount=3 position should still be throttled, while a
    // genuinely capture-rich position (captureCount=6) still
    // escapes it.
    //----------------------------------

    const fewCapturesBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            totalMaterial: 8150,
            legalMoveCount: 31,
            captureCount: 3,
            inCheck: false
        });

    const manyCapturesBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            totalMaterial: 8150,
            legalMoveCount: 31,
            captureCount: 6,
            inCheck: false
        });

    assert.ok(
        fewCapturesBudget < manyCapturesBudget,
        `Expected the throttled few-captures budget (${fewCapturesBudget}) < the escaped many-captures budget (${manyCapturesBudget})`
    );

    assert.ok(
        fewCapturesBudget < 5000,
        `Expected the throttled few-captures budget (${fewCapturesBudget}) to stay well under 5s`
    );

});

//----------------------------------
// Late-opening/middlegame tactical reinvestment
// (lateOpeningMiddlegameBonus / complexityMultiplier): a
// tactically rich position inside the fullMoveNumber 9-28
// window, with many pieces still on the board, should receive
// noticeably more time than an otherwise-identical clock spent
// on a quiet early-opening position -- but a simplified
// endgame that happens to fall inside the same fullmove range
// must not receive the bonus.
//----------------------------------

test("late-opening/middlegame tactical position gets more time than a quiet opening", () => {

    const quietOpeningBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            totalMaterial: 7840,
            legalMoveCount: 20,
            captureCount: 0,
            inCheck: false
        });

    const lateTacticalBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 19,
            totalMaterial: 5610,
            legalMoveCount: 28,
            captureCount: 0,
            inCheck: false
        });

    assert.ok(
        lateTacticalBudget > quietOpeningBudget,
        `Expected the move-19 tactical position (${lateTacticalBudget}) to receive more time than the quiet move-4 opening (${quietOpeningBudget})`
    );

    //----------------------------------
    // The gap needs to be meaningful, not just directionally
    // correct: an earlier version of this feature only widened
    // this gap by ~625ms (14992ms -> 15617ms for the motivating
    // FEN), which wasn't enough to explain why Coach only found
    // Kh1 over h3 once given a much longer fixed movetime. The
    // core-window boost below is meant to close that gap.
    //----------------------------------

    assert.ok(
        lateTacticalBudget - quietOpeningBudget >= 5000,
        `Expected a meaningful (>=5000ms) gap between the tactical and quiet budgets, got ${lateTacticalBudget - quietOpeningBudget}`
    );

});

test("motivating late-opening/middlegame FEN allocates roughly 18-20s on a 5-minute clock", () => {

    //----------------------------------
    // r4rk1/ppp3pp/4p1q1/4P3/1nP3B1/8/PP3P1P/R2Q1RK1 w - - 1 19
    // -- fullMoveNumber, totalMaterial, legalMoveCount,
    // captureCount, and inCheck below are the real values for
    // this exact FEN. Coach only preferred Kh1 over h3 once
    // given a fixed movetime of ~20s (not 5s or 10s), so a
    // 5-minute-clock allocation in that neighborhood is the
    // target this test guards against regressing.
    //----------------------------------

    const motivatingFenBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 19,
            totalMaterial: 5610,
            legalMoveCount: 28,
            captureCount: 0,
            inCheck: false
        });

    assert.ok(
        motivatingFenBudget >= 18000 && motivatingFenBudget <= 20000,
        `Expected the motivating FEN's allocation (${motivatingFenBudget}) to fall in the 18-20s range on a 5-minute clock`
    );

});

test("late-opening/middlegame bonus does not apply to a simplified endgame in the same fullmove range", () => {

    const simplifiedEndgameParams = {
        sideToMove: 1,
        wtime: 300000,
        btime: 300000,
        winc: 0,
        binc: 0,
        fullMoveNumber: 20,
        totalMaterial: 600,
        legalMoveCount: 20,
        captureCount: 1,
        inCheck: false
    };

    const withBonusSignals =
        allocateMoveTime(simplifiedEndgameParams);

    const withoutMobilitySignal =
        allocateMoveTime({
            ...simplifiedEndgameParams,
            legalMoveCount: 10,
            captureCount: 0
        });

    assert.equal(
        withBonusSignals,
        withoutMobilitySignal,
        "Expected no late-opening/middlegame bonus once material has dropped below the middlegame floor, regardless of mobility/capture signals"
    );

});

test("opening throttle is skipped when in check, even in the first few moves", () => {

    const throttledBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 28,
            captureCount: 1,
            inCheck: false
        });

    const inCheckBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 22,
            captureCount: 1,
            inCheck: true
        });

    assert.ok(
        inCheckBudget > throttledBudget,
        `Expected in-check budget (${inCheckBudget}) > throttled quiet budget (${throttledBudget})`
    );

});

test("opening throttle is skipped when legal moves are unusually low", () => {

    const throttledBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 28,
            captureCount: 1,
            inCheck: false
        });

    const fewLegalMovesBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 5,
            captureCount: 0,
            inCheck: false
        });

    assert.ok(
        fewLegalMovesBudget > throttledBudget,
        `Expected few-legal-moves budget (${fewLegalMovesBudget}) > throttled quiet budget (${throttledBudget})`
    );

});

test("opening throttle is skipped when the capture count is high", () => {

    const throttledBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 28,
            captureCount: 1,
            inCheck: false
        });

    const highCaptureBudget =
        allocateMoveTime({
            sideToMove: 1,
            wtime: 300000,
            btime: 300000,
            winc: 0,
            binc: 0,
            fullMoveNumber: 4,
            legalMoveCount: 25,
            captureCount: 6,
            inCheck: false
        });

    assert.ok(
        highCaptureBudget > throttledBudget,
        `Expected high-capture budget (${highCaptureBudget}) > throttled quiet budget (${throttledBudget})`
    );

});

test("opening throttle does not affect go depth or go movetime", async () => {

    const depthChild = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let depthStdout = "";

    depthChild.stdout.setEncoding("utf8");
    depthChild.stdout.on("data", chunk => {
        depthStdout += chunk;
    });

    depthChild.stdin.write("position startpos\n");
    depthChild.stdin.write("go depth 3\n");
    depthChild.stdin.write("quit\n");
    depthChild.stdin.end();

    await new Promise((resolve, reject) => {
        depthChild.on("error", reject);
        depthChild.on("close", resolve);
    });

    const depthInfoLine =
        depthStdout
            .split(/\r?\n/)
            .find(line => line.startsWith("info depth 3 "));

    assert.ok(depthInfoLine, "expected a depth-3 info line, unaffected by the opening throttle");

    const movetimeChild = spawn(
        process.execPath,
        ["uci.js"],
        {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let movetimeStdout = "";

    movetimeChild.stdout.setEncoding("utf8");
    movetimeChild.stdout.on("data", chunk => {
        movetimeStdout += chunk;
    });

    movetimeChild.stdin.write("position startpos\n");
    movetimeChild.stdin.write("go movetime 200\n");
    movetimeChild.stdin.write("quit\n");
    movetimeChild.stdin.end();

    await new Promise((resolve, reject) => {
        movetimeChild.on("error", reject);
        movetimeChild.on("close", resolve);
    });

    const movetimeBestMoveLine =
        movetimeStdout
            .split(/\r?\n/)
            .find(line => line.startsWith("bestmove "));

    assert.ok(movetimeBestMoveLine, "expected a bestmove line from go movetime, unaffected by the opening throttle");

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
