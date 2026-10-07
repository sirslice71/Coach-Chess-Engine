import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function score(cp) {
    return {
        cp,
        isMate: false,
        mateIn: null
    };
}

function position(label, fen, coachMove, referenceMove, diffCp, extra = {}) {
    return {
        label,
        fen,
        coach: {
            bestMove: coachMove,
            score: score(extra.coachCp ?? -200)
        },
        reference: {
            bestMove: referenceMove,
            score: score(extra.referenceCp ?? 40)
        },
        comparison: {
            evalDiffCp: diffCp,
            bestMoveAgree: coachMove === referenceMove
        },
        ...extra.position
    };
}

test("decision selector keeps only confirmed before-move candidates", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-decision-selector-test-"));

    const analysisPath = join(tmp, "analysis.json");
    const confirmedPath = join(tmp, "confirmed-child.json");
    const triagePath = join(tmp, "triage.json");
    const outDir = join(tmp, "out");

    const fen1 =
        "8/8/1k1Bp3/1P2Pp1p/2K4P/8/5P2/8 b - - 2 50";
    const fen2 =
        "8/5pk1/4p2p/4P1p1/5PP1/6K1/8/8 w - - 0 47";
    const fen3 =
        "8/6k1/4p2p/4P1p1/5PP1/6K1/8/8 b - - 1 47";
    const fen4 =
        "8/8/8/2k5/2P5/2K5/8/8 w - - 0 70";

    await writeFile(
        analysisPath,
        JSON.stringify({
            positions: [
                position("game1-before-47", fen1, "b6b7", "f5f4", 210),
                position("game1-before-48", fen2, "g3f3", "g3g2", 250),
                position("game2-after-30", fen3, "g7g6", "g7f8", 400),
                position("game3-before-12", fen4, "c3c4", "c3c4", 500)
            ]
        })
    );

    await writeFile(
        confirmedPath,
        JSON.stringify({
            rows: [
                {
                    label: "game1-before-47",
                    fen: fen1,
                    keep: true,
                    reasons: [],
                    gapCp: 135,
                    coachMove: "b6b7",
                    referenceMove: "f5f4",
                    referenceRootRank: 2,
                    rootTopTieCount: 1
                },
                {
                    label: "game1-before-48",
                    fen: fen2,
                    keep: false,
                    reasons: ["gap<100"],
                    gapCp: 55,
                    coachMove: "g3f3",
                    referenceMove: "g3g2",
                    referenceRootRank: 4,
                    rootTopTieCount: 1
                },
                {
                    label: "game2-after-30",
                    fen: fen3,
                    keep: true,
                    reasons: [],
                    gapCp: 500,
                    coachMove: "g7g6",
                    referenceMove: "g7f8",
                    referenceRootRank: 1,
                    rootTopTieCount: 1
                }
            ]
        })
    );

    await writeFile(
        triagePath,
        JSON.stringify({
            results: [
                {
                    label: "game1-before-47",
                    fen: fen1,
                    classification: "candidate-review",
                    depths: [
                        {
                            depth: 10,
                            best: "f5f4",
                            classification: {
                                kind: "spread",
                                topBandCp: 120,
                                topTieCount: 2,
                                mateCount: 0
                            }
                        }
                    ]
                },
                {
                    label: "game1-before-48",
                    fen: fen2,
                    classification: "candidate-review",
                    depths: [
                        {
                            depth: 10,
                            best: "g3g2",
                            classification: {
                                kind: "spread",
                                topBandCp: 100,
                                topTieCount: 1,
                                mateCount: 0
                            }
                        }
                    ]
                },
                {
                    label: "game2-after-30",
                    fen: fen3,
                    classification: "candidate-review",
                    depths: [
                        {
                            depth: 10,
                            best: "g7f8",
                            classification: {
                                kind: "spread",
                                topBandCp: 300,
                                topTieCount: 1,
                                mateCount: 0
                            }
                        }
                    ]
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/select-decision-candidates.mjs",
            "--analysis", analysisPath,
            "--confirmed-child-search", confirmedPath,
            "--triage", triagePath,
            "--require-confirmed-child",
            "--require-label-regex", "before",
            "--exclude-label-regex", "-after",
            "--first-per-game",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "decision-candidates.json"),
                "utf8"
            )
        );

    assert.equal(payload.summary.inputPositions, 4);
    assert.equal(payload.summary.rawCandidates, 1);
    assert.equal(payload.summary.candidates, 1);
    assert.equal(payload.candidates[0].label, "game1-before-47");
    assert.equal(payload.candidates[0].confirmedChild.gapCp, 135);
    assert.equal(payload.summary.rejectionCounts.labelExcluded, 1);
    assert.equal(payload.summary.rejectionCounts.refMoveAgrees, 1);
    assert.equal(payload.summary.rejectionCounts["confirmedChildRejected:gap<100"], 1);
    assert.equal(payload.summary.rejectionCounts["childGap<100"], 1);
});
