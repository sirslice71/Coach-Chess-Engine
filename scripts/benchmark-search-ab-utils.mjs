import { readFile } from "node:fs/promises";

export const DEFAULT_CONTROL_THRESHOLD = 0.005;
export const DEFAULT_CANDIDATE_THRESHOLD = -0.01;

export function createPrng(seed) {

    let state =
        Number(seed) >>> 0;

    return () => {
        state =
            (Math.imul(1664525, state) + 1013904223) >>> 0;

        return state / 4294967296;
    };

}

export async function loadCorpus(path) {

    const corpus =
        JSON.parse(await readFile(path, "utf8"));

    if (!Array.isArray(corpus.positions)) {
        throw new Error("Benchmark corpus must contain a positions array.");
    }

    return corpus;

}

export function selectCorpus(corpus, selection = "primary") {

    switch (selection) {
        case "primary":
            return corpus.positions.filter(
                position => position.classification === "primary"
            );

        case "diagnostic":
            return corpus.positions.filter(
                position => position.classification === "diagnostic"
            );

        case "all":
            return [...corpus.positions];

        default:
            throw new Error(
                `Unknown corpus selection "${selection}". Use primary, diagnostic, or all.`
            );
    }

}

export function generatePairedOrder(pairs, seed = 1) {

    if (!Number.isInteger(pairs) || pairs < 1) {
        throw new Error("--pairs must be a positive integer.");
    }

    const random =
        createPrng(seed);

    const order = [];
    let baselineFirst =
        random() < 0.5;

    for (let index = 0; index < pairs; index += 1) {
        if (baselineFirst) {
            order.push("baseline", "candidate");
        }
        else {
            order.push("candidate", "baseline");
        }

        baselineFirst =
            !baselineFirst;
    }

    return order;

}

export function median(values) {

    if (!values.length) {
        return null;
    }

    const sorted =
        [...values].sort((a, b) => a - b);

    const middle =
        Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 1) {
        return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;

}

export function arithmeticMean(values) {

    if (!values.length) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;

}

export function standardDeviation(values) {

    if (values.length < 2) {
        return 0;
    }

    const mean =
        arithmeticMean(values);

    const variance =
        values.reduce(
            (sum, value) => sum + ((value - mean) ** 2),
            0
        ) / values.length;

    return Math.sqrt(variance);

}

export function coefficientOfVariation(values) {

    const mean =
        arithmeticMean(values);

    if (!mean) {
        return 0;
    }

    return standardDeviation(values) / mean;

}

export function geometricMean(values) {

    if (!values.length) {
        return null;
    }

    if (!values.every(value => Number.isFinite(value) && value > 0)) {
        return null;
    }

    return Math.exp(
        values.reduce((sum, value) => sum + Math.log(value), 0) /
        values.length
    );

}

export function percentChangeFromRatio(ratio) {

    if (!Number.isFinite(ratio)) {
        return null;
    }

    return (ratio - 1) * 100;

}

export function ratio(baseline, candidate) {

    if (!baseline) {
        return null;
    }

    return candidate / baseline;

}

export function summarizeSamples(samples) {

    return {
        samples,
        count: samples.length,
        median: median(samples),
        min: samples.length ? Math.min(...samples) : null,
        max: samples.length ? Math.max(...samples) : null,
        standardDeviation: standardDeviation(samples),
        coefficientOfVariation: coefficientOfVariation(samples)
    };

}

export function compareIdentity(baseline, candidate) {

    const fields = [
        "bestMove",
        "score",
        "nodes",
        "leafNodes",
        "completedDepth",
        "qsearchEntries",
        "pv"
    ];

    const mismatches = [];

    for (const field of fields) {
        if (JSON.stringify(baseline[field] ?? null) !==
            JSON.stringify(candidate[field] ?? null)) {
            mismatches.push({
                field,
                baseline: baseline[field] ?? null,
                candidate: candidate[field] ?? null
            });
        }
    }

    return {
        ok: mismatches.length === 0,
        mismatches
    };

}

export function summarizePosition(position, samples, exact = true) {

    const baselineRuns =
        samples.filter(sample => sample.label === "baseline");

    const candidateRuns =
        samples.filter(sample => sample.label === "candidate");

    const baselineTimes =
        baselineRuns.map(sample => sample.elapsedMs);

    const candidateTimes =
        candidateRuns.map(sample => sample.elapsedMs);

    const baselineStats =
        summarizeSamples(baselineTimes);

    const candidateStats =
        summarizeSamples(candidateTimes);

    const sampleRatio =
        ratio(baselineStats.median, candidateStats.median);

    const identityChecks = [];

    const comparable =
        Math.min(baselineRuns.length, candidateRuns.length);

    for (let index = 0; index < comparable; index += 1) {
        const comparison =
            compareIdentity(baselineRuns[index], candidateRuns[index]);

        if (!comparison.ok) {
            identityChecks.push({
                pair: index,
                mismatches: comparison.mismatches
            });
        }
    }

    return {
        id: position.id,
        description: position.description,
        classification: position.classification,
        depth: position.depth,
        baseline: baselineStats,
        candidate: candidateStats,
        ratio: sampleRatio,
        percentChange: percentChangeFromRatio(sampleRatio),
        identityOk: !exact || identityChecks.length === 0,
        identityChecks,
        expectedBestMove: position.expectedBestMove || null,
        observed: baselineRuns[0]
            ? {
                bestMove: baselineRuns[0].bestMove,
                score: baselineRuns[0].score,
                nodes: baselineRuns[0].nodes,
                leafNodes: baselineRuns[0].leafNodes,
                completedDepth: baselineRuns[0].completedDepth,
                qsearchEntries: baselineRuns[0].qsearchEntries,
                pv: baselineRuns[0].pv
            }
            : null
    };

}

export function summarizeRun(positions, samplesByPosition, options = {}) {

    const exact =
        options.exact !== false;

    const positionsSummary =
        positions.map(position =>
            summarizePosition(
                position,
                samplesByPosition.get(position.id) || [],
                exact
            )
        );

    const aggregateFor = classification => {
        const selected =
            positionsSummary.filter(
                position => position.classification === classification &&
                    position.identityOk &&
                    Number.isFinite(position.ratio)
            );

        const ratios =
            selected.map(position => position.ratio);

        const geomeanRatio =
            geometricMean(ratios);

        const medianRatio =
            median(ratios);

        const arithmeticMeanRatio =
            arithmeticMean(ratios);

        return {
            count: selected.length,
            geomeanRatio,
            geomeanPercent: percentChangeFromRatio(geomeanRatio),
            medianRatio,
            medianPercent: percentChangeFromRatio(medianRatio),
            arithmeticMeanRatio,
            arithmeticMeanPercent: percentChangeFromRatio(arithmeticMeanRatio)
        };
    };

    return {
        positions: positionsSummary,
        aggregates: {
            primary: aggregateFor("primary"),
            diagnostic: aggregateFor("diagnostic")
        },
        identityOk:
            positionsSummary.every(position => position.identityOk)
    };

}

export function classifyControl(aggregate, threshold = DEFAULT_CONTROL_THRESHOLD) {

    const ratioValue =
        aggregate.geomeanRatio;

    if (!Number.isFinite(ratioValue)) {
        return {
            ok: false,
            status: "unavailable",
            message: "Control aggregate is unavailable."
        };
    }

    const bias =
        Math.abs(ratioValue - 1);

    return {
        ok: bias <= threshold,
        status: bias <= threshold ? "stable" : "too-noisy",
        bias,
        threshold,
        message: bias <= threshold
            ? "Identical-build control is within the noise threshold."
            : "Identical-build control is outside the noise threshold."
    };

}

export function classifyCandidate(
    aggregate,
    threshold = DEFAULT_CANDIDATE_THRESHOLD
) {

    const percent =
        aggregate.geomeanPercent;

    if (!Number.isFinite(percent)) {
        return {
            ok: false,
            status: "unavailable",
            message: "Candidate aggregate is unavailable."
        };
    }

    return {
        ok: percent <= threshold * 100,
        status: percent <= threshold * 100
            ? "candidate run: promising; confirmation required"
            : percent < 0
                ? "candidate run: inconclusive"
                : "candidate run: negative",
        threshold,
        message: percent <= threshold * 100
            ? "Single run exceeds the configured improvement threshold, but protocol acceptance requires independent confirmation."
            : percent < 0
                ? "Single run is faster but does not meet the configured single-run improvement threshold."
                : "Single run is not faster than the baseline."
    };

}

export function serializeSummaryCsv(summary) {

    const header = [
        "id",
        "classification",
        "depth",
        "baselineMedianMs",
        "candidateMedianMs",
        "ratio",
        "percentChange",
        "baselineCv",
        "candidateCv",
        "identityOk"
    ];

    const rows =
        summary.positions.map(position => [
            position.id,
            position.classification,
            position.depth,
            position.baseline.median,
            position.candidate.median,
            position.ratio,
            position.percentChange,
            position.baseline.coefficientOfVariation,
            position.candidate.coefficientOfVariation,
            position.identityOk
        ]);

    return [header, ...rows]
        .map(row => row.map(csvCell).join(","))
        .join("\n") + "\n";

}

function csvCell(value) {

    if (value === null || value === undefined) {
        return "";
    }

    const text =
        String(value);

    if (!/[",\n]/.test(text)) {
        return text;
    }

    return `"${text.replaceAll("\"", "\"\"")}"`;

}

export function makeRunConfig(args, corpusPositions) {

    return {
        baseline: args.baseline,
        candidate: args.candidate,
        corpusSelection: args.corpus,
        seed: args.seed,
        warmups: args.warmups,
        pairs: args.pairs,
        exact: args.exact,
        positionIds: corpusPositions.map(position => position.id),
        corpusFingerprint: corpusFingerprint(corpusPositions),
        buildIdentity: args.buildIdentity || null
    };

}

export function corpusFingerprint(corpusPositions) {

    return JSON.stringify(
        corpusPositions.map(position => ({
            id: position.id,
            fen: position.fen,
            depth: position.depth,
            classification: position.classification
        }))
    );

}

export function checkResumeCompatibility(existing, next) {

    const left =
        JSON.stringify(existing.config);

    const right =
        JSON.stringify(next);

    if (left !== right) {
        return {
            ok: false,
            reason: "Checkpoint configuration does not match this run."
        };
    }

    return {
        ok: true,
        reason: null
    };

}

export function sampleKey(positionId, sampleIndex) {

    return `${positionId}#${sampleIndex}`;

}

export function hasSample(samplesByPosition, positionId, sampleIndex) {

    return (samplesByPosition.get(positionId) || [])
        .some(sample => sample.sampleIndex === sampleIndex);

}

export function samplesToMap(samples = []) {

    const map =
        new Map();

    for (const sample of samples) {
        if (!map.has(sample.positionId)) {
            map.set(sample.positionId, []);
        }

        const bucket =
            map.get(sample.positionId);

        if (!bucket.some(existing => existing.sampleIndex === sample.sampleIndex)) {
            bucket.push(sample);
        }
    }

    return map;

}

export function mapToSamples(samplesByPosition) {

    return [...samplesByPosition.values()].flat();

}
