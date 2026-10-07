import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("child-search collapse summarizer categorizes keepers and misses", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-child-collapse-summary-test-"));

    try {
        const root = join(tmp, "analysis-runs");
        const nested = join(root, "run", "verify");
        const out = join(tmp, "out");

        await mkdir(nested, { recursive: true });
        await writeFile(
            join(nested, "reference-child-search.json"),
            JSON.stringify({
                rows: [
                    {
                        label: "keeper",
                        fen: "fen a",
                        diffCp: 220,
                        gapCp: 140,
                        keep: true,
                        reasons: [],
                        coachMove: "a1a2",
                        referenceMove: "a1b1"
                    },
                    {
                        label: "after-artifact-after",
                        fen: "fen after",
                        diffCp: 240,
                        gapCp: 180,
                        keep: true,
                        reasons: [],
                        coachMove: "h1h2",
                        referenceMove: "h1g1"
                    },
                    {
                        label: "collapse",
                        fen: "fen b",
                        diffCp: 500,
                        gapCp: 12,
                        keep: false,
                        reasons: ["gap<100"],
                        coachMove: "b1b2",
                        referenceMove: "b1c1"
                    },
                    {
                        label: "near",
                        fen: "fen c",
                        diffCp: 180,
                        gapCp: 75,
                        keep: false,
                        reasons: ["gap<100"],
                        coachMove: "c1c2",
                        referenceMove: "c1d1"
                    }
                ]
            }) + "\n"
        );

        await mkdir(join(root, "external"), { recursive: true });
        await writeFile(
            join(root, "external", "external-child-search.json"),
            JSON.stringify({
                rows: [
                    {
                        label: "external-only",
                        fen: "fen d",
                        diffCp: 300,
                        gapCp: 200,
                        keep: true,
                        reasons: [],
                        coachMove: "d1d2",
                        referenceMove: "d1e1"
                    }
                ]
            }) + "\n"
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/summarize-child-search-collapses.mjs",
                "--root", root,
                "--out", out
            ],
            { cwd: resolve(".") }
        );

        const payload =
            JSON.parse(
                await readFile(
                    join(out, "child-search-collapse-summary.json"),
                    "utf8"
                )
            );

        assert.equal(payload.summary.artifacts, 2);
        assert.equal(payload.summary.rows, 5);
        assert.equal(payload.summary.keepers, 3);
        assert.equal(payload.summary.activeGateKeepers, 1);
        assert.equal(payload.keepers[0].label, "external-only");
        assert.deepEqual(
            payload.activeGateKeepers.map(row => row.label),
            ["keeper"]
        );
        assert.equal(payload.largestCollapses[0].label, "collapse");
        assert.equal(payload.nearMisses[0].label, "near");
        assert.equal(payload.summary.rejectionCounts["gap<100"], 2);
        assert.equal(payload.summary.gapBuckets[">=100"], 3);
        assert.equal(payload.summary.gapBuckets["50-99"], 1);
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
});
