#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
    createEngineCore,
    moveToUci,
    uciToMove,
    withMutedConsole
} from "../js/uci/uciengine.js";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/select-coach-child-gap-fens.mjs " +
        "--fen-file <file> --out <dir> [--root-depth 8] [--child-depth 8] " +
        "[--min-gap 100] [--root-limit 12] [--limit 40] [--max-ms-per-child 5000] " +
        "[--exclude-label-regex <pattern>] [--min-root-band 0] " +
        "[--max-root-top-ties 99] [--max-root-mate-rows 0] [--max-ms-per-root 10000] " +
        "[--min-confirm-root-band 0] [--max-confirm-root-top-ties 99] " +
        "[--confirm-root-depth <n>] [--nonmate-check-depth <n>] " +
        "[--require-confirm-root-different] [--progress]"
    );
}

function parseArgs(argv) {
    const args = {
        fenFile: null,
        out: null,
        rootDepth: 8,
        childDepth: 8,
        minGap: 100,
        rootLimit: 12,
        limit: 40,
        maxMsPerChild: 5000,
        excludeLabelRegex: null,
        minRootBand: 0,
        maxRootTopTies: 99,
        maxRootMateRows: 0,
        maxMsPerRoot: 10000,
        minConfirmRootBand: 0,
        maxConfirmRootTopTies: 99,
        confirmRootDepth: null,
        nonmateCheckDepth: null,
        requireConfirmRootDifferent: false,
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--fen-file") args.fenFile = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--root-depth") args.rootDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--child-depth") args.childDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--min-gap") args.minGap = Number.parseInt(argv[++index], 10);
        else if (token === "--root-limit") args.rootLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-child") args.maxMsPerChild = Number.parseInt(argv[++index], 10);
        else if (token === "--exclude-label-regex") args.excludeLabelRegex = argv[++index];
        else if (token === "--min-root-band") args.minRootBand = Number.parseInt(argv[++index], 10);
        else if (token === "--max-root-top-ties") args.maxRootTopTies = Number.parseInt(argv[++index], 10);
        else if (token === "--max-root-mate-rows") args.maxRootMateRows = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-root") args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        else if (token === "--min-confirm-root-band") args.minConfirmRootBand = Number.parseInt(argv[++index], 10);
        else if (token === "--max-confirm-root-top-ties") args.maxConfirmRootTopTies = Number.parseInt(argv[++index], 10);
        else if (token === "--confirm-root-depth") args.confirmRootDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--nonmate-check-depth") args.nonmateCheckDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--require-confirm-root-different") args.requireConfirmRootDifferent = true;
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
        ["--min-gap", args.minGap],
        ["--root-limit", args.rootLimit],
        ["--limit", args.limit],
        ["--max-ms-per-child", args.maxMsPerChild],
        ["--min-root-band", args.minRootBand],
        ["--max-root-top-ties", args.maxRootTopTies],
        ["--max-root-mate-rows", args.maxRootMateRows],
        ["--max-ms-per-root", args.maxMsPerRoot],
        ["--min-confirm-root-band", args.minConfirmRootBand],
        ["--max-confirm-root-top-ties", args.maxConfirmRootTopTies]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    if (
        args.confirmRootDepth !== null &&
        (!Number.isInteger(args.confirmRootDepth) || args.confirmRootDepth <= 0)
    ) {
        throw new Error("--confirm-root-depth must be a positive integer");
    }
    if (
        args.nonmateCheckDepth !== null &&
        (!Number.isInteger(args.nonmateCheckDepth) || args.nonmateCheckDepth <= 0)
    ) {
        throw new Error("--nonmate-check-depth must be a positive integer");
    }

    args.excludeLabelPattern =
        args.excludeLabelRegex === null
            ? null
            : new RegExp(args.excludeLabelRegex);

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

function scoreBand(rows) {
    if (rows.length === 0) return null;
    return rows[0].score - rows.at(-1).score;
}

function countTopTies(rows) {
    if (rows.length === 0) return 0;

    const topScore = rows[0].score;

    return rows.filter(row => row.score === topScore).length;
}

function whiteEvalToRootSideCp(whiteEvalText, rootSideToMove) {
    const whiteCp =
        Math.round(Number.parseFloat(whiteEvalText) * 100);

    return rootSideToMove > 0
        ? whiteCp
        : -whiteCp;
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

function childSearchForMove({
    fen,
    moveUci,
    rootSideToMove,
    childDepth,
    maxMsPerChild
}) {
    const engine = createEngineCore(fen);
    const legalMoves = engine.legalMoveGenerator.generateMoves();
    const move = uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            move: moveUci,
            legal: false,
            error: "illegal-move"
        };
    }

    engine.board.makeMove(move);

    const startMs = performance.now();
    const deadlineMs =
        maxMsPerChild === null
            ? null
            : startMs + maxMsPerChild;
    const search =
        safeSearch(() =>
            withMutedConsole(() =>
                engine.search.bestMove(
                    Math.max(1, childDepth),
                    {
                        quiet: true,
                        ...(deadlineMs === null ? {} : { deadlineMs })
                    }
                )
            )
        );
    const elapsedMs = performance.now() - startMs;

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
        completedDepth: search.value.depth ?? childDepth,
        requestedDepth: childDepth,
        timed: (search.value.depth ?? childDepth) < childDepth,
        elapsedMs
    };
}

function searchRoot(fen, depth, maxMsPerRoot) {
    const engine = createEngineCore(fen);
    const startMs = performance.now();
    const deadlineMs =
        maxMsPerRoot === null
            ? null
            : startMs + maxMsPerRoot;

    const result =
        withMutedConsole(() =>
            engine.search.bestMove(
                Math.max(1, depth),
                {
                    quiet: true,
                    ...(deadlineMs === null ? {} : { deadlineMs })
                }
            )
        );

    return {
        ...result,
        elapsedMs: performance.now() - startMs,
        requestedDepth: depth,
        timed: (result.depth ?? depth) < depth
    };
}

function rootSummary(result, rootLimit) {
    const rootMoves =
        (result.rootMoves || [])
            .slice(0, rootLimit)
            .map(row => ({
                uci: row.uci,
                score: row.score
            }));
    const bestMove =
        rootMoves[0]?.uci ??
        (result.bestMove ? moveToUci(result.bestMove) : null);

    return {
        depth: result.depth,
        requestedDepth: result.requestedDepth,
        bestMove,
        bestScore: rootMoves[0]?.score ?? null,
        band: scoreBand(rootMoves),
        topTies: countTopTies(rootMoves),
        mateRows: rootMoves.filter(row => isMateScore(row.score)).length,
        elapsedMs: result.elapsedMs,
        timed: result.timed,
        rootMoves
    };
}

function analyzePosition(position, args) {
    const rootEngine = createEngineCore(position.fen);
    const rootSideToMove = rootEngine.board.sideToMove;
    const rootSearch =
        safeSearch(() =>
            searchRoot(position.fen, args.rootDepth, args.maxMsPerRoot)
        );

    if (!rootSearch.ok) {
        return {
            ...position,
            candidate: false,
            reasons: [`root-search-error:${rootSearch.error}`],
            root: null,
            confirmRoot: null,
            rootBestChild: null,
            bestAlternative: null,
            alternatives: []
        };
    }

    const root = rootSearch.value;
    const rootInfo = rootSummary(root, args.rootLimit);
    const rootMoves = rootInfo.rootMoves;
    const rootBest = rootInfo.bestMove;
    const rootBestScore = rootInfo.bestScore;
    const rootMateRows = rootInfo.mateRows;
    const rootBand = rootInfo.band;
    const rootTopTies = rootInfo.topTies;

    if (!rootBest) {
        return {
            ...position,
            candidate: false,
            reasons: ["missing-root-best"],
            root: {
                depth: root.depth,
                bestMove: rootBest,
                bestScore: rootBestScore,
                band: rootBand,
                topTies: rootTopTies,
                mateRows: rootMateRows,
                rootMoves
            }
        };
    }

    const rootBestChild =
        childSearchForMove({
            fen: position.fen,
            moveUci: rootBest,
            rootSideToMove,
            childDepth: args.childDepth,
            maxMsPerChild: args.maxMsPerChild
        });
    const alternatives = [];

    for (const row of rootMoves) {
        if (row.uci === rootBest) continue;

        const child =
            childSearchForMove({
                fen: position.fen,
                moveUci: row.uci,
                rootSideToMove,
                childDepth: args.childDepth,
                maxMsPerChild: args.maxMsPerChild
            });
        const gapCp =
            Number.isFinite(child.childRootSideScore) &&
            Number.isFinite(rootBestChild.childRootSideScore)
                ? child.childRootSideScore - rootBestChild.childRootSideScore
                : null;

        alternatives.push({
            move: row.uci,
            rootScore: row.score,
            child,
            gapCp
        });
    }

    alternatives.sort(
        (left, right) =>
            (right.gapCp ?? -Infinity) - (left.gapCp ?? -Infinity)
    );

    const bestAlternative = alternatives[0] ?? null;
    const reasons = [];

    if (rootBestChild.error) {
        reasons.push(`root-best-child-error:${rootBestChild.error}`);
    }
    if (rootBand !== null && rootBand < args.minRootBand) {
        reasons.push(`rootBand<${args.minRootBand}`);
    }
    if (rootTopTies > args.maxRootTopTies) {
        reasons.push(`rootTopTies>${args.maxRootTopTies}`);
    }
    if (!bestAlternative) {
        reasons.push("missing-alternative");
    }
    else {
        if (bestAlternative.child.error) {
            reasons.push(`alternative-child-error:${bestAlternative.child.error}`);
        }
        if (bestAlternative.gapCp === null || bestAlternative.gapCp < args.minGap) {
            reasons.push(`gap<${args.minGap}`);
        }
    }
    if (rootMateRows > args.maxRootMateRows || isMateScore(rootBestScore ?? 0)) {
        reasons.push("mate-root-score");
    }
    if (root.timed) {
        reasons.push("rootSearchTimed");
    }

    let confirmRoot = null;
    let nonmateCheckRoot = null;

    if (args.confirmRootDepth !== null) {
        const confirmSearch =
            safeSearch(() =>
                searchRoot(position.fen, args.confirmRootDepth, args.maxMsPerRoot)
            );

        if (!confirmSearch.ok) {
            reasons.push(`confirm-root-search-error:${confirmSearch.error}`);
        }
        else {
            const confirmResult = confirmSearch.value;
            confirmRoot = rootSummary(confirmResult, args.rootLimit);

        if (
            bestAlternative &&
            args.requireConfirmRootDifferent &&
            confirmRoot.bestMove !== bestAlternative.move
        ) {
            reasons.push("confirmRootDoesNotPreferAlternative");
        }

        if (confirmRoot.mateRows > args.maxRootMateRows) {
            reasons.push("confirmRootMateRows");
        }
        if (confirmRoot.timed) {
            reasons.push("confirmRootTimed");
        }
        if (
            confirmRoot.band !== null &&
            confirmRoot.band < args.minConfirmRootBand
        ) {
            reasons.push(`confirmRootBand<${args.minConfirmRootBand}`);
        }
        if (confirmRoot.topTies > args.maxConfirmRootTopTies) {
            reasons.push(`confirmRootTopTies>${args.maxConfirmRootTopTies}`);
        }
        }
    }

    if (args.nonmateCheckDepth !== null && reasons.length === 0) {
        const nonmateSearch =
            safeSearch(() =>
                searchRoot(position.fen, args.nonmateCheckDepth, args.maxMsPerRoot)
            );

        if (!nonmateSearch.ok) {
            reasons.push(`nonmate-check-search-error:${nonmateSearch.error}`);
        }
        else {
            nonmateCheckRoot = rootSummary(nonmateSearch.value, args.rootLimit);

            if (nonmateCheckRoot.timed) {
                reasons.push("nonmateCheckTimed");
            }
            if (
                nonmateCheckRoot.mateRows > args.maxRootMateRows ||
                isMateScore(nonmateCheckRoot.bestScore ?? 0)
            ) {
                reasons.push("nonmateCheckMateRows");
            }
            if (
                bestAlternative &&
                args.requireConfirmRootDifferent &&
                nonmateCheckRoot.bestMove !== bestAlternative.move
            ) {
                reasons.push("nonmateCheckDoesNotPreferAlternative");
            }
        }
    }

    return {
        ...position,
        candidate: reasons.length === 0,
        reasons,
        root: {
            depth: root.depth,
            bestMove: rootBest,
            bestScore: rootBestScore,
            band: rootBand,
            topTies: rootTopTies,
            mateRows: rootMateRows,
            rootMoves
        },
        confirmRoot,
        nonmateCheckRoot,
        rootBestChild,
        bestAlternative,
        alternatives
    };
}

function buildMarkdown(args, payload) {
    const lines = [
        "# Coach Child-Gap Selector",
        "",
        `- Source: \`${args.fenFile}\``,
        `- Root depth: ${args.rootDepth}`,
        `- Child depth: ${args.childDepth}`,
        `- Min child gap: ${args.minGap}cp`,
        `- Root limit: ${args.rootLimit}`,
        `- Min root band: ${args.minRootBand}cp`,
            `- Max root top ties: ${args.maxRootTopTies}`,
            `- Max root mate rows: ${args.maxRootMateRows}`,
            `- Max root search time: ${args.maxMsPerRoot}ms`,
            `- Min confirm root band: ${args.minConfirmRootBand}cp`,
            `- Max confirm root top ties: ${args.maxConfirmRootTopTies}`,
            `- Confirm root depth: ${args.confirmRootDepth ?? "off"}`,
        `- Non-mate check depth: ${args.nonmateCheckDepth ?? "off"}`,
        `- Require confirm root different: ${args.requireConfirmRootDifferent ? "yes" : "no"}`,
        `- Input positions: ${payload.summary.inputPositions}`,
        `- Audited positions: ${payload.summary.audited}`,
        `- Candidates: ${payload.summary.candidates}`,
        "",
        "## Candidates",
        ""
    ];

    if (payload.candidates.length === 0) {
        lines.push("None.");
    }

    for (const [index, row] of payload.candidates.entries()) {
        lines.push(
            `### ${index + 1}. ${row.label}`,
            "",
            `- Root best: ${row.root.bestMove} (${row.root.bestScore}cp)`,
            `- Better child move: ${row.bestAlternative.move}, gap ${row.bestAlternative.gapCp}cp`,
            `- Root band: ${row.root.band ?? "n/a"}cp; top ties: ${row.root.topTies}; mate rows: ${row.root.mateRows}`,
            row.confirmRoot
                ? `- Confirm root: ${row.confirmRoot.bestMove} at depth ${row.confirmRoot.depth}`
                : "- Confirm root: off",
            row.nonmateCheckRoot
                ? `- Non-mate check: ${row.nonmateCheckRoot.bestMove} at depth ${row.nonmateCheckRoot.depth}`
                : "- Non-mate check: off",
            `- FEN: \`${row.fen}\``,
            ""
        );
    }

    lines.push("## Rejections", "");

    for (const row of payload.rows.filter(item => !item.candidate).slice(0, 40)) {
        lines.push(
            `- ${row.label}: ${row.reasons.join(", ") || "no reason"}; ` +
            `best alternative gap ${row.bestAlternative?.gapCp ?? "n/a"}cp`
        );
    }

    return lines.join("\n") + "\n";
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
            console.error(
                `[${index + 1}/${positions.length}] ${position.label}`
            );
        }

        rows.push(analyzePosition(position, args));
    }
    const candidates =
        rows
            .filter(row => row.candidate)
            .sort(
                (left, right) =>
                    (right.bestAlternative?.gapCp ?? -Infinity) -
                    (left.bestAlternative?.gapCp ?? -Infinity)
            );
    const payload = {
        args: {
            ...args,
            excludeLabelPattern: undefined
        },
        generatedAt: new Date().toISOString(),
        summary: {
            inputPositions: parseFenFile(args.fenFile).length,
            audited: rows.length,
            candidates: candidates.length
        },
        candidates,
        rows
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "coach-child-gap-candidates.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "coach-child-gap-candidates.md"),
        buildMarkdown(args, payload)
    );
    fs.writeFileSync(
        path.join(args.out, "coach-child-gap-candidates.fens"),
        candidates.map(row => `${row.label} | ${row.fen}`).join("\n") +
            (candidates.length ? "\n" : "")
    );

    console.log(
        `Audited ${rows.length} position(s), found ${candidates.length} Coach child-gap candidate(s).`
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
