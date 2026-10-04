import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
    classify,
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

    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }

});
