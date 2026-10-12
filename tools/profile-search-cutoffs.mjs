#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    createEngineCore,
    withMutedConsole
} from "../js/uci/uciengine.js";
import {
    TTFlag,
    scoreFromTT,
    scoreToTT
} from "../js/engine/transpositiontable.js";

function usage() {
    console.error(
        "Usage: node tools/profile-search-cutoffs.mjs " +
        "[--corpus <json>] [--classification <name>] " +
        "[--depth <n>] [--max-positions <n>] --out <json>"
    );
}

export function parseArgs(argv) {
    const args = {
        corpus: "tests/data/search_benchmark_corpus.json",
        classification: "primary",
        depth: null,
        maxPositions: null,
        out: null,
        help: false
    };

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];

        if (token === "--corpus") args.corpus = argv[++index];
        else if (token === "--classification") args.classification = argv[++index];
        else if (token === "--depth") args.depth = Number.parseInt(argv[++index], 10);
        else if (token === "--max-positions") args.maxPositions = Number.parseInt(argv[++index], 10);
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.out) throw new Error("Missing --out");
    if (args.depth !== null && (!Number.isInteger(args.depth) || args.depth <= 0)) {
        throw new Error("--depth must be a positive integer");
    }
    if (
        args.maxPositions !== null &&
        (!Number.isInteger(args.maxPositions) || args.maxPositions <= 0)
    ) {
        throw new Error("--max-positions must be a positive integer");
    }

    return args;
}

function blankStats() {
    return {
        nodes: 0,
        ttProbes: 0,
        ttHits: 0,
        ttMisses: 0,
        ttBypassed: 0,
        ttMoveHits: 0,
        reachedMovePicker: 0,
        generatedMoves: 0,
        searchedMoves: 0,
        unusedGeneratedMovesAtCutoff: 0,
        betaCutoffs: 0,
        firstMoveCutoffs: 0,
        cutoffMoveIndexSum: 0,
        quietCutoffs: 0,
        captureCutoffs: 0,
        nonLosingCaptureCutoffs: 0,
        deepNoTtMoveNodes: 0
    };
}

function addStats(target, source) {
    for (const key of Object.keys(target)) {
        target[key] += source[key] ?? 0;
    }
}

function finalizeStats(stats) {
    return {
        ...stats,
        ttHitRate:
            stats.ttHits + stats.ttMisses > 0
                ? stats.ttHits / (stats.ttHits + stats.ttMisses)
                : null,
        firstMoveCutoffRate:
            stats.betaCutoffs > 0
                ? stats.firstMoveCutoffs / stats.betaCutoffs
                : null,
        generatedMoveUseRate:
            stats.generatedMoves > 0
                ? stats.searchedMoves / stats.generatedMoves
                : null,
        meanCutoffMoveIndex:
            stats.betaCutoffs > 0
                ? stats.cutoffMoveIndexSum / stats.betaCutoffs
                : null
    };
}

function classifyWindow(alpha, beta) {
    return beta === alpha + 1 ? "scout" : "pv";
}

function blankQsearchStats() {
    return {
        entries: 0,
        eligibleEntries: 0,
        repetitionBypasses: 0,
        repeatedEntries: 0,
        reusableEntries: 0,
        reusableExact: 0,
        reusableLower: 0,
        reusableUpper: 0,
        unshadowedReusableEntries: 0,
        generatedMoveLists: 0,
        generatedMoves: 0,
        estimatedEntriesAvoidable: 0,
        estimatedMoveListsAvoidable: 0,
        estimatedGeneratedMovesAvoidable: 0
    };
}

function finalizeQsearchStats(stats) {
    return {
        ...stats,
        repeatedEntryRate:
            stats.eligibleEntries > 0
                ? stats.repeatedEntries / stats.eligibleEntries
                : null,
        reusableEntryRate:
            stats.eligibleEntries > 0
                ? stats.reusableEntries / stats.eligibleEntries
                : null,
        estimatedEntryReduction:
            stats.entries > 0
                ? stats.estimatedEntriesAvoidable / stats.entries
                : null,
        estimatedMoveReduction:
            stats.generatedMoves > 0
                ? stats.estimatedGeneratedMovesAvoidable / stats.generatedMoves
                : null
    };
}

function reusableQsearchRecord(record, alpha, beta, ply) {
    if (!record) return null;

    if (record.exact !== null) {
        return { flag: TTFlag.EXACT, score: scoreFromTT(record.exact, ply) };
    }

    if (record.lower !== null) {
        const score = scoreFromTT(record.lower, ply);

        if (score >= beta) {
            return { flag: TTFlag.LOWER, score };
        }
    }

    if (record.upper !== null) {
        const score = scoreFromTT(record.upper, ply);

        if (score <= alpha) {
            return { flag: TTFlag.UPPER, score };
        }
    }

    return null;
}

function storeQsearchRecord(record, alpha, beta, score, ply) {
    const storedScore = scoreToTT(score, ply);

    if (score <= alpha) {
        record.upper =
            record.upper === null
                ? storedScore
                : Math.min(record.upper, storedScore);
    }
    else if (score >= beta) {
        record.lower =
            record.lower === null
                ? storedScore
                : Math.max(record.lower, storedScore);
    }
    else {
        record.exact = storedScore;
    }
}

export function instrumentSearch(search) {
    const contexts = [];
    const qsearchContexts = [];
    const qsearchRecords = new Map();
    const qsearchTotals = blankQsearchStats();
    const qsearchByPly = new Map();
    const totals = blankStats();
    const byDepth = new Map();
    const byWindow = new Map([
        ["pv", blankStats()],
        ["scout", blankStats()]
    ]);

    const originalNegamax = search.negamax.bind(search);
    const originalCreateMovePicker = search.createMovePicker.bind(search);
    const originalProbe = search.tt.probe.bind(search.tt);

    search.tt.probe = (...args) => {
        const entry = originalProbe(...args);
        const context = contexts.at(-1);

        if (context && !context.ttProbed) {
            context.ttProbed = true;
            context.ttHit = Boolean(entry);
            context.ttMove = Boolean(entry?.move);
        }

        return entry;
    };

    search.createMovePicker = (...args) => {
        const picker = originalCreateMovePicker(...args);
        const context = contexts.at(-1);
        const qsearchContext = qsearchContexts.at(-1);

        if (qsearchContext) {
            const generatedMoves =
                Array.isArray(args[0]) ? args[0].length : 0;

            qsearchContext.generatedMoveLists++;
            qsearchContext.generatedMoves += generatedMoves;
            qsearchTotals.generatedMoveLists++;
            qsearchTotals.generatedMoves += generatedMoves;
        }

        if (!context || context.depth <= 0) {
            return picker;
        }

        context.pickerAttached = true;
        context.generatedMoves += Array.isArray(args[0]) ? args[0].length : 0;
        const originalNext = picker.next.bind(picker);

        return {
            next() {
                const move = originalNext();

                if (move) {
                    context.movesSeen++;
                    context.lastMove = move;
                }

                return move;
            }
        };
    };

    search.negamax = function instrumentedNegamax(
        depth,
        alpha,
        beta,
        ...rest
    ) {
        const context = {
            depth,
            alpha,
            beta,
            window: classifyWindow(alpha, beta),
            inCheck: this.board.isInCheck(),
            ttProbed: false,
            ttHit: false,
            ttMove: false,
            pickerAttached: false,
            generatedMoves: 0,
            movesSeen: 0,
            lastMove: null
        };
        let score;

        contexts.push(context);

        try {
            score = originalNegamax(depth, alpha, beta, ...rest);
            return score;
        }
        finally {
            contexts.pop();

            if (depth > 0 && score !== undefined) {
                const row = blankStats();
                row.nodes = 1;
                row.ttProbes = context.ttProbed ? 1 : 0;
                row.ttHits = context.ttHit ? 1 : 0;
                row.ttMisses =
                    context.ttProbed && !context.ttHit ? 1 : 0;
                row.ttBypassed = context.ttProbed ? 0 : 1;
                row.ttMoveHits = context.ttMove ? 1 : 0;
                row.reachedMovePicker = context.pickerAttached ? 1 : 0;
                row.generatedMoves = context.generatedMoves;
                row.searchedMoves = context.movesSeen;

                if (
                    depth >= 6 &&
                    context.ttProbed &&
                    !context.ttMove &&
                    context.pickerAttached
                ) {
                    row.deepNoTtMoveNodes = 1;
                }

                if (
                    context.pickerAttached &&
                    context.movesSeen > 0 &&
                    score >= beta
                ) {
                    row.betaCutoffs = 1;
                    row.firstMoveCutoffs = context.movesSeen === 1 ? 1 : 0;
                    row.cutoffMoveIndexSum = context.movesSeen;
                    row.unusedGeneratedMovesAtCutoff = Math.max(
                        0,
                        context.generatedMoves - context.movesSeen
                    );

                    if (context.lastMove?.isCapture()) {
                        row.captureCutoffs = 1;

                        if ((context.lastMove.seeScore ?? -Infinity) >= 0) {
                            row.nonLosingCaptureCutoffs = 1;
                        }
                    }
                    else {
                        row.quietCutoffs = 1;
                    }
                }

                addStats(totals, row);

                if (!byDepth.has(depth)) {
                    byDepth.set(depth, blankStats());
                }

                addStats(byDepth.get(depth), row);
                addStats(byWindow.get(context.window), row);
            }
        }
    };

    if (typeof search.quiescence === "function") {
        const originalQuiescence = search.quiescence.bind(search);

        search.quiescence = function instrumentedQuiescence(
            alpha,
            beta,
            ply = 0,
            qPly = 0
        ) {
            const alphaOriginal = alpha;
            const entriesBefore = qsearchTotals.entries;
            const moveListsBefore = qsearchTotals.generatedMoveLists;
            const generatedMovesBefore = qsearchTotals.generatedMoves;
            const repetitionHistory =
                typeof this.hasRepetitionHistory === "function" &&
                this.hasRepetitionHistory();
            let byQply = qsearchByPly.get(qPly);

            if (!byQply) {
                byQply = blankQsearchStats();
                qsearchByPly.set(qPly, byQply);
            }

            qsearchTotals.entries++;
            byQply.entries++;

            let record = null;
            let reusable = null;

            if (repetitionHistory) {
                qsearchTotals.repetitionBypasses++;
                byQply.repetitionBypasses++;
            }
            else {
                qsearchTotals.eligibleEntries++;
                byQply.eligibleEntries++;

                const byPly = qsearchRecords.get(this.board.hashKey);
                record = byPly?.get(qPly) ?? null;

                if (record) {
                    qsearchTotals.repeatedEntries++;
                    byQply.repeatedEntries++;
                    reusable =
                        reusableQsearchRecord(record, alpha, beta, ply);
                }
            }

            if (reusable) {
                qsearchTotals.reusableEntries++;
                byQply.reusableEntries++;

                if (reusable.flag === TTFlag.EXACT) {
                    qsearchTotals.reusableExact++;
                    byQply.reusableExact++;
                }
                else if (reusable.flag === TTFlag.LOWER) {
                    qsearchTotals.reusableLower++;
                    byQply.reusableLower++;
                }
                else {
                    qsearchTotals.reusableUpper++;
                    byQply.reusableUpper++;
                }
            }

            const context = {
                reusable: Boolean(reusable),
                unshadowed:
                    Boolean(reusable) &&
                    !qsearchContexts.some(parent => parent.reusable),
                generatedMoveLists: 0,
                generatedMoves: 0
            };
            let score;

            qsearchContexts.push(context);

            try {
                score = originalQuiescence(alpha, beta, ply, qPly);
                return score;
            }
            finally {
                qsearchContexts.pop();

                if (score !== undefined && !repetitionHistory) {
                    let byPly = qsearchRecords.get(this.board.hashKey);

                    if (!byPly) {
                        byPly = new Map();
                        qsearchRecords.set(this.board.hashKey, byPly);
                    }

                    let completed = byPly.get(qPly);

                    if (!completed) {
                        completed = { exact: null, lower: null, upper: null };
                        byPly.set(qPly, completed);
                    }

                    storeQsearchRecord(
                        completed,
                        alphaOriginal,
                        beta,
                        score,
                        ply
                    );
                }

                if (context.unshadowed) {
                    qsearchTotals.unshadowedReusableEntries++;
                    qsearchTotals.estimatedEntriesAvoidable +=
                        qsearchTotals.entries - entriesBefore;
                    qsearchTotals.estimatedMoveListsAvoidable +=
                        qsearchTotals.generatedMoveLists - moveListsBefore;
                    qsearchTotals.estimatedGeneratedMovesAvoidable +=
                        qsearchTotals.generatedMoves - generatedMovesBefore;
                }
            }
        };
    }

    return {
        snapshot() {
            return {
                totals: finalizeStats(totals),
                byDepth: Object.fromEntries(
                    [...byDepth.entries()]
                        .sort(([left], [right]) => left - right)
                        .map(([depth, stats]) => [depth, finalizeStats(stats)])
                ),
                byWindow: Object.fromEntries(
                    [...byWindow.entries()]
                        .map(([window, stats]) => [window, finalizeStats(stats)])
                ),
                qsearch: {
                    totals: finalizeQsearchStats(qsearchTotals),
                    byQply: Object.fromEntries(
                        [...qsearchByPly.entries()]
                            .sort(([left], [right]) => left - right)
                            .map(([qPly, stats]) => [
                                qPly,
                                finalizeQsearchStats(stats)
                            ])
                    )
                }
            };
        }
    };
}

function loadPositions(args) {
    const corpus =
        JSON.parse(fs.readFileSync(args.corpus, "utf8"));
    let positions = corpus.positions;

    if (args.classification !== "all") {
        positions = positions.filter(
            row => row.classification === args.classification
        );
    }

    if (args.maxPositions !== null) {
        positions = positions.slice(0, args.maxPositions);
    }

    return positions;
}

function profilePosition(row, args) {
    const engine = createEngineCore(row.fen);
    const telemetry = instrumentSearch(engine.search);
    const depth = args.depth ?? row.depth;
    const result = withMutedConsole(() =>
        engine.search.bestMove(depth, { quiet: true, profile: true })
    );
    const phaseTimes = {
        generateMs: engine.search.generateTime,
        orderMs: engine.search.orderTime,
        makeMoveMs: engine.search.makeMoveTime,
        undoMoveMs: engine.search.undoMoveTime
    };
    phaseTimes.trackedMs = Object.values(phaseTimes)
        .reduce((sum, value) => sum + value, 0);

    return {
        id: row.id,
        fen: row.fen,
        depth,
        bestMove: result.uci,
        score: result.rootMoves[0]?.score ?? null,
        nodes: result.nodes,
        lazyGeneration: {
            nodes: engine.search.lazyMovePickerNodes ?? 0,
            quietGenerationCalls:
                engine.search.lazyQuietGenerationCalls ?? 0,
            quietGenerationSkips:
                engine.search.lazyQuietGenerationSkips ?? 0
        },
        phaseTimes,
        telemetry: telemetry.snapshot()
    };
}

function aggregatePositions(rows) {
    const totals = blankStats();

    for (const row of rows) {
        addStats(totals, row.telemetry.totals);
    }

    return finalizeStats(totals);
}

function aggregatePhaseTimes(rows) {
    const totals = {
        generateMs: 0,
        orderMs: 0,
        makeMoveMs: 0,
        undoMoveMs: 0,
        trackedMs: 0
    };

    for (const row of rows) {
        for (const key of Object.keys(totals)) {
            totals[key] += row.phaseTimes[key];
        }
    }

    return {
        ...totals,
        generateShare:
            totals.trackedMs > 0 ? totals.generateMs / totals.trackedMs : null,
        orderShare:
            totals.trackedMs > 0 ? totals.orderMs / totals.trackedMs : null
    };
}

function aggregateLazyGeneration(rows) {
    const totals = {
        nodes: 0,
        quietGenerationCalls: 0,
        quietGenerationSkips: 0
    };

    for (const row of rows) {
        for (const key of Object.keys(totals)) {
            totals[key] += row.lazyGeneration[key];
        }
    }

    return {
        ...totals,
        quietSkipRate:
            totals.nodes > 0
                ? totals.quietGenerationSkips / totals.nodes
                : null
    };
}

function aggregateQsearch(rows) {
    const totals = blankQsearchStats();

    for (const row of rows) {
        const stats = row.telemetry.qsearch.totals;

        for (const key of Object.keys(totals)) {
            totals[key] += stats[key] ?? 0;
        }
    }

    return finalizeQsearchStats(totals);
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const positions = loadPositions(args);
    const rows = positions.map(row => {
        const result = profilePosition(row, args);
        console.log(
            `${result.id}: depth=${result.depth} nodes=${result.nodes} ` +
            `ttHit=${(result.telemetry.totals.ttHitRate * 100).toFixed(1)}% ` +
            `firstCut=${(result.telemetry.totals.firstMoveCutoffRate * 100).toFixed(1)}% ` +
            `coldD6=${result.telemetry.totals.deepNoTtMoveNodes} ` +
            `qReuse=${result.telemetry.qsearch.totals.reusableEntries}/` +
            `${result.telemetry.qsearch.totals.eligibleEntries}`
        );
        return result;
    });
    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        args,
        aggregate: aggregatePositions(rows),
        phaseTimes: aggregatePhaseTimes(rows),
        lazyGeneration: aggregateLazyGeneration(rows),
        qsearch: aggregateQsearch(rows),
        positions: rows
    };

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`);
}

const isMain =
    process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    try {
        main();
    }
    catch (error) {
        console.error(error.message);
        usage();
        process.exitCode = 1;
    }
}
