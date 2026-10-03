#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
    allocateMoveTime,
    createEngineCore,
    moveToUci
} from "../js/uci/uciengine.js";
import { algebraic } from "../js/core/square.js";
import FEN from "../js/core/fen.js";
import { Piece } from "../js/core/piece.js";

function usage() {
    return [
        "Usage:",
        "  node tools/summarize-coach-pgn-time.mjs --pgn <match.pgn> --out <dir> [--player Coach]",
        "",
        "Reads CuteChess PGN comments such as {+0.38/7 3.0s} and writes:",
        "  coach-time-depth-summary.json",
        "  coach-time-depth-summary.md",
        "",
        "When PGN clock tags are absent, estimates remaining clock from TimeControl",
        "and cumulative Coach comment times. This is search-time budget, not exact",
        "GUI clock state."
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        pgn: null,
        out: null,
        player: "Coach"
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            i += 1;
            if (i >= argv.length) {
                throw new Error(`${arg} requires a value`);
            }
            return argv[i];
        };

        if (arg === "--pgn") args.pgn = next();
        else if (arg === "--out") args.out = next();
        else if (arg === "--player") args.player = next();
        else if (arg === "--help" || arg === "-h") args.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }

    return args;
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

function parseStartingClockSeconds(headers) {
    const timeControl =
        headers.TimeControl;

    if (!timeControl || timeControl === "-") {
        return null;
    }

    const firstSegment =
        timeControl.split(":")[0];

    const seconds =
        Number.parseFloat(firstSegment);

    return Number.isFinite(seconds)
        ? seconds
        : null;
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
            index = stop;
            continue;
        }

        if (char === "$") {
            let stop = index + 1;
            while (stop < movetext.length && /\d/.test(movetext[stop])) {
                stop += 1;
            }
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

function stripSan(raw) {
    return raw
        .replace(/[!?]+$/g, "")
        .replace(/[+#]+$/g, "");
}

function normalizeSan(raw) {
    return stripSan(raw)
        .replace(/^0-0-0/, "O-O-O")
        .replace(/^0-0/, "O-O")
        .replace(/\s*e\.p\.$/i, "")
        .trim();
}

function pieceLetter(piece) {
    switch (Math.abs(piece)) {
        case Math.abs(Piece.WN): return "N";
        case Math.abs(Piece.WB): return "B";
        case Math.abs(Piece.WR): return "R";
        case Math.abs(Piece.WQ): return "Q";
        case Math.abs(Piece.WK): return "K";
        default: return "";
    }
}

function promotionLetter(move) {
    if (!move.isPromotion()) {
        return "";
    }

    return pieceLetter(move.promotedPiece);
}

function moveGivesMateOrCheck(engine, move) {
    const board = engine.board;
    board.makeMove(move);

    try {
        const inCheck = board.isInCheck();
        if (!inCheck) {
            return "";
        }

        const replies =
            engine.legalMoveGenerator.generateMoves();

        return replies.length === 0 ? "#" : "+";
    }
    finally {
        board.undoMove();
    }
}

function moveToSan(engine, move, legalMoves) {
    if (move.isCastle()) {
        const castleSan =
            moveToUci(move).slice(2, 4) === "g1" ||
            moveToUci(move).slice(2, 4) === "g8"
                ? "O-O"
                : "O-O-O";

        return castleSan + moveGivesMateOrCheck(engine, move);
    }

    const piece = pieceLetter(move.piece);
    const from = algebraic(move.fromSquare);
    const to = algebraic(move.toSquare);
    const capture = move.isCapture() ? "x" : "";

    let disambiguation = "";

    if (piece) {
        const similarMoves =
            legalMoves.filter(candidate =>
                candidate.key !== move.key &&
                candidate.toSquare === move.toSquare &&
                Math.abs(candidate.piece) === Math.abs(move.piece)
            );

        if (similarMoves.length > 0) {
            const sameFile =
                similarMoves.some(candidate =>
                    algebraic(candidate.fromSquare)[0] === from[0]
                );
            const sameRank =
                similarMoves.some(candidate =>
                    algebraic(candidate.fromSquare)[1] === from[1]
                );

            if (!sameFile) disambiguation = from[0];
            else if (!sameRank) disambiguation = from[1];
            else disambiguation = from;
        }
    }

    const pawnCaptureFile =
        !piece && move.isCapture()
            ? from[0]
            : "";

    const promotion =
        move.isPromotion()
            ? `=${promotionLetter(move)}`
            : "";

    return (
        piece +
        disambiguation +
        pawnCaptureFile +
        capture +
        to +
        promotion +
        moveGivesMateOrCheck(engine, move)
    );
}

function resolveSanMove(engine, rawSan, legalMoves) {
    const target = normalizeSan(rawSan);
    const candidates =
        legalMoves
            .map(move => ({
                move,
                san: normalizeSan(moveToSan(engine, move, legalMoves)),
                uci: moveToUci(move)
            }))
            .filter(candidate =>
                candidate.san === target ||
                candidate.uci === target.toLowerCase()
            );

    return candidates.length === 1
        ? candidates[0].move
        : null;
}

function replayStartingFen(headers) {
    if (headers.SetUp === "1" && headers.FEN) {
        return headers.FEN;
    }

    return null;
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

        if (token.type !== "raw") {
            continue;
        }

        if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(token.text)) {
            break;
        }

        if (/^\d+\.(?:\.\.)?$/.test(token.text)) {
            continue;
        }

        const san = stripSan(token.text);
        if (!san) {
            continue;
        }

        current = {
            moveNumber,
            side,
            san,
            rawSan: token.text,
            comments: []
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

function coachSide(headers, playerName) {
    const target = playerName.toLowerCase();
    const white = (headers.White ?? "").toLowerCase();
    const black = (headers.Black ?? "").toLowerCase();

    if (white === target || white.includes(target)) return "w";
    if (black === target || black.includes(target)) return "b";
    return null;
}

function parseCoachComment(comments) {
    for (const comment of comments) {
        const match =
            comment.match(/([+-]?M\d+|[+-]?\d+(?:\.\d+)?)\/(\d+)\s+(\d+(?:\.\d+)?)(ms|s)?/i);

        if (!match) {
            continue;
        }

        const timeUnit = (match[4] || "s").toLowerCase();
        const rawTime = Number.parseFloat(match[3]);
        const timeSeconds =
            timeUnit === "ms"
                ? rawTime / 1000
                : rawTime;

        return {
            score: match[1],
            depth: Number.parseInt(match[2], 10),
            timeSeconds,
            raw: comment
        };
    }

    return null;
}

function average(values) {
    if (values.length === 0) {
        return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, fraction) {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1)
    );
    return sorted[index];
}

function round(value, digits = 2) {
    if (value === null || value === undefined) {
        return null;
    }
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function sideName(side) {
    return side === "w" ? "White" : "Black";
}

function phaseForMoveNumber(moveNumber) {
    if (moveNumber <= 10) return "opening-1-10";
    if (moveNumber <= 15) return "early-core-11-15";
    if (moveNumber <= 25) return "middlegame-16-25";
    if (moveNumber <= 40) return "late-middlegame-26-40";
    if (moveNumber <= 60) return "endgame-41-60";
    return "late-endgame-61+";
}

function moveLabel(move) {
    return `${move.moveNumber}${move.side === "b" ? "..." : "."} ${move.san}`;
}

function summarizeGame(gameText, gameNumber, playerName) {
    const headers = parseHeaders(gameText);
    const coach = coachSide(headers, playerName);
    const mainline = buildMainline(tokenizeMovetext(stripHeaders(gameText)));
    const moves = [];
    const replayErrors = [];
    const startingClockSeconds =
        parseStartingClockSeconds(headers);
    let cumulativeTimeSeconds = 0;
    const engine =
        createEngineCore(replayStartingFen(headers));

    if (coach === null) {
        return {
            game: gameNumber,
            headers,
            coachSide: null,
            moves,
            replayErrors,
            skipped: true
        };
    }

    for (const [plyIndex, entry] of mainline.entries()) {
        const legalMoves =
            engine.legalMoveGenerator.generateMoves();
        const resolvedMove =
            resolveSanMove(engine, entry.rawSan, legalMoves);

        if (!resolvedMove) {
            replayErrors.push({
                ply: plyIndex + 1,
                san: entry.rawSan,
                fen: engine.board.repetitionKey()
            });
            break;
        }

        if (entry.side === coach) {
            const parsed = parseCoachComment(entry.comments);

            if (parsed) {
                const captureCount =
                    legalMoves.filter(move => move.isCapture()).length;
                const totalMaterial =
                    engine.board.whiteMaterial +
                    engine.board.blackMaterial;
                const inCheck =
                    engine.board.isInCheck();
                const estimatedClockBeforeSeconds =
                    startingClockSeconds === null
                        ? null
                        : round(Math.max(0, startingClockSeconds - cumulativeTimeSeconds));
                const allocatedMoveTimeMs =
                    startingClockSeconds === null
                        ? null
                        : allocateMoveTime({
                            sideToMove: engine.board.sideToMove,
                            wtime: Math.max(0, estimatedClockBeforeSeconds * 1000),
                            btime: Math.max(0, estimatedClockBeforeSeconds * 1000),
                            winc: 0,
                            binc: 0,
                            fullMoveNumber: entry.moveNumber,
                            totalMaterial,
                            inCheck,
                            legalMoveCount: legalMoves.length,
                            captureCount
                        });

                cumulativeTimeSeconds += parsed.timeSeconds;

                moves.push({
                    game: gameNumber,
                    ply: plyIndex + 1,
                    moveNumber: entry.moveNumber,
                    phase: phaseForMoveNumber(entry.moveNumber),
                    side: entry.side,
                    san: entry.rawSan,
                    uci: moveToUci(resolvedMove),
                    fenBefore: FEN.export(engine.board),
                    depth: parsed.depth,
                    timeSeconds: parsed.timeSeconds,
                    cumulativeTimeSeconds: round(cumulativeTimeSeconds),
                    estimatedClockBeforeSeconds,
                    estimatedClockRemainingSeconds:
                        startingClockSeconds === null
                            ? null
                            : round(Math.max(0, startingClockSeconds - cumulativeTimeSeconds)),
                    score: parsed.score,
                    comment: parsed.raw,
                    legalMoveCount: legalMoves.length,
                    captureCount,
                    inCheck,
                    totalMaterial,
                    allocatedMoveTimeMs,
                    allocatedMoveTimeSeconds:
                        allocatedMoveTimeMs === null
                            ? null
                            : round(allocatedMoveTimeMs / 1000)
                });
            }
        }

        engine.board.makeMove(resolvedMove);
    }

    const depths = moves.map(move => move.depth);
    const times = moves.map(move => move.timeSeconds);

    return {
        game: gameNumber,
        headers,
        coachSide: coach,
        startingClockSeconds,
        replayErrors,
        skipped: false,
        moveCount: moves.length,
        averageDepth: round(average(depths)),
        minimumDepth: depths.length ? Math.min(...depths) : null,
        maximumDepth: depths.length ? Math.max(...depths) : null,
        averageTimeSeconds: round(average(times)),
        medianTimeSeconds: round(percentile(times, 0.5)),
        p90TimeSeconds: round(percentile(times, 0.9)),
        maximumTimeSeconds: round(times.length ? Math.max(...times) : null),
        estimatedClockRemainingSeconds:
            moves.length
                ? moves[moves.length - 1].estimatedClockRemainingSeconds
                : startingClockSeconds,
        shallowMoves: moves
            .filter(move => move.depth <= 4)
            .slice(-10),
        slowMoves: [...moves]
            .sort((a, b) => b.timeSeconds - a.timeSeconds)
            .slice(0, 10),
        lateMoves: moves.slice(-12),
        moves
    };
}

function formatMoveList(moves) {
    if (!moves || moves.length === 0) {
        return ["None."];
    }

    return moves.map(move =>
        `- Game ${move.game} ply ${move.ply}: ${moveLabel(move)} depth ${move.depth}, ${round(move.timeSeconds)}s, score ${move.score}`
    );
}

function formatContextMoveList(moves) {
    if (!moves || moves.length === 0) {
        return ["None."];
    }

    return moves.map(move =>
        `- Game ${move.game} ply ${move.ply}: ${moveLabel(move)} phase ${move.phase}, ` +
        `depth ${move.depth}, actual ${round(move.timeSeconds)}s, ` +
        `allocated ${move.allocatedMoveTimeSeconds ?? "n/a"}s, ` +
        `legal ${move.legalMoveCount ?? "n/a"}, captures ${move.captureCount ?? "n/a"}, ` +
        `material ${move.totalMaterial ?? "n/a"}, score ${move.score}`
    );
}

function formatClockMoveList(moves) {
    if (!moves || moves.length === 0) {
        return ["None."];
    }

    return moves.map(move =>
        `- Game ${move.game} ply ${move.ply}: ${moveLabel(move)} depth ${move.depth}, ` +
        `${round(move.timeSeconds)}s, est clock ${move.estimatedClockRemainingSeconds ?? "n/a"}s, score ${move.score}`
    );
}

function summarizePhases(moves) {
    const orderedPhases = [
        "opening-1-10",
        "early-core-11-15",
        "middlegame-16-25",
        "late-middlegame-26-40",
        "endgame-41-60",
        "late-endgame-61+"
    ];

    return orderedPhases
        .map(phase => {
            const phaseMoves =
                moves.filter(move => move.phase === phase);
            const depths =
                phaseMoves.map(move => move.depth);
            const times =
                phaseMoves.map(move => move.timeSeconds);
            const clockValues =
                phaseMoves
                    .map(move => move.estimatedClockRemainingSeconds)
                    .filter(value => value !== null);
            const allocatedTimes =
                phaseMoves
                    .map(move => move.allocatedMoveTimeSeconds)
                    .filter(value => value !== null);
            const legalMoveCounts =
                phaseMoves
                    .map(move => move.legalMoveCount)
                    .filter(value => value !== undefined);
            const captureCounts =
                phaseMoves
                    .map(move => move.captureCount)
                    .filter(value => value !== undefined);

            return {
                phase,
                moveCount: phaseMoves.length,
                totalTimeSeconds: round(times.reduce((sum, value) => sum + value, 0)),
                averageTimeSeconds: round(average(times)),
                averageAllocatedMoveTimeSeconds: round(average(allocatedTimes)),
                p90TimeSeconds: round(percentile(times, 0.9)),
                averageDepth: round(average(depths)),
                minimumDepth: depths.length ? Math.min(...depths) : null,
                averageLegalMoveCount: round(average(legalMoveCounts)),
                averageCaptureCount: round(average(captureCounts)),
                shallowMoveCount:
                    phaseMoves.filter(move => move.depth <= 5).length,
                slowMoveCount:
                    phaseMoves.filter(move => move.timeSeconds >= 10).length,
                lowClockMoveCount:
                    phaseMoves.filter(move =>
                        move.estimatedClockRemainingSeconds !== null &&
                        move.estimatedClockRemainingSeconds <= 30
                    ).length,
                minimumEstimatedClockRemainingSeconds:
                    clockValues.length ? Math.min(...clockValues) : null
            };
        });
}

function formatPhaseTable(phaseSummaries) {
    const lines = [
        "| Phase | Moves | Total Time | Avg Time | Avg Alloc | P90 Time | Avg Depth | Avg Legal | Avg Captures | Shallow <=5 | Slow >=10s | Low Clock <=30s | Min Est Clock |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];

    for (const phase of phaseSummaries) {
        lines.push(
            `| ${phase.phase} | ${phase.moveCount} | ${phase.totalTimeSeconds ?? "n/a"}s | ` +
            `${phase.averageTimeSeconds ?? "n/a"}s | ${phase.averageAllocatedMoveTimeSeconds ?? "n/a"}s | ` +
            `${phase.p90TimeSeconds ?? "n/a"}s | ${phase.averageDepth ?? "n/a"} | ` +
            `${phase.averageLegalMoveCount ?? "n/a"} | ${phase.averageCaptureCount ?? "n/a"} | ` +
            `${phase.shallowMoveCount} | ${phase.slowMoveCount} | ${phase.lowClockMoveCount} | ` +
            `${phase.minimumEstimatedClockRemainingSeconds ?? "n/a"}s |`
        );
    }

    return lines;
}

function markdown(summary) {
    const lines = [
        "# Coach Time/Depth Summary",
        "",
        `Source: \`${summary.sourcePgn}\``,
        `Player: ${summary.player}`,
        `Games: ${summary.games}`,
        `Games mined: ${summary.gamesMined}`,
        `Coach moves with comments: ${summary.moveCount}`,
        `Average depth: ${summary.averageDepth ?? "n/a"}`,
        `Minimum depth: ${summary.minimumDepth ?? "n/a"}`,
        `Average move time: ${summary.averageTimeSeconds ?? "n/a"}s`,
        `90th percentile move time: ${summary.p90TimeSeconds ?? "n/a"}s`,
        `Lowest estimated Coach clock: ${summary.minimumEstimatedClockRemainingSeconds ?? "n/a"}s`,
        ""
    ];

    lines.push("## Phase Buckets", "");
    lines.push(...formatPhaseTable(summary.phaseSummaries));

    lines.push("## By Game", "");
    for (const game of summary.gameSummaries) {
        if (game.skipped) {
            lines.push(`- Game ${game.game}: skipped; ${summary.player} was not White or Black.`);
            continue;
        }

        lines.push(
            `- Game ${game.game} (${sideName(game.coachSide)}, result ${game.headers.Result ?? "?"}): ` +
            `${game.moveCount} moves, avg depth ${game.averageDepth ?? "n/a"}, ` +
            `min depth ${game.minimumDepth ?? "n/a"}, avg time ${game.averageTimeSeconds ?? "n/a"}s, ` +
            `est clock left ${game.estimatedClockRemainingSeconds ?? "n/a"}s`
        );
    }

    lines.push("", "## Shallow Coach Moves", "");
    lines.push(...formatMoveList(summary.shallowMoves));

    lines.push("", "## Slowest Coach Moves", "");
    lines.push(...formatMoveList(summary.slowMoves));

    lines.push("", "## Slowest Coach Moves With Context", "");
    lines.push(...formatContextMoveList(summary.slowMovesWithContext));

    lines.push("", "## Late Low-Depth Moves", "");
    lines.push(...formatMoveList(summary.lateLowDepthMoves));

    lines.push("", "## Low Estimated Clock Moves", "");
    lines.push(...formatClockMoveList(summary.lowEstimatedClockMoves));

    lines.push("", "## Low Clock And Low Depth", "");
    lines.push(...formatClockMoveList(summary.lowClockLowDepthMoves));

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

    const sourcePgn = path.resolve(args.pgn);
    const outDir = path.resolve(args.out);
    const games = splitPgnGames(fs.readFileSync(sourcePgn, "utf8"));
    const gameSummaries =
        games.map((game, index) =>
            summarizeGame(game, index + 1, args.player)
        );
    const minedGames = gameSummaries.filter(game => !game.skipped);
    const moves = minedGames.flatMap(game => game.moves);
    const depths = moves.map(move => move.depth);
    const times = moves.map(move => move.timeSeconds);
    const clockValues =
        moves
            .map(move => move.estimatedClockRemainingSeconds)
            .filter(value => value !== null);
    const shallowMoves =
        moves.filter(move => move.depth <= 4);

    const summary = {
        sourcePgn,
        player: args.player,
        games: games.length,
        gamesMined: minedGames.length,
        moveCount: moves.length,
        averageDepth: round(average(depths)),
        minimumDepth: depths.length ? Math.min(...depths) : null,
        maximumDepth: depths.length ? Math.max(...depths) : null,
        averageTimeSeconds: round(average(times)),
        medianTimeSeconds: round(percentile(times, 0.5)),
        p90TimeSeconds: round(percentile(times, 0.9)),
        maximumTimeSeconds: round(times.length ? Math.max(...times) : null),
        minimumEstimatedClockRemainingSeconds:
            clockValues.length ? Math.min(...clockValues) : null,
        gameSummaries:
            gameSummaries.map(game => {
                const { moves: _moves, ...rest } = game;
                return rest;
            }),
        phaseSummaries:
            summarizePhases(moves),
        moves,
        shallowMoves:
            shallowMoves.slice(-30),
        slowMoves:
            [...moves]
                .sort((a, b) => b.timeSeconds - a.timeSeconds)
                .slice(0, 30),
        slowMovesWithContext:
            [...moves]
                .filter(move => move.legalMoveCount !== undefined)
                .sort((a, b) => b.timeSeconds - a.timeSeconds)
                .slice(0, 30),
        lateLowDepthMoves:
            minedGames
                .flatMap(game => game.moves.slice(-16))
                .filter(move => move.depth <= 5)
                .slice(-30),
        lowEstimatedClockMoves:
            [...moves]
                .filter(move =>
                    move.estimatedClockRemainingSeconds !== null
                )
                .sort((a, b) =>
                    a.estimatedClockRemainingSeconds - b.estimatedClockRemainingSeconds
                )
                .slice(0, 30),
        lowClockLowDepthMoves:
            moves
                .filter(move =>
                    move.estimatedClockRemainingSeconds !== null &&
                    move.estimatedClockRemainingSeconds <= 30 &&
                    move.depth <= 5
                )
                .slice(-30)
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, "coach-time-depth-summary.json"),
        JSON.stringify(summary, null, 2) + "\n"
    );
    fs.writeFileSync(
        path.join(outDir, "coach-time-depth-summary.md"),
        markdown(summary)
    );

    console.log(`Wrote ${path.join(outDir, "coach-time-depth-summary.md")}`);
}

main();
