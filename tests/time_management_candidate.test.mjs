//======================================================
// time_management_candidate.test.mjs
// EXPERIMENTAL, isolated time-management candidate test
// (candidate/time-management). Verifies the moves-to-go floor
// (MIN_MOVES_TO_GO_FLOOR, js/uci/uciengine.js) and the low-clock
// reserve (lowClockReserve()) added to allocateMoveTime(), and
// confirms every other "go" variant (explicit movestogo, movetime,
// fixed depth, forced-move, timeout-preserves-completed-depth)
// remains unchanged from production behavior.
//======================================================

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import {
    allocateMoveTime,
    estimateMovesToGo,
    createEngineCore,
    applyUciMove,
    moveToUci,
    UciSession
} from "../js/uci/uciengine.js";

const STARTING_MATERIAL_TOTAL = 2 * (8 * 100 + 2 * 300 + 2 * 310 + 2 * 500 + 900);
const ENDGAME_MATERIAL = 600;

function legalUciMoves(engine) {
    return new Set(
        engine.legalMoveGenerator.generateMoves().map(moveToUci)
    );
}

function spawnUci(commands) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["uci.js"], {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });

        for (const command of commands) {
            child.stdin.write(command + "\n");
        }
        child.stdin.end();

        child.on("error", reject);
        child.on("close", exitCode => {
            resolve({
                exitCode,
                stderr,
                lines: stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            });
        });
    });
}

//----------------------------------
// 1. Explicit movestogo remains authoritative (unaffected by the
// no-movestogo floor, which only applies when movestogo is absent).
//----------------------------------
test("explicit movestogo remains authoritative and is unaffected by the moves-to-go floor", () => {

    const withMovestogo10 =
        allocateMoveTime({
            sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0,
            movestogo: 10, totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 40
        });

    const withMovestogo10Again =
        allocateMoveTime({
            sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0,
            movestogo: 10, totalMaterial: STARTING_MATERIAL_TOTAL, fullMoveNumber: 1
        });

    // movestogo=10 should produce IDENTICAL allocation regardless of
    // material/fullMoveNumber -- the floor must never override an
    // explicit GUI-supplied movestogo.
    assert.equal(withMovestogo10, withMovestogo10Again);

    // And it should differ from the no-movestogo endgame allocation
    // (movesToGo=10 divides usableTime by a smaller number than the
    // floored 24, so it should be a LARGER per-move budget).
    const withoutMovestogoEndgame =
        allocateMoveTime({
            sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 40
        });

    assert.ok(withMovestogo10 > withoutMovestogoEndgame);

});

//----------------------------------
// 2. No-movestogo 5+0 allocation: opening/middlegame unaffected by
// the floor (already >= 24).
//----------------------------------
test("no-movestogo 5+0 opening allocation is unchanged by the moves-to-go floor", () => {

    assert.equal(estimateMovesToGo({ totalMaterial: STARTING_MATERIAL_TOTAL, fullMoveNumber: 1 }), 30);
    assert.equal(estimateMovesToGo({ totalMaterial: STARTING_MATERIAL_TOTAL * 0.65, fullMoveNumber: 15 }), 24);

});

//----------------------------------
// 3. No-movestogo long-endgame allocation: this is the core fix --
// the floor must raise the effective movesToGo from the old 15/19
// endgame/lateMiddlegame constants up to 24.
//----------------------------------
test("no-movestogo long-endgame allocation is floored at 24, not the old 15", () => {

    assert.equal(estimateMovesToGo({ totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 60 }), 24);

    const lateMiddlegameMaterial = STARTING_MATERIAL_TOTAL * 0.40;
    assert.equal(estimateMovesToGo({ totalMaterial: lateMiddlegameMaterial, fullMoveNumber: 30 }), 24);

    const endgameBudget =
        allocateMoveTime({
            sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 60
        });

    // With movesToGo raised from 15 to 24, the endgame per-move
    // budget must be smaller than what the old formula would have
    // produced (usableTime/15), i.e. no more than 15/24 of it.
    const usableApprox = 300000 - 150;
    const oldStyleBudgetUpperBound = Math.floor((usableApprox / 15) * 1.6);
    assert.ok(endgameBudget < oldStyleBudgetUpperBound);

});

//----------------------------------
// 4. Increment handling: increment still contributes 0.75x per move,
// unaffected by the floor or the low-clock reserve's arithmetic
// (both operate on remainingTime, not increment).
//----------------------------------
test("increment still contributes to the budget the same way", () => {

    const noIncrement =
        allocateMoveTime({ sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0 });

    const withIncrement =
        allocateMoveTime({ sideToMove: 1, wtime: 300000, btime: 300000, winc: 2000, binc: 0 });

    assert.ok(withIncrement > noIncrement);

});

//----------------------------------
// 5. White/Black symmetry: swapping wtime/btime and sideToMove must
// produce the identical budget.
//----------------------------------
test("White and Black receive symmetric allocations for symmetric clocks", () => {

    const whiteBudget =
        allocateMoveTime({
            sideToMove: 1, wtime: 45000, btime: 90000, winc: 1000, binc: 500,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 50
        });

    const blackBudget =
        allocateMoveTime({
            sideToMove: -1, wtime: 90000, btime: 45000, winc: 500, binc: 1000,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 50
        });

    assert.equal(whiteBudget, blackBudget);

});

//----------------------------------
// 6. Move overhead applied once (not doubled by the new reserve
// tiers, which are additive to safetyBuffer+overhead, not
// multiplicative).
//----------------------------------
test("move overhead is applied exactly once, including under the low-clock reserve", () => {

    const overhead50 =
        allocateMoveTime({ sideToMove: 1, wtime: 3000, btime: 3000, winc: 0, binc: 0, moveOverheadMs: 50 });

    const overhead200 =
        allocateMoveTime({ sideToMove: 1, wtime: 3000, btime: 3000, winc: 0, binc: 0, moveOverheadMs: 200 });

    // A larger overhead can only ever reduce (or leave equal, once
    // clamped) the resulting budget -- never increase it, and the
    // difference should be bounded by the overhead delta (150ms),
    // not some multiple of it (which would indicate double-counting).
    assert.ok(overhead200 <= overhead50);
    assert.ok(overhead50 - overhead200 <= 150);

});

//----------------------------------
// 7. Minimum and maximum budget clamps still hold under the new
// reserve.
//----------------------------------
test("minimum and maximum budget clamps still hold with the low-clock reserve active", () => {

    const budget =
        allocateMoveTime({
            sideToMove: 1, wtime: 4000, btime: 4000, winc: 0, binc: 0,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 60,
            legalMoveCount: 40, captureCount: 8, inCheck: true
        });

    assert.ok(budget >= 1);
    // maxPercentage caps at 20% of usableTime; usableTime <= remainingTime.
    assert.ok(budget <= Math.floor(4000 * 0.20) + 1);

});

//----------------------------------
// 8. Very low clock never throws and never returns a nonsensical
// value.
//----------------------------------
test("very low clock produces a small but valid positive budget", () => {

    for (const wtime of [1, 5, 10, 50, 100]) {
        const budget =
            allocateMoveTime({ sideToMove: 1, wtime, btime: wtime, winc: 0, binc: 0 });
        assert.ok(budget >= 1, `expected positive budget for wtime=${wtime}, got ${budget}`);
        assert.ok(Number.isFinite(budget));
    }

});

//----------------------------------
// 9. No negative or zero budget unless remainingTime <= 0 itself
// (which returns 1, not 0 or negative).
//----------------------------------
test("budget is never zero or negative, including when remainingTime is zero or negative", () => {

    assert.equal(allocateMoveTime({ sideToMove: 1, wtime: 0, btime: 0, winc: 0, binc: 0 }), 1);
    assert.equal(allocateMoveTime({ sideToMove: 1, wtime: -500, btime: -500, winc: 0, binc: 0 }), 1);

    for (const wtime of [1, 100, 1000, 5000, 15000, 60000, 300000]) {
        const budget = allocateMoveTime({ sideToMove: 1, wtime, btime: wtime, winc: 0, binc: 0 });
        assert.ok(budget > 0, `budget must be positive for wtime=${wtime}`);
    }

});

//----------------------------------
// 10. go movetime is completely unaffected (allocateMoveTime is
// never called on that path).
//----------------------------------
test("go movetime allocation path is unchanged", async () => {

    const { exitCode, stderr, lines } =
        await spawnUci([
            "uci", "isready",
            "position startpos",
            "go movetime 300",
            "quit"
        ]);

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const bestMoveLine = lines.find(l => l.startsWith("bestmove "));
    assert.ok(bestMoveLine);

    const bestMove = bestMoveLine.slice("bestmove ".length);
    const engine = createEngineCore();
    assert.ok(legalUciMoves(engine).has(bestMove));

});

//----------------------------------
// 11. go depth N (fixed depth) is completely unaffected.
//----------------------------------
test("go depth N allocation path is unchanged", async () => {

    const { exitCode, stderr, lines } =
        await spawnUci([
            "uci", "isready",
            "position startpos",
            "go depth 3",
            "quit"
        ]);

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const infoLine = lines.find(l => l.startsWith("info depth 3 "));
    assert.ok(infoLine, "expected a completed depth-3 info line");

    const bestMoveLine = lines.find(l => l.startsWith("bestmove "));
    assert.ok(bestMoveLine);

});

//----------------------------------
// 12. Forced-move behavior unchanged: exactly one legal move at the
// root under clock-based go must still return that move immediately
// without a full deadline-bounded search.
//----------------------------------
test("forced-move shortcut is unchanged: single legal move returns immediately", async () => {

    // Black to move, exactly one legal move (verified programmatically:
    // h7 and g7 are covered by the white queen/king, only Kg8 escapes).
    const { exitCode, stderr, lines } =
        await spawnUci([
            "uci", "isready",
            "position fen 7k/8/6K1/8/8/8/8/7Q b - - 0 1",
            "go wtime 300000 btime 300000",
            "quit"
        ]);

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const bestMoveLine = lines.find(l => l.startsWith("bestmove "));
    assert.ok(bestMoveLine);
    assert.equal(bestMoveLine, "bestmove h8g8");

});

//----------------------------------
// 13. Timeout preserves the last completed depth: an extremely tight
// clock-based search must still return a legal move and a
// completed, non-negative depth (search.js's iterative-deepening
// loop is untouched by this candidate; this is a regression guard).
//----------------------------------
test("an extremely tight clock still returns a legal bestmove with a valid completed depth", async () => {

    // 150ms reliably completes depth >= 1 for this position (verified
    // directly: production and candidate both reach depth 2). A
    // deadline tight enough to expire before depth 1 even starts
    // (e.g. a handful of ms) is a separate, pre-existing edge case --
    // confirmed identical between production and this candidate --
    // where searchRoot's own fallback-move path reports depth 0; that
    // is not what "timeout preserves the last completed depth" is
    // about, so this test targets a deadline that actually exercises
    // depth preservation.
    const { exitCode, stderr, lines } =
        await spawnUci([
            "uci", "isready",
            "position startpos moves e2e4 e7e5 g1f3 b8c6",
            "go wtime 150 btime 150 winc 0 binc 0",
            "quit"
        ]);

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const infoLine = lines.find(l => l.startsWith("info depth "));
    assert.ok(infoLine, "expected an info line even under a tight deadline");

    const depthMatch = infoLine.match(/^info depth (\d+) /);
    assert.ok(depthMatch);
    assert.ok(Number.parseInt(depthMatch[1], 10) >= 1);

    const bestMoveLine = lines.find(l => l.startsWith("bestmove "));
    assert.ok(bestMoveLine);
    assert.notEqual(bestMoveLine, "bestmove 0000");

    const engine = createEngineCore();
    applyUciMove(engine, "e2e4");
    applyUciMove(engine, "e7e5");
    applyUciMove(engine, "g1f3");
    applyUciMove(engine, "b8c6");

    const bestMove = bestMoveLine.slice("bestmove ".length);
    assert.ok(legalUciMoves(engine).has(bestMove));

});

//----------------------------------
// 14. Clock-based root plateau early stop: repeated slow early-core
// evidence showed broad same-score root plateaus burning seconds
// without differentiating moves. The opt-in stop is deadline-only,
// so fixed-depth and fixed-movetime probes remain unchanged.
//----------------------------------
test("root plateau early stop is opt-in and deadline-only", () => {

    const plateauFen =
        "r1b1k2r/1pp1qppp/p1p5/8/4n3/2PN4/PPP1QPPP/R1B2RK1 b kq - 3 11";

    const withoutDeadline =
        createEngineCore(plateauFen)
            .search
            .bestMove(
                8,
                {
                    quiet: true,
                    rootPlateauEarlyStop: true
                }
            );

    assert.equal(withoutDeadline.depth, 8);

    const withDeadline =
        createEngineCore(plateauFen)
            .search
            .bestMove(
                8,
                {
                    quiet: true,
                    deadlineMs: performance.now() + 30000,
                    rootPlateauEarlyStop: true
                }
            );

    assert.equal(withDeadline.depth, 7);
    assert.equal(withDeadline.uci, "c8f5");

});

//----------------------------------
// Functional: requested vs actual elapsed time for a realistic
// clock-based go, confirming the candidate's allocation is honored
// by the real search (not just the pure allocateMoveTime formula).
//----------------------------------
test("UCI functional: clock-based go returns within a reasonable multiple of its allocated budget", async () => {

    const budgetMs =
        allocateMoveTime({
            sideToMove: 1, wtime: 300000, btime: 300000, winc: 0, binc: 0,
            totalMaterial: ENDGAME_MATERIAL, fullMoveNumber: 60
        });

    const start = Date.now();

    const { exitCode, stderr, lines } =
        await spawnUci([
            "uci", "isready",
            "position fen 8/5k2/8/4P3/8/8/5K2/8 w - - 0 1",
            "go wtime 300000 btime 300000",
            "quit"
        ]);

    const elapsedMs = Date.now() - start;

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");

    const bestMoveLine = lines.find(l => l.startsWith("bestmove "));
    assert.ok(bestMoveLine);
    assert.notEqual(bestMoveLine, "bestmove 0000");

    // Generous upper bound: process startup + search should not run
    // wildly past its allocated deadline. This guards against a
    // regression where the low-clock reserve or floor accidentally
    // produces an oversized budget.
    assert.ok(
        elapsedMs < budgetMs + 5000,
        `expected elapsed (${elapsedMs}ms) to stay near allocated budget (${budgetMs}ms)`
    );

});
