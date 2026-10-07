import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("root plateau child-score auditor writes classification artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-plateau-audit-test-"));

    try {
        const fenFile = join(tmp, "positions.fens");
        const outDir = join(tmp, "out");

        await writeFile(
            fenFile,
            [
                "kings | 8/8/8/8/8/8/4K3/6k1 w - - 0 1"
            ].join("\n") + "\n"
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/audit-root-plateau-child-scores.mjs",
                "--fen-file", fenFile,
                "--out", outDir,
                "--root-depth", "1",
                "--child-depth", "1",
                "--root-limit", "2",
                "--limit", "1",
                "--max-ms-per-root", "1000",
                "--max-ms-per-child", "1000"
            ],
            { cwd: resolve(".") }
        );

        const payload =
            JSON.parse(
                await readFile(
                    join(outDir, "root-plateau-child-score-audit.json"),
                    "utf8"
                )
            );
        const markdown =
            await readFile(
                join(outDir, "root-plateau-child-score-audit.md"),
                "utf8"
            );

        assert.equal(payload.summary.inputPositions, 1);
        assert.equal(payload.summary.audited, 1);
        assert.equal(payload.summary.disagreements, 0);
        assert.equal(payload.rows[0].label, "kings");
        assert.ok(payload.rows[0].root.rootMoves.length > 0);
        assert.ok(payload.rows[0].child.rows.length > 0);
        assert.ok("rootBestMove" in payload.rows[0].child);
        assert.ok("childBestMove" in payload.rows[0].child);
        assert.ok("disagreementGap" in payload.rows[0].child);
        assert.match(markdown, /Root Plateau Child-Score Audit/);
        assert.match(markdown, /Disagreement threshold/);
        await stat(join(outDir, "root-child-disagreements.fens"));
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
});
