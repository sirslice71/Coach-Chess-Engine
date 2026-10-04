#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/select-stable-candidates.mjs " +
        "--triage <fen-triage.json> [--analysis <results.json>] [--out <dir>] " +
        "[--confirmed-child-search <reference-child-search.json>] " +
        "[--min-diff <cp>] [--min-band <cp>] [--max-top-ties <n>] " +
        "[--max-mate-rows <n>] [--require-ref-disagree]"
    );
}

function parseArgs(argv) {
    const args = {
        triage: null,
        analysis: null,
        confirmedChildSearch: null,
        out: null,
        minDiff: 150,
        minBand: 50,
        maxTopTies: 3,
        maxMateRows: 0,
        requireRefDisagree: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--triage") {
            args.triage = argv[++index];
        }
        else if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--confirmed-child-search") {
            args.confirmedChildSearch = argv[++index];
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-band") {
            args.minBand = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-top-ties") {
            args.maxTopTies = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-mate-rows") {
            args.maxMateRows = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--require-ref-disagree") {
            args.requireRefDisagree = true;
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.triage) {
        throw new Error("Missing --triage");
    }

    for (const [name, value] of [
        ["--min-diff", args.minDiff],
        ["--min-band", args.minBand],
        ["--max-top-ties", args.maxTopTies],
        ["--max-mate-rows", args.maxMateRows]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    return args;
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

function buildAnalysisMap(analysis) {
    const byKey = new Map();
    const byFen = new Map();

    for (const position of analysis?.positions || []) {
        byKey.set(keyFor(position.label, position.fen), position);

        if (!byFen.has(position.fen)) {
            byFen.set(position.fen, []);
        }

        byFen.get(position.fen).push(position);
    }

    return { byKey, byFen };
}

function buildConfirmedChildMap(confirmedChildSearch) {
    const byKey = new Map();
    const byFen = new Map();

    for (const row of confirmedChildSearch?.rows || []) {
        byKey.set(keyFor(row.label, row.fen), row);

        if (!byFen.has(row.fen)) {
            byFen.set(row.fen, []);
        }

        byFen.get(row.fen).push(row);
    }

    return { byKey, byFen };
}

function matchingAnalysis(item, maps) {
    if (!maps) {
        return null;
    }

    return maps.byKey.get(keyFor(item.label, item.fen)) ||
        (maps.byFen.get(item.fen) || [])[0] ||
        null;
}

function matchingConfirmedChild(item, maps) {
    if (!maps) {
        return null;
    }

    return maps.byKey.get(keyFor(item.label, item.fen)) ||
        (maps.byFen.get(item.fen) || [])[0] ||
        null;
}

function deepestSummary(item) {
    const deepest = item.depths?.at(-1) || null;

    if (!deepest) {
        return null;
    }

    return {
        depth: deepest.depth,
        best: deepest.best,
        band: deepest.classification?.topBandCp ?? null,
        topTies: deepest.classification?.topTieCount ?? null,
        mateRows: deepest.classification?.mateCount ?? null,
        kind: deepest.classification?.kind ?? null
    };
}

function rejectionReasons(args, triageItem, analysisPosition, deepest, confirmedChild) {
    const reasons = [];

    if (triageItem.classification !== "candidate-review") {
        reasons.push(`class=${triageItem.classification}`);
    }

    if (!deepest || deepest.kind !== "spread") {
        reasons.push(`deepest=${deepest?.kind ?? "missing"}`);
    }

    if (deepest?.band === null || deepest?.band < args.minBand) {
        reasons.push(`band<${args.minBand}`);
    }

    if (deepest?.topTies === null || deepest?.topTies > args.maxTopTies) {
        reasons.push(`topTies>${args.maxTopTies}`);
    }

    if (deepest?.mateRows === null || deepest?.mateRows > args.maxMateRows) {
        reasons.push(`mateRows>${args.maxMateRows}`);
    }

    if (analysisPosition) {
        const diff = absoluteDiff(analysisPosition);

        if (diff === null || diff < args.minDiff) {
            reasons.push(`diff<${args.minDiff}`);
        }

        if (
            args.requireRefDisagree &&
            analysisPosition.comparison?.bestMoveAgree !== false
        ) {
            reasons.push("refMoveAgrees");
        }
    }
    else if (args.analysis) {
        reasons.push("missingAnalysis");
    }

    if (args.confirmedChildSearch) {
        if (!confirmedChild) {
            reasons.push("missingConfirmedChild");
        }
        else if (!confirmedChild.keep) {
            const suffix =
                (confirmedChild.reasons || []).length > 0
                    ? `:${confirmedChild.reasons.join("+")}`
                    : "";

            reasons.push(`confirmedChildRejected${suffix}`);
        }
    }

    return reasons;
}

function candidateScore(candidate) {
    const diff = candidate.diffCp ?? 0;
    const band = candidate.deepest.band ?? 0;
    const tiePenalty = (candidate.deepest.topTies ?? 0) * 25;

    return diff + band - tiePenalty;
}

function selectCandidates(args, triage, analysis, confirmedChildSearch) {
    const maps = analysis ? buildAnalysisMap(analysis) : null;
    const confirmedMaps =
        confirmedChildSearch ? buildConfirmedChildMap(confirmedChildSearch) : null;
    const kept = [];
    const rejected = [];

    for (const item of triage.results || []) {
        const analysisPosition = matchingAnalysis(item, maps);
        const confirmedChild = matchingConfirmedChild(item, confirmedMaps);
        const deepest = deepestSummary(item);
        const reasons =
            rejectionReasons(args, item, analysisPosition, deepest, confirmedChild);
        const diffCp = analysisPosition ? absoluteDiff(analysisPosition) : null;

        const record = {
            label: item.label,
            fen: item.fen,
            triageClass: item.classification,
            deepest,
            diffCp,
            coachBest: analysisPosition?.coach?.bestMove ?? null,
            referenceBest: analysisPosition?.reference?.bestMove ?? null,
            bestMoveAgree: analysisPosition?.comparison?.bestMoveAgree ?? null,
            coachScore: analysisPosition?.coach?.score ?? null,
            referenceScore: analysisPosition?.reference?.score ?? null,
            confirmedChild: confirmedChild
                ? {
                    keep: confirmedChild.keep,
                    reasons: confirmedChild.reasons || [],
                    gapCp: confirmedChild.gapCp ?? null,
                    coachMove: confirmedChild.coachMove ?? null,
                    referenceMove: confirmedChild.referenceMove ?? null
                }
                : null,
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

    kept.sort((left, right) => right.score - left.score);
    rejected.sort((left, right) => {
        const leftBand = left.deepest?.band ?? -1;
        const rightBand = right.deepest?.band ?? -1;
        return rightBand - leftBand;
    });

    return { kept, rejected };
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
        "# Stable Coach Candidate Selector",
        "",
        `- Triage: \`${args.triage}\``,
        `- Analysis: ${args.analysis ? `\`${args.analysis}\`` : "n/a"}`,
        `- Confirmed child-search: ${args.confirmedChildSearch ? `\`${args.confirmedChildSearch}\`` : "n/a"}`,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Minimum deepest band: ${args.minBand}cp`,
        `- Maximum top ties: ${args.maxTopTies}`,
        `- Maximum mate rows: ${args.maxMateRows}`,
        `- Require reference best-move disagreement: ${args.requireRefDisagree ? "yes" : "no"}`,
        `- Stable candidates: ${payload.summary.stableCandidates}`,
        `- Rejected: ${payload.summary.rejected}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "## Stable Candidates",
        "",
        "| Rank | Label | Diff | Coach | Ref | Child gap | D | Band | Ties | Mate rows | FEN |",
        "| ---: | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"
    ];

    for (const [index, item] of payload.stableCandidates.entries()) {
        lines.push([
            index + 1,
            escapeMarkdown(item.label),
            item.diffCp ?? "",
            item.coachBest
                ? `${item.coachBest} ${scoreText(item.coachScore)}`
                : "n/a",
            item.referenceBest
                ? `${item.referenceBest} ${scoreText(item.referenceScore)}`
                : "n/a",
            item.confirmedChild?.gapCp ?? "",
            item.deepest?.depth ?? "",
            item.deepest?.band ?? "",
            item.deepest?.topTies ?? "",
            item.deepest?.mateRows ?? "",
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    lines.push(
        "",
        "## Top Rejections",
        "",
        "| Label | Class | D | Band | Ties | Mate rows | Child gap | Reasons | FEN |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |"
    );

    for (const item of payload.rejected.slice(0, 40)) {
        lines.push([
            escapeMarkdown(item.label),
            item.triageClass,
            item.deepest?.depth ?? "",
            item.deepest?.band ?? "",
            item.deepest?.topTies ?? "",
            item.deepest?.mateRows ?? "",
            item.confirmedChild?.gapCp ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const triage = readJson(args.triage);
    const analysis = args.analysis ? readJson(args.analysis) : null;
    const confirmedChildSearch =
        args.confirmedChildSearch ? readJson(args.confirmedChildSearch) : null;
    const { kept, rejected } =
        selectCandidates(args, triage, analysis, confirmedChildSearch);

    const rejectionCounts = countsBy(
        rejected.flatMap(item => item.reasons),
        reason => reason
    );

    const payload = {
        args,
        summary: {
            triagePositions: (triage.results || []).length,
            stableCandidates: kept.length,
            rejected: rejected.length,
            rejectionCounts
        },
        stableCandidates: kept,
        rejected
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "stable-candidates.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "stable-candidates.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Selected ${kept.length} stable candidate(s) from ` +
        `${payload.summary.triagePositions} triaged position(s).`
    );

    for (const item of kept.slice(0, 10)) {
        console.log(
            `KEEP ${item.label}: diff=${item.diffCp ?? "n/a"}cp, ` +
            `band=${item.deepest?.band ?? "n/a"}, ties=${item.deepest?.topTies ?? "n/a"}, ` +
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
