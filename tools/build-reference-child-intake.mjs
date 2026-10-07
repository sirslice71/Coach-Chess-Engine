#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
    createEngineCore,
    withMutedConsole
} from "../js/uci/uciengine.js";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/build-reference-child-intake.mjs " +
        "--root <analysis-dir> --out <dir> [--depth 8] [--root-limit 20] " +
        "[--min-diff 150] [--max-input 300] [--limit 80] " +
        "[--max-ms-per-root 10000] [--include-file-regex <pattern>] " +
        "[--exclude-file-regex <pattern>] [--exclude-label-regex <pattern>] " +
        "[--file-order name|mtime-desc|mtime-asc] " +
        "[--exclude-mate-comparisons] [--progress]"
    );
}

function parseArgs(argv) {
    const args = {
        root: null,
        out: null,
        depth: 8,
        rootLimit: 20,
        minDiff: 150,
        maxInput: 300,
        limit: 80,
        maxMsPerRoot: 10000,
        includeFileRegex: "results\\.json$",
        excludeFileRegex: null,
        excludeLabelRegex: "-after",
        fileOrder: "name",
        excludeMateComparisons: false,
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--root") args.root = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--depth") args.depth = Number.parseInt(argv[++index], 10);
        else if (token === "--root-limit") args.rootLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--min-diff") args.minDiff = Number.parseInt(argv[++index], 10);
        else if (token === "--max-input") args.maxInput = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-root") args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        else if (token === "--include-file-regex") args.includeFileRegex = argv[++index];
        else if (token === "--exclude-file-regex") args.excludeFileRegex = argv[++index];
        else if (token === "--exclude-label-regex") args.excludeLabelRegex = argv[++index];
        else if (token === "--file-order") args.fileOrder = argv[++index];
        else if (token === "--exclude-mate-comparisons") args.excludeMateComparisons = true;
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
        ["--min-diff", args.minDiff],
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
    if (args.maxMsPerRoot <= 0) throw new Error("--max-ms-per-root must be positive");
    if (!["name", "mtime-desc", "mtime-asc"].includes(args.fileOrder)) {
        throw new Error("--file-order must be name, mtime-desc, or mtime-asc");
    }

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

function orderFiles(files, order) {
    if (order === "name") return files;

    return [...files].sort((left, right) => {
        const leftTime = fs.statSync(left).mtimeMs;
        const rightTime = fs.statSync(right).mtimeMs;

        return order === "mtime-desc"
            ? rightTime - leftTime
            : leftTime - rightTime;
    });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function absoluteDiff(position) {
    const diff = position.comparison?.evalDiffCp;
    return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function isMateScore(score) {
    return Math.abs(score) >= MATE_THRESHOLD;
}

function rootRank(rootMoves, moveUci) {
    const index = rootMoves.findIndex(row => row.uci === moveUci);
    return index === -1 ? null : index + 1;
}

function rootScore(rootMoves, moveUci) {
    return rootMoves.find(row => row.uci === moveUci)?.score ?? null;
}

function collectRows(args) {
    const files = orderFiles(
        walkFiles(
            args.root,
            args.includeFilePattern,
            args.excludeFilePattern
        ),
        args.fileOrder
    );
    const rows = [];
    const seen = new Set();
    let rawPositions = 0;
    let duplicateFens = 0;
    let excludedLabels = 0;
    let excludedMateComparisons = 0;

    for (const file of files) {
        const relativeFile = path.relative(args.root, file);
        const payload = readJson(file);

        for (const position of payload.positions || []) {
            rawPositions += 1;

            if (
                !position.error &&
                position.fen &&
                position.coach?.bestMove &&
                position.reference?.bestMove &&
                position.comparison?.bestMoveAgree === false
            ) {
                const diffCp = absoluteDiff(position);

                if (diffCp === null || diffCp < args.minDiff) continue;
                if (
                    args.excludeMateComparisons &&
                    (
                        position.comparison?.mateDisagreement ||
                        position.coach?.score?.isMate ||
                        position.reference?.score?.isMate
                    )
                ) {
                    excludedMateComparisons += 1;
                    continue;
                }
                if (
                    args.excludeLabelPattern &&
                    args.excludeLabelPattern.test(position.label ?? "")
                ) {
                    excludedLabels += 1;
                    continue;
                }
                if (seen.has(position.fen)) {
                    duplicateFens += 1;
                    continue;
                }

                seen.add(position.fen);
                rows.push({
                    position,
                    diffCp,
                    sourceFile: relativeFile
                });

                if (rows.length >= args.maxInput) {
                    return {
                        files,
                        rows,
                        rawPositions,
                        duplicateFens,
                        excludedLabels,
                        excludedMateComparisons,
                        truncated: true
                    };
                }
            }
        }
    }

    return {
        files,
        rows,
        rawPositions,
        duplicateFens,
        excludedLabels,
        excludedMateComparisons,
        truncated: false
    };
}

function rootSearch(fen, args) {
    const engine = createEngineCore(fen);
    const startMs = performance.now();
    const deadlineMs = startMs + args.maxMsPerRoot;
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

    return {
        depth: result.depth ?? null,
        requestedDepth: args.depth,
        timed: (result.depth ?? args.depth) < args.depth,
        elapsedMs: performance.now() - startMs,
        rootMoves
    };
}

function analyzeRow(row, args) {
    try {
        const root = rootSearch(row.position.fen, args);
        const coachRootScore =
            rootScore(root.rootMoves, row.position.coach.bestMove);
        const referenceRootScore =
            rootScore(root.rootMoves, row.position.reference.bestMove);
        const referenceRootRank =
            rootRank(root.rootMoves, row.position.reference.bestMove);
        const reasons = [];

        if (root.timed) reasons.push("root-timed");
        if (referenceRootRank === null) {
            reasons.push(`reference-not-in-top-${args.rootLimit}`);
        }
        if (
            (coachRootScore !== null && isMateScore(coachRootScore)) ||
            (referenceRootScore !== null && isMateScore(referenceRootScore))
        ) {
            reasons.push("mate-root-score");
        }

        return {
            ...row,
            keep: reasons.length === 0,
            reasons,
            root: {
                ...root,
                coachRootScore,
                referenceRootScore,
                referenceRootRank
            },
            score:
                row.diffCp -
                (referenceRootRank ?? 100) * 5 -
                (root.timed ? 1000 : 0)
        };
    }
    catch (error) {
        return {
            ...row,
            keep: false,
            reasons: [`root-error:${error.message}`],
            root: null,
            score: -Infinity
        };
    }
}

function countsBy(rows) {
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

function buildAnalysis(selected) {
    return {
        positions: selected.map(row => ({
            ...row.position,
            label: `${row.position.label} [${row.sourceFile}]`
        }))
    };
}

function fenLine(row) {
    return `${row.position.label} [${row.sourceFile}] | ${row.position.fen}`;
}

function renderMarkdown(args, payload) {
    const lines = [
        "# Reference Child Intake",
        "",
        `- Root: \`${args.root}\``,
        `- Depth: ${args.depth}`,
        `- Root limit: ${args.rootLimit}`,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Max root time: ${args.maxMsPerRoot}ms`,
        `- Files scanned: ${payload.summary.filesScanned}`,
        `- Raw positions: ${payload.summary.rawPositions}`,
        `- Excluded mate comparisons: ${payload.summary.excludedMateComparisons}`,
        `- Audited positions: ${payload.summary.audited}`,
        `- Selected positions: ${payload.summary.selected}`,
        `- Rejection counts: ${Object.entries(payload.summary.rejectionCounts)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(", ") || "none"}`,
        "",
        "## Selected",
        "",
        "| Label | Source | Diff | Ref rank | Coach | Ref | Time ms | FEN |",
        "| --- | --- | ---: | ---: | --- | --- | ---: | --- |"
    ];

    for (const row of payload.selected) {
        lines.push(
            `| ${escapeMarkdown(row.position.label)} | ${escapeMarkdown(row.sourceFile)} | ` +
            `${row.diffCp} | ${row.root.referenceRootRank ?? ""} | ` +
            `${row.position.coach.bestMove} | ${row.position.reference.bestMove} | ` +
            `${Math.round(row.root.elapsedMs)} | \`${row.position.fen}\` |`
        );
    }

    lines.push("", "## Rejections", "");

    for (const row of payload.rejections.slice(0, 60)) {
        lines.push(
            `- ${row.position.label} [${row.sourceFile}]: ` +
            `${row.reasons.join(", ") || "no reason"}; diff ${row.diffCp}cp`
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

    const collected = collectRows(args);
    const audited = [];

    for (const [index, row] of collected.rows.entries()) {
        if (args.progress) {
            console.error(
                `[${index + 1}/${collected.rows.length}] ` +
                `${row.position.label} diff=${row.diffCp}cp`
            );
        }

        audited.push(analyzeRow(row, args));
    }

    const selected =
        audited
            .filter(row => row.keep)
            .sort((left, right) => right.score - left.score)
            .slice(0, args.limit);
    const rejections =
        audited
            .filter(row => !row.keep)
            .sort((left, right) => right.score - left.score);
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
            rawPositions: collected.rawPositions,
            duplicateFens: collected.duplicateFens,
            excludedLabels: collected.excludedLabels,
            excludedMateComparisons: collected.excludedMateComparisons,
            truncated: collected.truncated,
            audited: audited.length,
            selected: selected.length,
            rejectionCounts: countsBy(rejections)
        },
        selected,
        rejections
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "reference-child-intake.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "reference-child-intake.md"),
        renderMarkdown(args, payload)
    );
    fs.writeFileSync(
        path.join(args.out, "reference-child-intake.analysis.json"),
        `${JSON.stringify(buildAnalysis(selected), null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "reference-child-intake.fens"),
        selected.map(fenLine).join("\n") + (selected.length > 0 ? "\n" : "")
    );

    console.log(
        `Audited ${audited.length} position(s), selected ${selected.length} intake row(s).`
    );
}

try {
    main();
}
catch (error) {
    console.error(error.stack || error.message);
    usage();
    process.exit(1);
}
