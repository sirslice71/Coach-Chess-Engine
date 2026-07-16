#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
    arithmeticMean,
    median,
    standardDeviation
} from "./benchmark-search-ab-utils.mjs";

export const DEFAULT_CONTROL_LIMIT_PERCENT = 0.5;
export const DEFAULT_ACCEPTED_GAIN_PERCENT = 1.0;
export const DEFAULT_PROMISING_GAIN_PERCENT = 0.7;
export const DEFAULT_DOMINANCE_FRACTION = 0.6;
export const DEFAULT_SEARCH_STABLE_POSITION_REGRESSION_LIMIT_PERCENT = 2.0;

export function parseSummaryArgs(argv) {

    const args = {
        controls: [],
        candidates: []
    };

    let currentSession = "session-1";
    let sessionIndex = 1;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => argv[++index];

        switch (arg) {
            case "--control": {
                const path = value();
                currentSession = `session-${sessionIndex}`;
                args.controls.push({
                    path,
                    session: currentSession
                });
                sessionIndex += 1;
                break;
            }
            case "--candidate":
                args.candidates.push({
                    path: value(),
                    session: currentSession
                });
                break;
            case "--session":
                currentSession = value();
                break;
            case "--help":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;

}

export function printSummaryHelp() {

    console.log(`Usage:
  node scripts/benchmark-search-summary.mjs --control control.json --candidate a.json --candidate b.json [--control control-2.json --candidate c.json]

Controls apply to following candidates until another --control is supplied.
Use --session <name> before --control or --candidate to assign explicit sessions.
`);

}

export async function readBenchmarkReport(path) {

    return JSON.parse(await readFile(path, "utf8"));

}

export function primaryAggregate(report) {

    return report?.summary?.aggregates?.primary || {};

}

export function percentOrNull(value) {

    return Number.isFinite(value)
        ? value
        : null;

}

export function runGainPercent(report) {

    const percent =
        primaryAggregate(report).geomeanPercent;

    return Number.isFinite(percent)
        ? -percent
        : null;

}

export function medianGainPercent(report) {

    const percent =
        primaryAggregate(report).medianPercent;

    return Number.isFinite(percent)
        ? -percent
        : null;

}

export function identityOk(report) {

    return report?.summary?.identityOk === true;

}

export function identityMode(report) {

    return report?.config?.identityMode || "Exact";

}

export function positionGains(report) {

    return (report?.summary?.positions || [])
        .filter(position => Number.isFinite(position.percentChange))
        .map(position => ({
            id: position.id,
            gainPercent: -position.percentChange,
            identityOk: position.identityOk === true
        }));

}

export function summarizeBenchmarkReports(entries, options = {}) {

    const controlLimit =
        options.controlLimitPercent ?? DEFAULT_CONTROL_LIMIT_PERCENT;

    const acceptedGain =
        options.acceptedGainPercent ?? DEFAULT_ACCEPTED_GAIN_PERCENT;

    const promisingGain =
        options.promisingGainPercent ?? DEFAULT_PROMISING_GAIN_PERCENT;

    const dominanceFraction =
        options.dominanceFraction ?? DEFAULT_DOMINANCE_FRACTION;

    const controls =
        entries
            .filter(entry => entry.kind === "control")
            .map((entry, index) => {
                const aggregate =
                    primaryAggregate(entry.report);

                const geomeanPercent =
                    percentOrNull(aggregate.geomeanPercent);

                const medianPercent =
                    percentOrNull(aggregate.medianPercent);

                const gainPercent =
                    runGainPercent(entry.report);

                return {
                    index: index + 1,
                    path: entry.path,
                    session: entry.session,
                    timingDifferencePercent: geomeanPercent,
                    medianTimingDifferencePercent: medianPercent,
                    geomeanPercent,
                    medianPercent,
                    gainPercent,
                    speedGainPercent: gainPercent,
                    withinLimit:
                        Number.isFinite(geomeanPercent) &&
                        Math.abs(geomeanPercent) <= controlLimit,
                    identityOk: identityOk(entry.report)
                };
            });

    const controlBySession =
        new Map(controls.map(control => [control.session, control]));

    const candidates =
        entries
            .filter(entry => entry.kind === "candidate")
            .map((entry, index) => {
                const control =
                    controlBySession.get(entry.session) || null;

                const gainPercent =
                    runGainPercent(entry.report);

                const adjustedGainPercent =
                    control && Number.isFinite(gainPercent) &&
                    Number.isFinite(control.gainPercent)
                        ? gainPercent - control.gainPercent
                        : null;

                const positions =
                    positionGains(entry.report);

                return {
                    index: index + 1,
                    path: entry.path,
                    session: entry.session,
                    controlIndex: control?.index ?? null,
                    timingDifferencePercent:
                        percentOrNull(primaryAggregate(entry.report).geomeanPercent),
                    medianTimingDifferencePercent:
                        percentOrNull(primaryAggregate(entry.report).medianPercent),
                    geomeanGainPercent: gainPercent,
                    speedGainPercent: gainPercent,
                    medianGainPercent: medianGainPercent(entry.report),
                    adjustedGainPercent,
                    identityOk: identityOk(entry.report),
                    identityMode: identityMode(entry.report),
                    treeShape: entry.report?.summary?.treeShape || null,
                    positivePositions:
                        positions.filter(position => position.gainPercent > 0).length,
                    totalPositions: positions.length,
                    positions
                };
            });

    const rawGains =
        candidates
            .map(candidate => candidate.geomeanGainPercent)
            .filter(Number.isFinite);

    const adjustedGains =
        candidates
            .map(candidate => candidate.adjustedGainPercent)
            .filter(Number.isFinite);

    const perPosition =
        summarizePositions(candidates);

    const positiveCandidateRuns =
        candidates.filter(
            candidate => candidate.geomeanGainPercent > 0
        ).length;

    const identityAll =
        candidates.every(candidate => candidate.identityOk);

    const controlsOk =
        controls.length > 0 &&
        controls.every(control => control.withinLimit && control.identityOk);

    const allCandidateRunsPositive =
        candidates.length > 0 &&
        candidates.every(candidate => candidate.geomeanGainPercent > 0);

    const averageAdjustedGain =
        arithmeticMean(adjustedGains);

    const confirmingRuns =
        candidates.filter(
            candidate => candidate.adjustedGainPercent >= acceptedGain
        ).length;

    const inconsistentSigns =
        candidates.some(candidate => candidate.geomeanGainPercent <= 0) &&
        candidates.some(candidate => candidate.geomeanGainPercent > 0);

    const repeatedRegressionPattern =
        perPosition.positions.some(
            position => position.meanGainPercent < 0 &&
                position.negativeRuns >= Math.max(2, candidates.length)
        );

    const searchStableCandidates =
        candidates.filter(candidate =>
            candidate.identityMode === "SearchStable"
        );

    const allCandidatesSearchStable =
        candidates.length > 0 &&
        searchStableCandidates.length === candidates.length;

    const searchStableRegressionLimit =
        options.searchStablePositionRegressionLimitPercent ??
            DEFAULT_SEARCH_STABLE_POSITION_REGRESSION_LIMIT_PERCENT;

    const repeatedRegressionPositions =
        perPosition.positions.filter(
            position => position.meanGainPercent < 0 &&
                position.negativeRuns >= Math.max(2, candidates.length)
        );

    const seriousSearchStableRegressionPattern =
        allCandidatesSearchStable &&
        repeatedRegressionPositions.some(position =>
            position.meanGainPercent <= -searchStableRegressionLimit
        );

    const dominance =
        dominanceAnalysis(perPosition.positions, averageAdjustedGain, {
            acceptedGain,
            dominanceFraction
        });

    let verdict;
    const reasons = [];

    if (!controlsOk) {
        verdict = "rejected";
        reasons.push("At least one applicable control is missing, noisy, or identity-mismatched.");
    }
    else if (!identityAll) {
        verdict = "rejected";
        reasons.push("At least one candidate run has an identity mismatch.");
    }
    else if (candidates.length < 2) {
        verdict = "promising";
        reasons.push("Only one candidate run is available; protocol requires confirmation.");
    }
    else if (inconsistentSigns || !allCandidateRunsPositive) {
        verdict = "rejected";
        reasons.push("Candidate runs have inconsistent or non-positive signs.");
    }
    else if (Number.isFinite(averageAdjustedGain) && averageAdjustedGain < 0) {
        verdict = "rejected";
        reasons.push("Control-adjusted average gain is negative.");
    }
    else if (dominance.dominated) {
        verdict = "rejected";
        reasons.push("Aggregate appears dominated by one position.");
    }
    else if (
        repeatedRegressionPattern &&
        (!allCandidatesSearchStable || seriousSearchStableRegressionPattern)
    ) {
        verdict = "rejected";
        reasons.push(
            allCandidatesSearchStable
                ? `A repeated SearchStable per-position regression exceeded -${searchStableRegressionLimit}% mean speed gain.`
                : "A repeated per-position regression pattern was detected."
        );
    }
    else if (
        averageAdjustedGain >= acceptedGain &&
        confirmingRuns >= 1
    ) {
        verdict = "accepted";
        reasons.push("Controls are stable, all candidate runs are positive and exact, and adjusted gain meets the acceptance threshold.");
    }
    else if (
        averageAdjustedGain >= promisingGain ||
        confirmingRuns >= 1
    ) {
        verdict = "promising";
        reasons.push("Result is positive but does not fully satisfy multi-run acceptance.");
    }
    else {
        verdict = "rejected";
        reasons.push("Adjusted gain is below the promising threshold.");
    }

    return {
        controls,
        candidates,
        rawCandidate: {
            meanGainPercent: arithmeticMean(rawGains),
            medianGainPercent: median(rawGains),
            standardDeviationPercent: standardDeviation(rawGains)
        },
        adjustedCandidate: {
            meanGainPercent: averageAdjustedGain,
            medianGainPercent: median(adjustedGains),
            standardDeviationPercent: standardDeviation(adjustedGains)
        },
        positiveCandidateRuns,
        totalCandidateRuns: candidates.length,
        perPosition,
        dominance,
        identityPolicy: {
            allCandidatesSearchStable,
            searchStablePositionRegressionLimitPercent:
                searchStableRegressionLimit,
            repeatedRegressionPositions,
            seriousSearchStableRegressionPattern
        },
        verdict: {
            status: verdict,
            reasons,
            thresholds: {
                controlLimitPercent: controlLimit,
                acceptedGainPercent: acceptedGain,
                promisingGainPercent: promisingGain,
                dominanceFraction
            }
        },
        adjustmentMethod:
            "Each candidate speed gain is adjusted by subtracting the same-session identical-build control speed gain, where speed gain is defined as -(candidate/baseline geomean percent). Controls apply to following candidates until another control is supplied unless sessions are explicit."
    };

}

function summarizePositions(candidates) {

    const byId =
        new Map();

    for (const candidate of candidates) {
        for (const position of candidate.positions) {
            if (!byId.has(position.id)) {
                byId.set(position.id, []);
            }

            byId.get(position.id).push(position.gainPercent);
        }
    }

    const positions =
        [...byId.entries()]
            .map(([id, gains]) => ({
                id,
                meanGainPercent: arithmeticMean(gains),
                medianGainPercent: median(gains),
                standardDeviationPercent: standardDeviation(gains),
                positiveRuns: gains.filter(gain => gain > 0).length,
                negativeRuns: gains.filter(gain => gain < 0).length,
                runs: gains.length
            }))
            .sort((a, b) => a.id.localeCompare(b.id));

    return {
        positions,
        worstPosition:
            positions.reduce(
                (worst, position) =>
                    !worst || position.meanGainPercent < worst.meanGainPercent
                        ? position
                        : worst,
                null
            ),
        bestPosition:
            positions.reduce(
                (best, position) =>
                    !best || position.meanGainPercent > best.meanGainPercent
                        ? position
                        : best,
                null
            )
    };

}

function dominanceAnalysis(positions, averageAdjustedGain, options = {}) {

    const dominanceFraction =
        options.dominanceFraction ?? DEFAULT_DOMINANCE_FRACTION;

    const acceptedGain =
        options.acceptedGain ?? DEFAULT_ACCEPTED_GAIN_PERCENT;

    if (!positions.length || !Number.isFinite(averageAdjustedGain)) {
        return {
            dominated: false,
            dominantPosition: null,
            fraction: 0
        };
    }

    const positiveTotal =
        positions
            .filter(position => position.meanGainPercent > 0)
            .reduce((sum, position) => sum + position.meanGainPercent, 0);

    if (positiveTotal <= 0) {
        return {
            dominated: false,
            dominantPosition: null,
            fraction: 0
        };
    }

    const dominantPosition =
        positions.reduce(
            (best, position) =>
                !best || position.meanGainPercent > best.meanGainPercent
                    ? position
                    : best,
            null
        );

    const fraction =
        dominantPosition.meanGainPercent / positiveTotal;

    return {
        dominated:
            fraction > dominanceFraction &&
            averageAdjustedGain < acceptedGain * 2,
        dominantPosition,
        fraction
    };

}

export async function loadEntries(args) {

    const entries = [];

    for (const control of args.controls) {
        entries.push({
            kind: "control",
            path: control.path,
            session: control.session,
            report: await readBenchmarkReport(control.path)
        });
    }

    for (const candidate of args.candidates) {
        entries.push({
            kind: "candidate",
            path: candidate.path,
            session: candidate.session,
            report: await readBenchmarkReport(candidate.path)
        });
    }

    entries.sort((left, right) => {
        const order = item => item.kind === "control" ? 0 : 1;
        const sessionCompare =
            left.session.localeCompare(right.session);

        return sessionCompare || order(left) - order(right);
    });

    return entries;

}

export function formatSummary(summary) {

    const lines = [];

    lines.push("Coach benchmark multi-run summary");
    lines.push(`verdict: ${summary.verdict.status}`);
    lines.push("");
    lines.push("Controls:");

    for (const control of summary.controls) {
        lines.push(
            `  #${control.index} ${control.session}: timing difference ${formatTimingDifference(control.timingDifferencePercent)}, median timing difference ${formatTimingDifference(control.medianTimingDifferencePercent)}, control speed gain ${formatSignedPercent(control.speedGainPercent)}, within +/-${summary.verdict.thresholds.controlLimitPercent}%=${control.withinLimit}, identity=${control.identityOk ? "ok" : "mismatch"}`
        );
    }

    lines.push("");
    lines.push("Candidates:");

    for (const candidate of summary.candidates) {
        const control =
            summary.controls.find(item => item.index === candidate.controlIndex);

        lines.push(
            `  #${candidate.index} ${candidate.session}: raw timing difference ${formatTimingDifference(candidate.timingDifferencePercent)}, speed gain ${formatSignedPercent(candidate.speedGainPercent)}, median speed gain ${formatSignedPercent(candidate.medianGainPercent)}, same-session control timing difference ${formatTimingDifference(control?.timingDifferencePercent)}, adjusted speed gain ${formatSignedPercent(candidate.adjustedGainPercent)}, identity=${candidate.identityOk ? "ok" : "mismatch"}, positive positions=${candidate.positivePositions}/${candidate.totalPositions}`
        );
        if (candidate.identityMode !== "Exact") {
            lines.push(
                `     identity mode=${candidate.identityMode}, tree shape=${candidate.treeShape?.changed ? "changed" : "same"}`
            );
        }
    }

    lines.push("");
    lines.push(
        `raw candidate speed gain mean/median/sd: ${formatSignedPercent(summary.rawCandidate.meanGainPercent)} / ${formatSignedPercent(summary.rawCandidate.medianGainPercent)} / ${formatPercent(summary.rawCandidate.standardDeviationPercent)}`
    );
    lines.push(
        `adjusted speed gain mean/median/sd: ${formatSignedPercent(summary.adjustedCandidate.meanGainPercent)} / ${formatSignedPercent(summary.adjustedCandidate.medianGainPercent)} / ${formatPercent(summary.adjustedCandidate.standardDeviationPercent)}`
    );
    lines.push(
        `positive candidate runs: ${summary.positiveCandidateRuns}/${summary.totalCandidateRuns}`
    );

    if (summary.perPosition.worstPosition) {
        lines.push(
            `worst position speed gain: ${summary.perPosition.worstPosition.id} ${formatSignedPercent(summary.perPosition.worstPosition.meanGainPercent)}`
        );
    }

    if (summary.perPosition.bestPosition) {
        lines.push(
            `best position speed gain: ${summary.perPosition.bestPosition.id} ${formatSignedPercent(summary.perPosition.bestPosition.meanGainPercent)}`
        );
    }

    if (summary.dominance.dominantPosition) {
        lines.push(
            `dominance: ${summary.dominance.dominantPosition.id} contributes ${(summary.dominance.fraction * 100).toFixed(1)}% of positive per-position mean gain; dominated=${summary.dominance.dominated}`
        );
    }

    if (
        summary.identityPolicy.allCandidatesSearchStable &&
        summary.identityPolicy.repeatedRegressionPositions.length > 0 &&
        !summary.identityPolicy.seriousSearchStableRegressionPattern
    ) {
        lines.push(
            `SearchStable repeated regressions: reported as caution; none exceeded -${summary.identityPolicy.searchStablePositionRegressionLimitPercent}% mean speed gain.`
        );
    }

    lines.push("");
    lines.push("Reasons:");
    for (const reason of summary.verdict.reasons) {
        lines.push(`  - ${reason}`);
    }
    lines.push("");
    lines.push(`Adjustment: ${summary.adjustmentMethod}`);

    return `${lines.join("\n")}\n`;

}

function formatPercent(value) {

    return Number.isFinite(value)
        ? `${value.toFixed(3)}%`
        : "unavailable";

}

function formatSignedPercent(value) {

    return Number.isFinite(value)
        ? `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`
        : "unavailable";

}

function formatTimingDifference(value) {

    if (!Number.isFinite(value)) {
        return "unavailable";
    }

    if (value < 0) {
        return `${Math.abs(value).toFixed(3)}% faster`;
    }

    if (value > 0) {
        return `${value.toFixed(3)}% slower`;
    }

    return "0.000% neutral";

}

async function main() {

    const args =
        parseSummaryArgs(process.argv.slice(2));

    if (args.help) {
        printSummaryHelp();
        return 0;
    }

    if (args.controls.length < 1) {
        throw new Error("Provide at least one --control JSON file.");
    }

    if (args.candidates.length < 1) {
        throw new Error("Provide at least one --candidate JSON file.");
    }

    const entries =
        await loadEntries(args);

    const summary =
        summarizeBenchmarkReports(entries);

    console.log(formatSummary(summary));

    return summary.verdict.status === "rejected"
        ? 2
        : 0;

}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
        .then(code => {
            process.exitCode = code;
        })
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
