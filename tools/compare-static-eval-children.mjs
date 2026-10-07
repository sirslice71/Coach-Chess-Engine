#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import FEN from "../js/core/fen.js";
import {
    createEngineCore,
    uciToMove
} from "../js/uci/uciengine.js";

function usage() {
    console.error(
        "Usage: node tools/compare-static-eval-children.mjs " +
        "--summary <external-child-disagreements.json> --out <dir> " +
        "[--limit 20]"
    );
}

export function parseArgs(argv) {
    const args = {
        summary: null,
        out: null,
        limit: 20
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--summary") args.summary = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.summary) throw new Error("Missing --summary");
    if (!args.out) throw new Error("Missing --out");
    if (!Number.isInteger(args.limit) || args.limit <= 0) {
        throw new Error("--limit must be a positive integer");
    }

    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rootSideToMove(fen) {
    return fen.trim().split(/\s+/)[1];
}

function whiteCpToRootSideCp(whiteCp, rootFen) {
    return rootSideToMove(rootFen) === "b" ? -whiteCp : whiteCp;
}

function categoryTotals(score) {
    return {
        material: score.material?.total ?? 0,
        opening: score.opening?.total ?? 0,
        position: score.position?.total ?? 0,
        king: score.king?.total ?? 0,
        pawns: score.pawns?.total ?? 0,
        mobility: score.mobility?.total ?? 0,
        tactics: score.tactics?.total ?? 0
    };
}

function diffCategories(reference, coach) {
    const diff = {};

    for (const key of Object.keys(reference)) {
        diff[key] = reference[key] - coach[key];
    }

    return diff;
}

function topCategoryDiffs(diff, limit = 4) {
    return Object.entries(diff)
        .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
        .slice(0, limit)
        .map(([key, value]) => `${key}:${value}`);
}

function evaluateChild(rootFen, moveUci) {
    const engine = createEngineCore(rootFen);
    const legalMoves = engine.legalMoveGenerator.generateMoves();
    const move = uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            legal: false,
            move: moveUci,
            error: "illegal-move"
        };
    }

    engine.board.makeMove(move);

    const score = engine.evaluation.evaluate();
    const categories = categoryTotals(score);

    return {
        legal: true,
        move: moveUci,
        error: null,
        fen: FEN.export(engine.board),
        whiteScore: score.total,
        rootSideScore: whiteCpToRootSideCp(score.total, rootFen),
        categoriesWhite: categories,
        categoriesRootSide:
            Object.fromEntries(
                Object.entries(categories)
                    .map(([key, value]) => [
                        key,
                        whiteCpToRootSideCp(value, rootFen)
                    ])
            )
    };
}

export function analyzeRow(row) {
    const coachChild = evaluateChild(row.fen, row.coachMove);
    const referenceChild = evaluateChild(row.fen, row.referenceMove);
    const staticGapCp =
        coachChild.legal && referenceChild.legal
            ? referenceChild.rootSideScore - coachChild.rootSideScore
            : null;
    const categoryDiffs =
        coachChild.legal && referenceChild.legal
            ? diffCategories(
                referenceChild.categoriesRootSide,
                coachChild.categoriesRootSide
            )
            : {};

    return {
        ...row,
        coachStatic: coachChild,
        referenceStatic: referenceChild,
        staticGapCp,
        staticVsExternalGapCp:
            Number.isFinite(staticGapCp) && Number.isFinite(row.externalGapCp)
                ? row.externalGapCp - staticGapCp
                : null,
        categoryDiffs,
        topCategoryDiffs: topCategoryDiffs(categoryDiffs)
    };
}

function renderMarkdown(payload) {
    const lines = [
        "# Static Eval Child Comparison",
        "",
        `- Summary: \`${payload.args.summary}\``,
        `- Rows analyzed: ${payload.summary.rowsAnalyzed}`,
        "",
        "| Label | External gap | Coach child gap | Static gap | Residual | Top static category diffs | Coach | Reference | FEN |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |"
    ];

    for (const row of payload.rows) {
        lines.push(
            `| ${String(row.label).replaceAll("|", "\\|")} | ` +
            `${row.externalGapCp ?? ""} | ${row.coachChildGapCp ?? ""} | ` +
            `${row.staticGapCp ?? ""} | ${row.staticVsExternalGapCp ?? ""} | ` +
            `${row.topCategoryDiffs.join(", ")} | ${row.coachMove} | ` +
            `${row.referenceMove} | \`${row.fen}\` |`
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

    const summary = readJson(args.summary);
    const rows =
        (summary.rows || [])
            .slice(0, args.limit)
            .map(analyzeRow);
    const payload = {
        args,
        generatedAt: new Date().toISOString(),
        summary: {
            inputRows: summary.rows?.length || 0,
            rowsAnalyzed: rows.length
        },
        rows
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "static-eval-child-comparison.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "static-eval-child-comparison.md"),
        renderMarkdown(payload)
    );

    console.log(`Analyzed ${rows.length} static child comparison row(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    }
    catch (error) {
        console.error(error.message);
        usage();
        process.exit(1);
    }
}
