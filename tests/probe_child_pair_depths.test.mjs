import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    analyzePair,
    parseDepths
} from "../tools/probe-child-pair-depths.mjs";

const execFileAsync = promisify(execFile);

test("child pair depth probe parses depth ranges", () => {
    assert.deepEqual(parseDepths("2-4"), [2, 3, 4]);
    assert.deepEqual(parseDepths("1,3"), [1, 3]);
});

test("child pair depth probe analyzes a legal move pair", () => {
    const payload =
        analyzePair(
            {
                label: "simple",
                fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
                coachMove: "e2e3",
                referenceMove: "e2d3",
                externalGapCp: 0
            },
            {
                depths: [1],
                maxMsPerSearch: 1000
            }
        );

    assert.equal(payload.coachChild.legal, true);
    assert.equal(payload.referenceChild.legal, true);
    assert.equal(payload.depths.length, 1);
    assert.equal(typeof payload.staticGapCp, "number");
});

test("child pair depth probe writes artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-child-pair-depths-test-"));
    const summaryPath = join(tmp, "summary.json");
    const outDir = join(tmp, "out");

    await writeFile(
        summaryPath,
        JSON.stringify({
            rows: [
                {
                    label: "simple",
                    fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
                    coachMove: "e2e3",
                    referenceMove: "e2d3",
                    externalGapCp: 0
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/probe-child-pair-depths.mjs",
            "--summary", summaryPath,
            "--label", "simple",
            "--out", outDir,
            "--depths", "1",
            "--max-ms-per-search", "1000"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "child-pair-depths.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "child-pair-depths.md"),
            "utf8"
        );

    assert.equal(payload.depths.length, 1);
    assert.match(markdown, /Child Pair Depth Probe/);
});
