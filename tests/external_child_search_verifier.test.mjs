import test from "node:test";
import assert from "node:assert/strict";

import {
    classify,
    parseArgs,
    scoreToRootSideCp,
    sideScoreToWhiteCp,
    whiteCpToRootSideCp
} from "../tools/verify-external-child-search.mjs";

test("external child score conversion preserves root-side perspective", () => {
    assert.equal(sideScoreToWhiteCp(120, "w"), 120);
    assert.equal(sideScoreToWhiteCp(120, "b"), -120);
    assert.equal(whiteCpToRootSideCp(120, "w"), 120);
    assert.equal(whiteCpToRootSideCp(120, "b"), -120);

    assert.equal(
        scoreToRootSideCp(
            { cp: 220, isMate: false },
            "8/8/8/8/8/8/8/8 b - - 0 1",
            "8/8/8/8/8/8/8/8 w - - 0 1"
        ),
        -220
    );

    assert.equal(
        scoreToRootSideCp(
            { cp: -150, isMate: false },
            "8/8/8/8/8/8/8/8 w - - 0 1",
            "8/8/8/8/8/8/8/8 b - - 0 1"
        ),
        150
    );
});

test("external verifier classifier keeps only real external gaps", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-gap", "100"
        ]);
    const baseItem = {
        coachChild: {
            legal: true
        },
        referenceChild: {
            legal: true
        },
        coachExternal: {
            error: null,
            score: {
                cp: -50,
                isMate: false
            }
        },
        referenceExternal: {
            error: null,
            score: {
                cp: 90,
                isMate: false
            }
        },
        gapCp: 140
    };

    assert.deepEqual(
        classify(args, baseItem),
        {
            keep: true,
            reasons: []
        }
    );

    assert.deepEqual(
        classify(
            args,
            {
                ...baseItem,
                gapCp: 80
            }
        ),
        {
            keep: false,
            reasons: ["external-gap<100"]
        }
    );

    assert.deepEqual(
        classify(
            args,
            {
                ...baseItem,
                referenceExternal: {
                    error: null,
                    score: {
                        cp: 99995,
                        isMate: true
                    }
                }
            }
        ),
        {
            keep: false,
            reasons: ["reference-external-mate"]
        }
    );
});
