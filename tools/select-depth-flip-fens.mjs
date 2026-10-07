#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
    createEngineCore,
    moveToUci
} from "../js/uci/uciengine.js";
import { SearchTimeout } from "../js/engine/search.js";

const MATE_THRESHOLD = 90000;

function usage() {
    console.error(
        "Usage: node tools/select-depth-flip-fens.mjs " +
        "--summary <coach-time-depth-summary.json> --out <dir> " +
        "[--target-depth 10] [--max-played-depth 8] [--min-gap 100] " +
        "[--confirm-depth 12] [--limit 40] [--require-shallow-agrees]"
    );
}

function parseArgs(argv) {
    const args = {
        summary: null,
        out: null,
        targetDepth: 10,
        maxPlayedDepth: 8,
        minMove: 1,
        minGap: 100,
        confirmDepth: null,
        limit: 40,
        maxMsPerSearch: 5000,
        requireShallowAgrees: false,
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--summary") args.summary = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--target-depth") args.targetDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--max-played-depth") args.maxPlayedDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--min-move") args.minMove = Number.parseInt(argv[++index], 10);
        else if (token === "--min-gap") args.minGap = Number.parseInt(argv[++index], 10);
        else if (token === "--confirm-depth") {
            const value = argv[++index];
            args.confirmDepth =
                value === "off"
                    ? null
                    : Number.parseInt(value, 10);
        }
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-search") args.maxMsPerSearch = Number.parseInt(argv[++index], 10);
        else if (token === "--require-shallow-agrees") args.requireShallowAgrees = true;
        else if (token === "--progress") args.progress = true;
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.summary) throw new Error("Missing --summary");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--target-depth", args.targetDepth],
        ["--max-played-depth", args.maxPlayedDepth],
        ["--min-move", args.minMove],
        ["--min-gap", args.minGap],
        ["--confirm-depth", args.confirmDepth],
        ["--limit", args.limit],
        ["--max-ms-per-search", args.maxMsPerSearch]
    ]) {
        if (value !== null && (!Number.isInteger(value) || value < 0)) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isMateScore(score) {
    return Math.abs(score) >= MATE_THRESHOLD;
}

function rootScore(root, uci) {
    return (root.rootMoves || [])
        .find(row => row.uci === uci)
        ?.score ?? null;
}

function rootRank(root, uci) {
    const index =
        (root.rootMoves || [])
            .findIndex(row => row.uci === uci);

    return index === -1 ? null : index + 1;
}

function searchFen(fen, depth, maxMsPerSearch) {
    const engine = createEngineCore(fen);
    const deadlineMs =
        maxMsPerSearch === null
            ? null
            : performance.now() + maxMsPerSearch;
    const result = engine.search.bestMove(depth, {
        quiet: true,
        deadlineMs
    });
    const rootMoves =
        (result.rootMoves || [])
            .map(row => ({
                uci: row.uci,
                score: row.score
            }));

    return {
        bestMove:
            result.bestMove
                ? moveToUci(result.bestMove)
                : rootMoves[0]?.uci ?? null,
        score: result.score ?? rootMoves[0]?.score ?? null,
        depth: result.depth,
        rootMoves
    };
}

function labelForMove(move) {
    return `game${move.game}-ply${move.ply}-${move.san.replace(/[^A-Za-z0-9=+#-]+/g, "")}`;
}

function scoreText(score) {
    if (score === null || score === undefined) return "n/a";
    if (isMateScore(score)) return score > 0 ? `M+${100000 - score}` : `M-${100000 + score}`;
    return `${score}cp`;
}

function buildMarkdown(args, payload) {
    const lines = [
        "# Coach Depth-Flip Selector",
        "",
        `- Source: \`${payload.source}\``,
        `- Target depth: ${args.targetDepth}`,
        `- Confirmation depth: ${args.confirmDepth ?? "off"}`,
        `- Max played depth: ${args.maxPlayedDepth}`,
        `- Min deeper gap: ${args.minGap}cp`,
        `- Require shallow agrees: ${args.requireShallowAgrees ? "yes" : "no"}`,
        `- Input moves: ${payload.summary.inputMoves}`,
        `- Audited moves: ${payload.summary.audited}`,
        `- Candidates: ${payload.summary.candidates}`,
        `- Preliminary candidates: ${payload.summary.preliminaryCandidates}`,
        `- Rejections: ${Object.entries(payload.summary.rejectionCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
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
            `- Played: ${row.playedMove} at match depth ${row.playedDepth}, score ${scoreText(row.deeper.playedScore)}, rank ${row.deeper.playedRank ?? "n/a"}`,
            `- Deeper best: ${row.deeper.bestMove} at depth ${row.deeper.depth}, score ${scoreText(row.deeper.bestScore)}, gap ${row.deeper.gapCp}cp`,
            row.confirm
                ? `- Confirmation: ${row.confirm.bestMove} at depth ${row.confirm.depth}; candidate move score ${scoreText(row.confirm.candidateScore)}, played score ${scoreText(row.confirm.playedScore)}, gap ${row.confirm.gapCp}cp`
                : `- Confirmation: off`,
            `- Shallow probe: ${row.shallow.bestMove} at depth ${row.shallow.depth}, agrees with played: ${row.shallow.agreesWithPlayed ? "yes" : "no"}`,
            `- Clock before: ${row.estimatedClockBeforeSeconds ?? "n/a"}s; match time: ${row.timeSeconds}s; phase: ${row.phase}`,
            `- FEN: \`${row.fen}\``,
            ""
        );
    }

    return lines.join("\n");
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const summary = readJson(args.summary);
    const inputMoves =
        (summary.moves || [])
            .filter(move =>
                Number.isFinite(move.depth) &&
                move.depth <= args.maxPlayedDepth &&
                move.moveNumber >= args.minMove &&
                move.fenBefore &&
                move.uci &&
                !String(move.score || "").includes("M")
            )
            .sort((left, right) =>
                left.depth - right.depth ||
                right.moveNumber - left.moveNumber ||
                (left.estimatedClockBeforeSeconds ?? Infinity) -
                    (right.estimatedClockBeforeSeconds ?? Infinity) ||
                left.timeSeconds - right.timeSeconds
            )
            .slice(0, args.limit);

    const rows = [];

    for (const [moveIndex, move] of inputMoves.entries()) {
        const label = labelForMove(move);
        const shallowDepth = Math.max(1, move.depth);
        let shallow;
        let deeper;
        let confirm = null;

        try {
            shallow = searchFen(move.fenBefore, shallowDepth, args.maxMsPerSearch);
            deeper = searchFen(move.fenBefore, args.targetDepth, args.maxMsPerSearch);
        }
        catch (error) {
            rows.push({
                label,
                game: move.game,
                ply: move.ply,
                phase: move.phase,
                san: move.san,
                playedMove: move.uci,
                playedDepth: move.depth,
                timeSeconds: move.timeSeconds,
                estimatedClockBeforeSeconds: move.estimatedClockBeforeSeconds,
                fen: move.fenBefore,
                candidate: false,
                reasons: [
                    error instanceof SearchTimeout
                        ? "search-timeout"
                        : `search-error:${error.message}`
                ]
            });
            continue;
        }
        const playedScore = rootScore(deeper, move.uci);
        const playedRank = rootRank(deeper, move.uci);
        const bestScore = deeper.score;
        const gapCp =
            Number.isFinite(bestScore) && Number.isFinite(playedScore)
                ? bestScore - playedScore
                : null;
        const shallowAgrees =
            shallow.bestMove === move.uci;
        const reasons = [];

        if (deeper.bestMove === move.uci) reasons.push("deeper-agrees-with-played");
        if (gapCp === null) reasons.push("played-move-not-in-root");
        else if (gapCp < args.minGap) reasons.push("gap<min");
        if (isMateScore(bestScore) || isMateScore(playedScore ?? 0)) reasons.push("mate-score");
        if (args.requireShallowAgrees && !shallowAgrees) reasons.push("shallow-disagrees-with-played");

        const preliminaryCandidate = reasons.length === 0;

        if (args.progress) {
            console.error(
                `[${moveIndex + 1}/${inputMoves.length}] ${label}: ` +
                (preliminaryCandidate
                    ? `preliminary ${deeper.bestMove} gap ${gapCp}cp`
                    : `reject ${reasons.join(",") || "unknown"}`)
            );
        }

        if (preliminaryCandidate && args.confirmDepth !== null) {
            try {
                const confirmSearch =
                    searchFen(move.fenBefore, args.confirmDepth, args.maxMsPerSearch);
                const candidateScore =
                    rootScore(confirmSearch, deeper.bestMove);
                const confirmPlayedScore =
                    rootScore(confirmSearch, move.uci);
                const confirmGapCp =
                    Number.isFinite(candidateScore) && Number.isFinite(confirmPlayedScore)
                        ? candidateScore - confirmPlayedScore
                        : null;

                confirm = {
                    depth: confirmSearch.depth,
                    bestMove: confirmSearch.bestMove,
                    candidateMove: deeper.bestMove,
                    candidateScore,
                    playedScore: confirmPlayedScore,
                    gapCp: confirmGapCp
                };

                if (confirmGapCp === null) reasons.push("confirm-move-not-in-root");
                else if (confirmGapCp < args.minGap) reasons.push("confirm-gap<min");
                if (isMateScore(candidateScore ?? 0) || isMateScore(confirmPlayedScore ?? 0)) {
                    reasons.push("confirm-mate-score");
                }

                if (args.progress) {
                    console.error(
                        `  confirm ${label}: ${confirmSearch.bestMove}, ` +
                        `${confirmGapCp ?? "n/a"}cp`
                    );
                }
            }
            catch (error) {
                reasons.push(
                    error instanceof SearchTimeout
                        ? "confirm-search-timeout"
                        : `confirm-search-error:${error.message}`
                );
            }
        }

        rows.push({
            label,
            game: move.game,
            ply: move.ply,
            phase: move.phase,
            san: move.san,
            playedMove: move.uci,
            playedDepth: move.depth,
            timeSeconds: move.timeSeconds,
            estimatedClockBeforeSeconds: move.estimatedClockBeforeSeconds,
            fen: move.fenBefore,
            shallow: {
                depth: shallow.depth,
                bestMove: shallow.bestMove,
                agreesWithPlayed: shallowAgrees
            },
            deeper: {
                depth: deeper.depth,
                bestMove: deeper.bestMove,
                bestScore,
                playedScore,
                playedRank,
                gapCp
            },
            confirm,
            preliminaryCandidate,
            candidate: reasons.length === 0,
            reasons
        });
    }

    const rejectionCounts = {};
    for (const row of rows) {
        if (row.candidate) continue;
        for (const reason of row.reasons) {
            rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
        }
    }

    const candidates =
        rows
            .filter(row => row.candidate)
            .sort((left, right) => right.deeper.gapCp - left.deeper.gapCp);

    const payload = {
        source: args.summary,
        generatedAt: new Date().toISOString(),
        args,
        summary: {
            inputMoves: summary.moves?.length ?? 0,
            audited: rows.length,
            candidates: candidates.length,
            preliminaryCandidates:
                rows.filter(row => row.preliminaryCandidate).length,
            rejectionCounts
        },
        candidates,
        rows
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "depth-flip-candidates.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "depth-flip-candidates.md"),
        buildMarkdown(args, payload)
    );
    fs.writeFileSync(
        path.join(args.out, "depth-flip-candidates.fens"),
        candidates.map(row => `${row.label} | ${row.fen}`).join("\n") +
            (candidates.length ? "\n" : "")
    );

    console.log(
        `Audited ${rows.length} move(s), found ${candidates.length} depth-flip candidate(s).`
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
