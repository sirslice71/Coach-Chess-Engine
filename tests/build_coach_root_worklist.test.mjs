import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("coach root worklist writes bounded scan artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-worklist-test-"));
    const sourceDir = join(tmp, "source");
    const outDir = join(tmp, "out");
    const fenFile = join(sourceDir, "packet.fens");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(
        fenFile,
        [
            "before-one | 8/8/8/8/8/8/4K3/7k w - - 0 1",
            "game-after-one | 8/8/8/8/8/8/4K3/7k w - - 0 1",
            "duplicate-before | 8/8/8/8/8/8/4K3/7k w - - 0 1"
        ].join("\n") + "\n",
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/build-coach-root-worklist.mjs",
            "--root", sourceDir,
            "--out", outDir,
            "--depth", "1",
            "--root-limit", "2",
            "--min-band", "999999",
            "--max-input", "10",
            "--limit", "5",
            "--max-ms-per-root", "1000"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "coach-root-worklist.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "coach-root-worklist.md"),
            "utf8"
        );

    assert.equal(payload.summary.filesScanned, 1);
    assert.equal(payload.summary.rawLines, 3);
    assert.equal(payload.summary.excludedLabels, 1);
    assert.equal(payload.summary.duplicateFens, 1);
    assert.equal(payload.summary.audited, 1);
    assert.equal(payload.summary.worklist, 0);
    assert.match(markdown, /Coach Root Worklist/);
});

test("coach root worklist can exclude noisy file paths", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-worklist-exclude-test-"));
    const sourceDir = join(tmp, "source");
    const noisyDir = join(sourceDir, "old-run");
    const usefulDir = join(sourceDir, "new-run");
    const outDir = join(tmp, "out");

    await mkdir(noisyDir, { recursive: true });
    await mkdir(usefulDir, { recursive: true });
    await writeFile(
        join(noisyDir, "candidate-regressions.fens"),
        "old-before | 8/8/8/8/8/8/4K3/7k w - - 0 1\n"
    );
    await writeFile(
        join(usefulDir, "before.fens"),
        "new-before | 8/8/8/8/8/8/4K3/7k w - - 0 1\n"
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/build-coach-root-worklist.mjs",
            "--root", sourceDir,
            "--out", outDir,
            "--depth", "1",
            "--root-limit", "2",
            "--min-band", "999999",
            "--exclude-file-regex", "candidate-regressions",
            "--max-ms-per-root", "1000"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "coach-root-worklist.json"),
                "utf8"
            )
        );

    assert.equal(payload.summary.filesScanned, 1);
    assert.equal(payload.summary.rawLines, 1);
    assert.equal(payload.rejections[0].label, "new-before");
});
