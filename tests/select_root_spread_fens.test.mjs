import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function result(label, fen, triageClass, deepest) {
    return {
        label,
        fen,
        classification: triageClass,
        depths: [
            {
                depth: 8,
                best: deepest.best ?? "a1a2",
                classification: {
                    kind: deepest.kind,
                    topBandCp: deepest.band,
                    topTieCount: deepest.topTies,
                    mateCount: deepest.mateRows
                }
            }
        ]
    };
}

test("root-spread selector emits only non-mate low-tie spread FENs", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-spread-selector-test-"));

    const triagePath = join(tmp, "fen-triage.json");
    const outDir = join(tmp, "out");

    const keepFen =
        "8/8/1k1Bp3/1P2Pp1p/2K4P/8/5P2/8 b - - 2 50";
    const broadTieFen =
        "8/5pk1/4p2p/4P1p1/5PP1/6K1/8/8 w - - 0 47";
    const mateFen =
        "5r1k/6pp/5q2/1Rb1p3/4p3/1QP3Pb/P3RP1K/8 b - - 4 54";
    const afterFen =
        "8/6k1/4p2p/4P1p1/5PP1/6K1/8/8 b - - 1 47";

    await writeFile(
        triagePath,
        JSON.stringify({
            results: [
                result("game1-before-47", keepFen, "candidate-review", {
                    kind: "spread",
                    band: 180,
                    topTies: 2,
                    mateRows: 0,
                    best: "f5f4"
                }),
                result("game2-before-48", broadTieFen, "all-tied", {
                    kind: "broad-tie",
                    band: 0,
                    topTies: 12,
                    mateRows: 0
                }),
                result("game3-before-49", mateFen, "candidate-review", {
                    kind: "spread",
                    band: 200,
                    topTies: 1,
                    mateRows: 1
                }),
                result("game4-after-50", afterFen, "candidate-review", {
                    kind: "spread",
                    band: 220,
                    topTies: 1,
                    mateRows: 0
                })
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/select-root-spread-fens.mjs",
            "--triage", triagePath,
            "--require-class", "candidate-review",
            "--exclude-label-regex", "-after",
            "--min-band", "100",
            "--max-top-ties", "3",
            "--max-mate-rows", "0",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "root-spread-fens.json"),
                "utf8"
            )
        );
    const fens =
        await readFile(join(outDir, "root-spread.fens"), "utf8");

    assert.equal(payload.summary.inputPositions, 4);
    assert.equal(payload.summary.rawCandidates, 1);
    assert.equal(payload.summary.candidates, 1);
    assert.equal(payload.candidates[0].label, "game1-before-47");
    assert.match(fens, /^game1-before-47 \| /);
    assert.equal(payload.summary.rejectionCounts.deepestNotSpread, 1);
    assert.equal(payload.summary.rejectionCounts["mateRows>0"], 1);
    assert.equal(payload.summary.rejectionCounts.labelExcluded, 1);
});

test("root-spread selector limits candidates after sorting by band", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-root-spread-limit-test-"));

    const triagePath = join(tmp, "fen-triage.json");
    const outDir = join(tmp, "out");

    await writeFile(
        triagePath,
        JSON.stringify({
            results: [
                result("smaller", "8/8/8/8/8/8/8/K6k w - - 0 1", "candidate-review", {
                    kind: "spread",
                    band: 120,
                    topTies: 1,
                    mateRows: 0
                }),
                result("larger", "8/8/8/8/8/8/K7/7k w - - 0 1", "candidate-review", {
                    kind: "spread",
                    band: 240,
                    topTies: 1,
                    mateRows: 0
                })
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/select-root-spread-fens.mjs",
            "--triage", triagePath,
            "--limit", "1",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "root-spread-fens.json"),
                "utf8"
            )
        );

    assert.equal(payload.summary.rawCandidates, 2);
    assert.equal(payload.summary.candidates, 1);
    assert.equal(payload.candidates[0].label, "larger");
});
