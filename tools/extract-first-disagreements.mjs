#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/extract-first-disagreements.mjs " +
        "--analysis <coach-analysis-lab results.json> [--out <dir>] " +
        "[--min-diff <cp>] [--require-label-regex <pattern>] " +
        "[--exclude-label-regex <pattern>] [--include-mate] [--max-per-game <n>] " +
        "[--min-fullmove <n>] [--max-fullmove <n>] [--min-piece-count <n>] " +
        "[--min-non-pawn-material <cp>]"
    );
}

function parseArgs(argv) {
    const args = {
        analysis: null,
        out: null,
        minDiff: 150,
        requireLabelRegex: null,
        excludeLabelRegex: null,
        includeMate: false,
        maxPerGame: 1,
        minFullmove: null,
        maxFullmove: null,
        minPieceCount: null,
        minNonPawnMaterial: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--require-label-regex") {
            args.requireLabelRegex = argv[++index];
        }
        else if (token === "--exclude-label-regex") {
            args.excludeLabelRegex = argv[++index];
        }
        else if (token === "--include-mate") {
            args.includeMate = true;
        }
        else if (token === "--max-per-game") {
            args.maxPerGame = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-fullmove") {
            args.minFullmove = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-fullmove") {
            args.maxFullmove = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-piece-count") {
            args.minPieceCount = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-non-pawn-material") {
            args.minNonPawnMaterial = Number.parseInt(argv[++index], 10);
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
        ["--max-per-game", args.maxPerGame],
        ["--min-fullmove", args.minFullmove],
        ["--max-fullmove", args.maxFullmove],
        ["--min-piece-count", args.minPieceCount],
        ["--min-non-pawn-material", args.minNonPawnMaterial]
    ]) {
        if (value !== null && (!Number.isInteger(value) || value < 0)) {
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

function absoluteDiff(position) {
    const diff = position.comparison?.evalDiffCp;
    return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function isMateScore(score) {
    return Boolean(score?.isMate) || Math.abs(score?.cp ?? 0) >= MATE_THRESHOLD;
}

function gameId(label) {
    const match = /^game(\d+)/.exec(label);
    return match ? match[1] : label;
}

function fullmoveFromLabel(label) {
    const beforeMatch = /before-(\d+)(?:\.|$)/.exec(label);
    if (beforeMatch) return Number.parseInt(beforeMatch[1], 10);

    const plyMatch = /(?:^|-)ply(\d+)(?:-|$)/.exec(label);
    if (plyMatch) {
        return Math.ceil(Number.parseInt(plyMatch[1], 10) / 2);
    }

    return null;
}

function fenStats(fen) {
    const placement = String(fen || "").split(/\s+/)[0] || "";
    const materialValues = {
        n: 300,
        b: 300,
        r: 500,
        q: 900
    };
    let pieceCount = 0;
    let nonPawnMaterial = 0;

    for (const char of placement) {
        if (!/[a-z]/i.test(char)) continue;

        pieceCount += 1;
        nonPawnMaterial += materialValues[char.toLowerCase()] || 0;
    }

    return { pieceCount, nonPawnMaterial };
}

function rejectionReasons(args, position) {
    const reasons = [];
    const diffCp = absoluteDiff(position);
    const fullmove = fullmoveFromLabel(position.label);
    const stats = fenStats(position.fen);

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

    if (
        args.minFullmove !== null &&
        (fullmove === null || fullmove < args.minFullmove)
    ) {
        reasons.push(`fullmove<${args.minFullmove}`);
    }

    if (
        args.maxFullmove !== null &&
        (fullmove === null || fullmove > args.maxFullmove)
    ) {
        reasons.push(`fullmove>${args.maxFullmove}`);
    }

    if (
        args.minPieceCount !== null &&
        stats.pieceCount < args.minPieceCount
    ) {
        reasons.push(`pieceCount<${args.minPieceCount}`);
    }

    if (
        args.minNonPawnMaterial !== null &&
        stats.nonPawnMaterial < args.minNonPawnMaterial
    ) {
        reasons.push(`nonPawnMaterial<${args.minNonPawnMaterial}`);
    }

    if (
        !args.includeMate &&
        (isMateScore(position.coach?.score) || isMateScore(position.reference?.score))
    ) {
        reasons.push("mateAnalysisScore");
    }

    return reasons;
}

function selectRows(args, analysis) {
    const accepted = [];
    const rejected = [];
    const countsByGame = new Map();

    for (const [inputIndex, position] of (analysis.positions || []).entries()) {
        const reasons = rejectionReasons(args, position);
        const game = gameId(position.label);
        const record = {
            inputIndex,
            game,
            fullmove: fullmoveFromLabel(position.label),
            label: position.label,
            fen: position.fen,
            diffCp: absoluteDiff(position),
            coachBest: position.coach?.bestMove ?? null,
            referenceBest: position.reference?.bestMove ?? null,
            coachScore: position.coach?.score ?? null,
            referenceScore: position.reference?.score ?? null,
            fenStats: fenStats(position.fen),
            pgn: position.pgn ?? null,
            reasons
        };

        const selectedForGame = countsByGame.get(game) || 0;

        if (reasons.length === 0 && selectedForGame < args.maxPerGame) {
            accepted.push(record);
            countsByGame.set(game, selectedForGame + 1);
        }
        else {
            rejected.push(
                reasons.length === 0
                    ? { ...record, reasons: [`gameLimit>${args.maxPerGame}`] }
                    : record
            );
        }
    }

    return { accepted, rejected };
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

function buildFens(rows) {
    return rows
        .map(row => `${row.label} | ${row.fen}`)
        .join("\n") + (rows.length > 0 ? "\n" : "");
}

function buildMarkdown(args, payload) {
    const lines = [
        "# First Coach/SF Disagreement Extractor",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Include mate-class rows: ${args.includeMate ? "yes" : "no"}`,
        `- Label required: ${args.requireLabelRegex ?? "none"}`,
        `- Label excluded: ${args.excludeLabelRegex ?? "none"}`,
        `- Max per game: ${args.maxPerGame}`,
        `- Fullmove range: ${args.minFullmove ?? "any"}-${args.maxFullmove ?? "any"}`,
        `- Minimum piece count: ${args.minPieceCount ?? "none"}`,
        `- Minimum non-pawn material: ${args.minNonPawnMaterial ?? "none"}cp`,
        `- Selected: ${payload.summary.selected}`,
        `- Rejected: ${payload.summary.rejected}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "| Game | Label | Move | Diff | Pieces | Non-pawn | Coach | Ref | FEN |",
        "| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |"
    ];

    for (const row of payload.selected) {
        lines.push([
            row.game,
            escapeMarkdown(row.label),
            row.fullmove ?? "",
            row.diffCp ?? "",
            row.fenStats?.pieceCount ?? "",
            row.fenStats?.nonPawnMaterial ?? "",
            row.coachBest ?? "",
            row.referenceBest ?? "",
            `\`${row.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const analysis = readJson(args.analysis);
    const { accepted, rejected } = selectRows(args, analysis);
    const rejectionCounts = countsBy(
        rejected.flatMap(row => row.reasons),
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
            selected: accepted.length,
            rejected: rejected.length,
            rejectionCounts
        },
        selected: accepted,
        rejected
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "first-disagreements.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "first-disagreements.fens"),
            buildFens(accepted)
        );

        fs.writeFileSync(
            path.join(args.out, "first-disagreements.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Selected ${accepted.length} first disagreement(s) from ` +
        `${payload.summary.inputPositions} analyzed position(s).`
    );
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
}
