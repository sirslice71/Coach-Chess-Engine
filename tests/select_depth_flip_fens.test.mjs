import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STARTPOS =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("depth-flip selector filters and orders low-depth late moves", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-depth-flip-selector-test-"));

    try {
        const summaryPath =
            join(tmp, "coach-time-depth-summary.json");
        const outDir =
            join(tmp, "out");

        await writeFile(
            summaryPath,
            JSON.stringify({
                moves: [
                    {
                        game: 1,
                        ply: 20,
                        moveNumber: 10,
                        phase: "opening-1-10",
                        san: "d4",
                        uci: "d2d4",
                        depth: 4,
                        score: "+0.10",
                        timeSeconds: 1,
                        estimatedClockBeforeSeconds: 200,
                        fenBefore: STARTPOS
                    },
                    {
                        game: 2,
                        ply: 100,
                        moveNumber: 50,
                        phase: "endgame-41-60",
                        san: "Nf3",
                        uci: "g1f3",
                        depth: 6,
                        score: "+0.10",
                        timeSeconds: 1,
                        estimatedClockBeforeSeconds: 50,
                        fenBefore: STARTPOS
                    },
                    {
                        game: 3,
                        ply: 120,
                        moveNumber: 60,
                        phase: "late-endgame-61+",
                        san: "e4",
                        uci: "e2e4",
                        depth: 3,
                        score: "+0.10",
                        timeSeconds: 1,
                        estimatedClockBeforeSeconds: 40,
                        fenBefore: STARTPOS
                    },
                    {
                        game: 4,
                        ply: 130,
                        moveNumber: 65,
                        phase: "late-endgame-61+",
                        san: "c4",
                        uci: "c2c4",
                        depth: 9,
                        score: "+0.10",
                        timeSeconds: 1,
                        estimatedClockBeforeSeconds: 30,
                        fenBefore: STARTPOS
                    }
                ]
            }) + "\n"
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/select-depth-flip-fens.mjs",
                "--summary", summaryPath,
                "--out", outDir,
                "--target-depth", "1",
                "--confirm-depth", "1",
                "--max-played-depth", "8",
                "--min-move", "35",
                "--min-gap", "0",
                "--limit", "2",
                "--max-ms-per-search", "1000"
            ],
            { cwd: resolve(".") }
        );

        const payload =
            JSON.parse(
                await readFile(
                    join(outDir, "depth-flip-candidates.json"),
                    "utf8"
                )
            );
        const markdown =
            await readFile(
                join(outDir, "depth-flip-candidates.md"),
                "utf8"
            );

        assert.equal(payload.summary.inputMoves, 4);
        assert.equal(payload.args.confirmDepth, 1);
        assert.equal(payload.summary.audited, 2);
        assert.equal(payload.summary.preliminaryCandidates, 1);
        assert.deepEqual(payload.summary.rejectionCounts, {
            "deeper-agrees-with-played": 1
        });
        assert.equal(payload.rows[0].label, "game3-ply120-e4");
        assert.equal(payload.rows[1].label, "game2-ply100-Nf3");
        assert.match(markdown, /Coach Depth-Flip Selector/);
        assert.match(markdown, /Confirmation depth: 1/);
        assert.match(markdown, /Preliminary candidates: 1/);
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
});
