import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    parseLine,
    replayLine
} from "../tools/replay-pv-static-eval.mjs";

const execFileAsync = promisify(execFile);

test("PV replay parses named line", () => {
    assert.deepEqual(
        parseLine("main:e2e3,h1g1"),
        {
            name: "main",
            moves: ["e2e3", "h1g1"]
        }
    );
});

test("PV replay evaluates each legal move", () => {
    const line =
        replayLine(
            "8/8/8/8/8/8/4K3/7k w - - 0 1",
            {
                name: "simple",
                moves: ["e2e3"]
            }
        );

    assert.equal(line.rows.length, 2);
    assert.equal(line.rows[1].move, "e2e3");
    assert.equal(typeof line.rows[1].evaluation.rootSideScore, "number");
});

test("PV replay writes artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-pv-static-replay-test-"));
    const outDir = join(tmp, "out");

    await execFileAsync(
        process.execPath,
        [
            "tools/replay-pv-static-eval.mjs",
            "--fen", "8/8/8/8/8/8/4K3/7k", "w", "-", "-", "0", "1",
            "--line", "simple:e2e3",
            "--out", outDir
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "pv-static-eval.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "pv-static-eval.md"),
            "utf8"
        );

    assert.equal(payload.lines.length, 1);
    assert.match(markdown, /PV Static Eval Replay/);
});
