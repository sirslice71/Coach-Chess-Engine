import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("plateau audit keeps reference child-search improvements", async () => {

    const tmp =
        await mkdtemp(join(tmpdir(), "coach-plateau-audit-test-"));

    try {

        const analysisPath =
            join(tmp, "analysis.json");
        const plateauPath =
            join(tmp, "plateau.json");

        await writeFile(
            analysisPath,
            JSON.stringify({
                positions: [
                    {
                        label: "sentinel",
                        fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
                        coach: {
                            bestMove: "a1a2"
                        },
                        reference: {
                            bestMove: "a1b1"
                        },
                        comparison: {
                            bestMoveAgree: false,
                            evalDiffCp: 275
                        }
                    }
                ]
            })
        );

        await writeFile(
            plateauPath,
            JSON.stringify({
                results: [
                    {
                        label: "sentinel",
                        fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
                        depth: 7,
                        best: "a1a2",
                        rootBand: 0,
                        childRootSideBand: 180,
                        topTies: 4,
                        boundLikeTopTies: 2,
                        mateRows: 0,
                        rows: [
                            {
                                move: "a1a2",
                                childRootSideScore: 10
                            },
                            {
                                move: "a1b1",
                                childRootSideScore: 170
                            }
                        ]
                    }
                ]
            })
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/rank-plateau-audit.mjs",
                "--analysis",
                analysisPath,
                "--plateau",
                plateauPath,
                "--out",
                tmp,
                "--min-child-gap",
                "100"
            ],
            {
                cwd: resolve(".")
            }
        );

        const audit =
            JSON.parse(
                await readFile(
                    join(tmp, "plateau-candidate-audit.json"),
                    "utf8"
                )
            );

        assert.equal(audit.summary.audited, 1);
        assert.equal(audit.summary.candidates, 1);
        assert.equal(audit.rows[0].keep, true);
        assert.equal(audit.rows[0].childGapCp, 160);

    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }

});
