#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createEngineCore, moveToUci } from "../js/uci/uciengine.js";
import FEN from "../js/core/fen.js";
import PGN from "../js/game/pgn.js";

const MATE_SCORE = 100000;
const MATE_THRESHOLD = 90000;

function usage() {
    return [
        "Usage:",
        "  node tools/mine-coach-pgn-swings.mjs --pgn <match.pgn> --out <dir> [options]",
        "",
        "Options:",
        "  --player <name>       Player name to mine (default: Coach)",
        "  --top <n>             FENs per bucket to write (default: 10)",
        "  --drop-cp <n>         Minimum Coach-perspective drop (default: 300)",
        "  --include-forfeits    Include time-forfeit games",
        "",
        "Outputs:",
        "  swing-report.json",
        "  swing-report.md",
        "  coach-swing-targets.fens"
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        pgn: null,
        out: null,
        player: "Coach",
        top: 10,
        dropCp: 300,
        includeForfeits: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => {
            index += 1;
            if (index >= argv.length) {
                throw new Error(`${arg} requires a value`);
            }
            return argv[index];
        };

        switch (arg) {
            case "--pgn":
                args.pgn = next();
                break;
            case "--out":
                args.out = next();
                break;
            case "--player":
                args.player = next();
                break;
            case "--top":
                args.top = parsePositiveInteger(next(), "--top");
                break;
            case "--drop-cp":
                args.dropCp = parsePositiveInteger(next(), "--drop-cp");
                break;
            case "--include-forfeits":
                args.includeForfeits = true;
                break;
            case "--help":
            case "-h":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }

    return args;
}

function parsePositiveInteger(text, name) {
    const value = Number.parseInt(text, 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

function splitPgnGames(text) {
    const lines = text.split(/\r?\n/);
    const starts = [];

    lines.forEach((line, index) => {
        if (/^\s*\[Event\s+"/.test(line)) {
            starts.push(index);
        }
    });

    if (starts.length === 0) {
        return [text];
    }

    return starts.map((start, index) => {
        const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
        return lines.slice(start, end).join("\n");
    });
}

function parseHeaders(gameText) {
    const headers = {};
    for (const match of gameText.matchAll(/^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]\s*$/gm)) {
        headers[match[1]] = match[2];
    }
    return headers;
}

function stripHeaders(gameText) {
    return gameText
        .split(/\r?\n/)
        .filter(line => !/^\s*\[/.test(line))
        .join("\n");
}

function tokenizeMovetext(movetext) {
    const tokens = [];
    let index = 0;

    while (index < movetext.length) {
        const char = movetext[index];

        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        if (char === "{") {
            const end = movetext.indexOf("}", index + 1);
            const stop = end === -1 ? movetext.length : end;
            tokens.push({
                type: "comment",
                text: movetext.slice(index + 1, stop).trim()
            });
            index = end === -1 ? movetext.length : end + 1;
            continue;
        }

        if (char === "(") {
            let depth = 1;
            let stop = index + 1;
            while (stop < movetext.length && depth > 0) {
                if (movetext[stop] === "(") depth += 1;
                else if (movetext[stop] === ")") depth -= 1;
                stop += 1;
            }
            tokens.push({
                type: "variation",
                text: movetext.slice(index + 1, Math.max(index + 1, stop - 1)).trim()
            });
            index = stop;
            continue;
        }

        if (char === "$") {
            let stop = index + 1;
            while (stop < movetext.length && /\d/.test(movetext[stop])) {
                stop += 1;
            }
            tokens.push({ type: "nag", text: movetext.slice(index, stop) });
            index = stop;
            continue;
        }

        let stop = index;
        while (
            stop < movetext.length &&
            !/\s/.test(movetext[stop]) &&
            !["{", "(", "$"].includes(movetext[stop])
        ) {
            stop += 1;
        }
        tokens.push({ type: "raw", text: movetext.slice(index, stop) });
        index = stop;
    }

    return tokens;
}

function splitSan(raw) {
    return raw
        .replace(/[!?]+$/g, "")
        .replace(/[+#]+$/g, "");
}

function buildMainline(tokens) {
    const mainline = [];
    let moveNumber = 1;
    let side = "w";
    let current = null;

    for (const token of tokens) {
        if (token.type === "comment") {
            if (current) {
                current.comments.push(token.text);
            }
            continue;
        }

        if (token.type === "nag") {
            if (current) {
                current.nags.push(token.text);
            }
            continue;
        }

        if (token.type !== "raw") {
            continue;
        }

        if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(token.text)) {
            break;
        }

        if (/^\d+\.(?:\.\.)?$/.test(token.text)) {
            continue;
        }

        const san = splitSan(token.text);
        if (!san) {
            continue;
        }

        current = {
            moveNumber,
            side,
            san,
            rawSan: token.text,
            comments: [],
            nags: []
        };
        mainline.push(current);

        if (side === "w") {
            side = "b";
        }
        else {
            side = "w";
            moveNumber += 1;
        }
    }

    return mainline;
}

function scoreFromComments(comments) {
    for (const comment of comments) {
        const mate = comment.match(/([+-]?)M(\d+)/i);
        if (mate) {
            const sign = mate[1] === "-" ? -1 : 1;
            return {
                cp: sign * (MATE_SCORE - Number.parseInt(mate[2], 10)),
                text: mate[0],
                isMate: true
            };
        }

        const cp = comment.match(/(?<![\w.])([+-]?\d+(?:\.\d+)?)(?![\w.])/);
        if (cp) {
            return {
                cp: Math.round(Number.parseFloat(cp[1]) * 100),
                text: cp[1],
                isMate: false
            };
        }
    }

    return null;
}

function replayGame(game, gameIndex) {
    const headers = parseHeaders(game);
    const mainline = buildMainline(tokenizeMovetext(stripHeaders(game)));
    const engine = createEngineCore(
        headers.SetUp === "1" && headers.FEN ? headers.FEN : null
    );
    const replayed = [];
    let replayError = null;

    for (const entry of mainline) {
        const legalMoves = engine.legalMoveGenerator.generateMoves();
        const fenBefore = FEN.export(engine.board);
        const candidates = legalMoves.filter(move =>
            PGN.sanForMove(move, legalMoves) === entry.san
        );

        if (candidates.length !== 1) {
            replayError =
                `move ${entry.moveNumber}${entry.side === "b" ? "..." : "."} ` +
                `${entry.rawSan}: ${candidates.length} matching legal moves`;
            break;
        }

        const move = candidates[0];
        engine.board.makeMove(move);

        replayed.push({
            ...entry,
            game: gameIndex,
            headers,
            fenBefore,
            fenAfter: FEN.export(engine.board),
            uci: moveToUci(move),
            score: scoreFromComments(entry.comments)
        });
    }

    return { headers, replayed, replayError };
}

function coachSide(headers, playerName) {
    const target = playerName.toLowerCase();
    const white = (headers.White ?? "").toLowerCase();
    const black = (headers.Black ?? "").toLowerCase();

    if (white === target || white.includes(target)) return "w";
    if (black === target || black.includes(target)) return "b";
    return null;
}

function sideName(side) {
    return side === "w" ? "White" : "Black";
}

function scoreForCoach(entry, coach) {
    return entry.side === coach ? entry.score.cp : -entry.score.cp;
}

function classifySwing(record) {
    const beforeMate = Math.abs(record.beforeCoachCp) >= MATE_THRESHOLD;
    const afterMate = Math.abs(record.afterCoachCp) >= MATE_THRESHOLD;

    if (record.afterCoachCp <= -MATE_THRESHOLD && record.beforeCoachCp > -MATE_THRESHOLD) {
        return "entered-losing-mate";
    }

    if (!beforeMate && !afterMate) {
        return "centipawn-drop";
    }

    return "mate-score-change";
}

function markdownReport(summary) {
    const lines = [
        "# Coach PGN Swing Miner",
        "",
        `Source: \`${summary.sourcePgn}\``,
        `Player: ${summary.player}`,
        `Games: ${summary.games}`,
        `Games mined: ${summary.gamesMined}`,
        `Games skipped: ${summary.gamesSkipped}`,
        `Replay errors: ${summary.replayErrors.length}`,
        `Coach-side scored moves: ${summary.scoredCoachMoves}`,
        `Swings >= ${summary.dropCp}cp: ${summary.swings.length}`,
        ""
    ];

    for (const [title, records] of [
        ["Top Centipawn Drops", summary.topCentipawnDrops],
        ["Top Losing-Mate Entries", summary.topLosingMateEntries],
        ["Top Mate Score Changes", summary.topMateScoreChanges],
        ["Top All Swings", summary.topAllSwings]
    ]) {
        lines.push(`## ${title}`, "");

        if (records.length === 0) {
            lines.push("None.", "");
            continue;
        }

        for (const [index, record] of records.entries()) {
            lines.push(`### ${index + 1}. ${record.label}`, "");
            lines.push(`- Game: ${record.game}`);
            lines.push(`- Coach side: ${sideName(record.coachSide)}`);
            lines.push(`- Move: ${record.moveNumber}${record.side === "b" ? "..." : "."} ${record.san} (${record.uci})`);
            lines.push(`- Category: ${record.category}`);
            lines.push(`- Coach eval: ${record.beforeCoachCp}cp -> ${record.afterCoachCp}cp (${record.dropCoachCp}cp)`);
            lines.push(`- PGN score: ${record.beforeScoreText} -> ${record.afterScoreText}`);
            lines.push(`- FEN before: \`${record.fenBefore}\``);
            lines.push(`- FEN after: \`${record.fenAfter}\``);
            lines.push("");
        }
    }

    return lines.join("\n");
}

function fenLines(records) {
    const lines = [];

    for (const record of records) {
        lines.push(`${record.label}-before | ${record.fenBefore}`);
        lines.push(`${record.label}-after | ${record.fenAfter}`);
    }

    return lines.join("\n") + "\n";
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

    if (!args.pgn || !args.out) {
        console.error("--pgn and --out are required");
        console.error(usage());
        process.exitCode = 1;
        return;
    }

    const pgnText = fs.readFileSync(args.pgn, "utf8");
    const games = splitPgnGames(pgnText);
    const swings = [];
    const replayErrors = [];
    let gamesMined = 0;
    let gamesSkipped = 0;
    let scoredCoachMoves = 0;

    for (const [index, game] of games.entries()) {
        const gameNumber = index + 1;
        const { headers, replayed, replayError } = replayGame(game, gameNumber);
        const termination = (headers.Termination ?? "").toLowerCase();

        if (termination === "time forfeit" && !args.includeForfeits) {
            gamesSkipped += 1;
            continue;
        }

        const coach = coachSide(headers, args.player);
        if (coach === null) {
            gamesSkipped += 1;
            continue;
        }

        gamesMined += 1;

        if (replayError) {
            replayErrors.push({ game: gameNumber, replayError });
        }

        let previousScored = null;

        for (const entry of replayed) {
            if (entry.score === null) {
                continue;
            }

            if (entry.side === coach) {
                scoredCoachMoves += 1;

                if (previousScored !== null) {
                    const beforeCoachCp =
                        scoreForCoach(previousScored, coach);
                    const afterCoachCp =
                        scoreForCoach(entry, coach);
                    const dropCoachCp = afterCoachCp - beforeCoachCp;

                    if (dropCoachCp <= -args.dropCp) {
                        const cleanSan = entry.san.replace(/[^A-Za-z0-9]+/g, "");
                        const record = {
                            label: `game${gameNumber}-ply${replayed.indexOf(entry) + 1}-${cleanSan}`,
                            game: gameNumber,
                            event: headers.Event ?? null,
                            result: headers.Result ?? null,
                            coachSide: coach,
                            moveNumber: entry.moveNumber,
                            side: entry.side,
                            san: entry.rawSan,
                            uci: entry.uci,
                            fenBefore: entry.fenBefore,
                            fenAfter: entry.fenAfter,
                            beforeWhiteCp: previousScored.score.cp,
                            afterWhiteCp: entry.score.cp,
                            beforeCoachCp,
                            afterCoachCp,
                            dropCoachCp,
                            beforeScoreText: previousScored.score.text,
                            afterScoreText: entry.score.text,
                            beforeIsMate: previousScored.score.isMate,
                            afterIsMate: entry.score.isMate
                        };
                        record.category = classifySwing(record);
                        swings.push(record);
                    }
                }
            }

            previousScored = entry;
        }
    }

    swings.sort((a, b) => a.dropCoachCp - b.dropCoachCp);

    const topCentipawnDrops = swings
        .filter(record => record.category === "centipawn-drop")
        .slice(0, args.top);

    const topLosingMateEntries = swings
        .filter(record => record.category === "entered-losing-mate")
        .slice(0, args.top);

    const topMateScoreChanges = swings
        .filter(record => record.category === "mate-score-change")
        .slice(0, args.top);

    const topAllSwings = swings.slice(0, args.top);

    let selected = [
        ...topLosingMateEntries,
        ...topCentipawnDrops,
        ...topMateScoreChanges
    ];

    const uniqueSelected = [];
    const seen = new Set();
    for (const record of selected) {
        const key = `${record.game}:${record.moveNumber}:${record.san}:${record.category}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueSelected.push(record);
        }
    }

    const selectedFenCategoryCounts =
        uniqueSelected.reduce((counts, record) => {
            counts[record.category] = (counts[record.category] ?? 0) + 1;
            return counts;
        }, {});

    const summary = {
        sourcePgn: path.resolve(args.pgn),
        player: args.player,
        games: games.length,
        gamesMined,
        gamesSkipped,
        dropCp: args.dropCp,
        scoredCoachMoves,
        replayErrors,
        swings,
        topCentipawnDrops,
        topLosingMateEntries,
        topMateScoreChanges,
        topAllSwings,
        selectedFenCategoryCounts,
        selectedFenRecords: uniqueSelected
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "swing-report.json"),
        JSON.stringify(summary, null, 2) + "\n"
    );
    fs.writeFileSync(
        path.join(args.out, "swing-report.md"),
        markdownReport(summary)
    );
    fs.writeFileSync(
        path.join(args.out, "coach-swing-targets.fens"),
        fenLines(uniqueSelected)
    );

    console.log(JSON.stringify({
        out: args.out,
        games: summary.games,
        gamesMined,
        gamesSkipped,
        replayErrors: replayErrors.length,
        scoredCoachMoves,
        swings: swings.length,
        topCentipawnDrops: topCentipawnDrops.length,
        topLosingMateEntries: topLosingMateEntries.length,
        topMateScoreChanges: topMateScoreChanges.length,
        selectedFenRecords: uniqueSelected.length,
        selectedFenCategoryCounts,
        selectedFenPositions: uniqueSelected.length * 2,
        worst: topAllSwings.slice(0, 5).map(record => ({
            label: record.label,
            category: record.category,
            dropCoachCp: record.dropCoachCp,
            beforeCoachCp: record.beforeCoachCp,
            afterCoachCp: record.afterCoachCp,
            san: record.san
        }))
    }, null, 2));
}

main();
