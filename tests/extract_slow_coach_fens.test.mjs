import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("extract-slow-coach-fens groups slow positions by FEN", async () => {

    const tmp =
        await mkdtemp(join(tmpdir(), "coach-slow-fens-test-"));

    try {

        const summary =
            join(tmp, "coach-time-depth-summary.json");
        const out =
            join(tmp, "out");

        await writeFile(
            summary,
            JSON.stringify({
                slowMovesWithContext: [
                    {
                        game: 1,
                        ply: 20,
                        moveNumber: 10,
                        side: "b",
                        san: "Bf5",
                        uci: "c8f5",
                        phase: "opening-1-10",
                        timeSeconds: 14,
                        depth: 7,
                        fenBefore: "fen one b - - 0 10"
                    },
                    {
                        game: 3,
                        ply: 20,
                        moveNumber: 10,
                        side: "b",
                        san: "Bf5",
                        uci: "c8f5",
                        phase: "opening-1-10",
                        timeSeconds: 16,
                        depth: 8,
                        fenBefore: "fen one b - - 0 10"
                    },
                    {
                        game: 5,
                        ply: 80,
                        moveNumber: 40,
                        side: "b",
                        san: "Kb7",
                        uci: "c8b7",
                        phase: "late-middlegame-26-40",
                        timeSeconds: 20,
                        depth: 5,
                        fenBefore: "fen two b - - 0 40"
                    }
                ]
            }) + "\n"
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/extract-slow-coach-fens.mjs",
                "--summary",
                summary,
                "--out",
                out
            ],
            { cwd: resolve(".") }
        );

        const extracted =
            JSON.parse(
                await readFile(
                    join(out, "slow-coach-positions.json"),
                    "utf8"
                )
            );

        assert.equal(extracted.rows.length, 1);
        assert.equal(extracted.rows[0].count, 2);
        assert.equal(extracted.rows[0].totalTimeSeconds, 30);
        assert.equal(extracted.rows[0].moveCounts.c8f5, 2);

    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }

});
