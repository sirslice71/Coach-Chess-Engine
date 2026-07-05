#!/usr/bin/env node

//----------------------------------
// Coach Analysis Lab v1
//
// Diagnostic tool only. Runs Coach (and optionally a
// stronger reference UCI engine such as Stockfish) over a
// set of FEN positions and reports where they disagree
// most, so overnight runs produce concrete engineering
// targets in the morning.
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
//
// FEN file format: one position per line.
//   - Blank lines and lines starting with # are ignored.
//   - Optional label:   label | fen
//
// Output: analysis-runs/YYYYMMDD-HHMMSS/results.json and
// report.md (directory configurable via --out).
//
// Coach-only mode (no --stockfish) still produces a useful
// per-position report; comparison fields are simply absent.
//----------------------------------

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

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
// CLI parsing
//----------------------------------

function usage() {

    return [
        "Coach Analysis Lab v1",
        "",
        "Required (one of):",
        "  --fen-file <path>     File with one FEN per line ('label | fen' and # comments allowed)",
        "  --fen \"<fen>\"         Analyze a single FEN",
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
        label: null,
        coachCommand: "node uci.js",
        referenceCommand: null,
        movetimeMs: null,
        depth: null,
        limit: null,
        outDir: "analysis-runs",
        timeoutMs: null,
        verbose: false,
        help: false
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

    if (!options.fenFile && !options.fen) {
        throw new Error("Provide --fen-file <path> or --fen \"<fen>\" (see --help)");
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
// Both engines report side-to-move-relative scores for the
// same position, so they are directly comparable once
// "score mate N" is mapped into the same numeric range
// Coach already uses for mates (+/- ~100000). isMate is
// tracked so mate-class scores are excluded from centipawn
// averaging and flagged separately.
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
// Coach vs reference comparison. Scores are side-to-move
// relative for the same position, so a positive evalDiffCp
// means Coach is more optimistic about the side to move
// than the reference engine is.
//----------------------------------

function compareResults(coachResult, referenceResult) {

    if (!referenceResult || referenceResult.error) {
        return null;
    }

    const coachScore = coachResult.score;
    const referenceScore = referenceResult.score;

    const bothScored =
        coachScore !== null && referenceScore !== null;

    const evalDiffCp =
        bothScored ? coachScore.cp - referenceScore.cp : null;

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

    const mateDisagreement =
        bothScored &&
        (coachScore.isMate !== referenceScore.isMate ||
            (coachScore.isMate &&
                referenceScore.isMate &&
                Math.sign(coachScore.cp) !== Math.sign(referenceScore.cp)));

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
    // mate-level disagreement add fixed penalties.
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
        severity
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
            `score ${formatScore(position.coach.score)}, ` +
            `depth ${position.coach.depth ?? "n/a"}, ` +
            `nodes ${position.coach.nodes ?? "n/a"}, ` +
            `time ${position.coach.wallTimeMs}ms, ` +
            `pv \`${formatPv(position.coach.pv)}\``
        );

        if (position.reference) {

            lines.push(
                `- Reference: **${position.reference.bestMove ?? "none"}** ` +
                `score ${formatScore(position.reference.score)}, ` +
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
                `| ${formatScore(position.coach.score)} ` +
                `| ${position.coach.depth ?? "-"} ` +
                `| ${position.reference ? position.reference.bestMove ?? "-" : "-"} ` +
                `| ${position.reference ? formatScore(position.reference.score) : "-"} ` +
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
                `| ${formatScore(position.coach.score)} ` +
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
        "no engine behavior was changed). Scores are side-to-move relative " +
        "centipawns; mate-class scores use Coach's +/-100000 convention."
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

    const positionsInput = options.fenFile
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

    const positionsToRun =
        options.limit !== null
            ? positionsInput.slice(0, options.limit)
            : positionsInput;

    const goCommand =
        options.depth !== null
            ? `go depth ${options.depth}`
            : `go movetime ${options.movetimeMs}`;

    console.log(`Coach Analysis Lab v1`);
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
                compareResults(coachResult, referenceResult);

            const themes =
                themeTags(features, comparison, coachResult, referenceResult);

            const record = {
                label: entry.label,
                fen: entry.fen,
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
        version: 1,
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
            limit: options.limit
        },
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

    if (run.summary.failed > 0) {
        console.log(`Warning: ${run.summary.failed} position(s) failed; see report.`);
    }

}

main().catch(error => {
    console.error(`Fatal: ${error.message}`);
    process.exitCode = 1;
});
