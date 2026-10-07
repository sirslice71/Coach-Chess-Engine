#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import FEN from "../js/core/fen.js";

const DEFAULT_REPO = process.cwd();
const DEFAULT_REFERENCE = "<USERPROFILE>\\Downloads\\stockfish-windows-x86-64-universal.exe";
const HANDSHAKE_TIMEOUT_MS = 10000;
const MATE_THRESHOLD = 90000;
const MATE_CP_BASE = 100000;

function usage() {
    console.error(
        "Usage: node tools/verify-external-child-search.mjs " +
        "--analysis <coach-analysis-lab results.json> [--reference <stockfish.exe>] " +
        "[--repo <Coach repo>] [--depth 10] [--max-positions <n>] " +
        "[--min-diff <cp>] [--min-gap <cp>] [--timeout <ms>] " +
        "[--include-mate] [--out <dir>]"
    );
}

function parseArgs(argv) {
    const args = {
        repo: DEFAULT_REPO,
        analysis: null,
        reference: DEFAULT_REFERENCE,
        depth: 10,
        maxPositions: 40,
        minDiff: 150,
        minGap: 100,
        timeoutMs: 90000,
        includeMate: false,
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--repo") {
            args.repo = argv[++index];
        }
        else if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--reference") {
            args.reference = argv[++index];
        }
        else if (token === "--depth") {
            args.depth = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-positions") {
            args.maxPositions = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--min-gap") {
            args.minGap = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--timeout") {
            args.timeoutMs = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--include-mate") {
            args.includeMate = true;
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.analysis) {
        throw new Error("Missing --analysis");
    }

    for (const [name, value] of [
        ["--depth", args.depth],
        ["--max-positions", args.maxPositions],
        ["--min-diff", args.minDiff],
        ["--min-gap", args.minGap],
        ["--timeout", args.timeoutMs]
    ]) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${name} must be a positive integer`);
        }
    }

    return args;
}

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

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sideToMove(fen) {
    return fen.trim().split(/\s+/)[1];
}

function absoluteDiff(position) {
    const diff = position.comparison?.evalDiffCp;
    return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function isMateScore(score) {
    return Boolean(score?.isMate) || Math.abs(score?.cp ?? 0) >= MATE_THRESHOLD;
}

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
        pv: null
    };

    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];

        if (token === "depth") {
            info.depth = Number.parseInt(tokens[++index], 10);
        }
        else if (token === "nodes") {
            info.nodes = Number.parseInt(tokens[++index], 10);
        }
        else if (token === "time") {
            info.timeMs = Number.parseInt(tokens[++index], 10);
        }
        else if (token === "score") {
            const kind = tokens[++index];
            const value = Number.parseInt(tokens[++index], 10);

            if (kind === "cp") {
                info.scoreCp = value;
            }
            else if (kind === "mate") {
                info.scoreMate = value;
            }

            if (
                tokens[index + 1] === "lowerbound" ||
                tokens[index + 1] === "upperbound"
            ) {
                info.bound = tokens[++index];
            }
        }
        else if (token === "pv") {
            info.pv = tokens.slice(index + 1);
            index = tokens.length;
        }
    }

    return (
        info.depth !== null ||
        info.scoreCp !== null ||
        info.scoreMate !== null ||
        info.pv !== null
    )
        ? info
        : null;
}

function pickFinalInfo(infos) {
    const hasScore = info =>
        info.scoreCp !== null || info.scoreMate !== null;
    const exactWithPv =
        infos.filter(info => hasScore(info) && info.pv && info.bound === null);

    if (exactWithPv.length > 0) {
        return exactWithPv.at(-1);
    }

    const scored = infos.filter(hasScore);
    return scored.length > 0 ? scored.at(-1) : infos.at(-1) || null;
}

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
            isMate: Math.abs(info.scoreCp) >= MATE_THRESHOLD,
            mateIn: null
        };
    }

    return null;
}

function sideScoreToWhiteCp(scoreCp, fenSideToMove) {
    return fenSideToMove === "b" ? -scoreCp : scoreCp;
}

function whiteCpToRootSideCp(whiteCp, rootSideToMove) {
    return rootSideToMove === "b" ? -whiteCp : whiteCp;
}

function scoreToRootSideCp(score, childFen, rootFen) {
    if (!score) {
        return null;
    }

    const whiteCp =
        sideScoreToWhiteCp(score.cp, sideToMove(childFen));

    return whiteCpToRootSideCp(whiteCp, sideToMove(rootFen));
}

class UciClient {
    constructor(commandString) {
        this.commandString = commandString;
        this.child = null;
        this.idName = null;
        this.exited = false;
        this.pendingWaits = [];
        this.lineListeners = [];
        this.stderrTail = [];
    }

    async start() {
        const tokens = tokenizeCommand(this.commandString);

        this.child = spawn(tokens[0], tokens.slice(1), {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
        });

        this.child.on("error", error => {
            this.failAllWaits(new Error(`reference failed to start: ${error.message}`));
        });

        this.child.on("exit", (code, signal) => {
            this.exited = true;
            this.failAllWaits(
                new Error(
                    `reference exited unexpectedly (code ${code}, signal ${signal})` +
                    this.stderrSuffix()
                )
            );
        });

        this.child.stderr.on("data", chunk => {
            this.stderrTail.push(chunk.toString());

            if (this.stderrTail.length > 20) {
                this.stderrTail.shift();
            }
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
                "uciok"
            );
            this.send("isready");
            await this.waitForLine(
                line => line.trim() === "readyok",
                HANDSHAKE_TIMEOUT_MS,
                "readyok"
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
        if (line.startsWith("id name ") && !this.idName) {
            this.idName = line.slice("id name ".length).trim();
        }

        for (const listener of this.lineListeners) {
            listener(line);
        }

        for (let index = this.pendingWaits.length - 1; index >= 0; index -= 1) {
            const wait = this.pendingWaits[index];

            if (wait.predicate(line)) {
                this.pendingWaits.splice(index, 1);
                clearTimeout(wait.timer);
                wait.resolve(line);
            }
        }
    }

    send(command) {
        if (this.exited || !this.child || !this.child.stdin.writable) {
            throw new Error(`reference is not running; cannot send "${command}"`);
        }

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
                        `reference timed out after ${timeoutMs}ms waiting for ${description}` +
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

    async analyze(fen, depth, timeoutMs) {
        const infos = [];
        const collector = line => {
            const info = parseInfoLine(line);

            if (info) {
                infos.push(info);
            }
        };

        this.lineListeners.push(collector);

        try {
            this.send("ucinewgame");
            this.send(`position fen ${fen}`);
            this.send("isready");
            await this.waitForLine(
                line => line.trim() === "readyok",
                HANDSHAKE_TIMEOUT_MS,
                "readyok after position"
            );
            this.send(`go depth ${depth}`);
            const bestmoveLine = await this.waitForLine(
                line => line.startsWith("bestmove"),
                timeoutMs,
                `bestmove after go depth ${depth}`
            );
            const finalInfo = pickFinalInfo(infos);
            const bestMove = bestmoveLine.trim().split(/\s+/)[1] || null;

            return {
                engine: this.idName || "reference",
                bestMove: bestMove === "0000" ? null : bestMove,
                score: normalizeScore(finalInfo),
                depth: finalInfo?.depth ?? null,
                nodes: finalInfo?.nodes ?? null,
                timeMs: finalInfo?.timeMs ?? null,
                pv: finalInfo?.pv ?? [],
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

    async dispose() {
        if (!this.child || this.exited) {
            return;
        }

        const child = this.child;
        const exitPromise = new Promise(resolve => child.once("exit", resolve));

        try {
            this.send("quit");
        }
        catch {
            // The process is already gone or wedged; kill below.
        }

        const timeoutPromise =
            new Promise(resolve => setTimeout(resolve, 1000, "timeout"));
        const result = await Promise.race([exitPromise, timeoutPromise]);

        if (result === "timeout" && !this.exited) {
            child.kill();
        }
    }
}

function inputRows(analysis, args) {
    return (analysis.positions || [])
        .filter(position =>
            !position.error &&
            position.coach?.bestMove &&
            position.reference?.bestMove &&
            position.comparison?.bestMoveAgree === false
        )
        .map(position => ({
            position,
            diffCp: absoluteDiff(position)
        }))
        .filter(row =>
            row.diffCp !== null &&
            row.diffCp >= args.minDiff &&
            (
                args.includeMate ||
                (
                    !isMateScore(row.position.coach?.score) &&
                    !isMateScore(row.position.reference?.score)
                )
            )
        )
        .sort((left, right) => right.diffCp - left.diffCp)
        .slice(0, args.maxPositions);
}

function makeChildFen(uciModule, fen, moveUci) {
    const engine = uciModule.createEngineCore(fen);
    const legalMoves = engine.legalMoveGenerator.generateMoves();
    const move = uciModule.uciToMove(moveUci, legalMoves);

    if (!move) {
        return {
            legal: false,
            move: moveUci,
            error: "illegal-move",
            fen: null
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

function classify(args, item) {
    const reasons = [];

    if (!item.coachChild.legal) {
        reasons.push("coach-move-illegal");
    }

    if (!item.referenceChild.legal) {
        reasons.push("reference-move-illegal");
    }

    if (item.coachExternal.error) {
        reasons.push(`coach-external-error:${item.coachExternal.error}`);
    }

    if (item.referenceExternal.error) {
        reasons.push(`reference-external-error:${item.referenceExternal.error}`);
    }

    if (!args.includeMate) {
        if (isMateScore(item.coachExternal.score)) {
            reasons.push("coach-external-mate");
        }

        if (isMateScore(item.referenceExternal.score)) {
            reasons.push("reference-external-mate");
        }
    }

    if (item.gapCp === null || item.gapCp < args.minGap) {
        reasons.push(`external-gap<${args.minGap}`);
    }

    return {
        keep: reasons.length === 0,
        reasons
    };
}

async function safeAnalyze(reference, fen, args) {
    try {
        return await reference.analyze(fen, args.depth, args.timeoutMs);
    }
    catch (error) {
        return {
            engine: reference.idName || "reference",
            bestMove: null,
            score: null,
            depth: null,
            nodes: null,
            timeMs: null,
            pv: [],
            error: error.message
        };
    }
}

async function analyzeRow(row, args, uciModule, reference) {
    const { position, diffCp } = row;
    const coachMove = position.coach.bestMove;
    const referenceMove = position.reference.bestMove;
    const coachChild = makeChildFen(uciModule, position.fen, coachMove);
    const referenceChild = makeChildFen(uciModule, position.fen, referenceMove);
    const coachExternal = coachChild.legal
        ? await safeAnalyze(reference, coachChild.fen, args)
        : { error: "illegal-move", score: null };
    const referenceExternal = referenceChild.legal
        ? await safeAnalyze(reference, referenceChild.fen, args)
        : { error: "illegal-move", score: null };
    const coachRootSideScore =
        coachChild.legal
            ? scoreToRootSideCp(coachExternal.score, coachChild.fen, position.fen)
            : null;
    const referenceRootSideScore =
        referenceChild.legal
            ? scoreToRootSideCp(referenceExternal.score, referenceChild.fen, position.fen)
            : null;
    const gapCp =
        Number.isFinite(coachRootSideScore) &&
        Number.isFinite(referenceRootSideScore)
            ? referenceRootSideScore - coachRootSideScore
            : null;
    const item = {
        label: position.label,
        fen: position.fen,
        diffCp,
        coachMove,
        referenceMove,
        coachScore: position.coach.score ?? null,
        referenceScore: position.reference.score ?? null,
        coachChild,
        referenceChild,
        coachExternal: {
            ...coachExternal,
            rootSideScore: coachRootSideScore
        },
        referenceExternal: {
            ...referenceExternal,
            rootSideScore: referenceRootSideScore
        },
        gapCp
    };
    const classification = classify(args, item);

    return {
        ...item,
        keep: classification.keep,
        reasons: classification.reasons,
        score: (gapCp ?? -10000) * 4 + diffCp
    };
}

function countsBy(items, keyFn) {
    return items.reduce((counts, item) => {
        const key = keyFn(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function formatCounts(counts) {
    return Object.entries(counts)
        .map(([key, count]) => `${key}=${count}`)
        .join(", ");
}

function scoreText(score) {
    if (!score) {
        return "n/a";
    }

    if (score.isMate) {
        return score.mateIn === null
            ? `mate-class ${score.cp}`
            : `mate ${score.mateIn}`;
    }

    return `${score.cp}cp`;
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function buildMarkdown(args, payload) {
    const lines = [
        "# External Reference Child-Search Verifier",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Reference: \`${args.reference}\``,
        `- Depth: ${args.depth}`,
        `- Max positions: ${args.maxPositions}`,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Minimum external child gap: ${args.minGap}cp`,
        `- Include mate-class child scores: ${args.includeMate ? "yes" : "no"}`,
        `- Candidates: ${payload.summary.candidates}`,
        `- Audited: ${payload.summary.audited}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        "",
        "| Keep | Label | Diff | Coach | SF child | Ref | SF child | Gap | Reasons | FEN |",
        "| --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- | --- |"
    ];

    for (const item of payload.rows) {
        lines.push([
            item.keep ? "yes" : "no",
            escapeMarkdown(item.label),
            item.diffCp,
            `${item.coachMove} ${scoreText(item.coachScore)}`,
            item.coachExternal.rootSideScore ?? "",
            `${item.referenceMove} ${scoreText(item.referenceScore)}`,
            item.referenceExternal.rootSideScore ?? "",
            item.gapCp ?? "",
            escapeMarkdown(item.reasons.join(", ")),
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = path.resolve(args.repo);
    const analysis = readJson(args.analysis);
    const rows = inputRows(analysis, args);
    const uciModule = await import(
        pathToFileURL(path.join(repo, "js/uci/uciengine.js")).href
    );
    const reference = new UciClient(args.reference);
    const verified = [];

    await reference.start();

    try {
        for (const [index, row] of rows.entries()) {
            console.error(
                `[${index + 1}/${rows.length}] ${row.position.label} ` +
                `diff=${row.diffCp}cp`
            );
            verified.push(await analyzeRow(row, args, uciModule, reference));
        }
    }
    finally {
        await reference.dispose();
    }

    verified.sort((left, right) => {
        if (left.keep !== right.keep) {
            return left.keep ? -1 : 1;
        }

        return right.score - left.score;
    });

    const rejectionCounts = countsBy(
        verified.flatMap(item => item.reasons),
        reason => reason
    );
    const payload = {
        args,
        summary: {
            inputPositions: rows.length,
            audited: verified.length,
            candidates: verified.filter(item => item.keep).length,
            rejectionCounts
        },
        rows: verified
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "external-child-search.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "external-child-search.md"),
            buildMarkdown(args, payload)
        );
    }

    console.log(
        `Verified ${payload.summary.audited} position(s), ` +
        `${payload.summary.candidates} external candidate(s).`
    );

    for (const item of verified.slice(0, 10)) {
        console.log(
            `${item.keep ? "KEEP" : "skip"} ${item.label}: ` +
            `externalGap=${item.gapCp ?? "n/a"}cp, ` +
            `${item.coachMove} vs ${item.referenceMove}`
        );
    }
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(error => {
        usage();
        console.error(error.stack || error.message);
        process.exit(1);
    });
}

export {
    classify,
    parseArgs,
    scoreToRootSideCp,
    sideScoreToWhiteCp,
    whiteCpToRootSideCp
};
