import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    classify,
    gapClass,
    inferConfirmChildDepth,
    parseArgs
} from "../tools/verify-reference-child-search.mjs";

const execFileAsync = promisify(execFile);

test("reference child-search verifier rejects keepers whose confirmation gap collapses", () => {

    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--child-depth", "10",
            "--min-gap", "100"
        ]);

    const position = {
        coach: {
            depth: 12
        },
        reference: {
            depth: 12
        }
    };

    assert.equal(
        inferConfirmChildDepth(args, position),
        12
    );

    const result =
        classify(
            args,
            {
                coachChild: {
                    legal: true
                },
                referenceChild: {
                    legal: true
                },
                referenceInRootLimit: true,
                gapCp: 183,
                coachRootScore: -1374,
                referenceRootScore: -1156,
                confirmation: {
                    childDepth: 12,
                    coachChild: {
                        legal: true
                    },
                    referenceChild: {
                        legal: true
                    },
                    gapCp: 0
                }
            }
        );

    assert.equal(result.keep, false);
    assert.deepEqual(
        result.reasons,
        ["confirm-gap<100@d12"]
    );

});

test("reference child-search verifier rejects mate-class child scores", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-gap", "100"
        ]);

    const result =
        classify(
            args,
            {
                coachChild: {
                    legal: true,
                    childRootSideScore: -99989
                },
                referenceChild: {
                    legal: true,
                    childRootSideScore: -1249
                },
                referenceInRootLimit: true,
                gapCp: 98740,
                coachRootScore: -1239,
                referenceRootScore: -1239
            }
        );

    assert.equal(result.keep, false);
    assert.deepEqual(
        result.reasons,
        ["mate-child-score"]
    );
});

test("reference child-search verifier rejects mate-class confirmation scores", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-gap", "100"
        ]);

    const result =
        classify(
            args,
            {
                coachChild: {
                    legal: true,
                    childRootSideScore: -120
                },
                referenceChild: {
                    legal: true,
                    childRootSideScore: 40
                },
                referenceInRootLimit: true,
                gapCp: 160,
                coachRootScore: -40,
                referenceRootScore: -20,
                confirmation: {
                    childDepth: 10,
                    coachChild: {
                        legal: true,
                        childRootSideScore: -99989
                    },
                    referenceChild: {
                        legal: true,
                        childRootSideScore: -1249
                    },
                    gapCp: 98740
                }
            }
        );

    assert.equal(result.keep, false);
    assert.deepEqual(
        result.reasons,
        ["confirm-mate-child-score@d10"]
    );
});

test("reference child-search verifier records root prefilter reasons", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-gap", "100"
        ]);

    const result =
        classify(
            args,
            {
                coachChild: {
                    legal: true,
                    skipped: true
                },
                referenceChild: {
                    legal: true,
                    skipped: true
                },
                referenceInRootLimit: false,
                prefilterReason: "prefilter-reference-not-in-top-20",
                gapCp: null,
                coachRootScore: -40,
                referenceRootScore: -20
            }
        );

    assert.equal(result.keep, false);
    assert.deepEqual(
        result.reasons,
        [
            "reference-not-in-top-16",
            "prefilter-reference-not-in-top-20",
            "gap<100"
        ]
    );
});

test("reference child-search verifier writes an audit for legal moves", async () => {

    const tmp =
        await mkdtemp(join(tmpdir(), "coach-reference-child-test-"));

    try {

        const analysisPath =
            join(tmp, "analysis.json");

        await writeFile(
            analysisPath,
            JSON.stringify({
                positions: [
                    {
                        label: "kings-only",
                        fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
                        coach: {
                            bestMove: "a2a3",
                            score: {
                                isMate: false,
                                cp: 0
                            }
                        },
                        reference: {
                            bestMove: "a2b2",
                            score: {
                                isMate: false,
                                cp: 200
                            }
                        },
                        comparison: {
                            bestMoveAgree: false,
                            evalDiffCp: 200
                        }
                    }
                ]
            })
        );

        await execFileAsync(
            process.execPath,
            [
                "tools/verify-reference-child-search.mjs",
                "--analysis",
                analysisPath,
                "--child-depth",
                "1",
                "--min-gap",
                "0",
                "--max-positions",
                "1",
                "--root-limit",
                "8",
                "--out",
                tmp
            ],
            {
                cwd: resolve(".")
            }
        );

        const audit =
            JSON.parse(
                await readFile(
                    join(tmp, "reference-child-search.json"),
                    "utf8"
                )
            );

        assert.equal(audit.summary.audited, 1);
        assert.equal(audit.rows[0].label, "kings-only");
        assert.equal(audit.rows[0].coachChild.legal, true);
        assert.equal(audit.rows[0].referenceChild.legal, true);

        const candidateFens =
            await readFile(
                join(tmp, "reference-child-candidates.fens"),
                "utf8"
            );

        const nearMissFens =
            await readFile(
                join(tmp, "reference-child-positive-subthreshold.fens"),
                "utf8"
            );

        assert.equal(
            candidateFens,
            "kings-only | 8/8/8/8/8/8/K7/7k w - - 0 1\n"
        );
        assert.equal(nearMissFens, "");

    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }

});

test("reference child-search verifier classifies subthreshold gaps", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-gap", "100"
        ]);

    assert.equal(gapClass(args, 140), "candidate");
    assert.equal(gapClass(args, 54), "positive-subthreshold");
    assert.equal(gapClass(args, 0), "flat");
    assert.equal(gapClass(args, -12), "coach-favored");
    assert.equal(gapClass(args, null), "unknown");
});
