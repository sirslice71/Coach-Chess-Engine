#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const STARTING_MATERIAL_TOTAL =
    2 * (8 * 100 + 2 * 300 + 2 * 310 + 2 * 500 + 900);
const OPENING_MATERIAL_FLOOR = STARTING_MATERIAL_TOTAL * 0.85;
const MIDDLEGAME_MATERIAL_FLOOR = STARTING_MATERIAL_TOTAL * 0.60;
const LATE_MIDDLEGAME_MATERIAL_FLOOR = STARTING_MATERIAL_TOTAL * 0.35;
const MIN_MOVES_TO_GO_FLOOR = 24;

function usage() {
    return [
        "Usage:",
        "  node tools/analyze-coach-time-policy.mjs --summary <coach-time-depth-summary.json> [--out <dir>]",
        "",
        "Compares narrow timing-policy sketches against replayed PGN move context.",
        "This is diagnostic only; it does not change Coach."
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        summary: null,
        out: null
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--summary") args.summary = argv[++i];
        else if (arg === "--out") args.out = argv[++i];
        else if (arg === "--help" || arg === "-h") args.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }

    return args;
}

function round(value, digits = 2) {
    if (value === null || value === undefined) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function average(values) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
}

function gamePhase(totalMaterial, fullMoveNumber) {
    if (fullMoveNumber <= 10 || totalMaterial >= OPENING_MATERIAL_FLOOR) {
        return "opening";
    }

    if (totalMaterial >= MIDDLEGAME_MATERIAL_FLOOR) {
        return "middlegame";
    }

    if (totalMaterial >= LATE_MIDDLEGAME_MATERIAL_FLOOR) {
        return "lateMiddlegame";
    }

    return "endgame";
}

function estimateMovesToGo(move) {
    const phase = gamePhase(move.totalMaterial, move.moveNumber);
    const byPhase =
        phase === "opening"
            ? 30
            : phase === "middlegame"
                ? 24
                : phase === "lateMiddlegame"
                    ? 19
                    : 15;

    return Math.max(MIN_MOVES_TO_GO_FLOOR, byPhase);
}

function lowClockReserve(remainingMs) {
    if (remainingMs <= 5000) return remainingMs * 0.20;
    if (remainingMs <= 15000) return remainingMs * 0.08;
    return 0;
}

function baselineMultiplier(move, variant) {
    let multiplier = 1.0;

    if (move.inCheck) multiplier += 0.15;

    if (move.legalMoveCount >= 35) multiplier += 0.20;
    else if (move.legalMoveCount >= 25) multiplier += 0.10;

    if (move.captureCount >= 6) multiplier += 0.15;
    else if (move.captureCount >= 3) multiplier += 0.08;

    const phase = gamePhase(move.totalMaterial, move.moveNumber);
    if (phase === "middlegame" || phase === "lateMiddlegame") {
        multiplier += 0.10;
    }

    const manyPiecesRemain =
        move.totalMaterial >= MIDDLEGAME_MATERIAL_FLOOR;
    const inLateWindow =
        move.moveNumber >= 9 &&
        move.moveNumber <= 28 &&
        manyPiecesRemain;
    const inCore =
        move.moveNumber >= 10 &&
        move.moveNumber <= 28 &&
        manyPiecesRemain;

    if (inLateWindow) {
        if (move.legalMoveCount >= 20) multiplier += 0.05;
        if (move.captureCount >= 1) multiplier += 0.05;
        if (move.inCheck) multiplier += 0.05;
    }

    if (inCore) {
        let coreBase = 0.15;
        let highMobility = move.legalMoveCount >= 25 ? 0.10 : 0;

        if (variant === "halve-core-base-10-15" && move.moveNumber <= 15) {
            coreBase = 0.075;
        }

        if (variant === "no-high-mobility-10-15" && move.moveNumber <= 15) {
            highMobility = 0;
        }

        if (variant === "no-core-10-14" && move.moveNumber <= 14) {
            coreBase = 0;
            highMobility = 0;
        }

        multiplier += coreBase + highMobility;
    }

    multiplier = Math.min(multiplier, 1.6);

    const remainingMs =
        move.estimatedClockBeforeSeconds === null
            ? Infinity
            : move.estimatedClockBeforeSeconds * 1000;

    if (remainingMs <= 3000) multiplier = Math.min(multiplier, 1.05);
    else if (remainingMs <= 8000) multiplier = Math.min(multiplier, 1.20);

    const isTacticallyUrgent =
        move.inCheck ||
        move.legalMoveCount <= 8 ||
        move.captureCount >= 5;

    if (!isTacticallyUrgent) {
        if (move.moveNumber <= 6) multiplier *= 0.30;
        else if (move.moveNumber <= 8) multiplier *= 0.55;
    }

    return multiplier;
}

function budgetSeconds(move, variant) {
    if (move.estimatedClockBeforeSeconds === null) {
        return null;
    }

    const remainingMs =
        move.estimatedClockBeforeSeconds * 1000;
    const reserved =
        (remainingMs > 1000 ? 100 : 50) + 150 + lowClockReserve(remainingMs);
    const usable =
        Math.max(1, remainingMs - reserved);
    const movesToGo =
        estimateMovesToGo(move);
    const multiplier =
        baselineMultiplier(move, variant);
    const base =
        (usable / movesToGo) * multiplier;

    let minimumFloor = 50;
    if (remainingMs <= 500) minimumFloor = 10;
    else if (remainingMs <= 2000) minimumFloor = 25;

    const minimumBudget =
        Math.min(usable, minimumFloor);
    const maxPercentage =
        Math.min(0.20, 0.10 * multiplier);
    const maximumBudget =
        Math.max(minimumBudget, Math.floor(usable * maxPercentage));
    const rawBudget =
        Math.floor(base);

    let budget =
        Math.max(1, Math.min(maximumBudget, Math.max(minimumBudget, rawBudget)));

    if (variant === "early-core-cap-12s" && move.moveNumber >= 10 && move.moveNumber <= 15) {
        budget = Math.min(budget, 12000);
    }

    if (variant === "early-core-cap-10s" && move.moveNumber >= 10 && move.moveNumber <= 15) {
        budget = Math.min(budget, 10000);
    }

    return round(budget / 1000, 3);
}

function summarizeVariant(moves, variant) {
    const considered =
        moves.filter(move =>
            move.allocatedMoveTimeSeconds !== null &&
            move.estimatedClockBeforeSeconds !== null
        );

    const deltas =
        considered.map(move => {
            const candidate =
                budgetSeconds(move, variant);
            return {
                move,
                candidate,
                delta: move.allocatedMoveTimeSeconds - candidate
            };
        });

    const changed =
        deltas.filter(entry => Math.abs(entry.delta) >= 0.05);
    const saved =
        changed.reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);
    const spentMore =
        changed.reduce((sum, entry) => sum + Math.max(0, -entry.delta), 0);
    const affectedEarlyCore =
        changed.filter(entry =>
            entry.move.moveNumber >= 10 &&
            entry.move.moveNumber <= 15
        );

    return {
        variant,
        changedMoves: changed.length,
        changedEarlyCoreMoves: affectedEarlyCore.length,
        savedSeconds: round(saved),
        spentMoreSeconds: round(spentMore),
        averageChangedDepth: round(average(changed.map(entry => entry.move.depth))),
        averageChangedScoreCpLike:
            round(
                average(
                    changed
                        .map(entry => entry.move.score)
                        .filter(score => /^[-+]?\d+(\.\d+)?$/.test(score))
                        .map(Number)
                )
            ),
        biggestSavers:
            changed
                .sort((a, b) => b.delta - a.delta)
                .slice(0, 12)
                .map(entry => ({
                    game: entry.move.game,
                    ply: entry.move.ply,
                    move: `${entry.move.moveNumber}${entry.move.side === "b" ? "..." : "."} ${entry.move.san}`,
                    phase: entry.move.phase,
                    depth: entry.move.depth,
                    score: entry.move.score,
                    legal: entry.move.legalMoveCount,
                    captures: entry.move.captureCount,
                    baselineSeconds: entry.move.allocatedMoveTimeSeconds,
                    candidateSeconds: entry.candidate,
                    savedSeconds: round(entry.delta)
                }))
    };
}

function printSummary(result) {
    console.log("");
    console.log(result.variant);
    console.log("-".repeat(result.variant.length));
    console.log(`changed moves: ${result.changedMoves}`);
    console.log(`changed early-core moves: ${result.changedEarlyCoreMoves}`);
    console.log(`saved seconds: ${result.savedSeconds}`);
    console.log(`spent more seconds: ${result.spentMoreSeconds}`);
    console.log(`avg changed depth: ${result.averageChangedDepth ?? "n/a"}`);
    console.log(`avg changed numeric score: ${result.averageChangedScoreCpLike ?? "n/a"}`);
    console.table(result.biggestSavers);
}

function writeReports(outDir, summaryPath, results) {
    fs.mkdirSync(outDir, { recursive: true });

    const payload = {
        source: path.resolve(summaryPath),
        generatedAt: new Date().toISOString(),
        variants: results
    };

    fs.writeFileSync(
        path.join(outDir, "time-policy-impact.json"),
        JSON.stringify(payload, null, 2) + "\n"
    );

    const lines = [
        "# Coach Time-Policy Impact",
        "",
        `- Source: \`${path.resolve(summaryPath)}\``,
        `- Generated: ${payload.generatedAt}`,
        "",
        "| Variant | Changed | Early-core changed | Saved | Spent more | Avg depth | Avg numeric score |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];

    for (const result of results) {
        lines.push(
            [
                `| \`${result.variant}\``,
                result.changedMoves,
                result.changedEarlyCoreMoves,
                `${result.savedSeconds}s`,
                `${result.spentMoreSeconds}s`,
                result.averageChangedDepth ?? "n/a",
                result.averageChangedScoreCpLike ?? "n/a"
            ].join(" | ") + " |"
        );
    }

    lines.push("");

    for (const result of results) {
        lines.push(`## ${result.variant}`);
        lines.push("");
        lines.push("| Game | Ply | Move | Phase | Depth | Score | Legal | Captures | Baseline | Candidate | Saved |");
        lines.push("| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

        for (const row of result.biggestSavers) {
            lines.push(
                [
                    `| ${row.game}`,
                    row.ply,
                    row.move,
                    row.phase,
                    row.depth,
                    row.score,
                    row.legal,
                    row.captures,
                    `${row.baselineSeconds}s`,
                    `${row.candidateSeconds}s`,
                    `${row.savedSeconds}s`
                ].join(" | ") + " |"
            );
        }

        lines.push("");
    }

    fs.writeFileSync(
        path.join(outDir, "time-policy-impact.md"),
        lines.join("\n")
    );
}

function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    }
    catch (error) {
        console.error(error.message);
        console.error(usage());
        process.exitCode = 1;
        return;
    }

    if (args.help) {
        console.log(usage());
        return;
    }

    if (!args.summary) {
        console.error("--summary is required");
        console.error(usage());
        process.exitCode = 1;
        return;
    }

    const summary =
        JSON.parse(fs.readFileSync(path.resolve(args.summary), "utf8"));

    const results = [];

    for (const variant of [
        "no-high-mobility-10-15",
        "halve-core-base-10-15",
        "no-core-10-14",
        "early-core-cap-12s",
        "early-core-cap-10s"
    ]) {
        const result = summarizeVariant(summary.moves, variant);
        results.push(result);
        printSummary(result);
    }

    if (args.out) {
        writeReports(path.resolve(args.out), args.summary, results);
    }
}

main();
