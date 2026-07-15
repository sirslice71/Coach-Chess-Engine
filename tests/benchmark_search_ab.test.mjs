import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
    checkResumeCompatibility,
    classifyCandidate,
    classifyControl,
    coefficientOfVariation,
    compareIdentity,
    generatePairedOrder,
    geometricMean,
    hasSample,
    loadCorpus,
    makeRunConfig,
    median,
    percentChangeFromRatio,
    ratio,
    samplesToMap,
    selectCorpus,
    serializeSummaryCsv,
    standardDeviation,
    summarizeRun
} from "../scripts/benchmark-search-ab-utils.mjs";

const corpus =
    await loadCorpus(
        new URL("../tests/data/search_benchmark_corpus.json", import.meta.url)
    );

function sample(positionId, sampleIndex, label, elapsedMs, extra = {}) {

    return {
        positionId,
        sampleIndex,
        label,
        elapsedMs,
        bestMove: "e2-e4",
        score: "0.10",
        nodes: 12,
        leafNodes: 7,
        completedDepth: 4,
        qsearchEntries: 7,
        pv: ["e2-e4"],
        ...extra
    };

}

test("corpus loading and primary/diagnostic selection are deterministic", () => {

    assert.equal(corpus.schemaVersion, 1);

    const primary =
        selectCorpus(corpus, "primary");

    const diagnostic =
        selectCorpus(corpus, "diagnostic");

    assert.deepEqual(
        primary.map(position => position.id),
        [
            "quiet-defense",
            "tactical-capture",
            "game8",
            "game10",
            "high-branching",
            "quiet-open",
            "capture-rich",
            "queen-rook-mate",
            "kiwipete",
            "promotion-race"
        ]
    );

    assert.ok(
        diagnostic.some(position => position.id === "game4")
    );

    assert.equal(selectCorpus(corpus, "all").length, 18);
    assert.throws(() => selectCorpus(corpus, "nope"), /Unknown corpus/);

});

test("AB/BA order generation is paired and seeded", () => {

    const first =
        generatePairedOrder(5, 1234);

    const second =
        generatePairedOrder(5, 1234);

    assert.deepEqual(first, second);
    assert.equal(first.length, 10);

    for (let index = 0; index < first.length; index += 2) {
        assert.deepEqual(
            new Set([first[index], first[index + 1]]),
            new Set(["baseline", "candidate"])
        );
    }

    for (let index = 2; index < first.length; index += 2) {
        assert.notEqual(first[index], first[index - 2]);
    }

    assert.notDeepEqual(
        generatePairedOrder(5, 1),
        generatePairedOrder(5, 682)
    );

    assert.throws(() => generatePairedOrder(0), /positive integer/);

});

test("statistics helpers calculate expected values", () => {

    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(ratio(100, 97), 0.97);
    assert.ok(Math.abs(percentChangeFromRatio(0.97) + 3) < 1e-12);
    assert.ok(Math.abs(geometricMean([1, 1.21]) - 1.1) < 1e-12);
    assert.equal(geometricMean([]), null);
    assert.equal(geometricMean([1, 0]), null);
    assert.equal(geometricMean([1, -1]), null);
    assert.equal(percentChangeFromRatio(null), null);
    assert.ok(Math.abs(standardDeviation([1, 2, 3]) - Math.sqrt(2 / 3)) < 1e-12);
    assert.equal(standardDeviation([3]), 0);
    assert.ok(coefficientOfVariation([10, 10, 10]) === 0);

});

test("identity comparison reports exact-tree mismatches", () => {

    const baseline =
        sample("x", 0, "baseline", 1);

    assert.equal(
        compareIdentity(baseline, { ...baseline }).ok,
        true
    );

    const changed =
        compareIdentity(
            baseline,
            { ...baseline, nodes: 13, pv: ["d2-d4"] }
        );

    assert.equal(changed.ok, false);
    assert.deepEqual(
        changed.mismatches.map(mismatch => mismatch.field),
        ["nodes", "pv"]
    );

    const missing =
        compareIdentity(
            baseline,
            { ...baseline, qsearchEntries: undefined }
        );

    assert.equal(missing.ok, false);
    assert.equal(missing.mismatches[0].field, "qsearchEntries");

});

test("summarizeRun computes ratios and mismatch state from mocked samples", () => {

    const positions = [
        {
            id: "x",
            description: "mock",
            classification: "primary",
            depth: 4
        }
    ];

    const samples =
        samplesToMap([
            sample("x", 0, "baseline", 100),
            sample("x", 1, "candidate", 95),
            sample("x", 2, "candidate", 97),
            sample("x", 3, "baseline", 101)
        ]);

    const summary =
        summarizeRun(positions, samples);

    assert.equal(summary.identityOk, true);
    assert.equal(summary.positions[0].baseline.median, 100.5);
    assert.equal(summary.positions[0].candidate.median, 96);
    assert.ok(summary.aggregates.primary.geomeanPercent < 0);

    samples.get("x")[1].nodes = 99;

    const mismatch =
        summarizeRun(positions, samples);

    assert.equal(mismatch.identityOk, false);
    assert.equal(mismatch.positions[0].identityOk, false);

    const nonExact =
        summarizeRun(positions, samples, { exact: false });

    assert.equal(nonExact.identityOk, true);

});

test("control and candidate threshold classification are explicit", () => {

    assert.equal(
        classifyControl({ geomeanRatio: 1.004 }).ok,
        true
    );

    assert.equal(
        classifyControl({ geomeanRatio: 1.006 }).status,
        "too-noisy"
    );

    assert.equal(
        classifyCandidate({ geomeanPercent: -1.2 }).ok,
        true
    );

    assert.equal(
        classifyCandidate({ geomeanPercent: -0.4 }).status,
        "insufficient"
    );

});

test("CSV serialization includes per-position summary rows", () => {

    const summary = {
        positions: [
            {
                id: "x",
                classification: "primary",
                depth: 4,
                baseline: { median: 100, coefficientOfVariation: 0.1 },
                candidate: { median: 99, coefficientOfVariation: 0.2 },
                ratio: 0.99,
                percentChange: -1,
                identityOk: true
            }
        ]
    };

    const csv =
        serializeSummaryCsv(summary);

    assert.match(csv, /id,classification,depth/);
    assert.match(csv, /x,primary,4,100,99,0.99,-1,0.1,0.2,true/);

});

test("resume compatibility and double-count prevention use run config", () => {

    const positions =
        selectCorpus(corpus, "primary").slice(0, 2);

    const args = {
        baseline: "a",
        candidate: "b",
        corpus: "primary",
        seed: 1,
        warmups: 5,
        pairs: 10,
        exact: true
    };

    const config =
        makeRunConfig(args, positions);

    assert.equal(
        checkResumeCompatibility({ config }, config).ok,
        true
    );

    assert.equal(
        checkResumeCompatibility(
            { config },
            { ...config, seed: 2 }
        ).ok,
        false
    );

    assert.equal(
        checkResumeCompatibility(
            { config },
            {
                ...config,
                corpusFingerprint: `${config.corpusFingerprint}changed`
            }
        ).ok,
        false
    );

    const samples =
        samplesToMap([
            sample("quiet-defense", 0, "baseline", 1),
            sample("quiet-defense", 0, "baseline", 2)
        ]);

    assert.equal(hasSample(samples, "quiet-defense", 0), true);
    assert.equal(samples.get("quiet-defense").length, 1);

});

test("malformed corpus fails clearly", async () => {

    await assert.rejects(
        loadCorpus(new URL("../tests/benchmark_search_ab.test.mjs", import.meta.url)),
        /Unexpected token|not valid JSON/
    );

});

test("malformed command-line input exits non-zero without running searches", () => {

    const result =
        spawnSync(
            process.execPath,
            [
                "scripts/benchmark-search-ab.mjs",
                "--definitely-not-valid"
            ],
            {
                cwd: new URL("..", import.meta.url),
                encoding: "utf8"
            }
        );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown argument/);

});
