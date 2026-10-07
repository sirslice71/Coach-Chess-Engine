#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_REPO = process.cwd();
const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/diagnose-root-bound-pairs.mjs " +
        "--analysis <coach-analysis-lab results.json> " +
        "[--external-child-search <external-child-search.json>] " +
        "[--repo <Coach repo>] [--depth 8] [--max-positions <n>] " +
        "[--min-diff <cp>] [--min-child-band <cp>] [--out <dir>]"
    );
}

function parseArgs(argv) {
    const args = {
        repo: DEFAULT_REPO,
        analysis: null,
        externalChildSearch: null,
        depth: 8,
        maxPositions: 40,
        minDiff: 150,
        minChildBand: 100,
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--repo") {
            args.repo = argv[++index];
        }
        else if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--external-child-search") {
            args.externalChildSearch = argv[++index];
        }
        else if (token === "--depth") {
            args.depth = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-positions") {
            args.maxPositions = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-child-band") {
            args.minChildBand = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.analysis) {
        throw new Error("Missing --analysis");
    }

    for (const [name, value] of [
        ["--depth", args.depth],
        ["--max-positions", args.maxPositions],
        ["--min-diff", args.minDiff],
        ["--min-child-band", args.minChildBand]
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

function isMateScore(score) {
    return Math.abs(score) >= MATE_THRESHOLD;
}

function whiteEvalToRootSideCp(whiteEvalText, rootSideToMove) {
    const whiteCp =
        Math.round(Number.parseFloat(whiteEvalText) * 100);

    return rootSideToMove > 0
        ? whiteCp
        : -whiteCp;
}

function inputRows(analysis, externalChildSearch, args) {
    const externalByKey = new Map(
        (externalChildSearch?.rows || [])
            .filter(row => row.keep)
            .map(row => [keyFor(row.label, row.fen), row])
    );

    return (analysis.positions || [])
        .filter(position =>
            !position.error &&
            position.coach?.bestMove &&
            position.reference?.bestMove &&
            position.comparison?.bestMoveAgree === false
        )
        .map(position => ({
            position,
            diffCp: absoluteDiff(position)
        }))
        .filter(row =>
            row.diffCp !== null &&
            row.diffCp >= args.minDiff &&
            (!externalChildSearch || externalByKey.has(keyFor(row.position.label, row.position.fen)))
        )
        .map(row => ({
            ...row,
            externalChild:
                externalByKey.get(keyFor(row.position.label, row.position.fen)) ||
                null
        }))
        .sort((left, right) => right.diffCp - left.diffCp)
        .slice(0, args.maxPositions);
}

function safeSearch(fn) {
    try {
        return {
            ok: true,
            value: fn()
        };
    }
    catch (error) {
        return {
            ok: false,
            error: error.message
        };
    }
}

function rootRowFor(root, moveUci) {
    return (root.rootMoves || []).find(row => row.uci === moveUci) || null;
}

function childSearchForMove({
    fen,
    moveUci,
    rootSideToMove,
    childDepth,
    uciModule
}) {
    const engine = uciModule.createEngineCore(fen);
    const legalMoves = engine.legalMoveGenerator.generateMoves();
    const move = uciModule.uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            move: moveUci,
            legal: false,
            error: "illegal-move"
        };
    }

    engine.board.makeMove(move);

    const search =
        safeSearch(() =>
            uciModule.withMutedConsole(
                () => engine.search.bestMove(
                    Math.max(1, childDepth),
                    { quiet: true }
                )
            )
        );

    if (!search.ok) {
        return {
            move: moveUci,
            legal: true,
            error: search.error
        };
    }

    return {
        move: moveUci,
        legal: true,
        childBest: search.value.uci,
        childEvaluation: search.value.evaluation,
        childRootSideScore:
            whiteEvalToRootSideCp(search.value.evaluation, rootSideToMove),
        childNodes: search.value.nodes,
        childDepth: search.value.depth ?? childDepth,
        error: null
    };
}

function classifyPair(args, item) {
    const reasons = [];

    if (!item.coachRootRow) {
        reasons.push("coach-root-missing");
    }

    if (!item.referenceRootRow) {
        reasons.push("reference-root-missing");
    }

    if (item.rootGapCp === null) {
        reasons.push("missing-root-gap");
    }

    if (item.childGapCp === null) {
        reasons.push("missing-child-gap");
    }

    if (item.childBandCp === null || item.childBandCp < args.minChildBand) {
        reasons.push(`childBand<${args.minChildBand}`);
    }

    if (item.rootGapCp !== null && item.childGapCp !== null) {
        if (Math.abs(item.rootGapCp) < args.minChildBand &&
            Math.abs(item.childGapCp) >= args.minChildBand) {
            reasons.push("bound-like-root-tie");
        }
        else if (Math.abs(item.rootGapCp) >= args.minChildBand) {
            reasons.push("root-already-spread");
        }
        else {
            reasons.push("root-and-child-flat");
        }
    }

    if (
        item.externalGapCp !== null &&
        item.externalGapCp >= args.minChildBand
    ) {
        if (item.childGapCp === null || item.childGapCp < args.minChildBand) {
            reasons.push("coach-child-disagrees-with-external");
        }
        else {
            reasons.push("coach-child-confirms-external");
        }
    }

    if (
        item.coachRootRow?.score !== undefined &&
        isMateScore(item.coachRootRow.score)
    ) {
        reasons.push("coach-root-mate");
    }

    if (
        item.referenceRootRow?.score !== undefined &&
        isMateScore(item.referenceRootRow.score)
    ) {
        reasons.push("reference-root-mate");
    }

    return {
        boundLike:
            reasons.includes("bound-like-root-tie") &&
            !reasons.includes("coach-root-mate") &&
            !reasons.includes("reference-root-mate"),
        reasons
    };
}

async function analyzeRow(row, args, uciModule) {
    const { position, diffCp, externalChild } = row;
    const coachMove = position.coach.bestMove;
    const referenceMove = position.reference.bestMove;
    const rootEngine = uciModule.createEngineCore(position.fen);
    const rootSideToMove = rootEngine.board.sideToMove;
    const root =
        uciModule.withMutedConsole(
            () => rootEngine.search.bestMove(args.depth, { quiet: true })
        );
    const coachRootRow = rootRowFor(root, coachMove);
    const referenceRootRow = rootRowFor(root, referenceMove);
    const childDepth = Math.max(1, args.depth - 1);
    const coachChild =
        childSearchForMove({
            fen: position.fen,
            moveUci: coachMove,
            rootSideToMove,
            childDepth,
            uciModule
        });
    const referenceChild =
        childSearchForMove({
            fen: position.fen,
            moveUci: referenceMove,
            rootSideToMove,
            childDepth,
            uciModule
        });
    const rootGapCp =
        coachRootRow &&
        referenceRootRow &&
        Number.isFinite(coachRootRow.score) &&
        Number.isFinite(referenceRootRow.score)
            ? referenceRootRow.score - coachRootRow.score
            : null;
    const childGapCp =
        Number.isFinite(coachChild.childRootSideScore) &&
        Number.isFinite(referenceChild.childRootSideScore)
            ? referenceChild.childRootSideScore -
                coachChild.childRootSideScore
            : null;
    const childBandCp =
        Number.isFinite(coachChild.childRootSideScore) &&
        Number.isFinite(referenceChild.childRootSideScore)
            ? Math.abs(childGapCp)
            : null;
    const item = {
        label: position.label,
        fen: position.fen,
        depth: args.depth,
        childDepth,
        diffCp,
        rootBest: root.uci,
        coachMove,
        referenceMove,
        coachRootRow,
        referenceRootRow,
        coachChild,
        referenceChild,
        rootGapCp,
        childGapCp,
        childBandCp,
        externalGapCp: externalChild?.gapCp ?? null
    };
    const classification = classifyPair(args, item);

    return {
        ...item,
        boundLike: classification.boundLike,
        reasons: classification.reasons
    };
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
        "# Root Bound Pair Diagnostic",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- External child-search: ${args.externalChildSearch ? `\`${args.externalChildSearch}\`` : "n/a"}`,
        `- Root depth: ${args.depth}`,
        `- Child depth: ${Math.max(1, args.depth - 1)}`,
        `- Minimum child band: ${args.minChildBand}cp`,
        `- Bound-like rows: ${payload.summary.boundLike}`,
        `- Audited: ${payload.summary.audited}`,
        `- Reason counts: ${formatCounts(payload.summary.reasonCounts) || "none"}`,
        "",
        "| Bound-like | Label | Diff | Coach | Root | Child | Ref | Root | Child | Root gap | Child gap | External gap | Reasons | FEN |",
        "| --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |"
    ];

    for (const item of payload.rows) {
        lines.push([
            item.boundLike ? "yes" : "no",
            escapeMarkdown(item.label),
            item.diffCp ?? "",
            item.coachMove,
            item.coachRootRow?.score ?? "",
            item.coachChild.childRootSideScore ?? "",
            item.referenceMove,
            item.referenceRootRow?.score ?? "",
            item.referenceChild.childRootSideScore ?? "",
            item.rootGapCp ?? "",
            item.childGapCp ?? "",
            item.externalGapCp ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = path.resolve(args.repo);
    const analysis = readJson(args.analysis);
    const externalChildSearch =
        args.externalChildSearch ? readJson(args.externalChildSearch) : null;
    const rows = inputRows(analysis, externalChildSearch, args);
    const uciModule = await import(
        pathToFileURL(path.join(repo, "js/uci/uciengine.js")).href
    );
    const audited = [];

    for (const [index, row] of rows.entries()) {
        console.error(
            `[${index + 1}/${rows.length}] ${row.position.label} ` +
            `diff=${row.diffCp}cp`
        );
        audited.push(await analyzeRow(row, args, uciModule));
    }

    audited.sort((left, right) => {
        if (left.boundLike !== right.boundLike) {
            return left.boundLike ? -1 : 1;
        }

        return (right.childBandCp ?? -1) - (left.childBandCp ?? -1);
    });

    const reasonCounts = countsBy(
        audited.flatMap(item => item.reasons),
        reason => reason
    );
    const payload = {
        args,
        summary: {
            inputPositions: rows.length,
            audited: audited.length,
            boundLike: audited.filter(item => item.boundLike).length,
            reasonCounts
        },
        rows: audited
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "root-bound-pairs.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "root-bound-pairs.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Audited ${payload.summary.audited} row(s), ` +
        `${payload.summary.boundLike} bound-like root tie(s).`
    );

    for (const item of audited.slice(0, 10)) {
        console.log(
            `${item.boundLike ? "BOUND" : "skip"} ${item.label}: ` +
            `rootGap=${item.rootGapCp ?? "n/a"}cp, ` +
            `childGap=${item.childGapCp ?? "n/a"}cp, ` +
            `${item.coachMove} vs ${item.referenceMove}`
        );
    }
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(error => {
        usage();
        console.error(error.stack || error.message);
        process.exit(1);
    });
}

export {
    classifyPair,
    parseArgs
};
