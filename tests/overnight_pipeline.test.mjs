import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("overnight PowerShell self-test covers PGN, UTF-16 logs, and command construction", () => {

    const result =
        spawnSync(
            "powershell",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                "scripts/run-coach-overnight.ps1",
                "-SelfTest"
            ],
            {
                cwd: new URL("..", import.meta.url),
                encoding: "utf8"
            }
        );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const summary =
        JSON.parse(result.stdout);

    assert.equal(summary.Ok, true);
    assert.equal(summary.PgnGames, 2);
    assert.equal(summary.ScorePercent, 75);
    assert.ok(summary.Warnings.includes("warning"));
    assert.ok(summary.Warnings.includes("timeout"));
    assert.ok(summary.CommandArgumentCount > 20);

});

test("overnight Benchmark dry-run prints commands without launching engines", async () => {

    const dir =
        await mkdtemp(join(tmpdir(), "coach-overnight-dryrun-"));

    try {
        const result =
            spawnSync(
                "powershell",
                [
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    "scripts/run-coach-overnight.ps1",
                    "-Mode",
                    "Benchmark",
                    "-CandidatePath",
                    "C:\\Candidate",
                    "-ResultDirectory",
                    dir,
                    "-Force",
                    "-DryRun"
                ],
                {
                    cwd: new URL("..", import.meta.url),
                    encoding: "utf8"
                }
            );

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.match(result.stdout, /DRYRUN quiet-machine/);
        assert.match(result.stdout, /DRYRUN benchmark-control/);
        assert.match(result.stdout, /DRYRUN benchmark-candidate-1/);
        assert.match(result.stdout, /DRYRUN benchmark-candidate-2/);
        assert.match(result.stdout, /DRYRUN benchmark-summary/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }

});
