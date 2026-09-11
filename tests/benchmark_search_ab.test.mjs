import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    checkResumeCompatibility,
    classifyCandidate,
    classifyControl,
    coefficientOfVariation,
    compareIdentity,
    compareSearchStableIdentity,
    generateAbbaOrder,
    generatePairedOrder,
    geometricMean,
    hasSample,
    IDENTITY_MODE_EXACT,
    IDENTITY_MODE_SEARCH_STABLE,
    loadCorpus,
    makeRunConfig,
    median,
    pairedLogRatioGroups,
    percentChangeFromRatio,
    ratio,
    resolveBenchmarkProfile,
    samplesToMap,
    selectProfilePositions,
    selectCorpus,
    serializeSummaryCsv,
    standardDeviation,
    STABILITY_SHORT_POSITION_IDS,
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

    assert.equal(selectCorpus(corpus, "all").length, 21);
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

test("stability-short profile is explicit and deterministic", () => {

    const full =
        resolveBenchmarkProfile({});

    assert.equal(full.name, "full");
    assert.equal(full.warmups, 5);
    assert.equal(full.pairs, 10);

    const short =
        resolveBenchmarkProfile({ profile: "stability-short" });

    assert.equal(short.name, "stability-short");
    assert.equal(short.warmups, 2);
    assert.equal(short.groups, 16);
    assert.deepEqual(short.positionIds, STABILITY_SHORT_POSITION_IDS);

    const positions =
        selectProfilePositions(selectCorpus(corpus, "primary"), short);

    assert.deepEqual(
        positions.map(position => position.id),
        [
            "quiet-open",
            "tactical-capture",
            "high-branching",
            "promotion-race"
        ]
    );

    assert.throws(
        () => resolveBenchmarkProfile({ profile: "mystery" }),
        /Unknown benchmark profile/
    );

});

test("ABBA order rotates deterministically across positions", () => {

    const first =
        generateAbbaOrder(3, 260716, 0);

    const second =
        generateAbbaOrder(3, 260716, 0);

    const rotated =
        generateAbbaOrder(3, 260716, 1);

    assert.deepEqual(first, second);
    assert.equal(first.length, 12);

    for (let index = 0; index < first.length; index += 4) {
        assert.deepEqual(
            new Set(first.slice(index, index + 4)),
            new Set(["baseline", "candidate"])
        );
        assert.equal(
            first.slice(index, index + 4).filter(label => label === "baseline").length,
            2
        );
    }

    assert.notDeepEqual(first.slice(0, 4), first.slice(4, 8));
    assert.notDeepEqual(first, rotated);
    assert.throws(() => generateAbbaOrder(0), /positive integer/);

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

test("SearchStable identity accepts intentional tree-shape differences", () => {

    const baseline =
        sample("x", 0, "baseline", 1);

    const candidate = {
        ...baseline,
        label: "candidate",
        nodes: 8,
        leafNodes: 5,
        qsearchEntries: 5,
        pv: ["e2-e4", "e7-e5"]
    };

    const comparison =
        compareSearchStableIdentity(baseline, candidate);

    assert.equal(comparison.ok, true);
    assert.equal(comparison.expectedTreeDifferences.length, 4);
    assert.equal(comparison.scoreDeltaCp, 0);

});

test("SearchStable identity rejects unstable or tactically meaningful fields", () => {

    const baseline =
        sample("x", 0, "baseline", 1);

    assert.equal(
        compareSearchStableIdentity(
            baseline,
            { ...baseline, bestMove: "d2-d4" }
        ).ok,
        false
    );

    assert.equal(
        compareSearchStableIdentity(
            baseline,
            { ...baseline, score: "0.11" }
        ).ok,
        false
    );

    assert.equal(
        compareSearchStableIdentity(
            baseline,
            { ...baseline, score: "0.11" },
            { scoreToleranceCp: 1 }
        ).ok,
        true
    );

    assert.equal(
        compareSearchStableIdentity(
            { ...baseline, score: "mate 2" },
            { ...baseline, score: "0.10" },
            { scoreToleranceCp: 1000 }
        ).ok,
        false
    );

    assert.equal(
        compareSearchStableIdentity(
            baseline,
            { ...baseline, pv: ["not-a-move"] }
        ).ok,
        false
    );

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

test("summarizeRun keeps Exact as default and gates SearchStable explicitly", () => {

    const positions = [
        {
            id: "x",
            description: "mock",
            classification: "primary",
            depth: 4
        }
    ];

    const treeChanged =
        samplesToMap([
            sample("x", 0, "baseline", 100),
            sample("x", 1, "candidate", 95, {
                nodes: 99,
                leafNodes: 44,
                qsearchEntries: 44,
                pv: ["e2-e4", "e7-e5"]
            }),
            sample("x", 2, "candidate", 96, {
                nodes: 99,
                leafNodes: 44,
                qsearchEntries: 44,
                pv: ["e2-e4", "e7-e5"]
            }),
            sample("x", 3, "baseline", 101)
        ]);

    const exact =
        summarizeRun(positions, treeChanged);

    assert.equal(exact.positions[0].identityMode, IDENTITY_MODE_EXACT);
    assert.equal(exact.identityOk, false);

    const stable =
        summarizeRun(positions, treeChanged, {
            identityMode: IDENTITY_MODE_SEARCH_STABLE
        });

    assert.equal(stable.positions[0].identityMode, IDENTITY_MODE_SEARCH_STABLE);
    assert.equal(stable.identityOk, true);
    assert.equal(stable.positions[0].treeShape.changed, true);

    treeChanged.get("x")[1].score = "0.12";

    const scoreMismatch =
        summarizeRun(positions, treeChanged, {
            identityMode: IDENTITY_MODE_SEARCH_STABLE,
            scoreToleranceCp: 1
        });

    assert.equal(scoreMismatch.identityOk, false);

    const nondeterministic =
        samplesToMap([
            sample("x", 0, "baseline", 100),
            sample("x", 1, "candidate", 95),
            sample("x", 2, "candidate", 96, { score: "0.11" }),
            sample("x", 3, "baseline", 101)
        ]);

    assert.equal(
        summarizeRun(positions, nondeterministic, {
            identityMode: IDENTITY_MODE_SEARCH_STABLE
        }).identityOk,
        false
    );

});

test("paired log-ratio aggregation preserves raw timing sign", () => {

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
            sample("x", 0, "baseline", 100, { groupIndex: 0 }),
            sample("x", 1, "candidate", 90, { groupIndex: 0 }),
            sample("x", 2, "candidate", 90, { groupIndex: 0 }),
            sample("x", 3, "baseline", 100, { groupIndex: 0 }),
            sample("x", 4, "candidate", 110, { groupIndex: 1 }),
            sample("x", 5, "baseline", 100, { groupIndex: 1 }),
            sample("x", 6, "baseline", 100, { groupIndex: 1 }),
            sample("x", 7, "candidate", 110, { groupIndex: 1 })
        ]);

    const groups =
        pairedLogRatioGroups(samples.get("x"));

    assert.equal(groups.length, 2);
    assert.ok(groups[0].percentChange < 0);
    assert.ok(groups[1].percentChange > 0);

    const summary =
        summarizeRun(positions, samples, {
            profile: { aggregation: "paired-log-ratio" }
        });

    assert.ok(Math.abs(summary.positions[0].paired.medianLogRatio) < 0.006);
    assert.ok(Math.abs(summary.aggregates.primary.geomeanPercent) < 0.6);

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
        "candidate run: inconclusive"
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
    assert.match(csv, /aggregation,pairedGroups,pairedMedianLogRatio/);
    assert.match(csv, /x,primary,4,100,99,0.99,-1,median-ratio,,,0.1,0.2,true/);

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
        baselineHashMB: 32,
        candidateHashMB: 128,
        exact: true
    };

    const config =
        makeRunConfig(args, positions);

    assert.equal(config.baselineHashMB, 32);
    assert.equal(config.candidateHashMB, 128);

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

test("benchmark timeout preserves partial JSON output", async () => {

    const dir =
        await mkdtemp(join(tmpdir(), "coach-benchmark-timeout-"));

    try {
        const corpusPath =
            join(dir, "corpus.json");

        const jsonPath =
            join(dir, "partial.json");

        await writeFile(
            corpusPath,
            JSON.stringify({
                schemaVersion: 1,
                positions: [
                    {
                        id: "tiny",
                        description: "tiny timeout fixture",
                        classification: "primary",
                        fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1",
                        depth: 1
                    }
                ]
            })
        );

        const result =
            spawnSync(
                process.execPath,
                [
                    "scripts/benchmark-search-ab.mjs",
                    "--baseline",
                    ".",
                    "--candidate",
                    ".",
                    "--control",
                    "--corpus-file",
                    corpusPath,
                    "--warmups",
                    "0",
                    "--pairs",
                    "20",
                    "--max-run-ms",
                    "1",
                    "--json",
                    jsonPath
                ],
                {
                    cwd: new URL("..", import.meta.url),
                    encoding: "utf8"
                }
            );

        assert.equal(result.status, 4, result.stderr || result.stdout);

        const report =
            JSON.parse(await readFile(jsonPath, "utf8"));

        assert.equal(report.timeout.timedOut, true);
        assert.equal(report.timeout.maxRunMs, 1);
        assert.equal(report.profile.name, "full");
        assert.ok(report.samples.length < 40);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }

});
