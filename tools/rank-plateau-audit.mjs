#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/rank-plateau-audit.mjs " +
        "--analysis <coach-analysis-lab results.json> " +
        "--plateau <root-plateau-explain.json> [--out <dir>] " +
        "[--min-diff <cp>] [--min-child-gap <cp>] [--max-mate-rows <n>]"
    );
}

function parseArgs(argv) {
    const args = {
        analysis: null,
        plateau: null,
        out: null,
        minDiff: 150,
        minChildGap: 100,
        maxMateRows: 0
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--plateau") {
            args.plateau = argv[++index];
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
        else if (token === "--max-mate-rows") {
            args.maxMateRows = Number.parseInt(argv[++index], 10);
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.analysis) {
        throw new Error("Missing --analysis");
    }

    if (!args.plateau) {
        throw new Error("Missing --plateau");
    }

    for (const [name, value] of [
        ["--min-diff", args.minDiff],
        ["--min-child-gap", args.minChildGap],
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

function matchingAnalysis(result, maps) {
    return maps.byKey.get(keyFor(result.label, result.fen)) ||
        (maps.byFen.get(result.fen) || [])[0] ||
        null;
}

function rowForMove(result, move) {
    return (result.rows || []).find(row => row.move === move) || null;
}

function statusFor(args, item) {
    const reasons = [];

    if (!item.analysisPosition) {
        reasons.push("missing-analysis");
    }

    if (item.diffCp === null || item.diffCp < args.minDiff) {
        reasons.push(`diff<${args.minDiff}`);
    }

    if (item.bestMoveAgree !== false) {
        reasons.push("ref-move-agrees");
    }

    if (!item.coachRow) {
        reasons.push("coach-move-missing-from-plateau");
    }

    if (!item.referenceRow) {
        reasons.push("reference-move-missing-from-plateau");
    }

    if (item.mateRows > args.maxMateRows) {
        reasons.push(`mateRows>${args.maxMateRows}`);
    }

    if (item.childGapCp === null || item.childGapCp < args.minChildGap) {
        reasons.push(`childGap<${args.minChildGap}`);
    }

    return reasons.length === 0
        ? { keep: true, reasons: [] }
        : { keep: false, reasons };
}

function rankScore(item) {
    return (
        (item.childGapCp ?? -10000) * 4 +
        (item.diffCp ?? 0) +
        (item.childRootSideBand ?? 0) -
        (item.boundLikeTopTies ?? 0) * 10
    );
}

function buildRows(args, analysis, plateau) {
    const maps = buildAnalysisMap(analysis);

    return (plateau.results || [])
        .map(result => {
            const analysisPosition =
                matchingAnalysis(result, maps);
            const coachBest =
                analysisPosition?.coach?.bestMove ?? null;
            const referenceBest =
                analysisPosition?.reference?.bestMove ?? null;
            const coachRow =
                coachBest ? rowForMove(result, coachBest) : null;
            const referenceRow =
                referenceBest ? rowForMove(result, referenceBest) : null;
            const childGapCp =
                coachRow &&
                referenceRow &&
                Number.isFinite(coachRow.childRootSideScore) &&
                Number.isFinite(referenceRow.childRootSideScore)
                    ? referenceRow.childRootSideScore -
                        coachRow.childRootSideScore
                    : null;

            const item = {
                label: result.label,
                fen: result.fen,
                depth: result.depth,
                plateauBest: result.best,
                coachBest,
                referenceBest,
                bestMoveAgree:
                    analysisPosition?.comparison?.bestMoveAgree ?? null,
                diffCp:
                    analysisPosition ? absoluteDiff(analysisPosition) : null,
                rootBand: result.rootBand,
                childRootSideBand: result.childRootSideBand,
                topTies: result.topTies,
                boundLikeTopTies: result.boundLikeTopTies,
                mateRows: result.mateRows,
                coachChildScore:
                    coachRow?.childRootSideScore ?? null,
                referenceChildScore:
                    referenceRow?.childRootSideScore ?? null,
                childGapCp,
                coachRow,
                referenceRow,
                analysisPosition
            };

            const status = statusFor(args, item);

            return {
                ...item,
                keep: status.keep,
                reasons: status.reasons,
                score: rankScore(item)
            };
        })
        .sort((left, right) => {
            if (left.keep !== right.keep) {
                return left.keep ? -1 : 1;
            }

            return right.score - left.score;
        });
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

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function buildMarkdown(args, payload) {
    const lines = [
        "# Plateau Candidate Audit",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Plateau: \`${args.plateau}\``,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Minimum reference child gap: ${args.minChildGap}cp`,
        `- Maximum mate rows: ${args.maxMateRows}`,
        `- Candidate rows: ${payload.summary.candidates}`,
        `- Audited rows: ${payload.summary.audited}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "| Keep | Label | Diff | Coach | Coach child | Ref | Ref child | Gap | Child band | Bound ties | Reasons | FEN |",
        "| --- | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |"
    ];

    for (const item of payload.rows) {
        lines.push([
            item.keep ? "yes" : "no",
            escapeMarkdown(item.label),
            item.diffCp ?? "",
            item.coachBest ?? "",
            item.coachChildScore ?? "",
            item.referenceBest ?? "",
            item.referenceChildScore ?? "",
            item.childGapCp ?? "",
            item.childRootSideBand ?? "",
            item.boundLikeTopTies ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const analysis = readJson(args.analysis);
    const plateau = readJson(args.plateau);
    const rows = buildRows(args, analysis, plateau);
    const rejectionCounts = countsBy(
        rows.flatMap(item => item.reasons),
        reason => reason
    );

    const payload = {
        args,
        summary: {
            audited: rows.length,
            candidates: rows.filter(item => item.keep).length,
            rejectionCounts
        },
        rows: rows.map(({ analysisPosition, coachRow, referenceRow, ...item }) => ({
            ...item,
            coachRow,
            referenceRow
        }))
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "plateau-candidate-audit.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "plateau-candidate-audit.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Audited ${payload.summary.audited} plateau row(s), ` +
        `${payload.summary.candidates} candidate(s).`
    );

    for (const item of rows.slice(0, 10)) {
        console.log(
            `${item.keep ? "KEEP" : "skip"} ${item.label}: ` +
            `gap=${item.childGapCp ?? "n/a"}cp, diff=${item.diffCp ?? "n/a"}cp, ` +
            `${item.coachBest ?? "coach?"} vs ${item.referenceBest ?? "ref?"}`
        );
    }
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.stack || error.message);
    process.exit(1);
}
