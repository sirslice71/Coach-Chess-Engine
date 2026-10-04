import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("stable selector rejects rows rejected by confirmed child-search", async () => {

    const tmp =
        await mkdtemp(join(tmpdir(), "coach-stable-selector-test-"));

    const triagePath = join(tmp, "triage.json");
    const analysisPath = join(tmp, "analysis.json");
    const confirmedPath = join(tmp, "confirmed-child.json");
    const outDir = join(tmp, "out");

    const fen =
        "8/8/1k1Bp3/1P2Pp1p/2K4P/8/5P2/8 b - - 2 50";

    await writeFile(
        triagePath,
        JSON.stringify({
            results: [
                {
                    label: "swing-row",
                    fen,
                    classification: "candidate-review",
                    depths: [
                        {
                            depth: 10,
                            best: "b6b7",
                            classification: {
                                kind: "spread",
                                topBandCp: 114,
                                topTieCount: 3,
                                mateCount: 0
                            }
                        }
                    ]
                }
            ]
        })
    );

    await writeFile(
        analysisPath,
        JSON.stringify({
            positions: [
                {
                    label: "swing-row",
                    fen,
                    coach: {
                        bestMove: "b6b7",
                        score: {
                            cp: -836,
                            isMate: false,
                            mateIn: null
                        }
                    },
                    reference: {
                        bestMove: "f5f4",
                        score: {
                            cp: -669,
                            isMate: false,
                            mateIn: null
                        }
                    },
                    comparison: {
                        evalDiffCp: -167,
                        bestMoveAgree: false
                    }
                }
            ]
        })
    );

    await writeFile(
        confirmedPath,
        JSON.stringify({
            rows: [
                {
                    label: "swing-row",
                    fen,
                    keep: false,
                    reasons: ["gap<100"],
                    gapCp: 81,
                    coachMove: "b6b7",
                    referenceMove: "f5f4"
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/select-stable-candidates.mjs",
            "--triage", triagePath,
            "--analysis", analysisPath,
            "--confirmed-child-search", confirmedPath,
            "--require-ref-disagree",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "stable-candidates.json"),
                "utf8"
            )
        );

    assert.equal(payload.summary.stableCandidates, 0);
    assert.equal(payload.summary.rejected, 1);
    assert.deepEqual(
        payload.rejected[0].confirmedChild,
        {
            keep: false,
            reasons: ["gap<100"],
            gapCp: 81,
            coachMove: "b6b7",
            referenceMove: "f5f4"
        }
    );
    assert.deepEqual(
        payload.rejected[0].reasons,
        ["confirmedChildRejected:gap<100"]
    );

});
