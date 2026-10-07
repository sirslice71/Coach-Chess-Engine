#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import FEN from "../js/core/fen.js";
import {
    createEngineCore,
    uciToMove
} from "../js/uci/uciengine.js";
import { PieceName } from "../js/core/piece.js";

function usage() {
    console.error(
        "Usage: node tools/replay-pv-static-eval.mjs " +
        "--fen <fen> --line <name:m1,m2,...> [--line <name:m1,m2,...>] " +
        "--out <dir>"
    );
}

export function parseArgs(argv) {
    const args = {
        fen: null,
        lines: [],
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--fen") {
            const fenParts = [];

            while (
                index + 1 < argv.length &&
                !argv[index + 1].startsWith("--")
            ) {
                fenParts.push(argv[++index]);

                if (fenParts.length === 6) {
                    break;
                }
            }

            args.fen = fenParts.join(" ");
        }
        else if (token === "--line") {
            args.lines.push(parseLine(argv[++index]));
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--help" || token === "-h") {
            args.help = true;
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (args.help) return args;
    if (!args.fen) throw new Error("Missing --fen");
    if (!args.out) throw new Error("Missing --out");
    if (args.lines.length === 0) throw new Error("Missing --line");

    return args;
}

export function parseLine(text) {
    const separator = text.indexOf(":");

    if (separator === -1) {
        throw new Error(`Invalid line, expected name:moves: ${text}`);
    }

    return {
        name: text.slice(0, separator),
        moves: text.slice(separator + 1)
            .split(",")
            .map(move => move.trim())
            .filter(Boolean)
    };
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

function evaluate(engine, rootFen) {
    const score = engine.evaluation.evaluate();
    const categories = categoryTotals(score);

    return {
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

function pieceText(piece) {
    if (!piece) return "";

    const color = piece > 0 ? "W" : "B";

    return `${color}${PieceName[Math.abs(piece)] || piece}`;
}

export function replayLine(rootFen, line) {
    const engine = createEngineCore(rootFen);
    const rows = [
        {
            ply: 0,
            move: "start",
            movedPiece: "",
            capturedPiece: "",
            sideToMove: rootSideToMove(FEN.export(engine.board)),
            fen: FEN.export(engine.board),
            evaluation: evaluate(engine, rootFen)
        }
    ];

    for (const [index, moveUci] of line.moves.entries()) {
        const legalMoves = engine.legalMoveGenerator.generateMoves();
        const move = uciToMove(moveUci, legalMoves);

        if (!move) {
            rows.push({
                ply: index + 1,
                move: moveUci,
                illegal: true,
                error: "illegal-move",
                fen: FEN.export(engine.board)
            });
            break;
        }

        const movedPiece = engine.board.pieceAt(move.fromSquare);
        const capturedPiece = engine.board.pieceAt(move.toSquare);

        engine.board.makeMove(move);

        rows.push({
            ply: index + 1,
            move: moveUci,
            movedPiece: pieceText(movedPiece),
            capturedPiece: pieceText(capturedPiece),
            sideToMove: rootSideToMove(FEN.export(engine.board)),
            fen: FEN.export(engine.board),
            evaluation: evaluate(engine, rootFen)
        });
    }

    return {
        name: line.name,
        moves: line.moves,
        rows
    };
}

function renderMarkdown(payload) {
    const lines = [
        "# PV Static Eval Replay",
        "",
        `- FEN: \`${payload.fen}\``,
        ""
    ];

    for (const line of payload.lines) {
        lines.push(
            `## ${line.name}`,
            "",
            "| Ply | Move | Moved | Captured | Root-side eval | Material | Position | Pawns | Tactics | FEN |",
            "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"
        );

        for (const row of line.rows) {
            const evalInfo = row.evaluation || {};
            const categories = evalInfo.categoriesRootSide || {};

            lines.push(
                `| ${row.ply} | ${row.move} | ${row.movedPiece ?? ""} | ` +
                `${row.capturedPiece ?? ""} | ${evalInfo.rootSideScore ?? ""} | ` +
                `${categories.material ?? ""} | ${categories.position ?? ""} | ` +
                `${categories.pawns ?? ""} | ${categories.tactics ?? ""} | ` +
                `\`${row.fen}\` |`
            );
        }

        lines.push("");
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const payload = {
        args,
        fen: args.fen,
        generatedAt: new Date().toISOString(),
        lines: args.lines.map(line => replayLine(args.fen, line))
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "pv-static-eval.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "pv-static-eval.md"),
        renderMarkdown(payload)
    );

    console.log(`Replayed ${payload.lines.length} line(s).`);
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
