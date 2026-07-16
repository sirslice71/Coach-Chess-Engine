import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    formatSummary,
    parseSummaryArgs,
    readBenchmarkReport,
    summarizeBenchmarkReports
} from "../scripts/benchmark-search-summary.mjs";

function report({
    geomeanPercent,
    medianPercent = geomeanPercent,
    identityOk = true,
    positions = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
}) {

    return {
        summary: {
            identityOk,
            aggregates: {
                primary: {
                    geomeanPercent,
                    medianPercent
                }
            },
            positions:
                positions.map((gain, index) => ({
                    id: `p${index + 1}`,
                    percentChange: -gain,
                    identityOk
                }))
        }
    };

}

function entry(kind, session, reportValue, path = `${kind}-${session}.json`) {

    return {
        kind,
        session,
        report: reportValue,
        path
    };

}

test("parseSummaryArgs groups candidates with the preceding control", () => {

    const args =
        parseSummaryArgs([
            "--control", "control-a.json",
            "--candidate", "candidate-a.json",
            "--candidate", "candidate-b.json",
            "--control", "control-b.json",
            "--candidate", "candidate-c.json"
        ]);

    assert.deepEqual(
        args.controls.map(control => control.session),
        ["session-1", "session-2"]
    );
    assert.deepEqual(
        args.candidates.map(candidate => candidate.session),
        ["session-1", "session-1", "session-2"]
    );

});

test("rejected king-list raw timing shape stays rejected", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "session-1", report({ geomeanPercent: 0.481 })),
            entry("candidate", "session-1", report({
                geomeanPercent: 1.354,
                medianPercent: 1.281,
                positions: [-1.1, -1.4, -1.2, -1.3, -1.6, -1.7, -1.0, -1.5, -1.2, -1.6]
            })),
            entry("candidate", "session-1", report({
                geomeanPercent: 2.483,
                medianPercent: 2.063,
                positions: [-2.1, -2.5, -2.3, -2.0, -2.7, -2.4, -2.2, -2.8, -2.1, -2.3]
            })),
            entry("control", "session-2", report({ geomeanPercent: 0.192 })),
            entry("candidate", "session-2", report({
                geomeanPercent: 1.829,
                medianPercent: 1.821,
                positions: [-1.6, -1.7, -1.5, -1.8, -2.0, -1.9, -1.6, -1.7, -1.5, -1.8]
            }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.equal(summary.controls.every(control => control.withinLimit), true);
    assert.equal(summary.candidates.every(candidate => candidate.identityOk), true);
    assert.equal(summary.positiveCandidateRuns, 0);
    assert.ok(Math.abs(summary.adjustedCandidate.meanGainPercent + 1.504) < 0.001);
    assert.match(formatSummary(summary), /verdict: rejected/);
    assert.match(formatSummary(summary), /raw timing difference 1\.354% slower/);

});

test("accepted faster candidate uses positive speed gain", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({ geomeanPercent: -1.5 })),
            entry("candidate", "s", report({ geomeanPercent: -1.8 }))
        ]);

    assert.equal(summary.verdict.status, "accepted");
    assert.equal(summary.positiveCandidateRuns, 2);
    assert.ok(summary.adjustedCandidate.meanGainPercent > 1.5);
    assert.match(formatSummary(summary), /speed gain \+1\.500%/);

});

test("noisy control rejects even with strong candidates", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.8 })),
            entry("candidate", "s", report({ geomeanPercent: -2 })),
            entry("candidate", "s", report({ geomeanPercent: -2.2 }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.match(summary.verdict.reasons.join(" "), /control/);

});

test("identity mismatch rejects", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({ geomeanPercent: -2 })),
            entry("candidate", "s", report({
                geomeanPercent: -2,
                identityOk: false
            }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.match(summary.verdict.reasons.join(" "), /identity/);

});

test("inconsistent candidate signs reject", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({ geomeanPercent: -1.4 })),
            entry("candidate", "s", report({ geomeanPercent: 0.2 }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.match(summary.verdict.reasons.join(" "), /signs/);

});

test("single positive candidate remains promising rather than accepted", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({ geomeanPercent: -1.4 }))
        ]);

    assert.equal(summary.verdict.status, "promising");

});

test("one-position domination rejects otherwise positive candidates", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({
                geomeanPercent: -1.4,
                positions: [10, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
            })),
            entry("candidate", "s", report({
                geomeanPercent: -1.4,
                positions: [10, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
            }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.match(summary.verdict.reasons.join(" "), /dominated/);

});

test("repeated per-position regression rejects", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "s", report({ geomeanPercent: 0.1 })),
            entry("candidate", "s", report({
                geomeanPercent: -1.5,
                positions: [-0.5, 2, 2, 2, 2, 2, 2, 2, 2, 2]
            })),
            entry("candidate", "s", report({
                geomeanPercent: -1.5,
                positions: [-0.5, 2, 2, 2, 2, 2, 2, 2, 2, 2]
            }))
        ]);

    assert.equal(summary.verdict.status, "rejected");
    assert.match(summary.verdict.reasons.join(" "), /per-position regression/);

});

test("session-specific control adjustment is explicit", () => {

    const summary =
        summarizeBenchmarkReports([
            entry("control", "a", report({ geomeanPercent: 0.4 })),
            entry("candidate", "a", report({ geomeanPercent: -1.4 })),
            entry("control", "b", report({ geomeanPercent: -0.2 })),
            entry("candidate", "b", report({ geomeanPercent: -1.4 }))
        ]);

    assert.equal(summary.candidates[0].controlIndex, 1);
    assert.equal(summary.candidates[1].controlIndex, 2);
    assert.ok(summary.candidates[0].adjustedGainPercent > 1.7);
    assert.ok(summary.candidates[1].adjustedGainPercent < 1.3);

});

test("missing or malformed JSON fails clearly", async () => {

    const dir =
        await mkdtemp(join(tmpdir(), "coach-summary-test-"));

    try {
        await assert.rejects(
            readBenchmarkReport(join(dir, "missing.json")),
            /ENOENT/
        );

        const badJson =
            join(dir, "bad.json");

        await writeFile(badJson, "{ definitely not json");

        await assert.rejects(
            readBenchmarkReport(badJson),
            /Unexpected token|Expected property name|not valid JSON/
        );
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }

});
