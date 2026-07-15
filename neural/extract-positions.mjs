#!/usr/bin/env node
//======================================================
// extract-positions.mjs
// PGN files -> unique, sampled, split, Coach-evaluated
// position records (JSONL). No Stockfish here.
//
// Usage:
//   node extract-positions.mjs <pgn...> --out positions.jsonl
//        [--config config.json] [--skip-first N] [--every N]
//        [--max-per-game N] [--seed N] [--include-terminal]
//        [--exclude-in-check] [--limit-games N] [--source-root DIR]
//
// Provenance: each record's `source` carries a human-readable basename
// (`file`), a STABLE UNIQUE source id (`id`), the per-file `gameIndex`, the
// content-derived `gameKey` (authoritative game identity for split leakage),
// and `ply`. `id` is the path relative to --source-root (normalized to `/`)
// when the input is under that root, else "<parentDir>/<basename>". This makes
// two different inputs that share a basename distinguishable. No absolute path
// or username is stored. If two inputs resolve to the same id, extraction fails.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { loadCoach } from "./lib/coach.mjs";
import { readPgnFile } from "./lib/pgn-reader.mjs";
import { replayGame } from "./lib/replay.mjs";
import { sampleFrames, DEFAULT_SAMPLING } from "./lib/sampling.mjs";
import { assignSplit, gameKey, DEFAULT_SPLIT } from "./lib/splits.mjs";
import { positionIdentity, materialSignature, gamePhase } from "./lib/position.mjs";
import { AppendWriter, writeJson } from "./lib/jsonl.mjs";

function parseArgs(argv) {
    const a = { pgns: [], out: null, config: null, overrides: {}, limitGames: null, sourceRoot: null };
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === "--out") a.out = argv[++i];
        else if (t === "--config") a.config = argv[++i];
        else if (t === "--source-root") a.sourceRoot = argv[++i];
        else if (t === "--skip-first") a.overrides.skipFirstPlies = Number(argv[++i]);
        else if (t === "--every") a.overrides.sampleEveryPlies = Number(argv[++i]);
        else if (t === "--max-per-game") a.overrides.maxPositionsPerGame = Number(argv[++i]);
        else if (t === "--seed") a.overrides.seed = Number(argv[++i]);
        else if (t === "--include-terminal") a.overrides.includeTerminal = true;
        else if (t === "--exclude-in-check") a.overrides.includeInCheck = false;
        else if (t === "--limit-games") a.limitGames = Number(argv[++i]);
        else if (t.startsWith("--")) throw new Error("unknown flag " + t);
        else a.pgns.push(t);
    }
    if (!a.pgns.length) throw new Error("no PGN input paths given");
    if (!a.out) throw new Error("--out required");
    return a;
}

// Normalize any path separators to "/".
export function normalizeSep(p) { return String(p).split("\\").join("/"); }

// Stable, unique, human-readable source id. Relative to sourceRoot when the
// input lives under it (no absolute path / username stored), else the last two
// path segments ("<parentDir>/<basename>"). Always "/"-normalized.
export function sourceIdFor(pgnPath, sourceRoot) {
    if (sourceRoot) {
        const rel = path.relative(sourceRoot, pgnPath);
        if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return normalizeSep(rel);
    }
    const base = path.basename(pgnPath);
    const parent = path.basename(path.dirname(pgnPath));
    return normalizeSep(parent ? parent + "/" + base : base);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cfg = args.config ? JSON.parse(fs.readFileSync(args.config, "utf8")) : {};
    const sampling = { ...DEFAULT_SAMPLING, ...(cfg.sampling || {}), ...args.overrides };
    const split = { ...DEFAULT_SPLIT, ...(cfg.split || {}) };
    const caps = cfg.caps || {};

    const coach = await loadCoach();
    const writer = new AppendWriter(args.out);

    const stats = {
        files: [], gamesRead: 0, gamesFailed: 0, positionsSampled: 0,
        duplicatesRemoved: 0, uniqueRetained: 0, capped: 0,
        splits: { train: 0, val: 0, test: 0 },
        errors: [],
    };
    const seenKeys = new Set();
    const phaseCount = { opening: 0, middlegame: 0, endgame: 0 };
    const materialCount = new Map();

    // Precompute unique source ids and fail fast on ambiguous provenance.
    const idFor = new Map();
    const idsSeen = new Map();
    for (const pgnPath of args.pgns) {
        const sid = sourceIdFor(pgnPath, args.sourceRoot);
        if (idsSeen.has(sid) && idsSeen.get(sid) !== pgnPath) {
            throw new Error(`ambiguous source id "${sid}" for both "${idsSeen.get(sid)}" and "${pgnPath}" — pass --source-root or rename inputs`);
        }
        idsSeen.set(sid, pgnPath);
        idFor.set(pgnPath, sid);
    }

    for (const pgnPath of args.pgns) {
        let games;
        try { games = readPgnFile(pgnPath); }
        catch (e) { stats.errors.push({ file: pgnPath, error: e.message }); continue; }
        const base = path.basename(pgnPath);
        const srcId = idFor.get(pgnPath);
        stats.files.push({ file: base, id: srcId, games: games.length });

        for (const game of games) {
            if (args.limitGames && stats.gamesRead >= args.limitGames) break;
            stats.gamesRead++;
            const gk = gameKey(game);
            const sp = assignSplit(game, split);
            let rep;
            try { rep = replayGame(coach, game); }
            catch (e) { stats.gamesFailed++; stats.errors.push({ file: base, id: srcId, gameIndex: game.index, error: e.message }); continue; }
            if (rep.error) stats.errors.push({ file: base, id: srcId, gameIndex: game.index, ...rep.error });

            const chosen = sampleFrames(rep.frames, gk, sampling);
            for (const frame of chosen) {
                stats.positionsSampled++;
                const core = coach.createEngineCore(frame.fen);
                const { key, canonicalFen } = positionIdentity(core, coach.FEN, coach.MoveFlags);
                if (seenKeys.has(key)) { stats.duplicatesRemoved++; continue; }

                const phase = gamePhase(canonicalFen);
                const matSig = materialSignature(canonicalFen.split(/\s+/)[0]);

                if (caps.perPhase && caps.perPhase[phase] &&
                    phaseCount[phase] >= caps.perPhase[phase]) { stats.capped++; continue; }
                if (caps.maxDuplicateMaterial &&
                    (materialCount.get(matSig) || 0) >= caps.maxDuplicateMaterial) { stats.capped++; continue; }

                seenKeys.add(key);
                stats.uniqueRetained++;
                stats.splits[sp]++;
                phaseCount[phase]++;
                materialCount.set(matSig, (materialCount.get(matSig) || 0) + 1);

                writer.append({
                    fen: canonicalFen,
                    positionKey: key,
                    source: { file: base, id: srcId, gameIndex: game.index, gameKey: gk, ply: frame.ply },
                    sideToMove: frame.sideToMove,
                    gamePhase: phase,
                    materialSignature: matSig,
                    result: rep.result,
                    inCheck: frame.inCheck,
                    coachClassicalCpWhite: core.evaluation.evaluate().total,
                    split: sp,
                }, 200);
            }
            if (args.limitGames && stats.gamesRead >= args.limitGames) break;
        }
    }
    writer.close();
    writeJson(args.out.replace(/\.jsonl$/, "") + ".extract-summary.json", { config: { sampling, split, caps }, stats, phaseCount });

    console.log("== extraction ==");
    console.log("games read:      ", stats.gamesRead);
    console.log("positions sampled:", stats.positionsSampled);
    console.log("duplicates removed:", stats.duplicatesRemoved);
    console.log("capped:          ", stats.capped);
    console.log("unique retained: ", stats.uniqueRetained);
    console.log("splits:          ", stats.splits);
    console.log("phase:           ", phaseCount);
    if (stats.errors.length) console.log("errors:", stats.errors.length, "(see summary json)");
    console.log("out:", args.out);
}

// Only run as a CLI, not when imported (e.g. by the test suite).
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
