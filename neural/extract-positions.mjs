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
//        [--sources manifest.json] [--include-abnormal]
//
// Provenance: each record's `source` carries a human-readable basename
// (`file`), a STABLE UNIQUE source id (`id`), the per-file `gameIndex`, the
// content-derived `gameKey` (authoritative game identity for split leakage),
// and `ply`. `id` is the path relative to --source-root (normalized to `/`)
// when the input is under that root, else "<parentDir>/<basename>". This makes
// two different inputs that share a basename distinguishable. No absolute path
// or username is stored. If two inputs resolve to the same id, extraction fails.
//
// --sources manifest.json assigns SEMANTIC source ids and per-source metadata
// (opponent, time control, book, engine strength). Shape:
//   { "sources": [ { "path": "C:\\...\\a.pgn", "id": "shallowblue-1s-part1",
//                    "meta": { "opponent": "Shallowblue", "timeControl": "1s/move" } } ] }
// Record identity stays lean (`source.id`); the meta map is written to the
// extract summary keyed by id, so no machine-specific path enters the records.
//
// PGN validation: games whose [Termination] tag is present and NOT "normal"
// (e.g. "abandoned" from a disconnect, "time forfeit", "illegal move") are
// EXCLUDED by default and counted per source. CuteChess only emits Termination
// for abnormal endings, so an absent tag means a normally-finished game. Use
// --include-abnormal to keep them.
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
    const a = { pgns: [], out: null, config: null, overrides: {}, limitGames: null, sourceRoot: null,
        sources: null, includeAbnormal: false };
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === "--out") a.out = argv[++i];
        else if (t === "--config") a.config = argv[++i];
        else if (t === "--source-root") a.sourceRoot = argv[++i];
        else if (t === "--sources") a.sources = argv[++i];
        else if (t === "--include-abnormal") a.includeAbnormal = true;
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
    if (!a.pgns.length && !a.sources) throw new Error("no PGN input paths given (pass paths or --sources manifest.json)");
    if (!a.out) throw new Error("--out required");
    return a;
}

// PGN validation: CuteChess writes [Termination] only for ABNORMAL endings
// (abandoned/disconnect, time forfeit, illegal move, stalled connection).
// Returns the abnormal termination string, or null when the game ended normally.
export function abnormalTermination(headers) {
    const t = headers && headers.Termination;
    if (!t) return null;
    return String(t).toLowerCase() === "normal" ? null : String(t);
}

// Load a --sources manifest: [{ path, id, meta? }]. Returns { paths, idByPath, metaById }.
export function loadSourceManifest(manifestPath) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const list = Array.isArray(raw) ? raw : raw.sources;
    if (!Array.isArray(list) || !list.length) throw new Error("--sources manifest must contain a non-empty `sources` array");
    const paths = [], idByPath = new Map(), metaById = {};
    for (const s of list) {
        if (!s.path || !s.id) throw new Error("--sources entries require both `path` and `id`");
        if (idByPath.has(s.path)) throw new Error("duplicate manifest path: " + s.path);
        for (const [p, id] of idByPath) if (id === s.id) throw new Error(`duplicate manifest id "${s.id}" (${p} and ${s.path})`);
        paths.push(s.path); idByPath.set(s.path, s.id);
        if (s.meta) metaById[s.id] = s.meta;
    }
    return { paths, idByPath, metaById };
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
        gamesExcludedAbnormal: 0, abnormalByTermination: {},
        splits: { train: 0, val: 0, test: 0 },
        errors: [],
    };
    const seenKeys = new Set();
    const phaseCount = { opening: 0, middlegame: 0, endgame: 0 };
    const materialCount = new Map();

    // Resolve inputs + source ids. A --sources manifest gives semantic ids and
    // per-source metadata; otherwise ids are derived from the path.
    const manifest = args.sources ? loadSourceManifest(args.sources) : null;
    const inputs = manifest ? manifest.paths : args.pgns;
    const sourceMeta = manifest ? manifest.metaById : {};
    const idFor = new Map();
    const idsSeen = new Map();
    for (const pgnPath of inputs) {
        const sid = manifest ? manifest.idByPath.get(pgnPath) : sourceIdFor(pgnPath, args.sourceRoot);
        if (idsSeen.has(sid) && idsSeen.get(sid) !== pgnPath) {
            throw new Error(`ambiguous source id "${sid}" for both "${idsSeen.get(sid)}" and "${pgnPath}" — pass --source-root, --sources, or rename inputs`);
        }
        idsSeen.set(sid, pgnPath);
        idFor.set(pgnPath, sid);
    }

    for (const pgnPath of inputs) {
        let games;
        try { games = readPgnFile(pgnPath); }
        catch (e) { stats.errors.push({ file: pgnPath, error: e.message }); continue; }
        const base = path.basename(pgnPath);
        const srcId = idFor.get(pgnPath);
        const fileStat = { file: base, id: srcId, games: games.length, excludedAbnormal: 0, accepted: 0 };
        stats.files.push(fileStat);

        for (const game of games) {
            if (args.limitGames && stats.gamesRead >= args.limitGames) break;
            // PGN validation: drop abnormally-terminated games (disconnects etc.)
            const abnormal = abnormalTermination(game.headers);
            if (abnormal && !args.includeAbnormal) {
                stats.gamesExcludedAbnormal++;
                fileStat.excludedAbnormal++;
                stats.abnormalByTermination[abnormal] = (stats.abnormalByTermination[abnormal] || 0) + 1;
                stats.errors.push({ file: base, id: srcId, gameIndex: game.index, excluded: "abnormal termination", termination: abnormal });
                continue;
            }
            stats.gamesRead++;
            fileStat.accepted++;
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
    writeJson(args.out.replace(/\.jsonl$/, "") + ".extract-summary.json",
        { config: { sampling, split, caps }, sourceMeta, stats, phaseCount });

    console.log("== extraction ==");
    console.log("games accepted:  ", stats.gamesRead);
    if (stats.gamesExcludedAbnormal) console.log("games EXCLUDED (abnormal termination):", stats.gamesExcludedAbnormal, JSON.stringify(stats.abnormalByTermination));
    console.log("positions sampled:", stats.positionsSampled);
    console.log("duplicates removed:", stats.duplicatesRemoved);
    console.log("capped:          ", stats.capped);
    console.log("unique retained: ", stats.uniqueRetained);
    console.log("splits:          ", stats.splits);
    console.log("phase:           ", phaseCount);
    for (const f of stats.files) console.log(`   source ${f.id}: accepted ${f.accepted}/${f.games}` + (f.excludedAbnormal ? ` (excluded ${f.excludedAbnormal})` : ""));
    if (stats.errors.length) console.log("errors/exclusions:", stats.errors.length, "(see summary json)");
    console.log("out:", args.out);
}

// Only run as a CLI, not when imported (e.g. by the test suite).
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
