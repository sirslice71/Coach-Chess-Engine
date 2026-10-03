import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Coach time/depth summary parses CuteChess depth and move-time comments", async () => {

    const tmp =
        await mkdtemp(join(tmpdir(), "coach-time-depth-test-"));

    try {

        const pgn =
            join(tmp, "match.pgn");

        await writeFile(
            pgn,
            [
                '[Event "time depth fixture"]',
                '[Site "?"]',
                '[Date "2026.09.26"]',
                '[Round "1"]',
                '[White "Coach"]',
                '[Black "ShallowBlue 1618"]',
                '[Result "*"]',
                '[TimeControl "5"]',
                "",
                "1. e4 {+0.20/7 3.2s} e5 {-0.12/8 4.1s} 2. Nf3 {+0.31/4 0.42s} *",
                ""
            ].join("\n")
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/summarize-coach-pgn-time.mjs",
                "--pgn",
                pgn,
                "--out",
                tmp,
                "--player",
                "Coach"
            ],
            {
                cwd: resolve(".")
            }
        );

        const summary =
            JSON.parse(
                await readFile(
                    join(tmp, "coach-time-depth-summary.json"),
                    "utf8"
                )
            );

        assert.equal(summary.games, 1);
        assert.equal(summary.gamesMined, 1);
        assert.equal(summary.moveCount, 2);
        assert.equal(summary.averageDepth, 5.5);
        assert.equal(summary.minimumDepth, 4);
        assert.equal(summary.averageTimeSeconds, 1.81);
        assert.equal(summary.minimumEstimatedClockRemainingSeconds, 1.38);
        assert.equal(summary.phaseSummaries.length, 6);
        assert.equal(summary.phaseSummaries[0].phase, "opening-1-10");
        assert.equal(summary.phaseSummaries[0].moveCount, 2);
        assert.equal(summary.phaseSummaries[0].totalTimeSeconds, 3.62);
        assert.equal(summary.phaseSummaries[0].shallowMoveCount, 1);
        assert.equal(summary.phaseSummaries[0].slowMoveCount, 0);
        assert.equal(summary.phaseSummaries[0].minimumEstimatedClockRemainingSeconds, 1.38);
        assert.equal(summary.shallowMoves.length, 1);
        assert.equal(summary.shallowMoves[0].san, "Nf3");
        assert.equal(summary.shallowMoves[0].uci, "g1f3");
        assert.match(summary.shallowMoves[0].fenBefore, /^rnbqkbnr\/pppp1ppp/);
        assert.equal(summary.shallowMoves[0].depth, 4);
        assert.equal(summary.shallowMoves[0].estimatedClockRemainingSeconds, 1.38);
        assert.equal(summary.slowMoves[0].san, "e4");
        assert.equal(summary.lowEstimatedClockMoves[0].san, "Nf3");
        assert.equal(summary.lowClockLowDepthMoves.length, 1);

    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }

});
