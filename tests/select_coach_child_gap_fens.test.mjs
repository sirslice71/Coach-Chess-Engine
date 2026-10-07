import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("coach child-gap selector writes bounded audit artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-child-gap-selector-test-"));

    try {
        const fenFile = join(tmp, "positions.fens");
        const outDir = join(tmp, "out");

        await writeFile(
            fenFile,
            [
                "simple | 8/8/8/8/8/8/4K3/6k1 w - - 0 1",
                "excluded-after | 8/8/8/8/8/8/4K3/6k1 w - - 0 1"
            ].join("\n") + "\n"
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/select-coach-child-gap-fens.mjs",
                "--fen-file", fenFile,
                "--out", outDir,
                "--root-depth", "1",
                "--child-depth", "1",
                "--min-root-band", "1",
                "--max-root-top-ties", "1",
                "--root-limit", "2",
                "--limit", "2",
                "--max-ms-per-child", "1000",
                "--nonmate-check-depth", "1",
                "--exclude-label-regex", "after"
            ],
            { cwd: resolve(".") }
        );

        const payload =
            JSON.parse(
                await readFile(
                    join(outDir, "coach-child-gap-candidates.json"),
                    "utf8"
                )
            );
        const markdown =
            await readFile(
                join(outDir, "coach-child-gap-candidates.md"),
                "utf8"
            );

        assert.equal(payload.summary.inputPositions, 2);
        assert.equal(payload.summary.audited, 1);
        assert.equal(payload.args.nonmateCheckDepth, 1);
        assert.equal(payload.rows[0].label, "simple");
        assert.ok(payload.rows[0].root.bestMove);
        assert.ok(Array.isArray(payload.rows[0].reasons));
        assert.match(markdown, /Coach Child-Gap Selector/);
        assert.match(markdown, /Min root band/);
        assert.match(markdown, /Non-mate check depth/);
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
});
