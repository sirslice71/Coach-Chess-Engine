#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REPO = process.cwd();
const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/verify-reference-child-search.mjs " +
        "--analysis <coach-analysis-lab results.json> [--repo <Coach repo>] " +
        "[--child-depth 7] [--max-positions <n>] [--min-diff <cp>] " +
        "[--min-gap <cp>] [--root-limit <n>] [--max-ms-per-child <ms>] [--out <dir>]"
    );
}

function parseArgs(argv) {
    const args = {
        repo: DEFAULT_REPO,
        analysis: null,
        childDepth: 7,
        maxPositions: 40,
        minDiff: 150,
        minGap: 100,
        rootLimit: 16,
        maxMsPerChild: null,
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
        else if (token === "--child-depth") {
            args.childDepth = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-positions") {
            args.maxPositions = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-gap") {
            args.minGap = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--root-limit") {
            args.rootLimit = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-ms-per-child") {
            args.maxMsPerChild = Number.parseInt(argv[++index], 10);
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
        ["--child-depth", args.childDepth],
        ["--max-positions", args.maxPositions],
        ["--min-diff", args.minDiff],
        ["--min-gap", args.minGap],
        ["--root-limit", args.rootLimit]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    if (
        args.maxMsPerChild !== null &&
        (
            !Number.isInteger(args.maxMsPerChild) ||
            args.maxMsPerChild <= 0
        )
    ) {
        throw new Error("--max-ms-per-child must be a positive integer");
    }

    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function inputRows(analysis, args) {
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
            row.diffCp >= args.minDiff
        )
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

function moveInRootRows(root, moveUci, limit) {
    return (root.rootMoves || [])
        .slice(0, limit)
        .some(rootMove => rootMove.uci === moveUci);
}

function rootRank(root, moveUci) {
    const index =
        (root.rootMoves || [])
            .findIndex(rootMove => rootMove.uci === moveUci);

    return index === -1
        ? null
        : index + 1;
}

function rootScore(root, moveUci) {
    const row =
        (root.rootMoves || [])
            .find(rootMove => rootMove.uci === moveUci);

    return row?.score ?? null;
}

function childSearchForMove({
    fen,
    moveUci,
    rootSideToMove,
    childDepth,
    maxMsPerChild,
    uciModule
}) {
    const engine =
        uciModule.createEngineCore(fen);

    const legalMoves =
        engine.legalMoveGenerator.generateMoves();

    const move =
        uciModule.uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            move: moveUci,
            legal: false,
            error: "illegal-move"
        };
    }

    engine.board.makeMove(move);

    const startMs =
        performance.now();

    const deadlineMs =
        maxMsPerChild === null
            ? null
            : startMs + maxMsPerChild;

    const search =
        safeSearch(() =>
            uciModule.withMutedConsole(
                () => engine.search.bestMove(
                    Math.max(1, childDepth),
                    {
                        quiet: true,
                        ...(deadlineMs === null ? {} : { deadlineMs })
                    }
                )
            )
        );

    const elapsedMs =
        performance.now() - startMs;

    if (!search.ok) {
        return {
            move: moveUci,
            legal: true,
            error: search.error,
            elapsedMs
        };
    }

    return {
        move: moveUci,
        legal: true,
        childBest: search.value.uci,
        childEvaluation: search.value.evaluation,
        childRootSideScore:
            whiteEvalToRootSideCp(
                search.value.evaluation,
                rootSideToMove
            ),
        childNodes: search.value.nodes,
        completedDepth: search.value.depth ?? childDepth,
        requestedDepth: childDepth,
        timed:
            (search.value.depth ?? childDepth) < childDepth,
        elapsedMs
    };
}

function classify(args, item) {
    const reasons = [];

    if (!item.coachChild.legal) {
        reasons.push("coach-move-illegal");
    }

    if (!item.referenceChild.legal) {
        reasons.push("reference-move-illegal");
    }

    if (item.coachChild.error) {
        reasons.push(`coach-child-error:${item.coachChild.error}`);
    }

    if (item.referenceChild.error) {
        reasons.push(`reference-child-error:${item.referenceChild.error}`);
    }

    if (!item.referenceInRootLimit) {
        reasons.push(`reference-not-in-top-${args.rootLimit}`);
    }

    if (item.gapCp === null || item.gapCp < args.minGap) {
        reasons.push(`gap<${args.minGap}`);
    }

    if (
        item.coachRootScore !== null &&
        item.referenceRootScore !== null &&
        (
            isMateScore(item.coachRootScore) ||
            isMateScore(item.referenceRootScore)
        )
    ) {
        reasons.push("mate-root-score");
    }

    return {
        keep: reasons.length === 0,
        reasons
    };
}

async function analyzePosition(row, args, uciModule) {
    const { position, diffCp } = row;
    const fen = position.fen;
    const coachMove = position.coach.bestMove;
    const referenceMove = position.reference.bestMove;
    const rootEngine =
        uciModule.createEngineCore(fen);
    const rootSideToMove =
        rootEngine.board.sideToMove;

    const root =
        uciModule.withMutedConsole(
            () => rootEngine.search.bestMove(
                Math.max(1, args.childDepth + 1),
                { quiet: true }
            )
        );

    const coachChild =
        childSearchForMove({
            fen,
            moveUci: coachMove,
            rootSideToMove,
            childDepth: args.childDepth,
            maxMsPerChild: args.maxMsPerChild,
            uciModule
        });

    const referenceChild =
        childSearchForMove({
            fen,
            moveUci: referenceMove,
            rootSideToMove,
            childDepth: args.childDepth,
            maxMsPerChild: args.maxMsPerChild,
            uciModule
        });

    const gapCp =
        Number.isFinite(coachChild.childRootSideScore) &&
        Number.isFinite(referenceChild.childRootSideScore)
            ? referenceChild.childRootSideScore -
                coachChild.childRootSideScore
            : null;

    const item = {
        label: position.label,
        fen,
        diffCp,
        coachMove,
        referenceMove,
        coachScore: position.coach.score ?? null,
        referenceScore: position.reference.score ?? null,
        rootBest: root.uci,
        coachRootRank: rootRank(root, coachMove),
        referenceRootRank: rootRank(root, referenceMove),
        coachRootScore: rootScore(root, coachMove),
        referenceRootScore: rootScore(root, referenceMove),
        referenceInRootLimit:
            moveInRootRows(root, referenceMove, args.rootLimit),
        rootTopTieCount:
            (root.rootMoves || []).filter(rootMove =>
                rootMove.score === root.rootMoves?.[0]?.score
            ).length,
        coachChild,
        referenceChild,
        gapCp
    };

    const classification =
        classify(args, item);

    return {
        ...item,
        keep: classification.keep,
        reasons: classification.reasons,
        score:
            (gapCp ?? -10000) * 4 +
            diffCp -
            (item.referenceRootRank ?? 100) * 5
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
        "# Reference Child-Search Verifier",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Child depth: ${args.childDepth}`,
        `- Max positions: ${args.maxPositions}`,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Minimum child gap: ${args.minGap}cp`,
        `- Root limit: ${args.rootLimit}`,
        args.maxMsPerChild === null
            ? "- Max ms per child: none"
            : `- Max ms per child: ${args.maxMsPerChild}`,
        `- Candidates: ${payload.summary.candidates}`,
        `- Audited: ${payload.summary.audited}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "| Keep | Label | Diff | Coach | Coach child | Ref | Ref child | Gap | Ref rank | Root ties | Reasons | FEN |",
        "| --- | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |"
    ];

    for (const item of payload.rows) {
        lines.push([
            item.keep ? "yes" : "no",
            escapeMarkdown(item.label),
            item.diffCp,
            `${item.coachMove} ${scoreText(item.coachScore)}`,
            item.coachChild.childRootSideScore ?? "",
            `${item.referenceMove} ${scoreText(item.referenceScore)}`,
            item.referenceChild.childRootSideScore ?? "",
            item.gapCp ?? "",
            item.referenceRootRank ?? "",
            item.rootTopTieCount ?? "",
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
    const rows = inputRows(analysis, args);

    const uciModule = await import(
        pathToFileURL(path.join(repo, "js/uci/uciengine.js")).href
    );

    const verified = [];

    for (const [index, row] of rows.entries()) {
        console.error(
            `[${index + 1}/${rows.length}] ${row.position.label} ` +
            `diff=${row.diffCp}cp`
        );
        verified.push(await analyzePosition(row, args, uciModule));
    }

    verified.sort((left, right) => {
        if (left.keep !== right.keep) {
            return left.keep ? -1 : 1;
        }

        return right.score - left.score;
    });

    const rejectionCounts = countsBy(
        verified.flatMap(item => item.reasons),
        reason => reason
    );

    const payload = {
        args,
        summary: {
            inputPositions: rows.length,
            audited: verified.length,
            candidates: verified.filter(item => item.keep).length,
            rejectionCounts
        },
        rows: verified
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "reference-child-search.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "reference-child-search.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Verified ${payload.summary.audited} position(s), ` +
        `${payload.summary.candidates} candidate(s).`
    );

    for (const item of verified.slice(0, 10)) {
        console.log(
            `${item.keep ? "KEEP" : "skip"} ${item.label}: ` +
            `gap=${item.gapCp ?? "n/a"}cp, ` +
            `diff=${item.diffCp}cp, ` +
            `${item.coachMove} vs ${item.referenceMove}`
        );
    }
}

main().catch(error => {
    usage();
    console.error(error.stack || error.message);
    process.exit(1);
});
