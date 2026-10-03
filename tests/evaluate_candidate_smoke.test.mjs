import test from "node:test";
import assert from "node:assert/strict";

import {
    classifyDecision,
    parseCutechessScore,
    readTextSmart
} from "../tools/evaluate-candidate-smoke.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("parseCutechessScore reads final W-L-D score and color splits", () => {

    const text = [
        "Score of Coach vs ShallowBlue 1618: 3 - 2 - 1  [0.583] 6",
        "Score of Coach vs ShallowBlue 1618: 10 - 9 - 1  [0.525] 20",
        "...      Coach playing White: 5 - 4 - 1  [0.550] 10",
        "...      Coach playing Black: 5 - 5 - 0  [0.500] 10"
    ].join("\n");

    const parsed = parseCutechessScore(text, "Coach");

    assert.deepEqual(parsed.score, {
        opponent: "ShallowBlue 1618",
        wins: 10,
        losses: 9,
        draws: 1,
        score: 0.525,
        games: 20
    });
    assert.deepEqual(parsed.colors.white, {
        wins: 5,
        losses: 4,
        draws: 1,
        score: 0.55,
        games: 10
    });
    assert.deepEqual(parsed.colors.black, {
        wins: 5,
        losses: 5,
        draws: 0,
        score: 0.5,
        games: 10
    });

});

test("classifyDecision rejects score regressions against baseline", () => {

    const decision =
        classifyDecision(
            {
                score: { score: 0.375 },
                pipeline: { stableCandidateCount: 0 }
            },
            0.525
        );

    assert.equal(decision.status, "reject-smoke-regression");

});

test("classifyDecision asks for probes when stable candidates survive", () => {

    const decision =
        classifyDecision(
            {
                score: { score: 0.55 },
                pipeline: { stableCandidateCount: 2 }
            },
            0.525
        );

    assert.equal(decision.status, "needs-stable-candidate-probes");

});

test("classifyDecision marks non-regressing smoke with no stable candidates ready for review", () => {

    const decision =
        classifyDecision(
            {
                score: { score: 0.525 },
                pipeline: { stableCandidateCount: 0 }
            },
            0.525
        );

    assert.equal(decision.status, "smoke-nonregression-ready-for-review");

});

test("readTextSmart decodes PowerShell UTF-16LE Tee-Object output", () => {

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coach-smoke-"));
    const stdoutPath = path.join(tempDir, "cutechess.stdout.txt");
    const text = "Score of Coach vs ShallowBlue 1618: 6 - 13 - 1  [0.325] 20";

    fs.writeFileSync(
        stdoutPath,
        Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(text, "utf16le")
        ])
    );

    assert.equal(readTextSmart(stdoutPath), text);

});
