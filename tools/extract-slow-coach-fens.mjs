#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    return [
        "Usage:",
        "  node tools/extract-slow-coach-fens.mjs --summary <coach-time-depth-summary.json> [--summary <...>] --out <dir>",
        "",
        "Options:",
        "  --min-seconds <n>   Minimum recorded move time (default: 10)",
        "  --top <n>           Number of grouped positions to write (default: 12)",
        "  --phase <name>      Keep a phase; repeatable (default: opening-1-10 and early-core-11-15)"
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        summaries: [],
        out: null,
        minSeconds: 10,
        top: 12,
        phases: []
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        const next = () => {
            index += 1;
            if (index >= argv.length) {
                throw new Error(`${token} requires a value`);
            }
            return argv[index];
        };

        if (token === "--summary") args.summaries.push(next());
        else if (token === "--out") args.out = next();
        else if (token === "--min-seconds") args.minSeconds = Number.parseFloat(next());
        else if (token === "--top") args.top = Number.parseInt(next(), 10);
        else if (token === "--phase") args.phases.push(next());
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown option: ${token}`);
    }

    if (args.help) {
        return args;
    }

    if (args.summaries.length === 0) {
        throw new Error("Missing --summary");
    }

    if (!args.out) {
        throw new Error("Missing --out");
    }

    if (args.phases.length === 0) {
        args.phases = ["opening-1-10", "early-core-11-15"];
    }

    return args;
}

function movesFromSummary(summary) {
    const byKey = new Map();

    for (const key of [
        "slowMovesWithContext",
        "slowMoves",
        "shallowMoves",
        "lateLowDepthMoves",
        "lowClockLowDepthMoves"
    ]) {
        for (const move of summary[key] || []) {
            const id = `${move.game}:${move.ply}`;
            byKey.set(id, move);
        }
    }

    return [...byKey.values()];
}

function moveLabel(move) {
    return `${move.moveNumber}${move.side === "b" ? "..." : "."}${move.san}`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        console.log(usage());
        return;
    }

    const groups = new Map();
    const phaseSet = new Set(args.phases);

    for (const summaryPath of args.summaries) {
        const summary =
            JSON.parse(fs.readFileSync(summaryPath, "utf8"));

        for (const move of movesFromSummary(summary)) {
            if (!phaseSet.has(move.phase)) continue;
            if ((move.timeSeconds || 0) < args.minSeconds) continue;
            if (!move.fenBefore) continue;

            const group =
                groups.get(move.fenBefore) || {
                    fen: move.fenBefore,
                    count: 0,
                    totalTimeSeconds: 0,
                    depths: [],
                    moves: new Map(),
                    examples: []
                };

            group.count += 1;
            group.totalTimeSeconds += move.timeSeconds || 0;
            group.depths.push(move.depth);
            group.moves.set(move.uci, (group.moves.get(move.uci) || 0) + 1);

            if (group.examples.length < 4) {
                group.examples.push({
                    source: path.dirname(path.dirname(summaryPath)),
                    game: move.game,
                    ply: move.ply,
                    move: moveLabel(move),
                    uci: move.uci,
                    depth: move.depth,
                    timeSeconds: move.timeSeconds
                });
            }

            groups.set(move.fenBefore, group);
        }
    }

    const rows =
        [...groups.values()]
            .sort((a, b) =>
                b.totalTimeSeconds - a.totalTimeSeconds ||
                b.count - a.count
            )
            .slice(0, args.top)
            .map((row, index) => ({
                ...row,
                label: `slow${String(index + 1).padStart(2, "0")}`,
                averageDepth:
                    row.depths.reduce((sum, depth) => sum + depth, 0) /
                    row.depths.length,
                moveCounts:
                    Object.fromEntries(row.moves)
            }));

    fs.mkdirSync(args.out, { recursive: true });

    fs.writeFileSync(
        path.join(args.out, "slow-coach-positions.json"),
        JSON.stringify({ rows }, null, 2) + "\n"
    );

    fs.writeFileSync(
        path.join(args.out, "slow-coach-positions.fens"),
        [
            "# Repeated slow Coach positions",
            "# Format: label | fen",
            ...rows.map(row => `${row.label} | ${row.fen}`)
        ].join("\n") + "\n"
    );

    const lines = [
        "# Slow Coach Position Extraction",
        "",
        `Minimum time: ${args.minSeconds}s`,
        `Phases: ${args.phases.join(", ")}`,
        "",
        "| Label | Count | Total Time | Avg Depth | Moves | First Example |",
        "| --- | ---: | ---: | ---: | --- | --- |"
    ];

    for (const row of rows) {
        const moves =
            Object.entries(row.moveCounts)
                .map(([uci, count]) => `${uci}x${count}`)
                .join(", ");
        const first =
            row.examples[0]
                ? `${row.examples[0].source} g${row.examples[0].game} p${row.examples[0].ply} ${row.examples[0].move} ${row.examples[0].uci} d${row.examples[0].depth} ${row.examples[0].timeSeconds}s`
                : "";

        lines.push(
            `| ${row.label} | ${row.count} | ${row.totalTimeSeconds.toFixed(1)}s | ${row.averageDepth.toFixed(2)} | ${moves} | ${first} |`
        );
    }

    fs.writeFileSync(
        path.join(args.out, "slow-coach-positions.md"),
        lines.join("\n") + "\n"
    );

    console.log(`Wrote ${rows.length} positions to ${args.out}`);
}

try {
    main();
}
catch (error) {
    console.error(`Error: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 1;
}
