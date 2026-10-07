#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
    createEngineCore,
    uciToMove,
    withMutedConsole
} from "../js/uci/uciengine.js";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/audit-root-plateau-child-scores.mjs " +
        "--fen-file <file> --out <dir> [--root-depth 7] [--child-depth 7] " +
        "[--root-limit 8] [--max-ms-per-root 12000] [--max-ms-per-child 2500] " +
        "[--min-hidden-spread 100] [--min-disagreement-gap 100] [--limit 40] [--exclude-label-regex <pattern>] " +
        "[--progress]"
    );
}

function parseArgs(argv) {
    const args = {
        fenFile: null,
        out: null,
        rootDepth: 7,
        childDepth: 7,
        rootLimit: 8,
        maxMsPerRoot: 12000,
        maxMsPerChild: 2500,
        minHiddenSpread: 100,
        minDisagreementGap: 100,
        limit: 40,
        excludeLabelRegex: null,
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--fen-file") args.fenFile = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--root-depth") args.rootDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--child-depth") args.childDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--root-limit") args.rootLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-root") args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-child") args.maxMsPerChild = Number.parseInt(argv[++index], 10);
        else if (token === "--min-hidden-spread") args.minHiddenSpread = Number.parseInt(argv[++index], 10);
        else if (token === "--min-disagreement-gap") args.minDisagreementGap = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--exclude-label-regex") args.excludeLabelRegex = argv[++index];
        else if (token === "--progress") args.progress = true;
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.fenFile) throw new Error("Missing --fen-file");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--root-depth", args.rootDepth],
        ["--child-depth", args.childDepth],
        ["--root-limit", args.rootLimit],
        ["--max-ms-per-root", args.maxMsPerRoot],
        ["--max-ms-per-child", args.maxMsPerChild],
        ["--min-hidden-spread", args.minHiddenSpread],
        ["--min-disagreement-gap", args.minDisagreementGap],
        ["--limit", args.limit]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    args.excludeLabelPattern =
        args.excludeLabelRegex ? new RegExp(args.excludeLabelRegex) : null;

    return args;
}

function parseFenFile(filePath) {
    return fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map((line, index) => {
            const separator = line.indexOf("|");

            if (separator === -1) {
                return {
                    label: `position-${index + 1}`,
                    fen: line
                };
            }

            return {
                label: line.slice(0, separator).trim(),
                fen: line.slice(separator + 1).trim()
            };
        });
}

function isMateScore(score) {
    return Math.abs(score) >= MATE_THRESHOLD;
}

function band(rows, scoreKey = "score") {
    const scores =
        rows
            .map(row => row[scoreKey])
            .filter(Number.isFinite);

    if (scores.length === 0) return null;

    return Math.max(...scores) - Math.min(...scores);
}

function searchRoot(fen, args) {
    const startMs = performance.now();
    const engine = createEngineCore(fen);
    const deadlineMs = startMs + args.maxMsPerRoot;
    const result =
        withMutedConsole(() =>
            engine.search.bestMove(args.rootDepth, {
                quiet: true,
                deadlineMs
            })
        );

    return {
        depth: result.depth ?? null,
        requestedDepth: args.rootDepth,
        timed: (result.depth ?? args.rootDepth) < args.rootDepth,
        elapsedMs: performance.now() - startMs,
        rootMoves:
            (result.rootMoves || [])
                .slice(0, args.rootLimit)
                .map(row => ({
                    uci: row.uci,
                    score: row.score
                }))
    };
}

function searchChild(fen, moveUci, rootSideToMove, args) {
    const engine = createEngineCore(fen);
    const legalMoves = engine.legalMoveGenerator.generateMoves();
    const move = uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            move: moveUci,
            error: "illegal-move"
        };
    }

    engine.board.makeMove(move);

    const startMs = performance.now();
    const deadlineMs = startMs + args.maxMsPerChild;
    const result =
        withMutedConsole(() =>
            engine.search.bestMove(args.childDepth, {
                quiet: true,
                deadlineMs
            })
        );
    const whiteCp = Math.round(Number.parseFloat(result.evaluation) * 100);

    return {
        move: moveUci,
        score: rootSideToMove > 0 ? whiteCp : -whiteCp,
        childBest: result.uci,
        evaluation: result.evaluation,
        depth: result.depth ?? null,
        requestedDepth: args.childDepth,
        timed: (result.depth ?? args.childDepth) < args.childDepth,
        elapsedMs: performance.now() - startMs
    };
}

function classify(rootBand, childBand, args, childRows, rootBestMove) {
    if (childRows.some(row => isMateScore(row.score ?? 0))) {
        return "mate-child";
    }
    if (childBand === null) {
        return "unknown";
    }
    const childBest = childRows[0];
    const rootBestChild =
        childRows.find(row => row.move === rootBestMove);
    const disagreementGap =
        Number.isFinite(childBest?.score) && Number.isFinite(rootBestChild?.score)
            ? childBest.score - rootBestChild.score
            : null;

    if (
        childBest &&
        rootBestMove &&
        childBest.move !== rootBestMove &&
        disagreementGap !== null &&
        disagreementGap >= args.minDisagreementGap
    ) {
        return "root-child-disagreement";
    }
    if (childBand >= args.minHiddenSpread) {
        return rootBand === 0 ? "hidden-child-spread" : "child-spread";
    }
    return rootBand === 0 ? "true-flat" : "subthreshold-child-spread";
}

function analyzePosition(position, args) {
    const rootEngine = createEngineCore(position.fen);
    const rootSideToMove = rootEngine.board.sideToMove;
    let root;

    try {
        root = searchRoot(position.fen, args);
    }
    catch (error) {
        return {
            ...position,
            error: `root-search-error:${error.message}`
        };
    }

    const rootBand = band(root.rootMoves);
    const childRows = [];

    for (const row of root.rootMoves) {
        try {
            childRows.push({
                ...row,
                child: searchChild(position.fen, row.uci, rootSideToMove, args)
            });
        }
        catch (error) {
            childRows.push({
                ...row,
                child: {
                    move: row.uci,
                    error: error.message
                }
            });
        }
    }

    const scoredChildRows =
        childRows.map(row => ({
            move: row.uci,
            rootScore: row.score,
            score: row.child.score,
            childBest: row.child.childBest,
            depth: row.child.depth,
            timed: row.child.timed,
            error: row.child.error || null
        }));
    const childBand = band(scoredChildRows);

    scoredChildRows.sort((left, right) =>
        (right.score ?? -Infinity) - (left.score ?? -Infinity)
    );
    const rootBestMove = root.rootMoves[0]?.uci ?? null;
    const childBestMove = scoredChildRows[0]?.move ?? null;
    const rootBestChild =
        scoredChildRows.find(row => row.move === rootBestMove);
    const disagreementGap =
        Number.isFinite(scoredChildRows[0]?.score) &&
        Number.isFinite(rootBestChild?.score)
            ? scoredChildRows[0].score - rootBestChild.score
            : null;

    return {
        ...position,
        root: {
            depth: root.depth,
            requestedDepth: root.requestedDepth,
            timed: root.timed,
            elapsedMs: root.elapsedMs,
            band: rootBand,
            rootMoves: root.rootMoves
        },
        child: {
            depth: args.childDepth,
            band: childBand,
            rootBestMove,
            childBestMove,
            disagreementGap,
            classification: classify(rootBand, childBand, args, scoredChildRows, rootBestMove),
            rows: scoredChildRows
        }
    };
}

function reasonCounts(rows) {
    const counts = {};

    for (const row of rows) {
        const key = row.error || row.child?.classification || "unknown";
        counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
}

function renderMarkdown(payload) {
    const lines = [
        "# Root Plateau Child-Score Audit",
        "",
        `- Source: \`${payload.args.fenFile}\``,
        `- Root depth: ${payload.args.rootDepth}`,
        `- Child depth: ${payload.args.childDepth}`,
        `- Root limit: ${payload.args.rootLimit}`,
        `- Hidden spread threshold: ${payload.args.minHiddenSpread}cp`,
        `- Disagreement threshold: ${payload.args.minDisagreementGap}cp`,
        `- Audited: ${payload.summary.audited}`,
        `- Class counts: ${Object.entries(payload.summary.classCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
        "",
        "## Rows",
        "",
        "| Label | Class | Root band | Child band | Root best | Child best | Gap vs root best | Top child scores | FEN |",
        "| --- | --- | ---: | ---: | --- | --- | ---: | --- | --- |"
    ];

    for (const row of payload.rows) {
        lines.push(
            `| ${String(row.label).replaceAll("|", "\\|")} | ` +
            `${row.error || row.child.classification} | ` +
            `${row.root?.band ?? ""} | ${row.child?.band ?? ""} | ` +
            `${row.root?.rootMoves?.[0]?.uci ?? ""} | ` +
            `${row.child?.childBestMove ?? ""} | ` +
            `${row.child?.disagreementGap ?? ""} | ` +
            `${(row.child?.rows || [])
                .slice(0, 4)
                .map(child => `${child.move}:${child.score ?? "err"}`)
                .join(", ")} | ` +
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

    let positions = parseFenFile(args.fenFile);

    if (args.excludeLabelPattern) {
        positions = positions.filter(position =>
            !args.excludeLabelPattern.test(position.label)
        );
    }

    positions = positions.slice(0, args.limit);

    const rows = [];

    for (const [index, position] of positions.entries()) {
        if (args.progress) {
            console.error(`[${index + 1}/${positions.length}] ${position.label}`);
        }

        rows.push(analyzePosition(position, args));
    }

    const payload = {
        args: {
            ...args,
            excludeLabelPattern: undefined
        },
        generatedAt: new Date().toISOString(),
        summary: {
            inputPositions: parseFenFile(args.fenFile).length,
            audited: rows.length,
            classCounts: reasonCounts(rows),
            disagreements:
                rows.filter(row =>
                    row.child?.classification === "root-child-disagreement"
                ).length
        },
        rows
    };
    const disagreements =
        rows.filter(row =>
            row.child?.classification === "root-child-disagreement"
        );

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "root-plateau-child-score-audit.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "root-plateau-child-score-audit.md"),
        renderMarkdown(payload)
    );
    fs.writeFileSync(
        path.join(args.out, "root-child-disagreements.fens"),
        disagreements
            .map(row => `${row.label} | ${row.fen}`)
            .join("\n") + (disagreements.length > 0 ? "\n" : "")
    );

    console.log(
        `Audited ${rows.length} position(s); ` +
        Object.entries(payload.summary.classCounts)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ") +
        `; disagreements=${payload.summary.disagreements}`
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
