import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    classifyRow,
    parseArgs
} from "../tools/summarize-external-child-disagreements.mjs";

const execFileAsync = promisify(execFile);

test("external child disagreement classifier keeps external-only rows", () => {
    const args =
        parseArgs([
            "--root", "analysis-runs",
            "--out", "out",
            "--min-external-gap", "100",
            "--max-coach-child-gap", "99"
        ]);

    assert.deepEqual(
        classifyRow(
            args,
            {
                externalGapCp: 602,
                childGapCp: -76,
                reasons: ["coach-child-disagrees-with-external"]
            }
        ),
        {
            keep: true,
            reasons: []
        }
    );

    assert.deepEqual(
        classifyRow(
            args,
            {
                externalGapCp: 60,
                childGapCp: -76,
                reasons: ["coach-child-disagrees-with-external"]
            }
        ),
        {
            keep: false,
            reasons: ["externalGap<100"]
        }
    );
});

test("external child disagreement summarizer writes ranked artifacts", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-external-child-summary-test-"));
    const sourceDir = join(tmp, "source", "run", "root-bound-pairs-d8");
    const outDir = join(tmp, "out");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(
        join(sourceDir, "root-bound-pairs.json"),
        JSON.stringify({
            rows: [
                {
                    label: "keeper",
                    fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
                    coachMove: "e2e3",
                    referenceMove: "e2d3",
                    rootGapCp: 0,
                    childGapCp: -76,
                    childBandCp: 76,
                    externalGapCp: 602,
                    reasons: ["coach-child-disagrees-with-external"]
                },
                {
                    label: "small-external",
                    fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
                    coachMove: "e2e3",
                    referenceMove: "e2d3",
                    rootGapCp: 0,
                    childGapCp: -10,
                    childBandCp: 10,
                    externalGapCp: 40,
                    reasons: ["coach-child-disagrees-with-external"]
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/summarize-external-child-disagreements.mjs",
            "--root", join(tmp, "source"),
            "--out", outDir,
            "--min-external-gap", "100",
            "--max-coach-child-gap", "99"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "external-child-disagreements.json"),
                "utf8"
            )
        );
    const markdown =
        await readFile(
            join(outDir, "external-child-disagreements.md"),
            "utf8"
        );

    assert.equal(payload.summary.filesScanned, 1);
    assert.equal(payload.summary.rowsAudited, 2);
    assert.equal(payload.summary.externalOnlyDisagreements, 1);
    assert.equal(payload.rows[0].label, "keeper");
    assert.match(markdown, /External-vs-Coach Child Disagreement Audit/);
});
