#!/usr/bin/env node

//----------------------------------
// Coach Analysis Lab v1.3
//
// Diagnostic tool only. Runs Coach (and optionally a
// stronger reference UCI engine such as Stockfish) over a
// set of FEN positions and reports where they disagree
// most, so overnight runs produce concrete engineering
// targets in the morning.
//
// v1.1 adds PGN ingestion: feed a played game (typically a
// Stockfish-annotated Arena PGN) with --pgn-file and the
// tool replays it, extracts positions before the selected
// Coach side's moves, and writes a ranked candidate
// regression FEN list alongside the existing report.
//
// v1.2 adds multi-game PGN support: --pgn-file now accepts a
// file containing many games back-to-back (e.g. an Arena
// tournament export). Each game is parsed and replayed
// independently, candidate labels are prefixed with the game
// number (game1-before-13...Re8), --coach-side auto infers
// per game, and --max-positions caps the total across the
// whole file. candidate-regressions.md groups candidates by
// game and adds an overall top-candidates section.
//
// v1.3 adds --target-player "<name>": only analyze games
// where the named player is White or Black, using only that
// player's own moves, overriding --coach-side entirely. Name
// matching prefers an exact (case-insensitive) match against
// the distinct player names seen in the file, falling back to
// a substring match only when it is unambiguous.
//
// This tool does NOT change engine behavior. It talks to
// engines strictly through their UCI stdin/stdout, exactly
// like a GUI would.
//
// Usage:
//
//   node tools/coach-analysis-lab.mjs --fen-file docs/coach-analysis-sample-fens.txt --coach "node uci.js" --movetime 10000
//   node tools/coach-analysis-lab.mjs --fen-file docs/regression-fens.txt --coach "node uci.js" --stockfish "C:\Path\To\stockfish.exe" --movetime 10000
//   node tools/coach-analysis-lab.mjs --fen "8/R5N1/2p2pkp/4p3/P7/1p3P1P/2r3PK/8 b - - 0 45" --coach "node uci.js" --movetime 10000
//   node tools/coach-analysis-lab.mjs --pgn-file docs/coach-analysis-sample-loss2.pgn --coach "node uci.js" --coach-side black --extract annotated --movetime 1000
//   node tools/coach-analysis-lab.mjs --pgn-file docs/coach-analysis-sample-multigame.pgn --coach "node uci.js" --coach-side auto --extract annotated --movetime 1000
//   node tools/coach-analysis-lab.mjs --pgn-file docs/coach-analysis-sample-multigame.pgn --coach "node uci.js" --target-player "Coach-uci [001]" --extract annotated --movetime 1000
//
// FEN file format: one position per line.
//   - Blank lines and lines starting with # are ignored.
//   - Optional label:   label | fen
//
// Output: analysis-runs/YYYYMMDD-HHMMSS/results.json and
// report.md (directory configurable via --out). PGN runs
// additionally write candidate-regressions.fens and
// candidate-regressions.md in the same directory.
//
// Coach-only mode (no --stockfish) still produces a useful
// per-position report; comparison fields are simply absent.
//----------------------------------

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

import { createEngineCore, moveToUci } from "../js/uci/uciengine.js";
import PGN from "../js/game/pgn.js";
import FEN from "../js/core/fen.js";

//----------------------------------
// Coach reports forced mates as plain "score cp" values
// near SearchConstants.MATE (100000). Anything at or above
// this floor is treated as a mate-class score for
// comparison purposes. Stockfish-style "score mate N" is
// normalized into the same range so both are comparable.
//----------------------------------

const MATE_CP_FLOOR = 90000;
const MATE_CP_BASE = 100000;

const DEFAULT_MOVETIME_MS = 5000;
const HANDSHAKE_TIMEOUT_MS = 15000;
const QUIT_TIMEOUT_MS = 3000;

//----------------------------------
// Eval-difference thresholds (centipawns) used for
// follow-up priority. Deliberately coarse in v1.
//----------------------------------

const EVAL_DIFF_ALIGNED_CP = 25;
const EVAL_DIFF_MEDIUM_CP = 60;
const EVAL_DIFF_HIGH_CP = 100;
const EVAL_DIFF_TACTIC_CP = 150;

const TOP_DISAGREEMENT_COUNT = 10;

//----------------------------------
// PGN mode defaults and option vocab
//----------------------------------

const DEFAULT_COACH_SIDE = "auto";
const DEFAULT_EXTRACT_MODE = "annotated";
const VALID_COACH_SIDES = ["white", "black", "both", "auto"];
const VALID_EXTRACT_MODES = ["all", "annotated", "blunders"];

//----------------------------------
// CLI parsing
//----------------------------------

function usage() {

    return [
        "Coach Analysis Lab v1.3",
        "",
        "Required (one of):",
        "  --fen-file <path>     File with one FEN per line ('label | fen' and # comments allowed)",
        "  --fen \"<fen>\"         Analyze a single FEN",
        "  --pgn-file <path>     Replay a PGN file (one or many games back-to-back) and extract candidate positions",
        "",
        "Engines:",
        "  --coach \"<command>\"     Coach UCI command (default: node uci.js)",
        "  --stockfish \"<command>\" Reference UCI engine command or executable path (optional)",
        "  --ref \"<command>\"       Alias for --stockfish",
        "",
        "Search control (one of):",
        "  --movetime <ms>       go movetime per position (default 5000)",
        "  --depth <n>           go depth per position instead of movetime",
        "",
        "PGN mode:",
        "  --coach-side white|black|both|auto  Which side's moves to extract; \"auto\" infers per game (default: auto)",
        "  --target-player \"<name>\"            Only analyze games/moves for this player; overrides --coach-side",
        "  --extract all|annotated|blunders    Extraction strictness (default: annotated)",
        "  --max-per-game <n>                  Cap extracted positions per game before the file-wide cap",
        "  --min-move <n>                      In PGN mode, ignore candidate moves before this fullmove",
        "  --max-move <n>                      In PGN mode, ignore candidate moves after this fullmove",
        "  --sample-every <n>                  In PGN mode, keep every nth candidate after filters",
        "  --max-positions <n>                 Cap total extracted positions across the whole file",
        "",
        "Other:",
        "  --label \"<text>\"      Label for --fen mode",
        "  --limit <n>           Only analyze the first n positions",
        "  --out <dir>           Output base directory (default: analysis-runs)",
        "  --timeout <ms>        Per-position hard timeout (default: 3x movetime + 15000)",
        "  --verbose             Echo raw UCI traffic",
        "  --help                Show this help"
    ].join("\n");

}

function parseCliArguments(argv) {

    const options = {
        fenFile: null,
        fen: null,
        pgnFile: null,
        label: null,
        coachCommand: "node uci.js",
        referenceCommand: null,
        movetimeMs: null,
        depth: null,
        limit: null,
        outDir: "analysis-runs",
        timeoutMs: null,
        verbose: false,
        help: false,
        coachSide: DEFAULT_COACH_SIDE,
        extractMode: DEFAULT_EXTRACT_MODE,
        maxPositions: null,
        maxPositionsPerGame: null,
        pgnMinMove: null,
        pgnMaxMove: null,
        pgnSampleEvery: null,
        targetPlayer: null
    };

    for (let i = 0; i < argv.length; i++) {

        const flag = argv[i];

        const next = () => {

            i++;

            if (i >= argv.length) {
                throw new Error(`Missing value for ${flag}`);
            }

            return argv[i];

        };

        switch (flag) {

            case "--fen-file":
                options.fenFile = next();
                break;

            case "--fen":
                options.fen = next();
                break;

            case "--pgn-file":
                options.pgnFile = next();
                break;

            case "--coach-side":
                options.coachSide = next();
                break;

            case "--target-player":
                options.targetPlayer = next();
                break;

            case "--extract":
                options.extractMode = next();
                break;

            case "--max-positions":
                options.maxPositions = Number.parseInt(next(), 10);
                break;

            case "--max-per-game":
                options.maxPositionsPerGame = Number.parseInt(next(), 10);
                break;

            case "--min-move":
                options.pgnMinMove = Number.parseInt(next(), 10);
                break;

            case "--max-move":
                options.pgnMaxMove = Number.parseInt(next(), 10);
                break;

            case "--sample-every":
                options.pgnSampleEvery = Number.parseInt(next(), 10);
                break;

            case "--label":
                options.label = next();
                break;

            case "--coach":
                options.coachCommand = next();
                break;

            case "--stockfish":
            case "--ref":
                options.referenceCommand = next();
                break;

            case "--movetime":
                options.movetimeMs = Number.parseInt(next(), 10);
                break;

            case "--depth":
                options.depth = Number.parseInt(next(), 10);
                break;

            case "--limit":
                options.limit = Number.parseInt(next(), 10);
                break;

            case "--out":
                options.outDir = next();
                break;

            case "--timeout":
                options.timeoutMs = Number.parseInt(next(), 10);
                break;

            case "--verbose":
                options.verbose = true;
                break;

            case "--help":
            case "-h":
                options.help = true;
                break;

            default:
                throw new Error(`Unknown option: ${flag}`);

        }

    }

    return options;

}

function validateOptions(options) {

    if (!options.fenFile && !options.fen && !options.pgnFile) {
        throw new Error("Provide --fen-file <path>, --fen \"<fen>\", or --pgn-file <path> (see --help)");
    }

    const inputSourceCount =
        [options.fenFile, options.fen, options.pgnFile]
            .filter(value => value !== null).length;

    if (inputSourceCount > 1) {
        throw new Error("Use only one of --fen-file, --fen, or --pgn-file");
    }

    if (!VALID_COACH_SIDES.includes(options.coachSide)) {

        throw new Error(
            `--coach-side must be one of: ${VALID_COACH_SIDES.join(", ")}`
        );

    }

    if (!VALID_EXTRACT_MODES.includes(options.extractMode)) {

        throw new Error(
            `--extract must be one of: ${VALID_EXTRACT_MODES.join(", ")}`
        );

    }

    if (options.targetPlayer !== null) {

        if (!options.targetPlayer.trim()) {
            throw new Error("--target-player must not be empty");
        }

        if (!options.pgnFile) {
            throw new Error("--target-player requires --pgn-file");
        }

    }

    if (
        options.maxPositions !== null &&
        (!Number.isInteger(options.maxPositions) || options.maxPositions <= 0)
    ) {
        throw new Error("--max-positions must be a positive integer");
    }

    if (
        options.maxPositionsPerGame !== null &&
        (!Number.isInteger(options.maxPositionsPerGame) || options.maxPositionsPerGame <= 0)
    ) {
        throw new Error("--max-per-game must be a positive integer");
    }

    if (
        options.pgnMinMove !== null &&
        (!Number.isInteger(options.pgnMinMove) || options.pgnMinMove <= 0)
    ) {
        throw new Error("--min-move must be a positive integer");
    }

    if (
        options.pgnMaxMove !== null &&
        (!Number.isInteger(options.pgnMaxMove) || options.pgnMaxMove <= 0)
    ) {
        throw new Error("--max-move must be a positive integer");
    }

    if (
        options.pgnMinMove !== null &&
        options.pgnMaxMove !== null &&
        options.pgnMinMove > options.pgnMaxMove
    ) {
        throw new Error("--min-move must be less than or equal to --max-move");
    }

    if (
        options.pgnSampleEvery !== null &&
        (!Number.isInteger(options.pgnSampleEvery) || options.pgnSampleEvery <= 0)
    ) {
        throw new Error("--sample-every must be a positive integer");
    }

    if (options.movetimeMs !== null && options.depth !== null) {
        throw new Error("Use either --movetime or --depth, not both");
    }

    if (options.movetimeMs === null && options.depth === null) {
        options.movetimeMs = DEFAULT_MOVETIME_MS;
    }

    if (
        options.movetimeMs !== null &&
        (!Number.isInteger(options.movetimeMs) || options.movetimeMs <= 0)
    ) {
        throw new Error("--movetime must be a positive integer (milliseconds)");
    }

    if (
        options.depth !== null &&
        (!Number.isInteger(options.depth) || options.depth <= 0)
    ) {
        throw new Error("--depth must be a positive integer");
    }

    if (options.timeoutMs === null) {

        options.timeoutMs =
            options.movetimeMs !== null
                ? options.movetimeMs * 3 + 15000
                : 180000;

    }

    return options;

}

//----------------------------------
// Command tokenizing
//
// Engine commands may be either a bare executable path
// (possibly containing spaces, common on Windows, e.g.
// C:\Program Files\Stockfish\stockfish.exe) or a command
// line like "node uci.js". If the whole string is an
// existing file, treat it as a single executable; otherwise
// split on whitespace, honoring single and double quotes.
//----------------------------------

function tokenizeCommand(commandString) {

    const trimmed = commandString.trim();

    if (!trimmed) {
        throw new Error("Empty engine command");
    }

    if (fs.existsSync(trimmed)) {
        return [trimmed];
    }

    const tokens = [];
    let current = "";
    let quote = null;

    for (const char of trimmed) {

        if (quote) {

            if (char === quote) {
                quote = null;
            }
            else {
                current += char;
            }

        }
        else if (char === "\"" || char === "'") {
            quote = char;
        }
        else if (/\s/.test(char)) {

            if (current) {
                tokens.push(current);
                current = "";
            }

        }
        else {
            current += char;
        }

    }

    if (quote) {
        throw new Error(`Unbalanced quote in engine command: ${commandString}`);
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;

}

//----------------------------------
// UCI info-line parsing
//
// Handles both Coach's single final info line
// (info depth D score cp X nodes N pv ...) and
// Stockfish's per-iteration lines including
// "score mate N", nps, time, and bound markers.
//----------------------------------

function parseInfoLine(line) {

    const tokens = line.trim().split(/\s+/);

    if (tokens[0] !== "info") {
        return null;
    }

    const info = {
        depth: null,
        scoreCp: null,
        scoreMate: null,
        bound: null,
        nodes: null,
        timeMs: null,
        nps: null,
        pv: null
    };

    for (let i = 1; i < tokens.length; i++) {

        const token = tokens[i];

        switch (token) {

            case "depth":
                info.depth = Number.parseInt(tokens[++i], 10);
                break;

            case "nodes":
                info.nodes = Number.parseInt(tokens[++i], 10);
                break;

            case "time":
                info.timeMs = Number.parseInt(tokens[++i], 10);
                break;

            case "nps":
                info.nps = Number.parseInt(tokens[++i], 10);
                break;

            case "score": {

                const kind = tokens[++i];
                const value = Number.parseInt(tokens[++i], 10);

                if (kind === "cp") {
                    info.scoreCp = value;
                }
                else if (kind === "mate") {
                    info.scoreMate = value;
                }

                if (
                    tokens[i + 1] === "lowerbound" ||
                    tokens[i + 1] === "upperbound"
                ) {
                    info.bound = tokens[++i];
                }

                break;

            }

            case "pv":
                info.pv = tokens.slice(i + 1);
                i = tokens.length;
                break;

            default:
                break;

        }

    }

    const hasContent =
        info.depth !== null ||
        info.scoreCp !== null ||
        info.scoreMate !== null ||
        info.pv !== null;

    return hasContent ? info : null;

}

//----------------------------------
// Pick the most informative info line from a search:
// prefer the last exact-score line that carries a PV,
// then the last line with any score, then the last line.
//----------------------------------

function pickFinalInfo(infos) {

    const hasScore = info =>
        info.scoreCp !== null || info.scoreMate !== null;

    const exactWithPv = infos.filter(
        info => hasScore(info) && info.pv && info.bound === null
    );

    if (exactWithPv.length > 0) {
        return exactWithPv[exactWithPv.length - 1];
    }

    const scored = infos.filter(hasScore);

    if (scored.length > 0) {
        return scored[scored.length - 1];
    }

    return infos.length > 0 ? infos[infos.length - 1] : null;

}

//----------------------------------
// Score normalization
//
// Both Coach and the reference engine report scores that are
// side-to-move-relative -- the standard UCI convention: a
// positive "score cp"/"score mate" always means "good for
// whoever's turn it is right now" in the position that was
// analyzed. Since both engines are always given the exact same
// FEN (see the analyzeWithRestart() calls below), their raw
// scores share that one frame. normalizeScore() below only
// maps "score mate N" into the same numeric range Coach uses
// internally for mates (+/- ~100000) so both kinds of score
// can be handled uniformly; it does NOT change whose
// perspective the number is relative to.
//
// Side-to-move-relative numbers are easy to misread once two
// engines' outputs sit side by side -- e.g. a genuinely
// consistent pair of scores can look like an "impossible"
// contradiction to a human reader if they forget which side is
// on move. To make comparison, ranking, and the report itself
// unambiguous, every score is converted to a second, FIXED
// frame -- White-relative centipawns -- before any diffing,
// mate-agreement check, or severity/priority math happens (see
// toWhiteRelativeCp()/compareResults() below). White-relative
// is simple to sanity-check: positive always means White is
// doing better, full stop, regardless of who is to move. Raw,
// as-reported side-to-move-relative scores are still preserved
// and shown in every report via formatScore() / formatScoreWithContext()
// -- normalization only affects what's used for comparison and
// what's added alongside the raw score for clarity, never what
// was actually reported.
//----------------------------------

function normalizeScore(info) {

    if (!info) {
        return null;
    }

    if (info.scoreMate !== null) {

        const sign = info.scoreMate >= 0 ? 1 : -1;

        return {
            cp: sign * (MATE_CP_BASE - Math.abs(info.scoreMate)),
            isMate: true,
            mateIn: info.scoreMate
        };

    }

    if (info.scoreCp !== null) {

        return {
            cp: info.scoreCp,
            isMate: Math.abs(info.scoreCp) >= MATE_CP_FLOOR,
            mateIn: null
        };

    }

    return null;

}

//----------------------------------
// Side-to-move-relative -> White-relative.
//
// sideToMoveChar is the FEN's own "w"/"b" field for the
// position being analyzed -- both engines were handed that
// exact FEN, so this one flip is valid for both of their
// scores. White-relative: positive = good for White, negative
// = good for Black, independent of who was actually on move.
//----------------------------------

function toWhiteRelativeCp(sideRelativeCp, sideToMoveChar) {

    return sideToMoveChar === "b" ? -sideRelativeCp : sideRelativeCp;

}

//----------------------------------
// Which absolute side a White-relative cp value favors.
// "none" only for an exact 0 (a true dead-equal score); this
// is deliberately exact equality, not a tolerance band, since
// it is only used to decide mate-side agreement, not to grade
// closeness.
//----------------------------------

function favoredSide(whiteRelativeCp) {

    if (whiteRelativeCp > 0) {
        return "white";
    }

    if (whiteRelativeCp < 0) {
        return "black";
    }

    return "none";

}

//----------------------------------
// Human-readable, side-independent description of a score,
// e.g. "Black mates in 4" or "White +3.10". Used alongside the
// raw formatScore() output in reports so a reader never has to
// do the side-to-move sign flip themselves to see who a score
// actually favors.
//----------------------------------

function describeFavoredSide(score, sideToMoveChar) {

    if (!score) {
        return "n/a";
    }

    const whiteCp = toWhiteRelativeCp(score.cp, sideToMoveChar);

    if (score.isMate) {

        const mateMoves = Math.abs(
            score.mateIn !== null
                ? score.mateIn
                : MATE_CP_BASE - Math.abs(score.cp)
        );

        return whiteCp >= 0
            ? `White mates in ${mateMoves}`
            : `Black mates in ${mateMoves}`;

    }

    if (whiteCp === 0) {
        return "equal";
    }

    const pawns = Math.abs(whiteCp / 100).toFixed(2);

    return whiteCp > 0
        ? `White +${pawns}`
        : `Black +${pawns}`;

}

//----------------------------------
// UciEngineClient
//
// Minimal UCI client: spawn, handshake, analyze one
// position, quit. Every wait has a timeout so a wedged or
// crashed engine can never hang the run, and child
// processes are always cleaned up.
//----------------------------------

class UciEngineClient {

    constructor(commandString, displayName, verbose) {

        this.commandString = commandString;
        this.displayName = displayName;
        this.verbose = verbose;

        this.child = null;
        this.idName = null;
        this.exited = false;
        this.pendingWaits = [];
        this.lineListeners = [];
        this.stderrTail = [];

    }

    log(direction, text) {

        if (this.verbose) {
            console.error(`[${this.displayName}] ${direction} ${text}`);
        }

    }

    async start() {

        const tokens = tokenizeCommand(this.commandString);

        this.child = spawn(tokens[0], tokens.slice(1), {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
        });

        this.child.on("error", error => {
            this.failAllWaits(
                new Error(
                    `${this.displayName} failed to start (${this.commandString}): ${error.message}`
                )
            );
        });

        this.child.on("exit", (code, signal) => {

            this.exited = true;

            this.failAllWaits(
                new Error(
                    `${this.displayName} exited unexpectedly ` +
                    `(code ${code}, signal ${signal})` +
                    this.stderrSuffix()
                )
            );

        });

        this.child.stderr.on("data", chunk => {

            const text = chunk.toString();

            this.stderrTail.push(text);

            if (this.stderrTail.length > 20) {
                this.stderrTail.shift();
            }

            this.log("!!", text.trim());

        });

        let buffered = "";

        this.child.stdout.on("data", chunk => {

            buffered += chunk.toString();

            let newlineIndex;

            while ((newlineIndex = buffered.indexOf("\n")) !== -1) {

                const line =
                    buffered.slice(0, newlineIndex).replace(/\r$/, "");

                buffered = buffered.slice(newlineIndex + 1);

                if (line.trim()) {
                    this.handleLine(line);
                }

            }

        });

        try {

            this.send("uci");

            await this.waitForLine(
                line => line.trim() === "uciok",
                HANDSHAKE_TIMEOUT_MS,
                "uciok handshake"
            );

            this.send("isready");

            await this.waitForLine(
                line => line.trim() === "readyok",
                HANDSHAKE_TIMEOUT_MS,
                "readyok handshake"
            );

        }

        catch (error) {

            await this.dispose();
            throw error;

        }

    }

    stderrSuffix() {

        const tail = this.stderrTail.join("").trim();

        return tail
            ? `\n  stderr: ${tail.split("\n").slice(-3).join(" | ")}`
            : "";

    }

    handleLine(line) {

        this.log("<-", line);

        if (line.startsWith("id name ") && !this.idName) {
            this.idName = line.slice("id name ".length).trim();
        }

        for (const listener of this.lineListeners) {
            listener(line);
        }

        for (let i = this.pendingWaits.length - 1; i >= 0; i--) {

            const wait = this.pendingWaits[i];

            if (wait.predicate(line)) {

                this.pendingWaits.splice(i, 1);
                clearTimeout(wait.timer);
                wait.resolve(line);

            }

        }

    }

    send(command) {

        if (this.exited || !this.child || !this.child.stdin.writable) {
            throw new Error(
                `${this.displayName} is not running; cannot send "${command}"`
            );
        }

        this.log("->", command);
        this.child.stdin.write(command + "\n");

    }

    waitForLine(predicate, timeoutMs, description) {

        return new Promise((resolve, reject) => {

            const wait = { predicate, resolve, reject, timer: null };

            wait.timer = setTimeout(() => {

                const index = this.pendingWaits.indexOf(wait);

                if (index !== -1) {
                    this.pendingWaits.splice(index, 1);
                }

                reject(
                    new Error(
                        `${this.displayName} timed out after ${timeoutMs}ms waiting for ${description}` +
                        this.stderrSuffix()
                    )
                );

            }, timeoutMs);

            this.pendingWaits.push(wait);

        });

    }

    failAllWaits(error) {

        const waits = this.pendingWaits.splice(0);

        for (const wait of waits) {
            clearTimeout(wait.timer);
            wait.reject(error);
        }

    }

    //----------------------------------
    // Analyze a single FEN. Sends ucinewgame + position +
    // isready (a sync point that surfaces FEN-import
    // failures before searching), then go, then collects
    // every info line until bestmove.
    //----------------------------------

    async analyze(fen, goCommand, timeoutMs) {

        const infos = [];

        const collector = line => {

            const info = parseInfoLine(line);

            if (info) {
                infos.push(info);
            }

        };

        this.lineListeners.push(collector);

        const startedAt = performance.now();

        try {

            this.send("ucinewgame");
            this.send(`position fen ${fen}`);
            this.send("isready");

            await this.waitForLine(
                line => line.trim() === "readyok",
                HANDSHAKE_TIMEOUT_MS,
                `readyok after position fen ${fen}`
            );

            this.send(goCommand);

            const bestmoveLine = await this.waitForLine(
                line => line.startsWith("bestmove"),
                timeoutMs,
                `bestmove after "${goCommand}"`
            );

            const wallTimeMs =
                Math.round(performance.now() - startedAt);

            const bestMove =
                bestmoveLine.trim().split(/\s+/)[1] || null;

            const finalInfo = pickFinalInfo(infos);
            const score = normalizeScore(finalInfo);

            return {
                engine: this.idName || this.displayName,
                bestMove:
                    bestMove === "0000" ? null : bestMove,
                rawBestMove: bestMove,
                score,
                depth: finalInfo ? finalInfo.depth : null,
                nodes: finalInfo ? finalInfo.nodes : null,
                reportedTimeMs: finalInfo ? finalInfo.timeMs : null,
                nps: finalInfo ? finalInfo.nps : null,
                pv: finalInfo && finalInfo.pv ? finalInfo.pv : [],
                wallTimeMs,
                error: null
            };

        }

        finally {

            const index = this.lineListeners.indexOf(collector);

            if (index !== -1) {
                this.lineListeners.splice(index, 1);
            }

        }

    }

    //----------------------------------
    // Always resolves; never throws. Tries a polite quit,
    // then kills the process if it does not exit in time.
    //----------------------------------

    async dispose() {

        if (!this.child || this.exited) {
            return;
        }

        const child = this.child;

        const exitPromise = new Promise(resolve => {
            child.once("exit", resolve);
        });

        try {
            this.send("quit");
        }
        catch {
            // Already unwritable; fall through to kill.
        }

        const timed = await Promise.race([
            exitPromise.then(() => "exited"),
            new Promise(resolve =>
                setTimeout(() => resolve("timeout"), QUIT_TIMEOUT_MS)
            )
        ]);

        if (timed === "timeout") {
            child.kill("SIGKILL");
            await exitPromise;
        }

    }

}

//----------------------------------
// FEN input parsing
//----------------------------------

function looksLikeFen(text) {

    const fields = text.trim().split(/\s+/);

    if (fields.length < 2) {
        return false;
    }

    const ranks = fields[0].split("/");

    if (ranks.length !== 8) {
        return false;
    }

    for (const rank of ranks) {

        let squares = 0;

        for (const char of rank) {

            if (/[1-8]/.test(char)) {
                squares += Number.parseInt(char, 10);
            }
            else if (/[pnbrqkPNBRQK]/.test(char)) {
                squares += 1;
            }
            else {
                return false;
            }

        }

        if (squares !== 8) {
            return false;
        }

    }

    return fields[1] === "w" || fields[1] === "b";

}

function readFenFile(filePath) {

    const raw = fs.readFileSync(filePath, "utf8");
    const positions = [];

    raw.split(/\r?\n/).forEach((line, index) => {

        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        let label = null;
        let fen = trimmed;

        const pipeIndex = trimmed.indexOf("|");

        if (pipeIndex !== -1) {
            label = trimmed.slice(0, pipeIndex).trim() || null;
            fen = trimmed.slice(pipeIndex + 1).trim();
        }

        if (!looksLikeFen(fen)) {

            throw new Error(
                `${filePath}:${index + 1}: does not look like a FEN: "${trimmed}"`
            );

        }

        positions.push({
            label: label || `position-${positions.length + 1}`,
            fen
        });

    });

    if (positions.length === 0) {
        throw new Error(`${filePath}: no FEN positions found`);
    }

    return positions;

}

//======================================
// PGN Ingestion (v1.1)
//
// A lightweight, tolerant PGN reader: it does not aim for
// full ChessBase-level correctness, but it must safely
// handle normal Arena/Stockfish-annotated PGNs (headers,
// {comments}, $NAGs, (variations), move numbers, results)
// without crashing, and it must replay the mainline using
// Coach's own board/movegen so extracted FENs are exactly
// what Coach itself would have seen.
//======================================

const RESULT_TOKEN_PATTERN = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const MOVE_NUMBER_TOKEN_PATTERN = /^\d+\.+$/;

//----------------------------------
// Negative/annotation phrases used by both the "annotated"
// extraction mode and the candidate-regressions ranking.
// Case-insensitive substring match against move comments.
//----------------------------------

const NEGATIVE_COMMENT_PHRASES = [
    "what a pity",
    "throws away",
    "ruining",
    "missed",
    "only",
    "was possible",
    "is worth consideration",
    "stockfish",
    "the only chance",
    "blunder",
    "mistake"
];

function parsePgnHeaders(text) {

    const headers = {};
    const headerLinePattern = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;

    let match;

    while ((match = headerLinePattern.exec(text)) !== null) {
        headers[match[1]] = match[2].replace(/\\"/g, "\"");
    }

    return headers;

}

//----------------------------------
// Strip the header block, leaving only movetext. Headers
// are always "[Tag \"value\"]" lines at the top of the file
// in normal Arena/PGN output, so removing every line that
// matches the header pattern is sufficient and safe even if
// blank lines are inconsistent.
//----------------------------------

function stripHeaders(text) {

    return text
        .split(/\r?\n/)
        .filter(line => !/^\s*\[\w+\s+".*"\]\s*$/.test(line))
        .join("\n");

}

//----------------------------------
// Single-pass movetext tokenizer. Comments and variations
// are captured whole (by paren/brace depth) rather than
// recursively tokenized here; variations are tokenized
// separately, on demand, only to pull out their first move
// (see firstMoveInVariation).
//----------------------------------

function tokenizeMovetext(movetext) {

    const tokens = [];
    const length = movetext.length;
    let i = 0;

    while (i < length) {

        const ch = movetext[i];

        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        if (ch === "{") {

            let depth = 1;
            const start = i + 1;
            i++;

            while (i < length && depth > 0) {

                if (movetext[i] === "{") depth++;
                else if (movetext[i] === "}") depth--;

                i++;

            }

            tokens.push({
                type: "comment",
                text: movetext.slice(start, Math.max(start, i - 1)).trim()
            });

            continue;

        }

        if (ch === "(") {

            let depth = 1;
            const start = i + 1;
            i++;

            while (i < length && depth > 0) {

                if (movetext[i] === "(") depth++;
                else if (movetext[i] === ")") depth--;

                i++;

            }

            tokens.push({
                type: "variation",
                text: movetext.slice(start, Math.max(start, i - 1)).trim()
            });

            continue;

        }

        if (ch === "$") {

            const start = i;
            i++;

            while (i < length && /[0-9]/.test(movetext[i])) {
                i++;
            }

            tokens.push({
                type: "nag",
                code: movetext.slice(start, i)
            });

            continue;

        }

        const start = i;

        while (
            i < length &&
            !/\s/.test(movetext[i]) &&
            movetext[i] !== "{" &&
            movetext[i] !== "(" &&
            movetext[i] !== "$"
        ) {
            i++;
        }

        tokens.push({
            type: "raw",
            text: movetext.slice(start, i)
        });

    }

    return tokens;

}

//----------------------------------
// Separate the base SAN from trailing "!"/"?" annotation
// glyphs (some PGN sources use these instead of, or in
// addition to, numeric NAGs) and trailing "+"/"#" check or
// mate markers (sanForMove() never includes those, so they
// must be stripped before matching against it).
//----------------------------------

function splitSanGlyphs(rawToken) {

    const glyphMatch = rawToken.match(/^(.*?)([!?]+)$/);

    const withoutGlyphs = glyphMatch ? glyphMatch[1] : rawToken;
    const glyphs = glyphMatch ? glyphMatch[2] : "";

    const baseSan = withoutGlyphs.replace(/[+#]+$/, "");

    return { baseSan, glyphs };

}

//----------------------------------
// Pull just the first real move out of a variation's raw
// text (skipping any leading move-number marker), for the
// "suggested/variation move" metadata field. Does not
// attempt to replay the variation itself.
//----------------------------------

function firstMoveInVariation(variationText) {

    const tokens = tokenizeMovetext(variationText);

    for (const token of tokens) {

        if (token.type !== "raw") {
            continue;
        }

        if (
            MOVE_NUMBER_TOKEN_PATTERN.test(token.text) ||
            RESULT_TOKEN_PATTERN.test(token.text)
        ) {
            continue;
        }

        const { baseSan } = splitSanGlyphs(token.text);

        if (baseSan) {
            return baseSan;
        }

    }

    return null;

}

//----------------------------------
// Group the flat token stream into an ordered mainline move
// list, attaching comments/NAGs/the first following
// variation's first move to the mainline move they follow.
// Side/move-number bookkeeping is independent of the PGN's
// own move-number tokens (which are only markers here) --
// it simply alternates starting from White's move 1, which
// matches every normal PGN mainline.
//----------------------------------

function buildMainlineMoves(tokens) {

    const mainline = [];
    let result = null;

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
                current.nags.push(token.code);
            }

            continue;

        }

        if (token.type === "variation") {

            if (current && current.variationFirstMove === null) {
                current.variationFirstMove = firstMoveInVariation(token.text);
            }

            continue;

        }

        // token.type === "raw"

        if (RESULT_TOKEN_PATTERN.test(token.text)) {
            result = token.text;
            break;
        }

        if (MOVE_NUMBER_TOKEN_PATTERN.test(token.text)) {
            continue;
        }

        const { baseSan, glyphs } = splitSanGlyphs(token.text);

        if (!baseSan) {
            continue;
        }

        current = {
            moveNumber,
            side,
            san: baseSan,
            glyphs,
            comments: [],
            nags: [],
            variationFirstMove: null
        };

        mainline.push(current);

        if (side === "w") {
            side = "b";
        }
        else {
            side = "w";
            moveNumber++;
        }

    }

    return { mainline, result };

}

function parsePgn(text) {

    const headers = parsePgnHeaders(text);
    const movetext = stripHeaders(text);
    const tokens = tokenizeMovetext(movetext);
    const { mainline, result } = buildMainlineMoves(tokens);

    return { headers, mainline, result };

}

//----------------------------------
// Multi-game PGN splitting (v1.2)
//
// A single PGN file (typically an Arena tournament export)
// may contain many games back-to-back. Game boundaries are
// detected using the PGN header block, specifically the
// "[Event ...]" tag, which every well-formed game header
// starts with. Splitting purely on blank lines is not safe
// -- movetext itself can contain blank lines and irregular
// spacing -- so every line matching "[Event ..." is treated
// as the start of a new game, and each game's text runs up
// to (but not including) the next such line.
//
// If no "[Event" line is found at all (a bare movetext file
// with no headers), the whole file is treated as a single
// game, which keeps single-game PGNs without headers working
// exactly as before.
//----------------------------------

function splitPgnGames(text) {

    const lines = text.split(/\r?\n/);
    const eventLineIndices = [];

    lines.forEach((line, index) => {

        if (/^\s*\[Event\s+"/.test(line)) {
            eventLineIndices.push(index);
        }

    });

    if (eventLineIndices.length === 0) {
        return [text];
    }

    const games = [];

    for (let i = 0; i < eventLineIndices.length; i++) {

        const start = eventLineIndices[i];

        const end =
            i + 1 < eventLineIndices.length
                ? eventLineIndices[i + 1]
                : lines.length;

        games.push(lines.slice(start, end).join("\n"));

    }

    return games;

}

//----------------------------------
// Parses every game in a (possibly multi-game) PGN file.
// Each game is parsed independently, so a malformed game
// cannot take down the rest of the file -- a parse failure
// on one game is recorded as parseError and later games
// still get a chance to parse and replay.
//----------------------------------

function parseMultiGamePgn(fullText) {

    const gameTexts = splitPgnGames(fullText);

    return gameTexts.map((gameText, index) => {

        try {

            const { headers, mainline, result } = parsePgn(gameText);

            return {
                gameIndex: index + 1,
                headers,
                mainline,
                result,
                parseError: null
            };

        }

        catch (error) {

            return {
                gameIndex: index + 1,
                headers: {},
                mainline: [],
                result: null,
                parseError: error.message
            };

        }

    });

}

//----------------------------------
// Replay the mainline using Coach's own board and legal
// move generator, matching each SAN token against the SAN
// Coach's own browser PGN helper (js/game/pgn.js
// sanForMove()) would generate for each legal candidate move
// in that exact position. This reuses the same SAN logic
// Coach's browser export already relies on instead of
// duplicating a second SAN implementation.
//
// Stops at the first move that cannot be matched unambiguously
// (zero or multiple candidates), returning whatever replayed
// cleanly plus a clear error describing the move number, side,
// and token that failed. Never throws for a bad PGN move -- a
// malformed or unsupported input should be reported, not crash
// the tool.
//----------------------------------

function replayPgnMainline(mainline, startingFen) {

    const engine = createEngineCore(
        startingFen && startingFen !== "startpos" ? startingFen : null
    );

    const replayed = [];
    let replayError = null;

    for (const entry of mainline) {

        const legalMoves = engine.legalMoveGenerator.generateMoves();

        const fenBefore = FEN.export(engine.board);

        const candidates = legalMoves.filter(candidate =>
            PGN.sanForMove(candidate, legalMoves) === entry.san
        );

        if (candidates.length !== 1) {

            replayError =
                `move ${entry.moveNumber}${entry.side === "b" ? "..." : "."} ` +
                `"${entry.san}": ` +
                (candidates.length === 0
                    ? "no legal move matched this SAN"
                    : `ambiguous, ${candidates.length} legal moves matched this SAN`);

            break;

        }

        const move = candidates[0];

        replayed.push({
            ...entry,
            fenBefore,
            uciMove: moveToUci(move)
        });

        engine.board.makeMove(move);

    }

    return { replayed, replayError };

}

//----------------------------------
// Coach-side inference from PGN player-name headers.
// "auto" looks for the substring "coach" (case-insensitive)
// in the White/Black name headers. If both names contain it
// (as with two Coach-uci builds playing each other), this is
// genuinely ambiguous -- report that clearly and fall back
// to analyzing both sides rather than silently guessing.
//----------------------------------

function inferCoachSide(headers, requestedSide) {

    if (requestedSide !== "auto") {
        return { side: requestedSide, message: null };
    }

    const whiteName = (headers.White || "").toLowerCase();
    const blackName = (headers.Black || "").toLowerCase();

    const whiteIsCoach = whiteName.includes("coach");
    const blackIsCoach = blackName.includes("coach");

    if (whiteIsCoach && blackIsCoach) {

        return {
            side: "both",
            message:
                `Both player names contain "Coach" (White="${headers.White}", ` +
                `Black="${headers.Black}"). --coach-side auto cannot tell them ` +
                `apart, so falling back to "both". Pass --coach-side white or ` +
                `--coach-side black explicitly to analyze only one side.`
        };

    }

    if (whiteIsCoach) {
        return { side: "white", message: `Inferred --coach-side white from White="${headers.White}".` };
    }

    if (blackIsCoach) {
        return { side: "black", message: `Inferred --coach-side black from Black="${headers.Black}".` };
    }

    return {
        side: "both",
        message:
            `Neither player name contains "Coach" (White="${headers.White}", ` +
            `Black="${headers.Black}"). Falling back to "both". Pass ` +
            `--coach-side white or --coach-side black explicitly if that is wrong.`
    };

}

//----------------------------------
// --target-player resolution (v1.3)
//
// Resolves a requested player name against the distinct set
// of White/Black names seen anywhere in the PGN file (not
// per game), so a bracketed variant like "Coach-uci [001]"
// can be told apart from the plain "Coach-uci". Names are
// deduplicated case-insensitively, keeping the first-seen
// original casing for display.
//
// Prefers an exact (case-insensitive) match. If none exists,
// falls back to a substring match, but only if exactly one
// distinct player contains the requested text -- otherwise
// this is genuinely ambiguous and the caller should stop with
// a clear error rather than silently guessing which player
// was meant.
//----------------------------------

function collectDistinctPlayerNames(games) {

    const nameMap = new Map();

    for (const game of games) {

        for (const raw of [game.headers.White, game.headers.Black]) {

            if (!raw) {
                continue;
            }

            const key = raw.toLowerCase();

            if (!nameMap.has(key)) {
                nameMap.set(key, raw);
            }

        }

    }

    return nameMap;

}

function resolveTargetPlayer(games, targetPlayer) {

    const nameMap = collectDistinctPlayerNames(games);
    const targetLower = targetPlayer.toLowerCase();

    const exactMatches = [...nameMap.entries()]
        .filter(([key]) => key === targetLower)
        .map(([, name]) => name);

    if (exactMatches.length === 1) {

        return {
            resolvedName: exactMatches[0],
            matchType: "exact",
            message: null,
            error: null
        };

    }

    const substringMatches = [...nameMap.entries()]
        .filter(([key]) => key.includes(targetLower))
        .map(([, name]) => name);

    if (substringMatches.length === 1) {

        return {
            resolvedName: substringMatches[0],
            matchType: "substring",
            message:
                `--target-player "${targetPlayer}" matched by substring: "${substringMatches[0]}".`,
            error: null
        };

    }

    const knownNames = [...nameMap.values()];

    if (substringMatches.length === 0) {

        return {
            resolvedName: null,
            matchType: null,
            message: null,
            error:
                `No player found matching --target-player "${targetPlayer}". ` +
                `Players seen in this file: ${knownNames.join(", ") || "(none)"}.`
        };

    }

    return {
        resolvedName: null,
        matchType: null,
        message: null,
        error:
            `--target-player "${targetPlayer}" matches multiple players ambiguously: ` +
            `${substringMatches.join(", ")}. Provide a more exact name.`
    };

}

//----------------------------------
// Which side (if any) the resolved target player occupies in
// a specific game's headers. Returns null if the target does
// not appear in this game at all -- the caller should skip
// the game entirely in that case, per --target-player's
// "ignore games where that player does not appear" behavior.
//----------------------------------

function targetSideForGame(headers, resolvedName) {

    const resolvedLower = resolvedName.toLowerCase();

    const whiteIsTarget = (headers.White || "").toLowerCase() === resolvedLower;
    const blackIsTarget = (headers.Black || "").toLowerCase() === resolvedLower;

    if (whiteIsTarget && blackIsTarget) {
        return "both";
    }

    if (whiteIsTarget) {
        return "white";
    }

    if (blackIsTarget) {
        return "black";
    }

    return null;

}

//----------------------------------
// Annotation-signal detection, shared by extraction
// filtering and candidate-regressions ranking.
//----------------------------------

function annotationSignals(entry) {

    const nag2or4 =
        entry.nags.includes("$2") || entry.nags.includes("$4");

    const hasAnyNag = entry.nags.length > 0;

    const commentText = entry.comments.join(" ").toLowerCase();

    const hasComment = commentText.trim().length > 0;

    const hasNegativePhrase = NEGATIVE_COMMENT_PHRASES.some(
        phrase => commentText.includes(phrase)
    );

    const hasDoubleQuestion = entry.glyphs.includes("??");

    const hasSingleQuestion =
        !hasDoubleQuestion && entry.glyphs.includes("?");

    const hasDubiousGlyph =
        entry.glyphs === "?!";

    const hasVariationSuggestion = entry.variationFirstMove !== null;

    return {
        nag2or4,
        hasAnyNag,
        hasComment,
        hasNegativePhrase,
        hasDoubleQuestion,
        hasSingleQuestion,
        hasDubiousGlyph,
        hasVariationSuggestion
    };

}

//----------------------------------
// --extract mode filters. "all" takes every move by the
// selected side; "annotated" takes any move carrying PGN
// metadata that suggests importance; "blunders" takes only
// the strong negative markers.
//----------------------------------

function matchesExtractMode(entry, mode) {

    const signals = annotationSignals(entry);

    if (mode === "all") {
        return true;
    }

    if (mode === "annotated") {

        return (
            signals.hasAnyNag ||
            signals.hasComment ||
            signals.hasVariationSuggestion
        );

    }

    // mode === "blunders"

    return (
        signals.nag2or4 ||
        signals.hasDoubleQuestion ||
        signals.hasSingleQuestion ||
        signals.hasNegativePhrase
    );

}

//----------------------------------
// Annotation-severity score used to rank candidate
// regressions when no reference engine is provided (and
// blended with comparison.severity when one is). Coarse and
// deliberately simple, matching the rest of v1's thresholds.
//----------------------------------

function annotationSeverity(entry) {

    const signals = annotationSignals(entry);
    let severity = 0;

    if (entry.nags.includes("$4")) severity += 100;
    else if (entry.nags.includes("$2")) severity += 70;

    if (signals.hasDoubleQuestion) severity += 100;
    else if (signals.hasSingleQuestion) severity += 60;
    else if (signals.hasDubiousGlyph) severity += 30;

    if (signals.hasNegativePhrase) severity += 40;
    if (signals.hasVariationSuggestion) severity += 20;
    if (signals.hasComment && !signals.hasNegativePhrase) severity += 10;

    return severity;

}

//----------------------------------
// Selects candidate positions from a replayed mainline:
// filters to the requested side(s), applies the --extract
// mode, and caps the result. Ordering is preserved (game
// order); ranking for candidate-regressions happens later,
// after engine analysis, using severity + comparison data.
//----------------------------------

function selectPgnCandidates(
    replayedMainline,
    coachSide,
    extractMode,
    maxPositions,
    labelPrefix = "",
    filters = {}
) {

    const sideMatches = entry => {

        if (coachSide === "both") return true;
        if (coachSide === "white") return entry.side === "w";
        return entry.side === "b";

    };

    const moveMatches = entry => {

        if (filters.minMove !== null && entry.moveNumber < filters.minMove) {
            return false;
        }

        if (filters.maxMove !== null && entry.moveNumber > filters.maxMove) {
            return false;
        }

        return true;

    };

    const selectedBeforeSampling = replayedMainline
        .filter(sideMatches)
        .filter(moveMatches)
        .filter(entry => matchesExtractMode(entry, extractMode));

    const sampleEvery = filters.sampleEvery || null;

    const selected =
        sampleEvery !== null
            ? selectedBeforeSampling.filter((_, index) => index % sampleEvery === 0)
            : selectedBeforeSampling;

    const capped =
        maxPositions !== null
            ? selected.slice(0, maxPositions)
            : selected;

    return capped.map(entry => {

        const sideLabel = entry.side === "w" ? "w" : "b";

        const label =
            `${labelPrefix}before-${entry.moveNumber}${sideLabel === "b" ? "..." : "."}` +
            `${entry.san}`;

        return {
            label,
            fen: entry.fenBefore,
            pgn: {
                moveNumber: entry.moveNumber,
                side: entry.side,
                gameMoveSan: entry.san,
                gameMoveGlyphs: entry.glyphs,
                gameMoveUci: entry.uciMove,
                nags: entry.nags,
                comments: entry.comments,
                suggestedMove: entry.variationFirstMove,
                severity: annotationSeverity(entry),
                game: null
            }
        };

    });

}

//----------------------------------
// PGN/comment-derived theme hints. Additive only -- layered
// on top of the existing FEN-only themeTags() output for
// PGN-derived candidates. themeTags() itself is unchanged so
// FEN mode behaves exactly as before.
//----------------------------------

function pgnThemeHints(pgnMeta) {

    const tags = new Set();

    const commentText = pgnMeta.comments.join(" ").toLowerCase();
    const san = pgnMeta.gameMoveSan;

    if (/king\s*side|mating attack|attack.*king|king.*attack/.test(commentText)) {
        tags.add("kingside attack / king safety");
    }

    if (/attacking continuation|keeps? (the )?attack|initiative/.test(commentText)) {
        tags.add("attacking continuation");
    }

    if (/passed pawn|promot/.test(commentText)) {
        tags.add("passed pawn");
    }

    if (/pawn race/.test(commentText)) {
        tags.add("pawn race");
    }

    if (/rook endgame|rook ending/.test(commentText)) {
        tags.add("rook endgame");
    }

    if (/exchange|trade/.test(commentText)) {
        tags.add("exchange decision");
    }

    if (san.startsWith("K") && /[a-h][1-8]$/.test(san)) {
        tags.add("king activity");
    }

    if (pgnMeta.moveNumber <= 12) {
        tags.add("opening/time-management candidate");
    }

    if (
        tags.size === 0 &&
        (pgnMeta.nags.length > 0 || pgnMeta.comments.length > 0)
    ) {
        tags.add("middlegame tactic");
    }

    return [...tags];

}

//----------------------------------
// Cheap FEN-derived features for theme tagging.
// Deliberately simple v1 signals; no engine calls.
//----------------------------------

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function fenFeatures(fen) {

    const [boardField, sideToMove] = fen.trim().split(/\s+/);

    const whitePawns = [];
    const blackPawns = [];

    let whiteNonPawnMaterial = 0;
    let blackNonPawnMaterial = 0;
    let whiteRooks = 0;
    let blackRooks = 0;
    let whiteQueens = 0;
    let blackQueens = 0;
    let whiteMinors = 0;
    let blackMinors = 0;

    const ranks = boardField.split("/");

    for (let rankIndex = 0; rankIndex < 8; rankIndex++) {

        //----------------------------------
        // FEN lists rank 8 first. rankNumber is the
        // chess rank (1-8); file is 0-7 (a-h).
        //----------------------------------

        const rankNumber = 8 - rankIndex;
        let file = 0;

        for (const char of ranks[rankIndex]) {

            if (/[1-8]/.test(char)) {
                file += Number.parseInt(char, 10);
                continue;
            }

            const isWhite = char === char.toUpperCase();
            const kind = char.toLowerCase();

            if (kind === "p") {

                (isWhite ? whitePawns : blackPawns).push({
                    file,
                    rank: rankNumber
                });

            }
            else {

                const value = PIECE_VALUES[kind] || 0;

                if (isWhite) {
                    whiteNonPawnMaterial += value;
                }
                else {
                    blackNonPawnMaterial += value;
                }

                if (kind === "r") {
                    isWhite ? whiteRooks++ : blackRooks++;
                }
                else if (kind === "q") {
                    isWhite ? whiteQueens++ : blackQueens++;
                }
                else if (kind === "n" || kind === "b") {
                    isWhite ? whiteMinors++ : blackMinors++;
                }

            }

            file += 1;

        }

    }

    const isPassed = (pawn, enemyPawns, isWhitePawn) =>
        !enemyPawns.some(enemy =>
            Math.abs(enemy.file - pawn.file) <= 1 &&
            (isWhitePawn
                ? enemy.rank > pawn.rank
                : enemy.rank < pawn.rank)
        );

    const whitePassed =
        whitePawns.filter(pawn => isPassed(pawn, blackPawns, true));

    const blackPassed =
        blackPawns.filter(pawn => isPassed(pawn, whitePawns, false));

    const nearPromotion =
        whitePassed.some(pawn => pawn.rank >= 6) ||
        blackPassed.some(pawn => pawn.rank <= 3);

    return {
        sideToMove,
        whiteNonPawnMaterial,
        blackNonPawnMaterial,
        totalNonPawnMaterial:
            whiteNonPawnMaterial + blackNonPawnMaterial,
        rooksPresent: whiteRooks + blackRooks > 0,
        queensPresent: whiteQueens + blackQueens > 0,
        minorsPresent: whiteMinors + blackMinors > 0,
        pawnCount: whitePawns.length + blackPawns.length,
        passedPawnCount: whitePassed.length + blackPassed.length,
        nearPromotion
    };

}

//----------------------------------
// Theme tagging (v1 heuristic, cheap signals only):
//   - low non-pawn material + rooks and no queens -> rook endgame
//   - low non-pawn material                      -> endgame
//   - passed pawns / pawns near promotion        -> passed pawn
//   - mate score or large eval disagreement      -> tactic
//   - otherwise                                  -> unknown
// King safety and time-management tags need signals this
// tool does not compute cheaply yet (check detection,
// per-move clock data); listed as a known limitation.
//----------------------------------

function themeTags(features, comparison, coachResult, referenceResult) {

    const tags = new Set();

    const isEndgame = features.totalNonPawnMaterial <= 13;

    if (isEndgame) {

        tags.add("endgame");

        if (
            features.rooksPresent &&
            !features.queensPresent
        ) {
            tags.add("rook endgame");
        }

    }

    if (features.passedPawnCount > 0 || features.nearPromotion) {
        tags.add("passed pawn");
    }

    const mateSomewhere =
        (coachResult.score && coachResult.score.isMate) ||
        (referenceResult && referenceResult.score && referenceResult.score.isMate);

    if (mateSomewhere) {
        tags.add("tactic");
    }

    if (
        comparison &&
        comparison.evalDiffCp !== null &&
        Math.abs(comparison.evalDiffCp) >= EVAL_DIFF_TACTIC_CP
    ) {
        tags.add("tactic");
    }

    if (tags.size === 0) {
        tags.add("unknown");
    }

    return [...tags];

}

//----------------------------------
// Coach vs reference comparison.
//
// evalDiffCp is still computed directly from the raw,
// side-to-move-relative cp values (a positive evalDiffCp means
// Coach is more optimistic about the side to move than the
// reference engine is) -- that subtraction is valid without
// normalization because both engines were scored on the exact
// same position, so they share the same side-to-move frame,
// and normalizing both operands by the same fixed White-
// relative flip would not change their difference.
//
// mateDisagreement is where normalization actually matters. It
// is computed in the White-relative frame (see
// toWhiteRelativeCp()/favoredSide() above) specifically so that
// an isMate mismatch alone is never enough to flag a
// disagreement: Coach reporting "mate 6" and the reference
// reporting "cp 850" for the SAME favored side agree completely
// about who is winning, just not about whether a forced mate
// has been found yet. Only a genuine disagreement about which
// side is actually favored -- both mate-class but for opposite
// sides, or one mate-class while the other's normalized score
// favors the opposite side -- is flagged. Concretely, this
// means: same best move + same favored side after
// normalization never gets a mate-disagreement severity bump
// (requirement 5), while a true opposite-side disagreement
// still does, however the two raw scores happened to be
// signed.
//----------------------------------

function compareResults(coachResult, referenceResult, sideToMoveChar) {

    if (!referenceResult || referenceResult.error) {
        return null;
    }

    const coachScore = coachResult.score;
    const referenceScore = referenceResult.score;

    const bothScored =
        coachScore !== null && referenceScore !== null;

    const evalDiffCp =
        bothScored ? coachScore.cp - referenceScore.cp : null;

    const coachWhiteCp =
        bothScored
            ? toWhiteRelativeCp(coachScore.cp, sideToMoveChar)
            : null;

    const referenceWhiteCp =
        bothScored
            ? toWhiteRelativeCp(referenceScore.cp, sideToMoveChar)
            : null;

    const bestMoveAgree =
        coachResult.bestMove !== null &&
        referenceResult.bestMove !== null
            ? coachResult.bestMove === referenceResult.bestMove
            : null;

    const pvFirstAgree =
        coachResult.pv.length > 0 &&
        referenceResult.pv.length > 0
            ? coachResult.pv[0] === referenceResult.pv[0]
            : null;

    const coachFavors =
        bothScored ? favoredSide(coachWhiteCp) : null;

    const referenceFavors =
        bothScored ? favoredSide(referenceWhiteCp) : null;

    const mateDisagreement =
        bothScored &&
        (coachScore.isMate || referenceScore.isMate) &&
        coachFavors !== "none" &&
        referenceFavors !== "none" &&
        coachFavors !== referenceFavors;

    let coachAssessment = "unknown";

    if (evalDiffCp !== null) {

        if (Math.abs(evalDiffCp) <= EVAL_DIFF_ALIGNED_CP) {
            coachAssessment = "aligned";
        }
        else if (evalDiffCp > 0) {
            coachAssessment = "coach more optimistic";
        }
        else {
            coachAssessment = "coach more pessimistic";
        }

    }

    //----------------------------------
    // Severity drives ranking in the report. Eval
    // difference dominates; a different best move and any
    // genuine (normalized) mate-level disagreement add fixed
    // penalties. Same-move, same-favored-side cases never
    // reach the mateDisagreement branch, so they never get
    // this bump -- requirement 5.
    //----------------------------------

    let severity =
        evalDiffCp !== null
            ? Math.min(Math.abs(evalDiffCp), 2000)
            : 0;

    if (bestMoveAgree === false) {
        severity += 150;
    }

    if (mateDisagreement) {
        severity += 500;
    }

    return {
        bestMoveAgree,
        pvFirstAgree,
        evalDiffCp,
        mateDisagreement,
        coachAssessment,
        severity,
        coachWhiteCp,
        referenceWhiteCp
    };

}

function followUpPriority(comparison) {

    if (!comparison) {
        return "n/a (coach-only run)";
    }

    const diff =
        comparison.evalDiffCp !== null
            ? Math.abs(comparison.evalDiffCp)
            : 0;

    if (
        comparison.mateDisagreement ||
        (comparison.bestMoveAgree === false && diff >= EVAL_DIFF_HIGH_CP)
    ) {
        return "high";
    }

    if (comparison.bestMoveAgree === false || diff >= EVAL_DIFF_MEDIUM_CP) {
        return "medium";
    }

    return "low";

}

function reviewReason(position) {

    const { comparison, coach, reference } = position;

    if (!comparison) {

        return coach.score && coach.score.isMate
            ? "Coach reports a mate-class score; verify it is real."
            : "Coach-only baseline; compare against a reference engine to grade it.";

    }

    const parts = [];

    if (comparison.mateDisagreement) {
        parts.push("engines disagree about a forced mate");
    }

    if (comparison.bestMoveAgree === false) {

        parts.push(
            `different best moves (${position.coach.bestMove} vs ${reference.bestMove})`
        );

    }

    if (
        comparison.evalDiffCp !== null &&
        Math.abs(comparison.evalDiffCp) >= EVAL_DIFF_MEDIUM_CP
    ) {

        parts.push(
            `${comparison.coachAssessment} by ${Math.abs(comparison.evalDiffCp)}cp`
        );

    }

    return parts.length > 0
        ? `Worth reviewing: ${parts.join("; ")}.`
        : "Minor disagreement; low priority.";

}

//----------------------------------
// Formatting helpers
//----------------------------------

function formatScore(score) {

    if (!score) {
        return "n/a";
    }

    if (score.isMate) {

        return score.mateIn !== null
            ? `mate ${score.mateIn}`
            : `mate-class cp ${score.cp}`;

    }

    return `${score.cp}cp`;

}

//----------------------------------
// Raw score (exactly as reported, side-to-move-relative) plus
// the normalized, side-independent description in brackets --
// e.g. "mate -4 (Black mates in 4)" or "928cp (White +9.28)".
// Used everywhere the report shows a score so raw and
// normalized are always visible together; comparison/ranking
// itself uses compareResults()'s normalized fields, not this
// string.
//----------------------------------

function formatScoreWithContext(score, sideToMoveChar) {

    if (!score) {
        return "n/a";
    }

    return `${formatScore(score)} (${describeFavoredSide(score, sideToMoveChar)})`;

}

function formatPv(pv, maxMoves = 8) {

    if (!pv || pv.length === 0) {
        return "n/a";
    }

    const shown = pv.slice(0, maxMoves).join(" ");

    return pv.length > maxMoves ? `${shown} ...` : shown;

}

function runTimestamp(date = new Date()) {

    const pad = value => String(value).padStart(2, "0");

    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );

}

//----------------------------------
// Markdown report
//----------------------------------

function buildMarkdownReport(run) {

    const { settings, summary, positions } = run;
    const hasReference = Boolean(settings.referenceCommand);
    const lines = [];

    lines.push(`# Coach Analysis Lab Run — ${run.startedAt}`);
    lines.push("");
    lines.push("## Settings");
    lines.push("");
    lines.push(`- Coach command: \`${settings.coachCommand}\` (${run.coachEngineName || "unidentified"})`);
    lines.push(
        hasReference
            ? `- Reference command: \`${settings.referenceCommand}\` (${run.referenceEngineName || "unidentified"})`
            : "- Reference command: none (Coach-only run)"
    );
    lines.push(
        settings.depth !== null
            ? `- Search control: go depth ${settings.depth}`
            : `- Search control: go movetime ${settings.movetimeMs}ms`
    );
    lines.push(`- Per-position timeout: ${settings.timeoutMs}ms`);
    lines.push(`- Number of FENs: ${positions.length}`);

    if (run.pgnSource) {

        lines.push(
            `- PGN source: \`${run.pgnSource.pgnFile}\` ` +
            `(coach-side: ${run.pgnSource.coachSide}, extract: ${run.pgnSource.extractMode})`
        );

        lines.push(
            `- Games parsed: ${run.pgnSource.totalGames} ` +
            `(${run.pgnSource.gamesReplayed} replayed, ${run.pgnSource.gamesWithErrors} with errors)`
        );

        lines.push(
            `- Candidates extracted: ${run.pgnSource.totalCandidatesExtracted}` +
            (run.pgnSource.totalCandidatesExtracted !== run.pgnSource.totalCandidatesAnalyzed
                ? ` (capped to ${run.pgnSource.totalCandidatesAnalyzed} analyzed by --max-positions)`
                : "")
        );

        if (run.pgnSource.targetPlayer) {

            const target = run.pgnSource.targetPlayer;

            lines.push(
                `- Target player: "${target.resolvedName}" (${target.matchType} match for ` +
                `"${target.requested}") -- ${target.gamesInvolvingTarget}/${target.gamesScanned} ` +
                `games involved this player, ${target.gamesSkippedNoTarget} skipped`
            );

        }

    }

    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Positions analyzed: ${summary.analyzed} (${summary.failed} failed)`);

    if (hasReference) {

        lines.push(
            `- Best-move agreement: ${summary.bestMoveAgreements}/${summary.comparablePositions}`
        );

        lines.push(
            summary.averageAbsEvalDiffCp !== null
                ? `- Average |eval difference|: ${summary.averageAbsEvalDiffCp}cp (over ${summary.evalComparablePositions} non-mate comparable positions)`
                : "- Average |eval difference|: n/a"
        );

        lines.push(
            summary.largestEvalDiff
                ? `- Largest eval disagreement: ${summary.largestEvalDiff.diff}cp at "${summary.largestEvalDiff.label}"`
                : "- Largest eval disagreement: n/a"
        );

        lines.push(`- Mate-score disagreements: ${summary.mateDisagreements}`);

        lines.push(
            `- Coach chose a move the reference strongly disliked ` +
            `(different best move and Coach >= ${EVAL_DIFF_HIGH_CP}cp more optimistic): ` +
            `${summary.stronglyDislikedMoves}`
        );

    }
    else {

        lines.push(`- Average Coach depth: ${summary.averageCoachDepth ?? "n/a"}`);
        lines.push(`- Average Coach wall time: ${summary.averageCoachWallTimeMs ?? "n/a"}ms`);
        lines.push(`- Mate-class scores reported: ${summary.coachMateScores}`);

    }

    lines.push("");
    lines.push("## Top Candidate FENs");
    lines.push("");

    const ranked = positions
        .filter(position => !position.error)
        .sort((a, b) => {

            const severityA = a.comparison ? a.comparison.severity : 0;
            const severityB = b.comparison ? b.comparison.severity : 0;

            return severityB - severityA;

        })
        .slice(0, TOP_DISAGREEMENT_COUNT);

    if (ranked.length === 0) {
        lines.push("No successfully analyzed positions.");
    }

    for (const [index, position] of ranked.entries()) {

        lines.push(`### ${index + 1}. ${position.label}`);
        lines.push("");
        lines.push(`- FEN: \`${position.fen}\``);
        lines.push(`- Side to move: ${position.sideToMove === "w" ? "White" : "Black"}`);
        lines.push(
            `- Coach: **${position.coach.bestMove ?? "none"}** ` +
            `score ${formatScoreWithContext(position.coach.score, position.sideToMove)}, ` +
            `depth ${position.coach.depth ?? "n/a"}, ` +
            `nodes ${position.coach.nodes ?? "n/a"}, ` +
            `time ${position.coach.wallTimeMs}ms, ` +
            `pv \`${formatPv(position.coach.pv)}\``
        );

        if (position.reference) {

            lines.push(
                `- Reference: **${position.reference.bestMove ?? "none"}** ` +
                `score ${formatScoreWithContext(position.reference.score, position.sideToMove)}, ` +
                `depth ${position.reference.depth ?? "n/a"}, ` +
                `nodes ${position.reference.nodes ?? "n/a"}, ` +
                `time ${position.reference.wallTimeMs}ms, ` +
                `pv \`${formatPv(position.reference.pv)}\``
            );

        }

        if (position.comparison) {

            lines.push(
                `- Difference: eval ${position.comparison.evalDiffCp ?? "n/a"}cp ` +
                `(${position.comparison.coachAssessment}), ` +
                `best move ${position.comparison.bestMoveAgree ? "agrees" : "**differs**"}` +
                (position.comparison.mateDisagreement
                    ? ", **mate disagreement**"
                    : "")
            );

        }

        lines.push(`- Theme tags: ${position.themes.join(", ")}`);
        lines.push(`- Follow-up priority: ${position.priority}`);
        lines.push(`- Why review: ${reviewReason(position)}`);
        lines.push("");

    }

    lines.push("## Raw Results");
    lines.push("");

    if (hasReference) {

        lines.push("| # | Label | STM | Coach best | Coach score | Depth | Ref best | Ref score | Diff (cp) | Agree | Themes | Priority |");
        lines.push("|---|-------|-----|-----------|-------------|-------|----------|-----------|-----------|-------|--------|----------|");

    }
    else {

        lines.push("| # | Label | STM | Coach best | Coach score | Depth | Nodes | Time (ms) | Themes |");
        lines.push("|---|-------|-----|-----------|-------------|-------|-------|-----------|--------|");

    }

    positions.forEach((position, index) => {

        if (position.error) {

            lines.push(
                `| ${index + 1} | ${position.label} | - | ERROR | ${position.error} | | | | ` +
                (hasReference ? "| | | |" : "|")
            );

            return;

        }

        if (hasReference) {

            lines.push(
                `| ${index + 1} ` +
                `| ${position.label} ` +
                `| ${position.sideToMove} ` +
                `| ${position.coach.bestMove ?? "-"} ` +
                `| ${formatScoreWithContext(position.coach.score, position.sideToMove)} ` +
                `| ${position.coach.depth ?? "-"} ` +
                `| ${position.reference ? position.reference.bestMove ?? "-" : "-"} ` +
                `| ${position.reference ? formatScoreWithContext(position.reference.score, position.sideToMove) : "-"} ` +
                `| ${position.comparison && position.comparison.evalDiffCp !== null ? position.comparison.evalDiffCp : "-"} ` +
                `| ${position.comparison && position.comparison.bestMoveAgree !== null ? (position.comparison.bestMoveAgree ? "yes" : "NO") : "-"} ` +
                `| ${position.themes.join(", ")} ` +
                `| ${position.priority} |`
            );

        }
        else {

            lines.push(
                `| ${index + 1} ` +
                `| ${position.label} ` +
                `| ${position.sideToMove} ` +
                `| ${position.coach.bestMove ?? "-"} ` +
                `| ${formatScoreWithContext(position.coach.score, position.sideToMove)} ` +
                `| ${position.coach.depth ?? "-"} ` +
                `| ${position.coach.nodes ?? "-"} ` +
                `| ${position.coach.wallTimeMs} ` +
                `| ${position.themes.join(", ")} |`
            );

        }

    });

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
        "Generated by tools/coach-analysis-lab.mjs (diagnostic only; " +
        "no engine behavior was changed). Raw scores are side-to-move " +
        "relative centipawns (standard UCI convention); mate-class scores " +
        "use Coach's +/-100000 convention. Every score shown is followed " +
        "by a normalized, side-independent description in parentheses " +
        "(e.g. \"White mates in 4\") -- comparison, mate-agreement, and " +
        "severity/priority all use that normalized (White-relative) frame " +
        "internally, so same-move/same-favored-side cases are never " +
        "reported as a mate disagreement even if the two engines' raw " +
        "mate signs differ only because of whose move it was."
    );
    lines.push("");

    return lines.join("\n");

}

//----------------------------------
// Summary statistics
//----------------------------------

function buildSummary(positions) {

    const analyzed =
        positions.filter(position => !position.error);

    const failed = positions.length - analyzed.length;

    const compared =
        analyzed.filter(position => position.comparison);

    const bestMoveAgreements =
        compared.filter(
            position => position.comparison.bestMoveAgree === true
        ).length;

    //----------------------------------
    // Mate-class scores are excluded from the centipawn
    // average: a single +/-100000 would swamp it.
    //----------------------------------

    const evalComparable =
        compared.filter(position =>
            position.comparison.evalDiffCp !== null &&
            !position.coach.score.isMate &&
            !position.reference.score.isMate
        );

    const averageAbsEvalDiffCp =
        evalComparable.length > 0
            ? Math.round(
                evalComparable.reduce(
                    (sum, position) =>
                        sum + Math.abs(position.comparison.evalDiffCp),
                    0
                ) / evalComparable.length
            )
            : null;

    let largestEvalDiff = null;

    for (const position of evalComparable) {

        const diff = Math.abs(position.comparison.evalDiffCp);

        if (!largestEvalDiff || diff > largestEvalDiff.diff) {
            largestEvalDiff = { label: position.label, diff };
        }

    }

    const mateDisagreements =
        compared.filter(
            position => position.comparison.mateDisagreement
        ).length;

    const stronglyDislikedMoves =
        compared.filter(position =>
            position.comparison.bestMoveAgree === false &&
            position.comparison.evalDiffCp !== null &&
            position.comparison.evalDiffCp >= EVAL_DIFF_HIGH_CP
        ).length;

    const depths =
        analyzed
            .map(position => position.coach.depth)
            .filter(depth => depth !== null);

    const averageCoachDepth =
        depths.length > 0
            ? Math.round(
                (depths.reduce((sum, depth) => sum + depth, 0) /
                    depths.length) * 10
            ) / 10
            : null;

    const averageCoachWallTimeMs =
        analyzed.length > 0
            ? Math.round(
                analyzed.reduce(
                    (sum, position) => sum + position.coach.wallTimeMs,
                    0
                ) / analyzed.length
            )
            : null;

    const coachMateScores =
        analyzed.filter(
            position => position.coach.score && position.coach.score.isMate
        ).length;

    return {
        analyzed: analyzed.length,
        failed,
        comparablePositions: compared.length,
        bestMoveAgreements,
        evalComparablePositions: evalComparable.length,
        averageAbsEvalDiffCp,
        largestEvalDiff,
        mateDisagreements,
        stronglyDislikedMoves,
        averageCoachDepth,
        averageCoachWallTimeMs,
        coachMateScores
    };

}

//----------------------------------
// candidate-regressions.fens
//
// Format: label | fen  (one per line), matching the same
// format readFenFile() already accepts, so the output of a
// PGN run can be fed straight back in as --fen-file input.
//----------------------------------

function buildCandidateRegressionsFens(rankedPositions) {

    const lines = [
        "# Candidate regression FENs",
        "# Generated by tools/coach-analysis-lab.mjs PGN mode.",
        "# Format: label | fen",
        ""
    ];

    for (const position of rankedPositions) {
        lines.push(`${position.label} | ${position.fen}`);
    }

    return lines.join("\n") + "\n";

}

//----------------------------------
// candidate-regressions.md
//----------------------------------

function combinedPriorityScore(position) {

    const severity =
        position.pgn ? position.pgn.severity : 0;

    const comparisonSeverity =
        position.comparison ? position.comparison.severity : 0;

    return severity + comparisonSeverity;

}

//----------------------------------
// Renders one candidate's detail block (FEN, game move,
// suggested move, NAG/comment, Coach/reference analysis,
// themes, priority) at the given markdown heading depth.
// Shared by both the "top overall" and "by game" sections so
// the two views never drift apart.
//----------------------------------

function renderCandidateEntry(position, index, headingMarker) {

    const pgn = position.pgn;
    const lines = [];

    lines.push(`${headingMarker} ${index + 1}. ${position.label}`);
    lines.push("");
    lines.push(`- FEN: \`${position.fen}\``);
    lines.push(
        `- Game move: ${pgn.gameMoveSan}${pgn.gameMoveGlyphs || ""}` +
        (pgn.gameMoveUci ? ` (${pgn.gameMoveUci})` : "")
    );
    lines.push(
        `- Suggested/variation move from PGN: ${pgn.suggestedMove || "none found"}`
    );
    lines.push(
        `- NAG/comment: ${pgn.nags.join(" ") || "none"}` +
        (pgn.comments.length > 0 ? ` — ${pgn.comments.join(" / ")}` : "")
    );
    lines.push(
        `- Coach analysis: **${position.coach.bestMove ?? "none"}** ` +
        `score ${formatScoreWithContext(position.coach.score, position.sideToMove)}, ` +
        `depth ${position.coach.depth ?? "n/a"}, ` +
        `pv \`${formatPv(position.coach.pv)}\``
    );

    if (position.reference) {

        lines.push(
            `- Reference analysis: **${position.reference.bestMove ?? "none"}** ` +
            `score ${formatScoreWithContext(position.reference.score, position.sideToMove)}, ` +
            `depth ${position.reference.depth ?? "n/a"}, ` +
            `pv \`${formatPv(position.reference.pv)}\``
        );

    }
    else {
        lines.push("- Reference analysis: not run (no --stockfish/--ref provided)");
    }

    lines.push(`- Theme tag(s): ${position.themes.join(", ") || "unknown"}`);
    lines.push(`- Priority: ${position.priority} (score ${combinedPriorityScore(position)})`);
    lines.push("");

    return lines;

}

//----------------------------------
// candidate-regressions.md
//
// Structure:
//   - File-level summary (games parsed/replayed/errored,
//     total candidates).
//   - "Top Candidates Overall": every successfully analyzed
//     candidate across every game, ranked by
//     combinedPriorityScore (same ranking as v1.1's flat
//     list).
//   - "By Game": every game in game order, each with its own
//     header (Event/White/Black/Result/side analyzed/plies
//     replayed) followed by that game's own candidates,
//     ranked the same way within the game, or a short note if
//     the game produced no candidates or failed to parse/
//     replay.
//----------------------------------

function buildCandidateRegressionsMarkdown(run) {

    const { positions, pgnSource } = run;

    const withPgn = positions.filter(
        position => !position.error && position.pgn
    );

    const ranked = [...withPgn].sort(
        (a, b) => combinedPriorityScore(b) - combinedPriorityScore(a)
    );

    const lines = [];

    lines.push("# Candidate Regression FENs");
    lines.push("");
    lines.push(`Source PGN: \`${pgnSource.pgnFile}\``);
    lines.push("");
    lines.push(`Total games parsed: ${pgnSource.totalGames}`);
    lines.push(`Games successfully replayed: ${pgnSource.gamesReplayed}`);
    lines.push(`Games with parse errors: ${pgnSource.gamesWithErrors}`);
    lines.push(`Coach side setting: ${pgnSource.coachSide}`);
    lines.push(`Extraction mode: ${pgnSource.extractMode}`);
    lines.push(
        `Total candidates extracted: ${pgnSource.totalCandidatesExtracted}` +
        (pgnSource.totalCandidatesExtracted !== pgnSource.totalCandidatesAnalyzed
            ? ` (analyzed: ${pgnSource.totalCandidatesAnalyzed}, capped by --max-positions)`
            : "")
    );

    const target = pgnSource.targetPlayer;

    if (target) {

        lines.push(
            `Target player: "${target.resolvedName}" (${target.matchType} match for ` +
            `"${target.requested}")`
        );
        lines.push(
            `Games scanned: ${target.gamesScanned} -- ` +
            `involving target: ${target.gamesInvolvingTarget}, ` +
            `skipped (target not present): ${target.gamesSkippedNoTarget}`
        );

    }

    lines.push("");
    lines.push("## Candidate Counts by Game");
    lines.push("");

    if (target) {
        lines.push("| Game | Event | White | Black | Result | Target Side | Candidates |");
        lines.push("|------|-------|-------|-------|--------|--------------|------------|");
    }
    else {
        lines.push("| Game | Event | White | Black | Result | Candidates |");
        lines.push("|------|-------|-------|-------|--------|------------|");
    }

    for (const game of pgnSource.games) {

        const candidatesCell = game.parseError
            ? `error: ${game.parseError}`
            : (target && game.targetSide === null
                ? "skipped (target not present)"
                : game.candidateCount);

        lines.push(
            `| ${game.gameIndex} ` +
            `| ${game.event || "-"} ` +
            `| ${game.white || "-"} ` +
            `| ${game.black || "-"} ` +
            `| ${game.result || "-"} ` +
            (target ? `| ${game.targetSide || "-"} ` : "") +
            `| ${candidatesCell} |`
        );

    }

    lines.push("");
    lines.push("## Top Candidates Overall");
    lines.push("");

    if (ranked.length === 0) {
        lines.push("No candidates were successfully analyzed.");
        lines.push("");
    }

    for (const [index, position] of ranked.entries()) {
        lines.push(...renderCandidateEntry(position, index, "###"));
    }

    lines.push("## By Game");
    lines.push("");

    for (const game of pgnSource.games) {

        lines.push(
            `### Game ${game.gameIndex}: ${game.event || "(no Event header)"}`
        );
        lines.push("");
        lines.push(`- White: ${game.white || "?"}`);
        lines.push(`- Black: ${game.black || "?"}`);
        lines.push(`- Result: ${game.result || "?"}`);

        if (game.parseError) {

            lines.push(`- Status: skipped -- ${game.parseError}`);
            lines.push("");
            continue;

        }

        if (pgnSource.targetPlayer && game.targetSide === null) {

            lines.push(
                `- Status: skipped -- target player "${pgnSource.targetPlayer.resolvedName}" ` +
                "not present in this game"
            );
            lines.push("");
            continue;

        }

        if (pgnSource.targetPlayer) {
            lines.push(`- Target player played as: ${game.targetSide}`);
        }

        lines.push(`- Coach side analyzed: ${game.coachSide}`);
        lines.push(`- Plies replayed: ${game.repliedPlyCount}`);

        if (game.replayError) {
            lines.push(`- Replay note: stopped early -- ${game.replayError}`);
        }

        lines.push(`- Candidates extracted: ${game.candidateCount}`);
        lines.push("");

        const gameCandidates = ranked.filter(
            position => position.pgn.game && position.pgn.game.gameIndex === game.gameIndex
        );

        if (gameCandidates.length === 0) {

            lines.push("No candidates were successfully analyzed for this game.");
            lines.push("");
            continue;

        }

        for (const [index, position] of gameCandidates.entries()) {
            lines.push(...renderCandidateEntry(position, index, "####"));
        }

    }

    lines.push("---");
    lines.push("");
    lines.push(
        "Generated by tools/coach-analysis-lab.mjs (diagnostic only; no " +
        "engine behavior was changed). Priority score combines PGN " +
        "annotation severity (NAGs/glyphs/comments/variation hints) with " +
        "Coach-vs-reference disagreement severity when a reference engine " +
        "was provided."
    );
    lines.push("");

    return lines.join("\n");

}

//----------------------------------
// Main run
//----------------------------------

async function analyzeWithRestart(client, commandString, displayName, verbose, fen, goCommand, timeoutMs) {

    //----------------------------------
    // One retry with a fresh process: a crashed engine on
    // one position should not sink the rest of an
    // overnight run.
    //----------------------------------

    try {

        return {
            client,
            result: await client.analyze(fen, goCommand, timeoutMs)
        };

    }

    catch (firstError) {

        await client.dispose();

        const replacement =
            new UciEngineClient(commandString, displayName, verbose);

        await replacement.start();

        try {

            return {
                client: replacement,
                result: await replacement.analyze(fen, goCommand, timeoutMs)
            };

        }

        catch (secondError) {

            return {
                client: replacement,
                result: {
                    engine: displayName,
                    bestMove: null,
                    rawBestMove: null,
                    score: null,
                    depth: null,
                    nodes: null,
                    reportedTimeMs: null,
                    nps: null,
                    pv: [],
                    wallTimeMs: 0,
                    error: `${firstError.message}; retry also failed: ${secondError.message}`
                }
            };

        }

    }

}

async function main() {

    let options;

    try {
        options = validateOptions(parseCliArguments(process.argv.slice(2)));
    }
    catch (error) {
        console.error(`Error: ${error.message}\n`);
        console.error(usage());
        process.exitCode = 1;
        return;
    }

    if (options.help) {
        console.log(usage());
        return;
    }

    let positionsInput;
    let pgnSource = null;

    if (options.pgnFile) {

        let pgnText;

        try {
            pgnText = fs.readFileSync(options.pgnFile, "utf8");
        }
        catch (error) {
            console.error(`Error: could not read --pgn-file ${options.pgnFile}: ${error.message}`);
            process.exitCode = 1;
            return;
        }

        const games = parseMultiGamePgn(pgnText);

        if (games.length === 0) {
            console.error(`Error: ${options.pgnFile}: no games found in PGN file`);
            process.exitCode = 1;
            return;
        }

        //----------------------------------
        // --target-player resolves once, against every
        // distinct White/Black name in the file, and then
        // overrides --coach-side on a per-game basis for the
        // rest of this run: games the target does not appear
        // in are skipped entirely (not just filtered down to
        // zero candidates), and games it does appear in are
        // always analyzed from the target's own side(s).
        //----------------------------------

        let targetPlayerInfo = null;

        if (options.targetPlayer) {

            const resolution = resolveTargetPlayer(games, options.targetPlayer);

            if (resolution.error) {
                console.error(`Error: ${resolution.error}`);
                process.exitCode = 1;
                return;
            }

            if (resolution.message) {
                console.log(resolution.message);
            }

            targetPlayerInfo = {
                requested: options.targetPlayer,
                resolvedName: resolution.resolvedName,
                matchType: resolution.matchType
            };

            console.log(
                `Target player: "${targetPlayerInfo.resolvedName}" ` +
                `(${targetPlayerInfo.matchType} match) -- overriding --coach-side.`
            );

        }

        const allCandidates = [];
        const gameSummaries = [];

        //----------------------------------
        // Every game is parsed, replayed, and side-inferred
        // independently. A problem with one game (parse
        // failure, empty movetext, or a replay error on its
        // very first move) is recorded against that game only
        // and does not stop later games from being analyzed.
        //----------------------------------

        for (const game of games) {

            const gameLabel = `game ${game.gameIndex}`;

            const gameMeta = {
                gameIndex: game.gameIndex,
                event: game.headers.Event || null,
                site: game.headers.Site || null,
                date: game.headers.Date || null,
                round: game.headers.Round || null,
                white: game.headers.White || null,
                black: game.headers.Black || null,
                result: game.headers.Result || game.result || null,
                eco: game.headers.ECO || null
            };

            if (game.parseError) {

                console.log(`Warning: ${gameLabel}: parse error -- ${game.parseError}. Skipping.`);

                gameSummaries.push({
                    ...gameMeta,
                    parseError: game.parseError,
                    replayError: null,
                    repliedPlyCount: 0,
                    coachSide: null,
                    coachSideMessage: null,
                    candidateCount: 0,
                    targetSide: null
                });

                continue;

            }

            //----------------------------------
            // --target-player: skip this game entirely (no
            // replay attempted) if the resolved player is not
            // White or Black here. This is a distinct outcome
            // from a parse/replay error -- it is reported
            // separately in the report as "skipped, target
            // player not present".
            //----------------------------------

            let targetSide = null;

            if (targetPlayerInfo) {

                targetSide = targetSideForGame(game.headers, targetPlayerInfo.resolvedName);

                if (targetSide === null) {

                    console.log(
                        `${gameLabel}: target player "${targetPlayerInfo.resolvedName}" not present ` +
                        `(White="${gameMeta.white}", Black="${gameMeta.black}"). Skipping.`
                    );

                    gameSummaries.push({
                        ...gameMeta,
                        parseError: null,
                        replayError: null,
                        repliedPlyCount: 0,
                        coachSide: null,
                        coachSideMessage: null,
                        candidateCount: 0,
                        targetSide: null
                    });

                    continue;

                }

            }

            if (game.mainline.length === 0) {

                console.log(`Warning: ${gameLabel}: no moves found in PGN movetext. Skipping.`);

                gameSummaries.push({
                    ...gameMeta,
                    parseError: "no moves found in PGN movetext",
                    replayError: null,
                    repliedPlyCount: 0,
                    coachSide: null,
                    coachSideMessage: null,
                    candidateCount: 0,
                    targetSide
                });

                continue;

            }

            const startingFen =
                game.headers.SetUp === "1" && game.headers.FEN ? game.headers.FEN : null;

            const { replayed, replayError } =
                replayPgnMainline(game.mainline, startingFen);

            if (replayed.length === 0) {

                console.log(
                    `Warning: ${gameLabel}: replay failed on the first move ` +
                    `(${replayError}). Skipping.`
                );

                gameSummaries.push({
                    ...gameMeta,
                    parseError: null,
                    replayError,
                    repliedPlyCount: 0,
                    coachSide: null,
                    coachSideMessage: null,
                    candidateCount: 0,
                    targetSide
                });

                continue;

            }

            if (replayError) {

                console.log(
                    `Warning: ${gameLabel}: stopped replay early -- ${replayError}. ` +
                    `Continuing with the ${replayed.length} ply/plies replayed successfully.`
                );

            }

            let resolvedCoachSide;
            let coachSideMessage = null;

            if (targetPlayerInfo) {
                resolvedCoachSide = targetSide;
            }
            else {

                const inferred = inferCoachSide(game.headers, options.coachSide);

                resolvedCoachSide = inferred.side;
                coachSideMessage = inferred.message;

                if (coachSideMessage) {
                    console.log(`${gameLabel}: ${coachSideMessage}`);
                }

            }

            //----------------------------------
            // Per-game candidate selection is never capped
            // here -- --max-positions applies once, across the
            // whole file, after every game has contributed its
            // candidates in game order.
            //----------------------------------

            const gameCandidates = selectPgnCandidates(
                replayed,
                resolvedCoachSide,
                options.extractMode,
                options.maxPositionsPerGame,
                `game${game.gameIndex}-`,
                {
                    minMove: options.pgnMinMove,
                    maxMove: options.pgnMaxMove,
                    sampleEvery: options.pgnSampleEvery
                }
            );

            for (const candidate of gameCandidates) {
                candidate.pgn.game = gameMeta;
            }

            allCandidates.push(...gameCandidates);

            gameSummaries.push({
                ...gameMeta,
                parseError: null,
                replayError,
                repliedPlyCount: replayed.length,
                coachSide: resolvedCoachSide,
                coachSideMessage,
                candidateCount: gameCandidates.length,
                targetSide
            });

        }

        const totalCandidatesExtracted = allCandidates.length;

        positionsInput =
            options.maxPositions !== null
                ? allCandidates.slice(0, options.maxPositions)
                : allCandidates;

        if (positionsInput.length === 0) {

            console.error(
                `Error: ${options.pgnFile}: no candidate positions matched ` +
                (targetPlayerInfo
                    ? `--target-player "${targetPlayerInfo.resolvedName}" `
                    : `--coach-side ${options.coachSide} `) +
                `--extract ${options.extractMode} across ${games.length} game(s)`
            );
            process.exitCode = 1;
            return;

        }

        const gamesReplayed =
            gameSummaries.filter(summary => summary.repliedPlyCount > 0).length;

        const gamesWithErrors =
            gameSummaries.filter(summary =>
                summary.parseError !== null ||
                (summary.replayError !== null && summary.repliedPlyCount === 0)
            ).length;

        let targetPlayerSummary = null;

        if (targetPlayerInfo) {

            const gamesInvolvingTarget =
                gameSummaries.filter(summary => summary.targetSide !== null).length;

            const gamesSkippedNoTarget =
                gameSummaries.filter(summary =>
                    summary.targetSide === null && summary.parseError === null
                ).length;

            targetPlayerSummary = {
                requested: targetPlayerInfo.requested,
                resolvedName: targetPlayerInfo.resolvedName,
                matchType: targetPlayerInfo.matchType,
                gamesScanned: games.length,
                gamesInvolvingTarget,
                gamesSkippedNoTarget
            };

        }

        pgnSource = {
            pgnFile: options.pgnFile,
            coachSide: options.coachSide,
            extractMode: options.extractMode,
            totalGames: games.length,
            gamesReplayed,
            gamesWithErrors,
            totalCandidatesExtracted,
            totalCandidatesAnalyzed: positionsInput.length,
            targetPlayer: targetPlayerSummary,
            games: gameSummaries
        };

        console.log(
            `Parsed ${games.length} game(s) from ${options.pgnFile}; ` +
            `${gamesReplayed} replayed successfully, ${gamesWithErrors} with errors; ` +
            `extracted ${totalCandidatesExtracted} candidate position(s)` +
            (options.maxPositions !== null && totalCandidatesExtracted > positionsInput.length
                ? `, capped to ${positionsInput.length} by --max-positions`
                : "") +
            "."
        );

        if (targetPlayerSummary) {

            console.log(
                `Target player "${targetPlayerSummary.resolvedName}": ` +
                `${targetPlayerSummary.gamesInvolvingTarget}/${targetPlayerSummary.gamesScanned} ` +
                `games involved this player, ${targetPlayerSummary.gamesSkippedNoTarget} skipped.`
            );

        }

    }
    else {

        positionsInput = options.fenFile
            ? readFenFile(options.fenFile)
            : [{
                label: options.label || "cli-fen",
                fen: options.fen.trim()
            }];

        if (!options.fenFile && !looksLikeFen(positionsInput[0].fen)) {
            console.error(`Error: --fen value does not look like a FEN: "${positionsInput[0].fen}"`);
            process.exitCode = 1;
            return;
        }

    }

    const positionsToRun =
        options.limit !== null
            ? positionsInput.slice(0, options.limit)
            : positionsInput;

    const goCommand =
        options.depth !== null
            ? `go depth ${options.depth}`
            : `go movetime ${options.movetimeMs}`;

    console.log(`Coach Analysis Lab v1.3`);
    console.log(`Positions: ${positionsToRun.length}  |  ${goCommand}  |  reference: ${options.referenceCommand ? "yes" : "no (Coach-only)"}`);

    //----------------------------------
    // Start engines. Handshake failures are fatal and
    // reported clearly before any position is analyzed.
    //----------------------------------

    let coachClient =
        new UciEngineClient(options.coachCommand, "coach", options.verbose);

    let referenceClient = null;

    try {
        await coachClient.start();
    }
    catch (error) {
        console.error(`Coach engine failed to start: ${error.message}`);
        process.exitCode = 1;
        return;
    }

    if (options.referenceCommand) {

        referenceClient =
            new UciEngineClient(options.referenceCommand, "reference", options.verbose);

        try {
            await referenceClient.start();
        }
        catch (error) {
            console.error(`Reference engine failed to start: ${error.message}`);
            await coachClient.dispose();
            process.exitCode = 1;
            return;
        }

    }

    const startedAt = new Date();
    const positions = [];

    try {

        for (const [index, entry] of positionsToRun.entries()) {

            process.stdout.write(
                `[${index + 1}/${positionsToRun.length}] ${entry.label} ... `
            );

            const coachRun = await analyzeWithRestart(
                coachClient,
                options.coachCommand,
                "coach",
                options.verbose,
                entry.fen,
                goCommand,
                options.timeoutMs
            );

            coachClient = coachRun.client;
            const coachResult = coachRun.result;

            let referenceResult = null;

            if (referenceClient) {

                const referenceRun = await analyzeWithRestart(
                    referenceClient,
                    options.referenceCommand,
                    "reference",
                    options.verbose,
                    entry.fen,
                    goCommand,
                    options.timeoutMs
                );

                referenceClient = referenceRun.client;
                referenceResult = referenceRun.result;

            }

            if (coachResult.error) {

                positions.push({
                    label: entry.label,
                    fen: entry.fen,
                    pgn: entry.pgn || null,
                    sideToMove: entry.fen.split(/\s+/)[1] || "?",
                    error: coachResult.error,
                    coach: coachResult,
                    reference: referenceResult,
                    comparison: null,
                    themes: [],
                    priority: "n/a (error)"
                });

                console.log("ERROR");
                continue;

            }

            const features = fenFeatures(entry.fen);

            const comparison =
                compareResults(coachResult, referenceResult, features.sideToMove);

            const baseThemes =
                themeTags(features, comparison, coachResult, referenceResult);

            const themes = entry.pgn
                ? [...new Set([...baseThemes, ...pgnThemeHints(entry.pgn)])]
                : baseThemes;

            const record = {
                label: entry.label,
                fen: entry.fen,
                pgn: entry.pgn || null,
                sideToMove: features.sideToMove,
                error: null,
                coach: coachResult,
                reference:
                    referenceResult && !referenceResult.error
                        ? referenceResult
                        : referenceResult,
                comparison,
                themes,
                priority: followUpPriority(comparison)
            };

            positions.push(record);

            const status = comparison
                ? `coach ${coachResult.bestMove} (${formatScore(coachResult.score)}) vs ref ${referenceResult.bestMove} (${formatScore(referenceResult.score)}) diff ${comparison.evalDiffCp ?? "n/a"}cp`
                : `${coachResult.bestMove} (${formatScore(coachResult.score)}, depth ${coachResult.depth ?? "n/a"})`;

            console.log(status);

        }

    }

    finally {

        await coachClient.dispose();

        if (referenceClient) {
            await referenceClient.dispose();
        }

    }

    //----------------------------------
    // Write outputs
    //----------------------------------

    const run = {
        tool: "coach-analysis-lab",
        version: pgnSource ? "1.3" : 1,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        coachEngineName: coachClient.idName,
        referenceEngineName:
            referenceClient ? referenceClient.idName : null,
        settings: {
            coachCommand: options.coachCommand,
            referenceCommand: options.referenceCommand,
            movetimeMs: options.movetimeMs,
            depth: options.depth,
            timeoutMs: options.timeoutMs,
            fenFile: options.fenFile,
            pgnFile: options.pgnFile,
            coachSide: options.coachSide,
            extractMode: options.extractMode,
            maxPositions: options.maxPositions,
            maxPositionsPerGame: options.maxPositionsPerGame,
            pgnMinMove: options.pgnMinMove,
            pgnMaxMove: options.pgnMaxMove,
            pgnSampleEvery: options.pgnSampleEvery,
            limit: options.limit
        },
        pgnSource,
        summary: buildSummary(positions),
        positions
    };

    const runDirectory =
        path.join(options.outDir, runTimestamp(startedAt));

    fs.mkdirSync(runDirectory, { recursive: true });

    const jsonPath = path.join(runDirectory, "results.json");
    const reportPath = path.join(runDirectory, "report.md");

    fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2) + "\n");
    fs.writeFileSync(reportPath, buildMarkdownReport(run));

    console.log("");
    console.log(`Results: ${jsonPath}`);
    console.log(`Report:  ${reportPath}`);

    if (pgnSource) {

        const candidateFensPath =
            path.join(runDirectory, "candidate-regressions.fens");

        const candidateMdPath =
            path.join(runDirectory, "candidate-regressions.md");

        const rankedPositions = [...positions]
            .filter(position => !position.error && position.pgn)
            .sort(
                (a, b) => combinedPriorityScore(b) - combinedPriorityScore(a)
            );

        fs.writeFileSync(
            candidateFensPath,
            buildCandidateRegressionsFens(rankedPositions)
        );

        fs.writeFileSync(
            candidateMdPath,
            buildCandidateRegressionsMarkdown(run)
        );

        console.log(`Candidates (fens): ${candidateFensPath}`);
        console.log(`Candidates (md):   ${candidateMdPath}`);

    }

    if (run.summary.failed > 0) {
        console.log(`Warning: ${run.summary.failed} position(s) failed; see report.`);
    }

}

main().catch(error => {
    console.error(`Fatal: ${error.message}`);
    process.exitCode = 1;
});
