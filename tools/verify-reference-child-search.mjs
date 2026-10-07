#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_REPO = process.cwd();
const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/verify-reference-child-search.mjs " +
        "--analysis <coach-analysis-lab results.json> [--repo <Coach repo>] " +
        "[--child-depth 7] [--max-positions <n>] [--min-diff <cp>] " +
        "[--min-gap <cp>] [--root-limit <n>] [--max-ms-per-root <ms>] " +
        "[--max-ms-per-child <ms>] " +
        "[--confirm-child-depth <n|analysis|off>] [--prefilter-root] [--out <dir>]"
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
        maxMsPerRoot: null,
        maxMsPerChild: null,
        confirmChildDepth: "analysis",
        prefilterRoot: false,
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
        else if (token === "--max-ms-per-root") {
            args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-ms-per-child") {
            args.maxMsPerChild = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--confirm-child-depth") {
            const value = argv[++index];

            if (value === "analysis") {
                args.confirmChildDepth = "analysis";
            }
            else if (value === "off") {
                args.confirmChildDepth = null;
            }
            else {
                args.confirmChildDepth = Number.parseInt(value, 10);
            }
        }
        else if (token === "--prefilter-root") {
            args.prefilterRoot = true;
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
        args.maxMsPerRoot !== null &&
        (
            !Number.isInteger(args.maxMsPerRoot) ||
            args.maxMsPerRoot <= 0
        )
    ) {
        throw new Error("--max-ms-per-root must be a positive integer");
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

    if (
        args.confirmChildDepth !== null &&
        args.confirmChildDepth !== "analysis" &&
        (
            !Number.isInteger(args.confirmChildDepth) ||
            args.confirmChildDepth <= 0
        )
    ) {
        throw new Error("--confirm-child-depth must be a positive integer, analysis, or off");
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

function hasMateChildScore(child) {
    return Number.isFinite(child?.childRootSideScore) &&
        isMateScore(child.childRootSideScore);
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

function rootSearch({
    rootEngine,
    rootDepth,
    maxMsPerRoot,
    uciModule
}) {
    const startMs =
        performance.now();
    const deadlineMs =
        maxMsPerRoot === null
            ? null
            : startMs + maxMsPerRoot;
    const search =
        uciModule.withMutedConsole(
            () => rootEngine.search.bestMove(
                rootDepth,
                {
                    quiet: true,
                    ...(deadlineMs === null ? {} : { deadlineMs })
                }
            )
        );
    const elapsedMs =
        performance.now() - startMs;

    return {
        ...search,
        elapsedMs,
        timed:
            maxMsPerRoot !== null &&
            elapsedMs >= maxMsPerRoot
    };
}

function inferConfirmChildDepth(args, position) {
    if (args.confirmChildDepth === null) {
        return null;
    }

    if (Number.isInteger(args.confirmChildDepth)) {
        return args.confirmChildDepth;
    }

    const depths = [
        position.coach?.depth,
        position.reference?.depth
    ].filter(Number.isInteger);

    if (depths.length === 0) {
        return args.childDepth;
    }

    return Math.max(args.childDepth, ...depths);
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

    if (item.prefilterReason) {
        reasons.push(item.prefilterReason);
    }

    if (item.rootTimed) {
        reasons.push("root-timed");
    }

    if (item.gapCp === null || item.gapCp < args.minGap) {
        reasons.push(`gap<${args.minGap}`);
    }

    if (
        hasMateChildScore(item.coachChild) ||
        hasMateChildScore(item.referenceChild)
    ) {
        reasons.push("mate-child-score");
    }

    if (item.confirmation) {
        if (item.confirmation.coachChild.error) {
            reasons.push(
                `confirm-coach-child-error:${item.confirmation.coachChild.error}`
            );
        }

        if (item.confirmation.referenceChild.error) {
            reasons.push(
                `confirm-reference-child-error:${item.confirmation.referenceChild.error}`
            );
        }

        if (
            item.confirmation.gapCp === null ||
            item.confirmation.gapCp < args.minGap
        ) {
            reasons.push(
                `confirm-gap<${args.minGap}@d${item.confirmation.childDepth}`
            );
        }

        if (
            hasMateChildScore(item.confirmation.coachChild) ||
            hasMateChildScore(item.confirmation.referenceChild)
        ) {
            reasons.push(`confirm-mate-child-score@d${item.confirmation.childDepth}`);
        }
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

function gapClass(args, gapCp) {
    if (!Number.isFinite(gapCp)) {
        return "unknown";
    }

    if (gapCp >= args.minGap) {
        return "candidate";
    }

    if (gapCp > 0) {
        return "positive-subthreshold";
    }

    if (gapCp === 0) {
        return "flat";
    }

    return "coach-favored";
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
        rootSearch({
            rootEngine,
            rootDepth: Math.max(1, args.childDepth + 1),
            maxMsPerRoot: args.maxMsPerRoot,
            uciModule
        });

    const coachRootScore =
        rootScore(root, coachMove);
    const referenceRootScore =
        rootScore(root, referenceMove);
    const referenceInRootLimit =
        moveInRootRows(root, referenceMove, args.rootLimit);
    const rootHasMateScore =
        coachRootScore !== null &&
        referenceRootScore !== null &&
        (
            isMateScore(coachRootScore) ||
            isMateScore(referenceRootScore)
        );

    if (
        args.prefilterRoot &&
        (
            !referenceInRootLimit ||
            rootHasMateScore
        )
    ) {
        const item = {
            label: position.label,
            fen,
            diffCp,
            coachMove,
            referenceMove,
            coachScore: position.coach.score ?? null,
            referenceScore: position.reference.score ?? null,
            rootBest: root.uci,
            rootTimed: root.timed === true,
            coachRootRank: rootRank(root, coachMove),
            referenceRootRank: rootRank(root, referenceMove),
            coachRootScore,
            referenceRootScore,
            referenceInRootLimit,
            rootTopTieCount:
                (root.rootMoves || []).filter(rootMove =>
                    rootMove.score === root.rootMoves?.[0]?.score
                ).length,
            coachChild: {
                move: coachMove,
                legal: true,
                skipped: true
            },
            referenceChild: {
                move: referenceMove,
                legal: true,
                skipped: true
            },
            gapCp: null,
            gapClass: "unknown",
            prefilterReason:
                !referenceInRootLimit
                    ? `prefilter-reference-not-in-top-${args.rootLimit}`
                    : "prefilter-mate-root-score"
        };
        const classification =
            classify(args, item);

        return {
            ...item,
            keep: false,
            reasons: classification.reasons,
            score:
                diffCp -
                (item.referenceRootRank ?? 100) * 5
        };
    }

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

    let item = {
        label: position.label,
        fen,
        diffCp,
        coachMove,
        referenceMove,
        coachScore: position.coach.score ?? null,
        referenceScore: position.reference.score ?? null,
        rootBest: root.uci,
        rootTimed: root.timed === true,
        coachRootRank: rootRank(root, coachMove),
        referenceRootRank: rootRank(root, referenceMove),
        coachRootScore,
        referenceRootScore,
        referenceInRootLimit,
        rootTopTieCount:
            (root.rootMoves || []).filter(rootMove =>
                rootMove.score === root.rootMoves?.[0]?.score
            ).length,
        coachChild,
        referenceChild,
        gapCp,
        gapClass: gapClass(args, gapCp)
    };

    let classification =
        classify(args, item);

    const confirmChildDepth =
        inferConfirmChildDepth(args, position);

    if (
        classification.keep &&
        confirmChildDepth !== null &&
        confirmChildDepth > args.childDepth
    ) {
        const confirmCoachChild =
            childSearchForMove({
                fen,
                moveUci: coachMove,
                rootSideToMove,
                childDepth: confirmChildDepth,
                maxMsPerChild: args.maxMsPerChild,
                uciModule
            });

        const confirmReferenceChild =
            childSearchForMove({
                fen,
                moveUci: referenceMove,
                rootSideToMove,
                childDepth: confirmChildDepth,
                maxMsPerChild: args.maxMsPerChild,
                uciModule
            });

        const confirmGapCp =
            Number.isFinite(confirmCoachChild.childRootSideScore) &&
            Number.isFinite(confirmReferenceChild.childRootSideScore)
                ? confirmReferenceChild.childRootSideScore -
                    confirmCoachChild.childRootSideScore
                : null;

        item = {
            ...item,
            confirmation: {
                childDepth: confirmChildDepth,
                coachChild: confirmCoachChild,
                referenceChild: confirmReferenceChild,
                gapCp: confirmGapCp
            }
        };

        classification =
            classify(args, item);
    }

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
        args.maxMsPerRoot === null
            ? "- Max ms per root: none"
            : `- Max ms per root: ${args.maxMsPerRoot}`,
        args.maxMsPerChild === null
            ? "- Max ms per child: none"
            : `- Max ms per child: ${args.maxMsPerChild}`,
        args.confirmChildDepth === null
            ? "- Confirm child depth: off"
            : `- Confirm child depth: ${args.confirmChildDepth}`,
        `- Candidates: ${payload.summary.candidates}`,
        `- Audited: ${payload.summary.audited}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "| Keep | Label | Diff | Coach | Coach child | Ref | Ref child | Gap | Gap class | Ref rank | Root ties | Reasons | FEN |",
        "| --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | --- |"
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
            item.gapClass ?? "unknown",
            item.referenceRootRank ?? "",
            item.rootTopTieCount ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function fenLine(item) {
    return `${item.label} | ${item.fen}`;
}

function writeFenList(outDir, fileName, rows) {
    fs.writeFileSync(
        path.join(outDir, fileName),
        rows.map(fenLine).join("\n") + (rows.length > 0 ? "\n" : "")
    );
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

        writeFenList(
            args.out,
            "reference-child-candidates.fens",
            verified.filter(item => item.keep)
        );

        writeFenList(
            args.out,
            "reference-child-positive-subthreshold.fens",
            verified.filter(item =>
                !item.keep &&
                item.gapClass === "positive-subthreshold"
            )
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
    classify,
    gapClass,
    inferConfirmChildDepth,
    parseArgs
};
