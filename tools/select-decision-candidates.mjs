#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/select-decision-candidates.mjs " +
        "--analysis <coach-analysis-lab results.json> " +
        "[--confirmed-child-search <reference-child-search.json>] " +
        "[--triage <fen-triage.json>] [--out <dir>] " +
        "[--min-diff <cp>] [--min-child-gap <cp>] [--max-ref-rank <n>] " +
        "[--max-root-ties <n>] [--min-band <cp>] [--max-mate-rows <n>] " +
        "[--require-confirmed-child] [--require-label-regex <pattern>] " +
        "[--exclude-label-regex <pattern>] [--first-per-game]"
    );
}

function parseArgs(argv) {
    const args = {
        analysis: null,
        confirmedChildSearch: null,
        triage: null,
        out: null,
        minDiff: 150,
        minChildGap: 100,
        maxRefRank: 16,
        maxRootTies: 3,
        minBand: 50,
        maxMateRows: 0,
        requireConfirmedChild: false,
        requireLabelRegex: null,
        excludeLabelRegex: null,
        firstPerGame: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--confirmed-child-search") {
            args.confirmedChildSearch = argv[++index];
        }
        else if (token === "--triage") {
            args.triage = argv[++index];
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-child-gap") {
            args.minChildGap = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-ref-rank") {
            args.maxRefRank = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-root-ties") {
            args.maxRootTies = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-band") {
            args.minBand = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-mate-rows") {
            args.maxMateRows = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--require-confirmed-child") {
            args.requireConfirmedChild = true;
        }
        else if (token === "--require-label-regex") {
            args.requireLabelRegex = argv[++index];
        }
        else if (token === "--exclude-label-regex") {
            args.excludeLabelRegex = argv[++index];
        }
        else if (token === "--first-per-game") {
            args.firstPerGame = true;
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.analysis) {
        throw new Error("Missing --analysis");
    }

    for (const [name, value] of [
        ["--min-diff", args.minDiff],
        ["--min-child-gap", args.minChildGap],
        ["--max-ref-rank", args.maxRefRank],
        ["--max-root-ties", args.maxRootTies],
        ["--min-band", args.minBand],
        ["--max-mate-rows", args.maxMateRows]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    args.requireLabelPattern =
        args.requireLabelRegex === null ? null : compileRegex(args.requireLabelRegex);
    args.excludeLabelPattern =
        args.excludeLabelRegex === null ? null : compileRegex(args.excludeLabelRegex);

    return args;
}

function compileRegex(pattern) {
    try {
        return new RegExp(pattern);
    }
    catch (error) {
        throw new Error(`Invalid regex ${pattern}: ${error.message}`);
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function keyFor(label, fen) {
    return `${label}\n${fen}`;
}

function absoluteDiff(position) {
    const diff = position.comparison?.evalDiffCp;
    return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function isMateScore(score) {
    return Boolean(score?.isMate) || Math.abs(score?.cp ?? 0) >= MATE_THRESHOLD;
}

function scoreText(score) {
    if (!score) {
        return "n/a";
    }

    if (score.isMate) {
        return score.mateIn === null
            ? `mate-class ${score.cp}`
            : `mate ${score.mateIn}`;
    }

    return `${score.cp}cp`;
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function buildRowMap(rows) {
    const byKey = new Map();
    const byFen = new Map();

    for (const row of rows || []) {
        byKey.set(keyFor(row.label, row.fen), row);

        if (!byFen.has(row.fen)) {
            byFen.set(row.fen, []);
        }

        byFen.get(row.fen).push(row);
    }

    return { byKey, byFen };
}

function matchingRow(item, maps) {
    if (!maps) {
        return null;
    }

    return maps.byKey.get(keyFor(item.label, item.fen)) ||
        (maps.byFen.get(item.fen) || [])[0] ||
        null;
}

function buildTriageRows(triage) {
    return (triage?.results || []).map(item => {
        const deepest = item.depths?.at(-1) || null;

        return {
            label: item.label,
            fen: item.fen,
            triageClass: item.classification,
            deepest: deepest
                ? {
                    depth: deepest.depth,
                    best: deepest.best,
                    kind: deepest.classification?.kind ?? null,
                    band: deepest.classification?.topBandCp ?? null,
                    topTies: deepest.classification?.topTieCount ?? null,
                    mateRows: deepest.classification?.mateCount ?? null
                }
                : null
        };
    });
}

function gameId(label) {
    const match = /^game(\d+)/.exec(label);
    return match ? match[1] : label;
}

function rejectionReasons(args, position, confirmedChild, triageRow) {
    const reasons = [];
    const diffCp = absoluteDiff(position);

    if (args.requireLabelPattern && !args.requireLabelPattern.test(position.label)) {
        reasons.push("labelRequiredMissing");
    }

    if (args.excludeLabelPattern && args.excludeLabelPattern.test(position.label)) {
        reasons.push("labelExcluded");
    }

    if (position.error) {
        reasons.push("analysisError");
    }

    if (!position.coach?.bestMove || !position.reference?.bestMove) {
        reasons.push("missingMove");
    }

    if (position.comparison?.bestMoveAgree !== false) {
        reasons.push("refMoveAgrees");
    }

    if (diffCp === null || diffCp < args.minDiff) {
        reasons.push(`diff<${args.minDiff}`);
    }

    if (isMateScore(position.coach?.score) || isMateScore(position.reference?.score)) {
        reasons.push("mateAnalysisScore");
    }

    if (args.confirmedChildSearch || args.requireConfirmedChild) {
        if (!confirmedChild) {
            reasons.push("missingConfirmedChild");
        }
        else {
            if (!confirmedChild.keep) {
                const suffix =
                    (confirmedChild.reasons || []).length > 0
                        ? `:${confirmedChild.reasons.join("+")}`
                        : "";

                reasons.push(`confirmedChildRejected${suffix}`);
            }

            if (
                confirmedChild.gapCp === null ||
                confirmedChild.gapCp === undefined ||
                confirmedChild.gapCp < args.minChildGap
            ) {
                reasons.push(`childGap<${args.minChildGap}`);
            }

            if (
                confirmedChild.referenceRootRank !== null &&
                confirmedChild.referenceRootRank !== undefined &&
                confirmedChild.referenceRootRank > args.maxRefRank
            ) {
                reasons.push(`refRank>${args.maxRefRank}`);
            }

            if (
                confirmedChild.rootTopTieCount !== null &&
                confirmedChild.rootTopTieCount !== undefined &&
                confirmedChild.rootTopTieCount > args.maxRootTies
            ) {
                reasons.push(`rootTies>${args.maxRootTies}`);
            }

            if ((confirmedChild.reasons || []).includes("mate-root-score")) {
                reasons.push("mateRootScore");
            }
        }
    }

    if (triageRow) {
        if (triageRow.triageClass !== "candidate-review") {
            reasons.push(`triageClass=${triageRow.triageClass}`);
        }

        if (!triageRow.deepest || triageRow.deepest.kind !== "spread") {
            reasons.push(`deepest=${triageRow.deepest?.kind ?? "missing"}`);
        }

        if (
            triageRow.deepest?.band === null ||
            triageRow.deepest?.band === undefined ||
            triageRow.deepest.band < args.minBand
        ) {
            reasons.push(`band<${args.minBand}`);
        }

        if (
            triageRow.deepest?.topTies === null ||
            triageRow.deepest?.topTies === undefined ||
            triageRow.deepest.topTies > args.maxRootTies
        ) {
            reasons.push(`topTies>${args.maxRootTies}`);
        }

        if (
            triageRow.deepest?.mateRows === null ||
            triageRow.deepest?.mateRows === undefined ||
            triageRow.deepest.mateRows > args.maxMateRows
        ) {
            reasons.push(`mateRows>${args.maxMateRows}`);
        }
    }
    else if (args.triage) {
        reasons.push("missingTriage");
    }

    return reasons;
}

function candidateScore(candidate) {
    return (candidate.confirmedChild?.gapCp ?? 0) * 3 +
        (candidate.diffCp ?? 0) +
        (candidate.triage?.deepest?.band ?? 0) -
        (candidate.confirmedChild?.rootTopTieCount ?? 0) * 25 -
        (candidate.confirmedChild?.referenceRootRank ?? 0) * 5;
}

function selectFirstPerGame(candidates) {
    const firstByGame = new Map();

    for (const candidate of candidates) {
        const key = gameId(candidate.label);
        const existing = firstByGame.get(key);

        if (!existing || candidate.inputIndex < existing.inputIndex) {
            firstByGame.set(key, candidate);
        }
    }

    return [...firstByGame.values()]
        .sort((left, right) => left.inputIndex - right.inputIndex);
}

function selectCandidates(args, analysis, confirmedChildSearch, triage) {
    const confirmedMaps =
        confirmedChildSearch ? buildRowMap(confirmedChildSearch.rows) : null;
    const triageMaps =
        triage ? buildRowMap(buildTriageRows(triage)) : null;
    const kept = [];
    const rejected = [];

    for (const [inputIndex, position] of (analysis.positions || []).entries()) {
        const confirmedChild = matchingRow(position, confirmedMaps);
        const triageRow = matchingRow(position, triageMaps);
        const reasons = rejectionReasons(args, position, confirmedChild, triageRow);
        const record = {
            inputIndex,
            label: position.label,
            fen: position.fen,
            diffCp: absoluteDiff(position),
            coachBest: position.coach?.bestMove ?? null,
            referenceBest: position.reference?.bestMove ?? null,
            bestMoveAgree: position.comparison?.bestMoveAgree ?? null,
            coachScore: position.coach?.score ?? null,
            referenceScore: position.reference?.score ?? null,
            confirmedChild: confirmedChild
                ? {
                    keep: confirmedChild.keep,
                    reasons: confirmedChild.reasons || [],
                    gapCp: confirmedChild.gapCp ?? null,
                    coachMove: confirmedChild.coachMove ?? null,
                    referenceMove: confirmedChild.referenceMove ?? null,
                    referenceRootRank: confirmedChild.referenceRootRank ?? null,
                    rootTopTieCount: confirmedChild.rootTopTieCount ?? null
                }
                : null,
            triage: triageRow,
            reasons
        };

        if (reasons.length === 0) {
            kept.push({
                ...record,
                score: candidateScore(record)
            });
        }
        else {
            rejected.push(record);
        }
    }

    const selected = args.firstPerGame
        ? selectFirstPerGame(kept)
        : kept.sort((left, right) => right.score - left.score);

    rejected.sort((left, right) => {
        if ((right.diffCp ?? -1) !== (left.diffCp ?? -1)) {
            return (right.diffCp ?? -1) - (left.diffCp ?? -1);
        }

        return left.inputIndex - right.inputIndex;
    });

    return { kept: selected, rejected, rawKept: kept };
}

function countsBy(items, keyFn) {
    return items.reduce((counts, item) => {
        const key = keyFn(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function formatCounts(counts) {
    return Object.entries(counts)
        .map(([key, count]) => `${key}=${count}`)
        .join(", ");
}

function buildMarkdown(args, payload) {
    const lines = [
        "# Coach Decision Candidate Selector",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Confirmed child-search: ${args.confirmedChildSearch ? `\`${args.confirmedChildSearch}\`` : "n/a"}`,
        `- Triage: ${args.triage ? `\`${args.triage}\`` : "n/a"}`,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Minimum child gap: ${args.minChildGap}cp`,
        `- Maximum reference rank: ${args.maxRefRank}`,
        `- Maximum root ties: ${args.maxRootTies}`,
        `- Label required: ${args.requireLabelRegex ?? "none"}`,
        `- Label excluded: ${args.excludeLabelRegex ?? "none"}`,
        `- First per game: ${args.firstPerGame ? "yes" : "no"}`,
        `- Candidates: ${payload.summary.candidates}`,
        `- Rejected: ${payload.summary.rejected}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "## Candidates",
        "",
        "| Rank | Label | Diff | Coach | Ref | Child gap | Ref rank | Root ties | FEN |",
        "| ---: | --- | ---: | --- | --- | ---: | ---: | ---: | --- |"
    ];

    for (const [index, item] of payload.candidates.entries()) {
        lines.push([
            index + 1,
            escapeMarkdown(item.label),
            item.diffCp ?? "",
            item.coachBest ? `${item.coachBest} ${scoreText(item.coachScore)}` : "n/a",
            item.referenceBest
                ? `${item.referenceBest} ${scoreText(item.referenceScore)}`
                : "n/a",
            item.confirmedChild?.gapCp ?? "",
            item.confirmedChild?.referenceRootRank ?? "",
            item.confirmedChild?.rootTopTieCount ?? "",
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    lines.push(
        "",
        "## Top Rejections",
        "",
        "| Label | Diff | Coach | Ref | Child gap | Reasons | FEN |",
        "| --- | ---: | --- | --- | ---: | --- | --- |"
    );

    for (const item of payload.rejected.slice(0, 60)) {
        lines.push([
            escapeMarkdown(item.label),
            item.diffCp ?? "",
            item.coachBest ?? "",
            item.referenceBest ?? "",
            item.confirmedChild?.gapCp ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const analysis = readJson(args.analysis);
    const confirmedChildSearch =
        args.confirmedChildSearch ? readJson(args.confirmedChildSearch) : null;
    const triage = args.triage ? readJson(args.triage) : null;
    const { kept, rejected, rawKept } =
        selectCandidates(args, analysis, confirmedChildSearch, triage);
    const rejectionCounts = countsBy(
        rejected.flatMap(item => item.reasons),
        reason => reason
    );
    const payload = {
        args: {
            ...args,
            requireLabelPattern: undefined,
            excludeLabelPattern: undefined
        },
        summary: {
            inputPositions: (analysis.positions || []).length,
            rawCandidates: rawKept.length,
            candidates: kept.length,
            rejected: rejected.length,
            rejectionCounts
        },
        candidates: kept,
        rejected
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "decision-candidates.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "decision-candidates.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Selected ${kept.length} decision candidate(s) from ` +
        `${payload.summary.inputPositions} analyzed position(s).`
    );

    for (const item of kept.slice(0, 10)) {
        console.log(
            `KEEP ${item.label}: diff=${item.diffCp ?? "n/a"}cp, ` +
            `gap=${item.confirmedChild?.gapCp ?? "n/a"}cp, ` +
            `${item.coachBest ?? "coach?"} vs ${item.referenceBest ?? "ref?"}`
        );
    }
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
}
