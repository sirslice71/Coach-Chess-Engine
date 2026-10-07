#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
    createEngineCore,
    moveToUci,
    withMutedConsole
} from "../js/uci/uciengine.js";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/build-coach-root-worklist.mjs " +
        "--root <dir> --out <dir> [--depth 7] [--root-limit 8] " +
        "[--min-band 80] [--max-top-ties 3] [--max-mate-rows 0] " +
        "[--max-input 300] [--limit 60] [--max-ms-per-root 3000] " +
        "[--include-file-regex <pattern>] [--exclude-label-regex <pattern>] " +
        "[--exclude-file-regex <pattern>] " +
        "[--progress]"
    );
}

function parseArgs(argv) {
    const args = {
        root: null,
        out: null,
        depth: 7,
        rootLimit: 8,
        minBand: 80,
        maxTopTies: 3,
        maxMateRows: 0,
        maxInput: 300,
        limit: 60,
        maxMsPerRoot: 3000,
        includeFileRegex: "\\.fens$",
        excludeFileRegex: null,
        excludeLabelRegex: "-after",
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--root") args.root = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--depth") args.depth = Number.parseInt(argv[++index], 10);
        else if (token === "--root-limit") args.rootLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--min-band") args.minBand = Number.parseInt(argv[++index], 10);
        else if (token === "--max-top-ties") args.maxTopTies = Number.parseInt(argv[++index], 10);
        else if (token === "--max-mate-rows") args.maxMateRows = Number.parseInt(argv[++index], 10);
        else if (token === "--max-input") args.maxInput = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-root") args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        else if (token === "--include-file-regex") args.includeFileRegex = argv[++index];
        else if (token === "--exclude-file-regex") args.excludeFileRegex = argv[++index];
        else if (token === "--exclude-label-regex") args.excludeLabelRegex = argv[++index];
        else if (token === "--progress") args.progress = true;
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.root) throw new Error("Missing --root");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--depth", args.depth],
        ["--root-limit", args.rootLimit],
        ["--min-band", args.minBand],
        ["--max-top-ties", args.maxTopTies],
        ["--max-mate-rows", args.maxMateRows],
        ["--max-input", args.maxInput],
        ["--limit", args.limit],
        ["--max-ms-per-root", args.maxMsPerRoot]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    if (args.depth <= 0) throw new Error("--depth must be positive");
    if (args.rootLimit <= 0) throw new Error("--root-limit must be positive");
    if (args.maxInput <= 0) throw new Error("--max-input must be positive");
    if (args.limit <= 0) throw new Error("--limit must be positive");

    args.includeFilePattern = new RegExp(args.includeFileRegex);
    args.excludeFilePattern =
        args.excludeFileRegex ? new RegExp(args.excludeFileRegex) : null;
    args.excludeLabelPattern =
        args.excludeLabelRegex ? new RegExp(args.excludeLabelRegex) : null;

    return args;
}

function walkFiles(rootDir, includePattern, excludePattern, baseDir = rootDir) {
    const files = [];

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const fullPath = path.join(rootDir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
            files.push(...walkFiles(fullPath, includePattern, excludePattern, baseDir));
        }
        else if (
            entry.isFile() &&
            includePattern.test(relativePath) &&
            !(excludePattern && excludePattern.test(relativePath))
        ) {
            files.push(fullPath);
        }
    }

    return files.sort();
}

function parseFenLine(line, fallbackLabel) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) return null;

    const separator = trimmed.indexOf("|");
    const label = separator === -1
        ? fallbackLabel
        : trimmed.slice(0, separator).trim();
    const fen = separator === -1
        ? trimmed
        : trimmed.slice(separator + 1).trim();

    if (fen.split(/\s+/).length < 6) return null;

    return { label, fen };
}

function collectPositions(args) {
    const files = walkFiles(
        args.root,
        args.includeFilePattern,
        args.excludeFilePattern
    );
    const seen = new Set();
    const positions = [];
    let rawLines = 0;
    let duplicateFens = 0;
    let excludedLabels = 0;

    for (const file of files) {
        const relativeFile = path.relative(args.root, file);
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

        for (const [index, line] of lines.entries()) {
            const parsed = parseFenLine(
                line,
                `${relativeFile}:${index + 1}`
            );

            if (!parsed) continue;
            rawLines += 1;

            if (
                args.excludeLabelPattern &&
                args.excludeLabelPattern.test(parsed.label)
            ) {
                excludedLabels += 1;
                continue;
            }

            if (seen.has(parsed.fen)) {
                duplicateFens += 1;
                continue;
            }

            seen.add(parsed.fen);
            positions.push({
                ...parsed,
                sourceFile: relativeFile,
                sourceLine: index + 1
            });

            if (positions.length >= args.maxInput) {
                return {
                    files,
                    positions,
                    rawLines,
                    duplicateFens,
                    excludedLabels,
                    truncated: true
                };
            }
        }
    }

    return {
        files,
        positions,
        rawLines,
        duplicateFens,
        excludedLabels,
        truncated: false
    };
}

function isMateScore(score) {
    return Math.abs(score) >= MATE_THRESHOLD;
}

function scoreBand(rows) {
    if (rows.length === 0) return null;
    return rows[0].score - rows.at(-1).score;
}

function countTopTies(rows) {
    if (rows.length === 0) return 0;

    const topScore = rows[0].score;

    return rows.filter(row => row.score === topScore).length;
}

function rootSearch(position, args) {
    const startMs = performance.now();
    const deadlineMs = startMs + args.maxMsPerRoot;
    const engine = createEngineCore(position.fen);
    const result =
        withMutedConsole(() =>
            engine.search.bestMove(
                args.depth,
                {
                    quiet: true,
                    deadlineMs
                }
            )
        );
    const rootMoves =
        (result.rootMoves || [])
            .slice(0, args.rootLimit)
            .map(row => ({
                uci: row.uci,
                score: row.score
            }));
    const bestMove =
        rootMoves[0]?.uci ??
        (result.bestMove ? moveToUci(result.bestMove) : null);

    return {
        depth: result.depth ?? null,
        requestedDepth: args.depth,
        timed: (result.depth ?? args.depth) < args.depth,
        elapsedMs: performance.now() - startMs,
        bestMove,
        bestScore: rootMoves[0]?.score ?? null,
        band: scoreBand(rootMoves),
        topTies: countTopTies(rootMoves),
        mateRows: rootMoves.filter(row => isMateScore(row.score)).length,
        rootMoves
    };
}

function analyzePosition(position, args) {
    try {
        const root = rootSearch(position, args);
        const reasons = [];

        if (!root.bestMove) reasons.push("missingRootBest");
        if (root.timed) reasons.push("rootTimed");
        if (root.band === null || root.band < args.minBand) {
            reasons.push(`band<${args.minBand}`);
        }
        if (root.topTies > args.maxTopTies) {
            reasons.push(`topTies>${args.maxTopTies}`);
        }
        if (root.mateRows > args.maxMateRows || isMateScore(root.bestScore ?? 0)) {
            reasons.push("mateRootScore");
        }

        return {
            ...position,
            keep: reasons.length === 0,
            reasons,
            root
        };
    }
    catch (error) {
        return {
            ...position,
            keep: false,
            reasons: [`rootError:${error.message}`],
            root: null
        };
    }
}

function reasonCounts(rows) {
    const counts = {};

    for (const row of rows) {
        for (const reason of row.reasons) {
            counts[reason] = (counts[reason] || 0) + 1;
        }
    }

    return counts;
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function renderMarkdown(payload) {
    const lines = [
        "# Coach Root Worklist",
        "",
        `- Root: \`${payload.args.root}\``,
        `- Depth: ${payload.args.depth}`,
        `- Root limit: ${payload.args.rootLimit}`,
        `- Min band: ${payload.args.minBand}cp`,
        `- Max top ties: ${payload.args.maxTopTies}`,
        `- Max mate rows: ${payload.args.maxMateRows}`,
        `- Max root time: ${payload.args.maxMsPerRoot}ms`,
        `- Files scanned: ${payload.summary.filesScanned}`,
        `- Raw FEN lines: ${payload.summary.rawLines}`,
        `- Audited positions: ${payload.summary.audited}`,
        `- Worklist rows: ${payload.summary.worklist}`,
        `- Rejection counts: ${Object.entries(payload.summary.rejectionCounts)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(", ") || "none"}`,
        "",
        "## Worklist",
        "",
        "| Label | Source | Best | Score | Band | Top ties | Depth | Time ms | FEN |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"
    ];

    for (const row of payload.worklist) {
        lines.push(
            `| ${escapeMarkdown(row.label)} | ${escapeMarkdown(row.sourceFile)}:${row.sourceLine} | ` +
            `${row.root.bestMove ?? ""} | ${row.root.bestScore ?? ""} | ` +
            `${row.root.band ?? ""} | ${row.root.topTies ?? ""} | ` +
            `${row.root.depth ?? ""} | ${Math.round(row.root.elapsedMs)} | ` +
            `\`${row.fen}\` |`
        );
    }

    lines.push(
        "",
        "## Top Rejections",
        "",
        "| Label | Source | Band | Top ties | Depth | Reasons | FEN |",
        "| --- | --- | ---: | ---: | ---: | --- | --- |"
    );

    for (const row of payload.rejections.slice(0, 40)) {
        lines.push(
            `| ${escapeMarkdown(row.label)} | ${escapeMarkdown(row.sourceFile)}:${row.sourceLine} | ` +
            `${row.root?.band ?? ""} | ${row.root?.topTies ?? ""} | ` +
            `${row.root?.depth ?? ""} | ${row.reasons.join(", ")} | ` +
            `\`${row.fen}\` |`
        );
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const collected = collectPositions(args);
    const rows = [];

    for (const [index, position] of collected.positions.entries()) {
        if (args.progress) {
            console.error(`[${index + 1}/${collected.positions.length}] ${position.label}`);
        }

        rows.push(analyzePosition(position, args));
    }

    const kept =
        rows
            .filter(row => row.keep)
            .sort((left, right) =>
                (right.root?.band ?? -Infinity) - (left.root?.band ?? -Infinity)
            );
    const worklist = kept.slice(0, args.limit);
    const rejections = rows.filter(row => !row.keep);
    const payload = {
        args: {
            ...args,
            includeFilePattern: undefined,
            excludeFilePattern: undefined,
            excludeLabelPattern: undefined
        },
        generatedAt: new Date().toISOString(),
        summary: {
            filesScanned: collected.files.length,
            rawLines: collected.rawLines,
            duplicateFens: collected.duplicateFens,
            excludedLabels: collected.excludedLabels,
            truncated: collected.truncated,
            audited: rows.length,
            rawWorklist: kept.length,
            worklist: worklist.length,
            rejectionCounts: reasonCounts(rejections)
        },
        worklist,
        rejections
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "coach-root-worklist.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "coach-root-worklist.md"),
        renderMarkdown(payload)
    );
    fs.writeFileSync(
        path.join(args.out, "coach-root-worklist.fens"),
        worklist.map(row => `${row.label} | ${row.fen}`).join("\n") +
            (worklist.length > 0 ? "\n" : "")
    );

    console.log(
        `Audited ${rows.length} position(s), wrote ${worklist.length} root worklist row(s).`
    );
}

try {
    main();
}
catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
}
