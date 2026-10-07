import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("candidate discovery pipeline writes combined artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-candidate-pipeline-test-"));
    const sourceDir = join(tmp, "source");
    const outDir = join(tmp, "out");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(
        join(sourceDir, "before.fens"),
        "simple-before | 8/8/8/8/8/8/4K3/7k w - - 0 1\n"
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/run-candidate-discovery-pipeline.mjs",
            "--root", sourceDir,
            "--out", outDir,
            "--worklist-depth", "1",
            "--child-depth", "1",
            "--confirm-depth", "1",
            "--nonmate-depth", "1",
            "--root-limit", "2",
            "--worklist-limit", "5",
            "--max-input", "5",
            "--min-band", "999999",
            "--max-ms-per-root", "1000",
            "--max-ms-per-child", "1000"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "candidate-discovery-pipeline.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "candidate-discovery-pipeline.md"),
            "utf8"
        );

    assert.equal(payload.summary.auditedPositions, 1);
    assert.equal(payload.summary.worklistRows, 0);
    assert.equal(payload.summary.childGapCandidates, 0);
    assert.match(markdown, /Coach Candidate Discovery Pipeline/);
});
