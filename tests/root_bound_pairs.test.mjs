import test from "node:test";
import assert from "node:assert/strict";

import {
    classifyPair,
    parseArgs
} from "../tools/diagnose-root-bound-pairs.mjs";

test("root bound pair classifier flags root tie with child spread", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-child-band", "100"
        ]);
    const item = {
        coachRootRow: {
            score: -68
        },
        referenceRootRow: {
            score: -68
        },
        rootGapCp: 0,
        childGapCp: -144,
        childBandCp: 144
    };

    assert.deepEqual(
        classifyPair(args, item),
        {
            boundLike: true,
            reasons: ["bound-like-root-tie"]
        }
    );
});

test("root bound pair classifier separates spread roots and flat children", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-child-band", "100"
        ]);

    assert.deepEqual(
        classifyPair(
            args,
            {
                coachRootRow: { score: -300 },
                referenceRootRow: { score: -50 },
                rootGapCp: 250,
                childGapCp: 250,
                childBandCp: 250
            }
        ),
        {
            boundLike: false,
            reasons: ["root-already-spread"]
        }
    );

    assert.deepEqual(
        classifyPair(
            args,
            {
                coachRootRow: { score: -68 },
                referenceRootRow: { score: -68 },
                rootGapCp: 0,
                childGapCp: 42,
                childBandCp: 42
            }
        ),
        {
            boundLike: false,
            reasons: ["childBand<100", "root-and-child-flat"]
        }
    );
});

test("root bound pair classifier marks external-only child support", () => {
    const args =
        parseArgs([
            "--analysis", "analysis.json",
            "--min-child-band", "100"
        ]);

    assert.deepEqual(
        classifyPair(
            args,
            {
                coachRootRow: { score: -68 },
                referenceRootRow: { score: -68 },
                rootGapCp: 0,
                childGapCp: -76,
                childBandCp: 76,
                externalGapCp: 602
            }
        ),
        {
            boundLike: false,
            reasons: [
                "childBand<100",
                "root-and-child-flat",
                "coach-child-disagrees-with-external"
            ]
        }
    );
});
