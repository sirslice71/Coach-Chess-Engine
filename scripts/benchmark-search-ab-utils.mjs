import { readFile } from "node:fs/promises";

export const DEFAULT_CONTROL_THRESHOLD = 0.005;
export const DEFAULT_CANDIDATE_THRESHOLD = -0.01;
export const DEFAULT_PROFILE = "full";
export const IDENTITY_MODE_EXACT = "Exact";
export const IDENTITY_MODE_SEARCH_STABLE = "SearchStable";
export const STABILITY_SHORT_PROFILE = "stability-short";
export const STABILITY_SHORT_POSITION_IDS = [
    "quiet-open",
    "tactical-capture",
    "high-branching",
    "promotion-race"
];

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

export function generateAbbaOrder(groups, seed = 1, positionIndex = 0) {

    if (!Number.isInteger(groups) || groups < 1) {
        throw new Error("--groups must be a positive integer.");
    }

    const random =
        createPrng((Number(seed) + positionIndex) >>> 0);

    const baselineFirst =
        (random() < 0.5) !== (positionIndex % 2 === 1);

    const first =
        baselineFirst
            ? ["baseline", "candidate", "candidate", "baseline"]
            : ["candidate", "baseline", "baseline", "candidate"];

    const second =
        baselineFirst
            ? ["candidate", "baseline", "baseline", "candidate"]
            : ["baseline", "candidate", "candidate", "baseline"];

    const order = [];

    for (let index = 0; index < groups; index += 1) {
        order.push(...(index % 2 === 0 ? first : second));
    }

    return order;

}

export function resolveBenchmarkProfile(args = {}) {

    const profile =
        args.profile || DEFAULT_PROFILE;

    switch (profile) {
        case DEFAULT_PROFILE:
            return {
                name: DEFAULT_PROFILE,
                warmups: args.warmups ?? 5,
                pairs: args.pairs ?? 10,
                groups: null,
                positionIds: null,
                aggregation: "median-ratio",
                order: "abba-pairs"
            };

        case STABILITY_SHORT_PROFILE:
            return {
                name: STABILITY_SHORT_PROFILE,
                warmups: args.warmups ?? 2,
                pairs: null,
                groups: args.groups ?? 16,
                positionIds: STABILITY_SHORT_POSITION_IDS,
                aggregation: "paired-log-ratio",
                order: "abba-groups"
            };

        default:
            throw new Error(
                `Unknown benchmark profile "${profile}". Use full or stability-short.`
            );
    }

}

export function selectProfilePositions(positions, profile) {

    if (!profile.positionIds) {
        return positions;
    }

    const byId =
        new Map(positions.map(position => [position.id, position]));

    return profile.positionIds.map(id => {
        const position =
            byId.get(id);

        if (!position) {
            throw new Error(`Profile ${profile.name} requires missing position "${id}".`);
        }

        return position;
    });

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

export function normalizeIdentityMode(mode = IDENTITY_MODE_EXACT) {

    switch (String(mode).toLowerCase()) {
        case "exact":
            return IDENTITY_MODE_EXACT;

        case "searchstable":
        case "search-stable":
        case "search_stable":
            return IDENTITY_MODE_SEARCH_STABLE;

        default:
            throw new Error(
                `Unknown identity mode "${mode}". Use Exact or SearchStable.`
            );
    }

}

function sameValue(left, right) {

    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

}

function scoreToCentipawns(score) {

    if (typeof score === "number" && Number.isFinite(score)) {
        return score;
    }

    if (typeof score !== "string") {
        return null;
    }

    const trimmed =
        score.trim();

    if (/mate/i.test(trimmed)) {
        return null;
    }

    const value =
        Number.parseFloat(trimmed);

    return Number.isFinite(value)
        ? Math.round(value * 100)
        : null;

}

function mateStatus(score) {

    return typeof score === "string" && /mate/i.test(score);

}

function moveLooksLegal(move) {

    return typeof move === "string" &&
        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.replace("-", ""));

}

function pvLooksLegal(pv) {

    return Array.isArray(pv) &&
        pv.every(move => moveLooksLegal(move));

}

function scoreDeltaCp(baseline, candidate) {

    const left =
        scoreToCentipawns(baseline.score);

    const right =
        scoreToCentipawns(candidate.score);

    return Number.isFinite(left) && Number.isFinite(right)
        ? right - left
        : null;

}

export function compareExactIdentity(baseline, candidate) {

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
        if (!sameValue(baseline[field], candidate[field])) {
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

export function compareSearchStableIdentity(
    baseline,
    candidate,
    options = {}
) {

    const scoreToleranceCp =
        options.scoreToleranceCp ?? 0;

    const mismatches = [];
    const expectedTreeDifferences = [];
    const scoreDelta =
        scoreDeltaCp(baseline, candidate);

    if (!moveLooksLegal(candidate.bestMove)) {
        mismatches.push({
            field: "bestMove",
            reason: "Candidate best move is missing or malformed.",
            baseline: baseline.bestMove ?? null,
            candidate: candidate.bestMove ?? null
        });
    }
    else if (!sameValue(baseline.bestMove, candidate.bestMove)) {
        mismatches.push({
            field: "bestMove",
            reason: "Best move differs.",
            baseline: baseline.bestMove ?? null,
            candidate: candidate.bestMove ?? null
        });
    }

    if (mateStatus(baseline.score) !== mateStatus(candidate.score)) {
        mismatches.push({
            field: "mateStatus",
            reason: "Mate status differs.",
            baseline: baseline.score ?? null,
            candidate: candidate.score ?? null
        });
    }
    else if (mateStatus(baseline.score) && !sameValue(baseline.score, candidate.score)) {
        mismatches.push({
            field: "score",
            reason: "Mate score differs.",
            baseline: baseline.score ?? null,
            candidate: candidate.score ?? null
        });
    }
    else if (
        scoreDelta === null ||
        Math.abs(scoreDelta) > scoreToleranceCp
    ) {
        mismatches.push({
            field: "score",
            reason: `Score delta exceeds ${scoreToleranceCp} cp tolerance.`,
            baseline: baseline.score ?? null,
            candidate: candidate.score ?? null,
            deltaCp: scoreDelta
        });
    }

    if (!Number.isInteger(candidate.completedDepth) || candidate.completedDepth < 0) {
        mismatches.push({
            field: "completedDepth",
            reason: "Candidate completed depth is invalid.",
            baseline: baseline.completedDepth ?? null,
            candidate: candidate.completedDepth ?? null
        });
    }
    else if (!sameValue(baseline.completedDepth, candidate.completedDepth)) {
        mismatches.push({
            field: "completedDepth",
            reason: "Completed depth differs.",
            baseline: baseline.completedDepth ?? null,
            candidate: candidate.completedDepth ?? null
        });
    }

    if (!pvLooksLegal(candidate.pv || [])) {
        mismatches.push({
            field: "pv",
            reason: "Candidate PV is malformed.",
            baseline: baseline.pv ?? null,
            candidate: candidate.pv ?? null
        });
    }

    for (const field of ["nodes", "leafNodes", "qsearchEntries", "pv", "rootOrder"]) {
        if (!sameValue(baseline[field], candidate[field])) {
            expectedTreeDifferences.push({
                field,
                baseline: baseline[field] ?? null,
                candidate: candidate[field] ?? null
            });
        }
    }

    return {
        ok: mismatches.length === 0,
        mode: IDENTITY_MODE_SEARCH_STABLE,
        scoreDeltaCp: scoreDelta,
        mismatches,
        expectedTreeDifferences
    };

}

export function compareIdentity(baseline, candidate, options = {}) {

    const mode =
        normalizeIdentityMode(options.identityMode);

    if (mode === IDENTITY_MODE_SEARCH_STABLE) {
        return compareSearchStableIdentity(baseline, candidate, options);
    }

    return {
        ...compareExactIdentity(baseline, candidate),
        mode
    };

}

function deterministicChecks(samples, options = {}) {

    const mode =
        normalizeIdentityMode(options.identityMode);

    if (mode !== IDENTITY_MODE_SEARCH_STABLE) {
        return [];
    }

    const checks = [];

    for (const label of ["baseline", "candidate"]) {
        const runs =
            samples.filter(sample => sample.label === label);

        if (runs.length < 2) {
            continue;
        }

        const reference =
            runs[0];

        for (let index = 1; index < runs.length; index += 1) {
            const comparison =
                compareSearchStableIdentity(reference, runs[index], options);

            if (!comparison.ok) {
                checks.push({
                    label,
                    run: index,
                    mismatches: comparison.mismatches
                });
            }
        }
    }

    return checks;

}

function summarizeTreeDifferences(identityChecks) {

    const differences =
        identityChecks.flatMap(check =>
            check.expectedTreeDifferences || []
        );

    const metricFor = field => {
        const values =
            differences.filter(item =>
                item.field === field &&
                Number.isFinite(item.baseline) &&
                Number.isFinite(item.candidate)
            );

        const baselineTotal =
            values.reduce((sum, item) => sum + item.baseline, 0);

        const candidateTotal =
            values.reduce((sum, item) => sum + item.candidate, 0);

        return {
            changedPairs: values.length,
            baselineTotal,
            candidateTotal,
            delta: candidateTotal - baselineTotal,
            deltaPercent: baselineTotal
                ? percentChangeFromRatio(candidateTotal / baselineTotal)
                : null
        };
    };

    return {
        changed: differences.length > 0,
        nodes: differences.filter(item => item.field === "nodes").length,
        leafNodes: differences.filter(item => item.field === "leafNodes").length,
        qsearchEntries: differences.filter(item => item.field === "qsearchEntries").length,
        pv: differences.filter(item => item.field === "pv").length,
        rootOrder: differences.filter(item => item.field === "rootOrder").length,
        metrics: {
            nodes: metricFor("nodes"),
            leafNodes: metricFor("leafNodes"),
            qsearchEntries: metricFor("qsearchEntries")
        }
    };

}

function aggregateTreeShape(positionsSummary) {

    const metricFor = field => {
        const metrics =
            positionsSummary.map(position =>
                position.treeShape?.metrics?.[field]
            ).filter(Boolean);

        const baselineTotal =
            metrics.reduce((sum, metric) => sum + metric.baselineTotal, 0);

        const candidateTotal =
            metrics.reduce((sum, metric) => sum + metric.candidateTotal, 0);

        return {
            changedPairs: metrics.reduce(
                (sum, metric) => sum + metric.changedPairs,
                0
            ),
            baselineTotal,
            candidateTotal,
            delta: candidateTotal - baselineTotal,
            deltaPercent: baselineTotal
                ? percentChangeFromRatio(candidateTotal / baselineTotal)
                : null
        };
    };

    return {
        changed:
            positionsSummary.some(position =>
                position.treeShape?.changed
            ),
        positionCount:
            positionsSummary.filter(position =>
                position.treeShape?.changed
            ).length,
        pvChanges:
            positionsSummary.reduce(
                (sum, position) => sum + (position.treeShape?.pv || 0),
                0
            ),
        rootOrderChanges:
            positionsSummary.reduce(
                (sum, position) => sum + (position.treeShape?.rootOrder || 0),
                0
            ),
        metrics: {
            nodes: metricFor("nodes"),
            leafNodes: metricFor("leafNodes"),
            qsearchEntries: metricFor("qsearchEntries")
        }
    };

}

export function summarizePosition(position, samples, options = {}) {

    const identityMode =
        normalizeIdentityMode(options.identityMode);

    const exact =
        options.exact !== false;

    const scoreToleranceCp =
        options.scoreToleranceCp ?? 0;

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
            compareIdentity(
                baselineRuns[index],
                candidateRuns[index],
                {
                    identityMode,
                    scoreToleranceCp
                }
            );

        if (!comparison.ok) {
            identityChecks.push({
                pair: index,
                mismatches: comparison.mismatches
            });
        }
        else if (identityMode === IDENTITY_MODE_SEARCH_STABLE) {
            identityChecks.push({
                pair: index,
                mismatches: [],
                scoreDeltaCp: comparison.scoreDeltaCp,
                expectedTreeDifferences: comparison.expectedTreeDifferences
            });
        }
    }

    const repeatabilityChecks =
        deterministicChecks(samples, {
            identityMode,
            scoreToleranceCp
        });

    const failedIdentityChecks =
        identityChecks.filter(check => check.mismatches.length > 0);

    const identityOk =
        !exact
            ? true
            : failedIdentityChecks.length === 0 &&
                repeatabilityChecks.length === 0;

    return {
        id: position.id,
        description: position.description,
        classification: position.classification,
        depth: position.depth,
        baseline: baselineStats,
        candidate: candidateStats,
        ratio: sampleRatio,
        percentChange: percentChangeFromRatio(sampleRatio),
        identityMode,
        scoreToleranceCp,
        identityOk,
        identityChecks,
        repeatabilityOk: repeatabilityChecks.length === 0,
        repeatabilityChecks,
        treeShape: summarizeTreeDifferences(identityChecks),
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

export function summarizePositionWithProfile(
    position,
    samples,
    options = {}
) {

    const exact =
        options.exact !== false;

    const identityMode =
        normalizeIdentityMode(options.identityMode || IDENTITY_MODE_EXACT);

    const profile =
        options.profile || { aggregation: "median-ratio" };

    const summary =
        summarizePosition(position, samples, {
            exact,
            identityMode,
            scoreToleranceCp: options.scoreToleranceCp ?? 0
        });

    if (profile.aggregation !== "paired-log-ratio") {
        return summary;
    }

    const groups =
        pairedLogRatioGroups(samples);

    if (groups.length > 0) {
        const medianLogRatio =
            median(groups.map(group => group.logRatio));

        summary.paired = {
            groups,
            medianLogRatio,
            ratio: Math.exp(medianLogRatio),
            percentChange: percentChangeFromRatio(Math.exp(medianLogRatio))
        };
        summary.ratio = summary.paired.ratio;
        summary.percentChange = summary.paired.percentChange;
    }

    return summary;

}

export function pairedLogRatioGroups(samples) {

    const byGroup =
        new Map();

    for (const sample of samples) {
        const groupIndex =
            sample.groupIndex ?? sample.pairIndex;

        if (groupIndex === null || groupIndex === undefined) {
            continue;
        }

        if (!byGroup.has(groupIndex)) {
            byGroup.set(groupIndex, []);
        }

        byGroup.get(groupIndex).push(sample);
    }

    const groups = [];

    for (const [groupIndex, groupSamples] of byGroup) {
        const baseline =
            groupSamples
                .filter(sample => sample.label === "baseline")
                .map(sample => sample.elapsedMs);

        const candidate =
            groupSamples
                .filter(sample => sample.label === "candidate")
                .map(sample => sample.elapsedMs);

        if (baseline.length < 1 || candidate.length < 1) {
            continue;
        }

        const baselineLogMean =
            arithmeticMean(baseline.map(value => Math.log(value)));

        const candidateLogMean =
            arithmeticMean(candidate.map(value => Math.log(value)));

        const logRatio =
            candidateLogMean - baselineLogMean;

        groups.push({
            groupIndex,
            baselineCount: baseline.length,
            candidateCount: candidate.length,
            baselineGeomeanMs: Math.exp(baselineLogMean),
            candidateGeomeanMs: Math.exp(candidateLogMean),
            logRatio,
            ratio: Math.exp(logRatio),
            percentChange: percentChangeFromRatio(Math.exp(logRatio))
        });
    }

    return groups.sort((left, right) => left.groupIndex - right.groupIndex);

}

export function summarizeRun(positions, samplesByPosition, options = {}) {

    const exact =
        options.exact !== false;

    const identityMode =
        normalizeIdentityMode(options.identityMode || IDENTITY_MODE_EXACT);

    const positionsSummary =
        positions.map(position =>
            summarizePositionWithProfile(
                position,
                samplesByPosition.get(position.id) || [],
                {
                    exact,
                    identityMode,
                    scoreToleranceCp: options.scoreToleranceCp ?? 0,
                    profile: options.profile
                }
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
        treeShape: aggregateTreeShape(positionsSummary),
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
        "aggregation",
        "pairedGroups",
        "pairedMedianLogRatio",
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
            position.paired ? "paired-log-ratio" : "median-ratio",
            position.paired?.groups?.length ?? "",
            position.paired?.medianLogRatio ?? "",
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
        identityMode: normalizeIdentityMode(args.identityMode),
        scoreToleranceCp: args.scoreToleranceCp ?? 0,
        baselineHashMB: args.baselineHashMB ?? null,
        candidateHashMB: args.candidateHashMB ?? null,
        profile: args.profile || DEFAULT_PROFILE,
        groups: args.groups ?? null,
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
