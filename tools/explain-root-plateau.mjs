#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REPO = process.cwd();
const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/explain-root-plateau.mjs " +
        "(--fen <six-field FEN> | --fen-file <file>) " +
        "[--repo <Coach repo>] [--depth 8] [--limit 8] [--out <dir>]"
    );
}

function parseArgs(argv) {
    const args = {
        repo: DEFAULT_REPO,
        fen: null,
        fenFile: null,
        depth: 8,
        limit: 8,
        out: null
    };

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];

        if (token === "--repo") {
            args.repo = argv[++index];
        }
        else if (token === "--fen") {
            const parts = [];

            for (
                let partIndex = index + 1;
                partIndex < argv.length && parts.length < 6;
                partIndex++
            ) {
                if (argv[partIndex].startsWith("--")) {
                    break;
                }

                parts.push(argv[partIndex]);
            }

            if (parts.length < 6) {
                throw new Error("--fen must include six FEN fields");
            }

            args.fen = parts.join(" ");
            index += parts.length;
        }
        else if (token === "--fen-file") {
            args.fenFile = argv[++index];
        }
        else if (token === "--depth") {
            args.depth = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--limit") {
            args.limit = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.fen && !args.fenFile) {
        throw new Error("Missing --fen or --fen-file");
    }

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
                    label: `fen-${index + 1}`,
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

function promotionSuffix(piece, Piece) {
    switch (Math.abs(piece)) {
        case Math.abs(Piece.WQ): return "q";
        case Math.abs(Piece.WR): return "r";
        case Math.abs(Piece.WB): return "b";
        case Math.abs(Piece.WN): return "n";
        default: return "";
    }
}

function moveToUci(move, algebraic, Piece) {
    let notation =
        algebraic(move.fromSquare) +
        algebraic(move.toSquare);

    if (move.isPromotion()) {
        notation += promotionSuffix(move.promotedPiece, Piece);
    }

    return notation;
}

function scoreBand(rows, key) {
    if (rows.length === 0) {
        return null;
    }

    const values =
        rows.map(row => row[key]);

    return Math.max(...values) - Math.min(...values);
}

function whiteEvalToRootSideCp(whiteEvalText, rootSideToMove) {
    const whiteCp =
        Math.round(Number.parseFloat(whiteEvalText) * 100);

    return rootSideToMove > 0
        ? whiteCp
        : -whiteCp;
}

function countTopTies(rows) {
    if (rows.length === 0) {
        return 0;
    }

    const topScore =
        rows[0].rootScore;

    return rows.filter(row => row.rootScore === topScore).length;
}

function countBoundLikeTies(rows, toleranceCp = 50) {
    if (rows.length === 0) {
        return 0;
    }

    const topScore =
        rows[0].rootScore;

    return rows.filter(row =>
        row.rootScore === topScore &&
        row.childRootSideScore !== null &&
        Math.abs(row.childRootSideScore - row.rootScore) > toleranceCp
    ).length;
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

async function analyzePosition(
    position,
    args,
    uciModule,
    squareModule,
    pieceModule
) {
    const rootEngine =
        uciModule.createEngineCore(position.fen);

    const root =
        uciModule.withMutedConsole(
            () => rootEngine.search.bestMove(
                args.depth,
                { quiet: true }
            )
        );

    const rootSideToMove =
        rootEngine.board.sideToMove;

    const rows =
        root.rootMoves
            .slice(0, args.limit)
            .map(rootMove => {
                const childFenEngine =
                    uciModule.createEngineCore(position.fen);

                childFenEngine.board.makeMove(rootMove.move);

                const staticWhite =
                    childFenEngine.search.whiteRelativeEval();

                const staticSide =
                    childFenEngine.search.toSideToMoveScore(staticWhite);

                const quiescence =
                    safeSearch(() =>
                        uciModule.withMutedConsole(
                            () => childFenEngine.search.quiescence(
                                -Infinity,
                                Infinity,
                                1,
                                0
                            )
                        )
                    );

                const childSearch =
                    safeSearch(() => {
                        const childEngine =
                            uciModule.createEngineCore(position.fen);

                        childEngine.board.makeMove(rootMove.move);

                        return uciModule.withMutedConsole(
                            () => childEngine.search.bestMove(
                                Math.max(1, args.depth - 1),
                                { quiet: true }
                            )
                        );
                    });

                return {
                    move: moveToUci(
                        rootMove.move,
                        squareModule.algebraic,
                        pieceModule.Piece
                    ),
                    rootScore: rootMove.score,
                    rootMate: isMateScore(rootMove.score),
                    staticWhite,
                    staticSide,
                    quiescenceScore:
                        quiescence.ok
                            ? quiescence.value
                            : null,
                    quiescenceError:
                        quiescence.ok
                            ? null
                            : quiescence.error,
                    childBest:
                        childSearch.ok
                            ? childSearch.value.uci
                            : null,
                    childScore:
                        childSearch.ok
                            ? childSearch.value.evaluation
                            : null,
                    childRootSideScore:
                        childSearch.ok
                            ? whiteEvalToRootSideCp(
                                childSearch.value.evaluation,
                                rootSideToMove
                            )
                            : null,
                    childNodes:
                        childSearch.ok
                            ? childSearch.value.nodes
                            : null,
                    childError:
                        childSearch.ok
                            ? null
                            : childSearch.error
                };
            });

    return {
        ...position,
        depth: args.depth,
        best: root.uci,
        evaluation: root.evaluation,
        rootSideToMove,
        nodes: root.nodes,
        rootBand: scoreBand(rows, "rootScore"),
        staticSideBand: scoreBand(rows, "staticSide"),
        childRootSideBand: scoreBand(
            rows.filter(row => row.childRootSideScore !== null),
            "childRootSideScore"
        ),
        topTies: countTopTies(rows),
        boundLikeTopTies: countBoundLikeTies(rows),
        mateRows: rows.filter(row => row.rootMate).length,
        rows
    };
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function writeOutputs(args, results) {
    if (!args.out) {
        console.log(JSON.stringify({ args, results }, null, 2));
        return;
    }

    fs.mkdirSync(args.out, { recursive: true });

    fs.writeFileSync(
        path.join(args.out, "root-plateau-explain.json"),
        JSON.stringify({ args, results }, null, 2) + "\n"
    );

    const lines = [
        "# Coach Root Plateau Explanation",
        "",
        `- Depth: ${args.depth}`,
        `- Root rows: ${args.limit}`,
        "",
        "| Label | Best | Root band | Static side band | Child band | Top ties | Bound-like ties | Mate rows | FEN |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ...results.map(result => [
            escapeMarkdown(result.label),
            result.best,
            result.rootBand,
            result.staticSideBand,
            result.childRootSideBand,
            result.topTies,
            result.boundLikeTopTies,
            result.mateRows,
            `\`${result.fen}\``
        ].join(" | ")).map(line => `| ${line} |`),
        ""
    ];

    for (const result of results) {
        lines.push(`## ${result.label}`);
        lines.push("");
        lines.push(`- FEN: \`${result.fen}\``);
        lines.push(`- Best: ${result.best}, eval ${result.evaluation}, nodes ${result.nodes}`);
        lines.push(`- Root band: ${result.rootBand}`);
        lines.push(`- Static side band after move: ${result.staticSideBand}`);
        lines.push(`- Child search root-side band: ${result.childRootSideBand}`);
        lines.push(`- Bound-like top ties: ${result.boundLikeTopTies}`);
        lines.push("");
        lines.push("| Move | Root | Static side | QSearch | Child best | Child root-side | Child white eval | Child nodes |");
        lines.push("| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |");

        for (const row of result.rows) {
            lines.push(`| ${[
                row.move,
                row.rootScore,
                row.staticSide,
                row.quiescenceScore ?? row.quiescenceError ?? "",
                row.childBest ?? row.childError ?? "",
                row.childRootSideScore ?? "",
                row.childScore ?? "",
                row.childNodes ?? ""
            ].join(" | ")} |`);
        }

        lines.push("");
    }

    fs.writeFileSync(
        path.join(args.out, "root-plateau-explain.md"),
        lines.join("\n") + "\n"
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = path.resolve(args.repo);
    const positions =
        args.fen
            ? [{ label: "input", fen: args.fen }]
            : parseFenFile(args.fenFile);

    const uciModule = await import(
        pathToFileURL(path.join(repo, "js/uci/uciengine.js")).href
    );
    const squareModule = await import(
        pathToFileURL(path.join(repo, "js/core/square.js")).href
    );
    const pieceModule = await import(
        pathToFileURL(path.join(repo, "js/core/piece.js")).href
    );

    const results = [];

    for (const position of positions) {
        console.error(`${position.label}: d${args.depth}`);
        results.push(
            await analyzePosition(
                position,
                args,
                uciModule,
                squareModule,
                pieceModule
            )
        );
    }

    writeOutputs(args, results);
}

main().catch(error => {
    usage();
    console.error(error.stack || error.message);
    process.exit(1);
});
