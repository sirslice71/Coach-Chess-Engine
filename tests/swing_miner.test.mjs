import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("mate-score swings populate fallback target FENs", async () => {

    const outDir =
        await mkdtemp(join(tmpdir(), "coach-swing-miner-test-"));

    try {
        await execFileAsync(
            process.execPath,
            [
                "tools/mine-coach-pgn-swings.mjs",
                "--pgn",
                "tests/data/swing_miner_mate_change.pgn",
                "--out",
                outDir,
                "--player",
                "Coach",
                "--top",
                "5",
                "--drop-cp",
                "300"
            ],
            {
                cwd: resolve(".")
            }
        );

        const summary =
            JSON.parse(
                await readFile(join(outDir, "swing-report.json"), "utf8")
            );
        const fenTargets =
            await readFile(join(outDir, "coach-swing-targets.fens"), "utf8");

        assert.equal(summary.topCentipawnDrops.length, 0);
        assert.equal(summary.topLosingMateEntries.length, 0);
        assert.equal(summary.topMateScoreChanges.length, 1);
        assert.equal(summary.selectedFenRecords.length, 1);
        assert.match(fenTargets, /-before \| /);
        assert.match(fenTargets, /-after \| /);
    }
    finally {
        await rm(outDir, { recursive: true, force: true });
    }

});
