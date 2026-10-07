#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import TranspositionTable from "../js/engine/transpositiontable.js";
import { SearchConstants } from "../js/engine/searchconstants.js";
import {
    createEngineCore,
    uciToMove,
    withMutedConsole
} from "../js/uci/uciengine.js";

function usage() {
    console.error(
        "Usage: node tools/diagnose-root-tie-tt.mjs " +
        "--fen <fen> --out <dir> [--root-depth 12] [--child-depth 12] " +
        "[--limit 12] [--top-only]"
    );
}

function parseArgs(argv) {
    const args = {
        fen: null,
        out: null,
        rootDepth: 12,
        childDepth: 12,
        limit: 12,
        topOnly: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--fen") {
            args.fen = argv.slice(index + 1).join(" ");
            break;
        }
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--root-depth") args.rootDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--child-depth") args.childDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--top-only") args.topOnly = true;
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.fen) throw new Error("Missing --fen");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--root-depth", args.rootDepth],
        ["--child-depth", args.childDepth],
        ["--limit", args.limit]
    ]) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${name} must be a positive integer`);
        }
    }

    return args;
}

function resolveMove(engine, moveUci) {
    const legalMoves =
        engine.legalMoveGenerator.generateMoves();
    const move =
        uciToMove(moveUci, legalMoves);

    if (!move) {
        throw new Error(`Illegal move: ${moveUci}`);
    }

    return move;
}

function scoreWithEngine(engine, moveUci, childDepth) {
    const move =
        resolveMove(engine, moveUci);
    const startMs =
        performance.now();

    engine.board.makeMove(move);

    try {
        const score =
            withMutedConsole(() =>
                -engine.search.negamax(
                    childDepth,
                    -SearchConstants.INFINITY,
                    SearchConstants.INFINITY,
                    1,
                    false
                )
            );

        return {
            score,
            elapsedMs: performance.now() - startMs,
            ttStats: engine.search.tt.stats()
        };
    }
    finally {
        engine.board.undoMove();
    }
}

function scoreFresh(fen, moveUci, childDepth) {
    const engine =
        createEngineCore(fen);

    return scoreWithEngine(engine, moveUci, childDepth);
}

function scoreIsolatedTable(sharedEngine, moveUci, childDepth) {
    const previousTable =
        sharedEngine.search.tt;
    const isolatedTable =
        new TranspositionTable(previousTable.sizeMB);

    isolatedTable.age = previousTable.age;
    sharedEngine.search.tt = isolatedTable;

    try {
        return scoreWithEngine(sharedEngine, moveUci, childDepth);
    }
    finally {
        sharedEngine.search.tt = previousTable;
    }
}

function rootSearch(fen, rootDepth) {
    const engine =
        createEngineCore(fen);
    const startMs =
        performance.now();
    const result =
        withMutedConsole(() =>
            engine.search.bestMove(
                rootDepth,
                {
                    quiet: true
                }
            )
        );

    return {
        engine,
        elapsedMs: performance.now() - startMs,
        result
    };
}

function renderMarkdown(payload) {
    const lines = [
        "# Root Tie TT Diagnostic",
        "",
        `- FEN: \`${payload.args.fen}\``,
        `- Root depth: ${payload.args.rootDepth}`,
        `- Child depth: ${payload.args.childDepth}`,
        `- Root best: ${payload.root.bestMove}`,
        `- Root eval: ${payload.root.evaluation}`,
        `- Root elapsed: ${Math.round(payload.root.elapsedMs)}ms`,
        "",
        "| Move | Root score | Shared TT | Isolated TT | Fresh engine | Shared-Fresh | Isolated-Fresh |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];

    for (const row of payload.rows) {
        lines.push(
            `| ${row.move} | ${row.rootScore} | ${row.shared.score} | ` +
            `${row.isolated.score} | ${row.fresh.score} | ` +
            `${row.shared.score - row.fresh.score} | ` +
            `${row.isolated.score - row.fresh.score} |`
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

    const root =
        rootSearch(args.fen, args.rootDepth);
    const rootMoves =
        (root.result.rootMoves || []).slice(0, args.limit);
    const topScore =
        rootMoves[0]?.score ?? null;
    const candidates =
        args.topOnly
            ? rootMoves.filter(row => row.score === topScore)
            : rootMoves;
    const rows =
        candidates.map(row => ({
            move: row.uci,
            rootScore: row.score,
            shared: scoreWithEngine(root.engine, row.uci, args.childDepth),
            isolated: scoreIsolatedTable(root.engine, row.uci, args.childDepth),
            fresh: scoreFresh(args.fen, row.uci, args.childDepth)
        }));
    const payload = {
        args,
        generatedAt: new Date().toISOString(),
        root: {
            bestMove: root.result.uci,
            evaluation: root.result.evaluation,
            elapsedMs: root.elapsedMs,
            depth: root.result.depth,
            nodes: root.result.nodes,
            ttStats: root.engine.search.tt.stats()
        },
        rows
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "root-tie-tt-diagnostic.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "root-tie-tt-diagnostic.md"),
        renderMarkdown(payload)
    );

    console.log(
        `Diagnosed ${rows.length} root move(s) for ${args.fen}.`
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
