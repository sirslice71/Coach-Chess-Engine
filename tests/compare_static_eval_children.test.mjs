import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    analyzeRow,
    parseArgs
} from "../tools/compare-static-eval-children.mjs";

const execFileAsync = promisify(execFile);

test("static eval child comparison analyzes legal child moves", () => {
    const row =
        analyzeRow({
            label: "simple",
            fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
            coachMove: "e2e3",
            referenceMove: "e2d3",
            externalGapCp: 100,
            coachChildGapCp: 0
        });

    assert.equal(row.coachStatic.legal, true);
    assert.equal(row.referenceStatic.legal, true);
    assert.equal(typeof row.staticGapCp, "number");
    assert.ok(Array.isArray(row.topCategoryDiffs));
});

test("static eval child comparison writes artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-static-child-compare-test-"));
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
                    externalGapCp: 100,
                    coachChildGapCp: 0
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/compare-static-eval-children.mjs",
            "--summary", summaryPath,
            "--out", outDir
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "static-eval-child-comparison.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "static-eval-child-comparison.md"),
            "utf8"
        );

    assert.equal(payload.summary.rowsAnalyzed, 1);
    assert.match(markdown, /Static Eval Child Comparison/);
});

test("static eval child comparison parses arguments", () => {
    assert.equal(
        parseArgs(["--summary", "a.json", "--out", "out", "--limit", "3"]).limit,
        3
    );
});
