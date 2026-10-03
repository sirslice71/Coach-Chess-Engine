#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REPO = process.cwd();
const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/triage-coach-fens.mjs --fen-file <file> " +
        "[--repo <Coach repo>] [--depths 4,6,8] [--limit 12] " +
        "[--max-ms-per-depth <ms>] [--out <dir>]"
    );
}

function parseArgs(argv) {
    const args = {
        repo: DEFAULT_REPO,
        fenFile: null,
        depths: [4, 6, 8],
        limit: 12,
        maxMsPerDepth: null,
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--repo") {
            args.repo = argv[++index];
        }
        else if (token === "--fen-file") {
            args.fenFile = argv[++index];
        }
        else if (token === "--depths") {
            args.depths = parseDepths(argv[++index]);
        }
        else if (token === "--limit") {
            args.limit = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-ms-per-depth") {
            args.maxMsPerDepth = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.fenFile) {
        throw new Error("Missing --fen-file");
    }

    if (
        args.maxMsPerDepth !== null &&
        (
            !Number.isFinite(args.maxMsPerDepth) ||
            args.maxMsPerDepth <= 0
        )
    ) {
        throw new Error("--max-ms-per-depth must be a positive integer");
    }

    return args;
}

function parseDepths(text) {
    if (text.includes("-")) {
        const [start, end] = text.split("-").map(Number);
        return Array.from(
            { length: end - start + 1 },
            (_, index) => start + index
        );
    }

    return text.split(",").map(value => Number.parseInt(value, 10));
}

function parseFenFile(filePath) {
    return fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map(line => {
            const separator = line.indexOf("|");

            if (separator === -1) {
                return {
                    label: line.slice(0, 40),
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
    if (rows.length === 0) {
        return null;
    }

    return rows[0].score - rows.at(-1).score;
}

function countSameScore(rows, score) {
    return rows.filter(row => row.score === score).length;
}

function classifyDepth(rows) {
    const top = rows[0] || null;

    if (!top) {
        return {
            kind: "no-root-moves",
            topTieCount: 0,
            mateCount: 0,
            topBandCp: null
        };
    }

    const mateCount =
        rows.filter(row => isMateScore(row.score)).length;

    const topTieCount =
        countSameScore(rows, top.score);

    const topBandCp =
        scoreBand(rows);

    if (mateCount >= Math.max(2, Math.ceil(rows.length * 0.5))) {
        return {
            kind: "mate-table",
            topTieCount,
            mateCount,
            topBandCp
        };
    }

    if (topTieCount >= Math.max(4, Math.ceil(rows.length * 0.5))) {
        return {
            kind: "broad-tie",
            topTieCount,
            mateCount,
            topBandCp
        };
    }

    if (topBandCp !== null && topBandCp <= 25) {
        return {
            kind: "narrow-tie",
            topTieCount,
            mateCount,
            topBandCp
        };
    }

    return {
        kind: "spread",
        topTieCount,
        mateCount,
        topBandCp
    };
}

function classifyPosition(depths) {
    const kinds =
        depths.map(depth => depth.classification.kind);

    const deepest =
        depths.at(-1);

    const hasMateFlip =
        depths.some(depth =>
            depth.classification.kind !== "mate-table"
        ) &&
        deepest?.classification.kind === "mate-table";

    if (hasMateFlip) {
        return "mate-horizon-flip";
    }

    if (kinds.every(kind => kind === "mate-table")) {
        return "mate-table";
    }

    if (kinds.every(kind =>
        kind === "broad-tie" ||
        kind === "narrow-tie"
    )) {
        return "all-tied";
    }

    if (deepest?.classification.kind === "spread") {
        return "candidate-review";
    }

    if (kinds.includes("spread")) {
        return "early-spread-then-tie";
    }

    return "diagnostic-only";
}

function escapeMarkdown(text) {
    return text.replaceAll("|", "\\|");
}

function classificationCounts(results) {
    return results.reduce((counts, item) => {
        counts[item.classification] =
            (counts[item.classification] || 0) + 1;
        return counts;
    }, {});
}

function timedDepthLabel(depthResult) {
    const marker =
        depthResult.timed
            ? "timed"
            : "full";

    if (depthResult.completedDepth !== depthResult.depth) {
        return `${Math.round(depthResult.elapsedMs)}ms ${marker} d${depthResult.completedDepth}`;
    }

    return `${Math.round(depthResult.elapsedMs)}ms ${marker}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = path.resolve(args.repo);
    const positions = parseFenFile(args.fenFile);

    const uciModule = await import(
        pathToFileURL(path.join(repo, "js/uci/uciengine.js")).href
    );

    const results = [];

    for (
        let positionIndex = 0;
        positionIndex < positions.length;
        positionIndex++
    ) {
        const position = positions[positionIndex];
        const depths = [];

        console.error(
            `[${positionIndex + 1}/${positions.length}] ${position.label}`
        );

        for (const depth of args.depths) {
            const startMs = performance.now();
            const deadlineMs =
                args.maxMsPerDepth === null
                    ? null
                    : startMs + args.maxMsPerDepth;

            console.error(
                `  d${depth} start` +
                (
                    args.maxMsPerDepth === null
                        ? ""
                        : ` (budget ${args.maxMsPerDepth}ms)`
                )
            );

            const engine = uciModule.createEngineCore(position.fen);
            const result = uciModule.withMutedConsole(
                () => engine.search.bestMove(
                    depth,
                    {
                        quiet: true,
                        ...(deadlineMs === null ? {} : { deadlineMs })
                    }
                )
            );
            const elapsedMs =
                performance.now() - startMs;

            const completedDepth =
                result.depth ?? depth;

            const timed =
                completedDepth < depth;

            const rows =
                result.rootMoves
                    .slice(0, args.limit)
                    .map(rootMove => ({
                        uci: rootMove.uci,
                        score: rootMove.score,
                        mateClass: isMateScore(rootMove.score)
                    }));

            depths.push({
                depth,
                requestedDepth: depth,
                completedDepth,
                best: result.uci,
                evaluation: result.evaluation,
                nodes: result.nodes,
                elapsedMs,
                timed,
                rows,
                classification: classifyDepth(rows)
            });

            console.error(
                `  d${depth} done: ` +
                `${depths.at(-1).classification.kind}, ` +
                `best=${result.uci ?? "none"}, ` +
                `completed=d${completedDepth}, ` +
                `nodes=${result.nodes ?? 0}, ` +
                `elapsed=${Math.round(elapsedMs)}ms` +
                (timed ? " (timed)" : "")
            );
        }

        results.push({
            ...position,
            classification: classifyPosition(depths),
            depths
        });

        const latest = results.at(-1);
        console.log(
            `${latest.label}: ${latest.classification} ` +
            `(d${latest.depths.at(-1).depth} ${latest.depths.at(-1).classification.kind})`
        );
    }

    results.sort((left, right) => {
        const rank = item =>
            item.classification === "candidate-review" ? 0 :
            item.classification === "early-spread-then-tie" ? 1 :
            item.classification === "diagnostic-only" ? 2 :
            item.classification === "mate-horizon-flip" ? 3 :
            item.classification === "all-tied" ? 4 :
            item.classification === "mate-table" ? 5 :
            6;

        return rank(left) - rank(right);
    });

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        const counts = classificationCounts(results);

        fs.writeFileSync(
            path.join(args.out, "fen-triage.json"),
            JSON.stringify({ args, summary: { counts }, results }, null, 2) + "\n"
        );

        const lines = [
            "# Coach FEN Triage",
            "",
            `- Source: \`${args.fenFile}\``,
            `- Depths: ${args.depths.join(", ")}`,
            `- Root rows per depth: ${args.limit}`,
            args.maxMsPerDepth === null
                ? "- Max ms per depth: none"
                : `- Max ms per depth: ${args.maxMsPerDepth}`,
            `- Class counts: ${Object.entries(counts)
                .map(([classification, count]) => `${classification}=${count}`)
                .join(", ")}`,
            "",
            "| Class | Label | Deepest | Best | Band | Top ties | Mate rows | Time | FEN |",
            "| --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- |",
            ...results.map(item => {
                const deepest = item.depths.at(-1);
                const c = deepest.classification;

                return [
                    item.classification,
                    escapeMarkdown(item.label),
                    deepest.depth,
                    deepest.best,
                    c.topBandCp ?? "",
                    c.topTieCount,
                    c.mateCount,
                    timedDepthLabel(deepest),
                    `\`${item.fen}\``
                ].join(" | ");
            }).map(line => `| ${line} |`)
        ];

        fs.writeFileSync(
            path.join(args.out, "fen-triage.md"),
            lines.join("\n") + "\n"
        );
    }
}

main().catch(error => {
    usage();
    console.error(error.message);
    process.exit(1);
});
