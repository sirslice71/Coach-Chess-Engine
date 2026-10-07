import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("root tie TT diagnostic writes score comparison artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-tie-tt-test-"));

    try {
        await execFileAsync(
            process.execPath,
            [
                "tools/diagnose-root-tie-tt.mjs",
                "--out", tmp,
                "--root-depth", "1",
                "--child-depth", "1",
                "--limit", "2",
                "--fen",
                "8/8/8/8/8/8/K7/7k w - - 0 1"
            ],
            {
                cwd: resolve(".")
            }
        );

        const payload =
            JSON.parse(
                await readFile(
                    join(tmp, "root-tie-tt-diagnostic.json"),
                    "utf8"
                )
            );
        const markdown =
            await readFile(
                join(tmp, "root-tie-tt-diagnostic.md"),
                "utf8"
            );

        assert.equal(payload.args.rootDepth, 1);
        assert.ok(payload.rows.length > 0);
        assert.equal(typeof payload.rows[0].shared.score, "number");
        assert.match(markdown, /Root Tie TT Diagnostic/);
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
});
