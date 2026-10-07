#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import FEN from "../js/core/fen.js";
import {
    createEngineCore,
    uciToMove,
    withMutedConsole
} from "../js/uci/uciengine.js";

function usage() {
    console.error(
        "Usage: node tools/probe-child-pair-depths.mjs " +
        "--summary <external-child-disagreements.json> (--label <label>|--label-contains <text>) --out <dir> " +
        "[--depths 1-8] [--max-ms-per-search 10000]"
    );
}

export function parseDepths(text) {
    if (/^\d+-\d+$/.test(text)) {
        const [start, end] = text.split("-").map(Number);

        if (start <= 0 || end < start) {
            throw new Error("--depths range must be positive and ascending");
        }

        return Array.from(
            { length: end - start + 1 },
            (_, index) => start + index
        );
    }

    const depths = text.split(",").map(item => Number.parseInt(item, 10));

    if (depths.some(depth => !Number.isInteger(depth) || depth <= 0)) {
        throw new Error("--depths must contain positive integers");
    }

    return depths;
}

export function parseArgs(argv) {
    const args = {
        summary: null,
        label: null,
        labelContains: null,
        out: null,
        depths: parseDepths("1-8"),
        maxMsPerSearch: 10000
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--summary") args.summary = argv[++index];
        else if (token === "--label") args.label = argv[++index];
        else if (token === "--label-contains") args.labelContains = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--depths") args.depths = parseDepths(argv[++index]);
        else if (token === "--max-ms-per-search") args.maxMsPerSearch = Number.parseInt(argv[++index], 10);
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.summary) throw new Error("Missing --summary");
    if (!args.label && !args.labelContains) {
        throw new Error("Missing --label or --label-contains");
    }
    if (!args.out) throw new Error("Missing --out");
    if (!Number.isInteger(args.maxMsPerSearch) || args.maxMsPerSearch <= 0) {
        throw new Error("--max-ms-per-search must be a positive integer");
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

function whiteEvalTextToRootSideCp(text, rootFen) {
    return whiteCpToRootSideCp(
        Math.round(Number.parseFloat(text) * 100),
        rootFen
    );
}

function makeChild(rootFen, moveUci) {
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

    return {
        legal: true,
        move: moveUci,
        error: null,
        fen: FEN.export(engine.board)
    };
}

function searchChild(childFen, rootFen, depth, maxMsPerSearch) {
    const engine = createEngineCore(childFen);
    const startMs = performance.now();
    const deadlineMs = startMs + maxMsPerSearch;

    try {
        const result =
            withMutedConsole(() =>
                engine.search.bestMove(
                    depth,
                    {
                        quiet: true,
                        deadlineMs
                    }
                )
            );

        return {
            ok: true,
            depth: result.depth ?? depth,
            requestedDepth: depth,
            timed: (result.depth ?? depth) < depth,
            elapsedMs: performance.now() - startMs,
            bestMove: result.uci,
            evaluation: result.evaluation,
            rootSideScore: whiteEvalTextToRootSideCp(result.evaluation, rootFen),
            nodes: result.nodes ?? null,
            pv: result.pv?.map(move => move.uci || move.toString?.()) ?? []
        };
    }
    catch (error) {
        return {
            ok: false,
            depth: null,
            requestedDepth: depth,
            timed: true,
            elapsedMs: performance.now() - startMs,
            error: error.message
        };
    }
}

function staticScore(childFen, rootFen) {
    const engine = createEngineCore(childFen);
    const score = engine.evaluation.evaluate();

    return {
        whiteScore: score.total,
        rootSideScore: whiteCpToRootSideCp(score.total, rootFen)
    };
}

export function analyzePair(row, args) {
    const coachChild = makeChild(row.fen, row.coachMove);
    const referenceChild = makeChild(row.fen, row.referenceMove);

    if (!coachChild.legal || !referenceChild.legal) {
        return {
            row,
            coachChild,
            referenceChild,
            depths: []
        };
    }

    const staticCoach = staticScore(coachChild.fen, row.fen);
    const staticReference = staticScore(referenceChild.fen, row.fen);
    const depths =
        args.depths.map(depth => {
            const coach = searchChild(
                coachChild.fen,
                row.fen,
                depth,
                args.maxMsPerSearch
            );
            const reference = searchChild(
                referenceChild.fen,
                row.fen,
                depth,
                args.maxMsPerSearch
            );
            const gapCp =
                Number.isFinite(coach.rootSideScore) &&
                Number.isFinite(reference.rootSideScore)
                    ? reference.rootSideScore - coach.rootSideScore
                    : null;

            return {
                depth,
                coach,
                reference,
                gapCp
            };
        });

    return {
        row,
        coachChild: {
            ...coachChild,
            static: staticCoach
        },
        referenceChild: {
            ...referenceChild,
            static: staticReference
        },
        staticGapCp: staticReference.rootSideScore - staticCoach.rootSideScore,
        depths
    };
}

function renderMarkdown(payload) {
    const row = payload.row;
    const lines = [
        "# Child Pair Depth Probe",
        "",
        `- Label: ${row.label}`,
        `- FEN: \`${row.fen}\``,
        `- Coach move: ${row.coachMove}`,
        `- Reference move: ${row.referenceMove}`,
        `- External gap: ${row.externalGapCp ?? "n/a"}cp`,
        `- Static gap: ${payload.staticGapCp ?? "n/a"}cp`,
        "",
        "| Depth | Coach score | Coach best | Ref score | Ref best | Gap |",
        "| ---: | ---: | --- | ---: | --- | ---: |"
    ];

    for (const item of payload.depths) {
        lines.push(
            `| ${item.depth} | ${item.coach.rootSideScore ?? "err"} | ` +
            `${item.coach.bestMove ?? item.coach.error ?? ""} | ` +
            `${item.reference.rootSideScore ?? "err"} | ` +
            `${item.reference.bestMove ?? item.reference.error ?? ""} | ` +
            `${item.gapCp ?? ""} |`
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
    const rows = summary.allRows || summary.rows || [];
    const matches = args.label
        ? rows.filter(item => item.label === args.label)
        : rows.filter(item => item.label.includes(args.labelContains));

    if (matches.length === 0) {
        throw new Error(`No row found for label selector.`);
    }
    if (matches.length > 1) {
        throw new Error(
            `Label selector matched ${matches.length} rows; use a narrower selector.`
        );
    }
    const row = matches[0];

    const payload = {
        args,
        generatedAt: new Date().toISOString(),
        ...analyzePair(row, args)
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "child-pair-depths.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "child-pair-depths.md"),
        renderMarkdown(payload)
    );

    console.log(
        `Probed ${payload.depths.length} depth(s) for ${row.label}.`
    );
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
