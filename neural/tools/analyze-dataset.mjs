#!/usr/bin/env node
//======================================================
// tools/analyze-dataset.mjs
// Read-only, deterministic, dependency-free dataset analysis.
// Never modifies the input. Prints a console summary and can
// write a JSON report.
//
// Usage (PowerShell):
//   node .\tools\analyze-dataset.mjs --in "C:\path\labelled.jsonl" `
//        [--json "C:\path\analysis.json"]
//
// The output directory for --json is NOT created automatically; if it
// does not exist the tool exits with a clear error.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJsonl } from "../lib/jsonl.mjs";

// ---------------- pure math helpers ----------------
export function stats(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / arr.length;
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return { n: arr.length, mean: Math.round(mean), median: q(0.5), std: Math.round(Math.sqrt(variance)),
        min: s[0], max: s[s.length - 1], p5: q(0.05), p25: q(0.25), p75: q(0.75), p95: q(0.95) };
}
export function pearson(x, y) {
    const n = x.length; if (n < 2) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(4) : null;
}
function ranks(arr) {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    let i = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
        const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r;
}
export function spearman(x, y) { if (x.length < 2) return null; return pearson(ranks(x), ranks(y)); }

// robust identity accessors (tolerant of legacy records)
const sid = (r) => (r.source && (r.source.id ?? r.source.file)) ?? "?";
const gkey = (r) => (r.source && r.source.gameKey) ?? (sid(r) + "#" + (r.source && (r.source.gameIndex ?? r.source.game)));
const fenField = (fen, i) => fen.trim().split(/\s+/)[i];
const counts = (placement) => { const c = {}; for (const ch of placement) if (/[a-zA-Z]/.test(ch)) c[ch] = (c[ch] || 0) + 1; return c; };
const sortedObj = (m) => Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const byCountDesc = (m) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));

function errStats(rows) {
    if (!rows.length) return null;
    const coach = rows.map(r => r.coachClassicalCpWhite), sf = rows.map(r => r.stockfish.scoreCpWhite);
    const errs = rows.map(r => r.coachClassicalCpWhite - r.stockfish.scoreCpWhite);
    const ae = errs.map(Math.abs);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    return { n: rows.length, meanSignedErr: Math.round(mean(errs)), MAE: Math.round(mean(ae)), medianAE: med(ae),
        RMSE: Math.round(Math.sqrt(mean(errs.map(e => e * e)))), pearson: pearson(coach, sf), spearman: spearman(coach, sf) };
}

// ---------------- core (pure) ----------------
export function analyzeDataset(records, opts = {}) {
    const N = records.length;
    const out = {};

    // ---- integrity ----
    const keys = new Set(); let dup = 0, nullLab = 0, missingMeta = 0, wtm = 0, btm = 0, mate = 0;
    const splitRec = { train: 0, val: 0, test: 0 };
    const gkSplits = new Map(), keySplits = new Map();
    const versions = new Map(), hashes = new Map(), threadsM = new Map(), multipvM = new Map(), nodesReq = new Map();
    const gkPerSplit = { train: new Set(), val: new Set(), test: new Set() };
    for (const r of records) {
        if (keys.has(r.positionKey)) dup++; keys.add(r.positionKey);
        if (!r.stockfish) nullLab++;
        if (r.stockfish && !r.labelling) missingMeta++;
        r.sideToMove === "w" ? wtm++ : btm++;
        if (r.stockfish && r.stockfish.mate !== null && r.stockfish.mate !== undefined) mate++;
        if (splitRec[r.split] !== undefined) splitRec[r.split]++;
        const gk = gkey(r);
        (gkSplits.get(gk) || gkSplits.set(gk, new Set()).get(gk)).add(r.split);
        (keySplits.get(r.positionKey) || keySplits.set(r.positionKey, new Set()).get(r.positionKey)).add(r.split);
        if (gkPerSplit[r.split]) gkPerSplit[r.split].add(gk);
        const sf = r.stockfish, lb = r.labelling;
        if (sf) versions.set(sf.version, (versions.get(sf.version) || 0) + 1);
        if (lb) {
            hashes.set(lb.hash, (hashes.get(lb.hash) || 0) + 1);
            threadsM.set(lb.threads, (threadsM.get(lb.threads) || 0) + 1);
            multipvM.set(lb.multipv, (multipvM.get(lb.multipv) || 0) + 1);
            nodesReq.set(lb.nodesLimit, (nodesReq.get(lb.nodesLimit) || 0) + 1);
        }
    }
    let gameLeak = 0; for (const s of gkSplits.values()) if (s.size > 1) gameLeak++;
    let keyLeak = 0; for (const s of keySplits.values()) if (s.size > 1) keyLeak++;
    out.integrity = {
        recordCount: N, uniquePositionKeys: keys.size, duplicateKeys: dup, malformedRows: opts.malformed || 0,
        nullLabels: nullLab, distinctGameKeys: gkSplits.size, splitRecords: splitRec,
        splitGameCounts: { train: gkPerSplit.train.size, val: gkPerSplit.val.size, test: gkPerSplit.test.size },
        gameLevelLeakageByGameKey: gameLeak, positionKeysCrossingSplits: keyLeak, missingMetadata: missingMeta,
        engine: { versions: byCountDesc(versions), hashes: byCountDesc(hashes), threads: byCountDesc(threadsM),
            multipv: byCountDesc(multipvM), nodesRequested: byCountDesc(nodesReq) },
    };

    // ---- provenance ----
    const bySource = new Map(); const basenameToIds = new Map(); const idToBasenames = new Map();
    for (const r of records) {
        const id = sid(r), base = (r.source && r.source.file) || "?";
        (basenameToIds.get(base) || basenameToIds.set(base, new Set()).get(base)).add(id);
        (idToBasenames.get(id) || idToBasenames.set(id, new Set()).get(id)).add(base);
        const s = bySource.get(id) || { records: 0, games: new Set(), split: { train: 0, val: 0, test: 0 } };
        s.records++; s.games.add(gkey(r)); if (s.split[r.split] !== undefined) s.split[r.split]++;
        bySource.set(id, s);
    }
    const basenameCollisions = [...basenameToIds.entries()].filter(([, ids]) => ids.size > 1).map(([b, ids]) => ({ basename: b, ids: [...ids].sort() }));
    const sourceIdCollisions = [...idToBasenames.entries()].filter(([, bs]) => bs.size > 1).map(([id, bs]) => ({ id, basenames: [...bs].sort() }));
    out.provenance = {
        bySourceId: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1].records - a[1].records || (a[0] < b[0] ? -1 : 1))
            .map(([id, s]) => [id, { records: s.records, games: s.games.size, pctOfDataset: N ? +(100 * s.records / N).toFixed(1) : 0, split: s.split }])),
        basenameCollisions, sourceIdCollisions,
    };

    // ---- position distribution ----
    const phase = new Map(), hmB = { "hm0-49": 0, "hm50-79": 0, "hm80-99": 0, "hm100+": 0 }, castling = new Map();
    let inCheck = 0, ep = 0; const plies = [];
    for (const r of records) {
        phase.set(r.gamePhase, (phase.get(r.gamePhase) || 0) + 1);
        if (r.inCheck) inCheck++;
        const hm = +(fenField(r.fen, 4) || 0);
        hmB[hm >= 100 ? "hm100+" : hm >= 80 ? "hm80-99" : hm >= 50 ? "hm50-79" : "hm0-49"]++;
        const cst = fenField(r.fen, 2) || "-"; castling.set(cst, (castling.get(cst) || 0) + 1);
        if ((fenField(r.fen, 3) || "-") !== "-") ep++;
        if (r.source && typeof r.source.ply === "number") plies.push(r.source.ply);
    }
    out.positionDistribution = {
        whiteToMove: wtm, blackToMove: btm, phase: byCountDesc(phase), inCheck, notInCheck: N - inCheck,
        mate, nonMate: N - mate, halfmoveBuckets: hmB, castlingCombos: byCountDesc(castling),
        legalEnPassant: ep, plyRange: plies.length ? { min: Math.min(...plies), max: Math.max(...plies), median: stats(plies).median } : null,
    };

    // ---- score distribution ----
    const cps = records.filter(r => r.stockfish && r.stockfish.scoreCpWhite !== null && r.stockfish.scoreCpWhite !== undefined).map(r => r.stockfish.scoreCpWhite);
    const absc = cps.map(Math.abs);
    const thr = (t) => absc.length ? +(100 * absc.filter(a => a <= t).length / absc.length).toFixed(1) : 0;
    const beyond = (t) => absc.length ? +(100 * absc.filter(a => a > t).length / absc.length).toFixed(1) : 0;
    const mrows = records.filter(r => r.stockfish && r.stockfish.mate !== null && r.stockfish.mate !== undefined);
    const mateDist = new Map(); for (const r of mrows) mateDist.set(r.stockfish.mate, (mateDist.get(r.stockfish.mate) || 0) + 1);
    out.scoreDistribution = {
        nonMate: stats(cps),
        absWithin: { "25": thr(25), "50": thr(50), "100": thr(100), "200": thr(200), "500": thr(500) },
        absBeyond: { "500": beyond(500), "1000": beyond(1000) },
        mate: { total: mrows.length, whiteMating: mrows.filter(r => r.stockfish.mate > 0).length,
            blackMating: mrows.filter(r => r.stockfish.mate < 0).length,
            distanceHistogram: Object.fromEntries([...mateDist.entries()].sort((a, b) => a[0] - b[0])) },
    };

    // ---- Coach vs Stockfish ----
    const nm = records.filter(r => r.stockfish && r.stockfish.scoreCpWhite !== null && r.stockfish.scoreCpWhite !== undefined && typeof r.coachClassicalCpWhite === "number");
    if (nm.length) {
        const by = (p) => errStats(nm.filter(p));
        out.coachVsStockfish = {
            overall: errStats(nm),
            bySplit: { train: by(r => r.split === "train"), val: by(r => r.split === "val"), test: by(r => r.split === "test") },
            byPhase: { opening: by(r => r.gamePhase === "opening"), middlegame: by(r => r.gamePhase === "middlegame"), endgame: by(r => r.gamePhase === "endgame") },
            bySide: { white: by(r => r.sideToMove === "w"), black: by(r => r.sideToMove === "b") },
            byCheck: { inCheck: by(r => r.inCheck), notInCheck: by(r => !r.inCheck) },
        };
    } else out.coachVsStockfish = { note: "coachClassicalCpWhite not available on non-mate records" };

    return out;
}

// ---------------- console formatting ----------------
export function formatConsole(a) {
    const L = [];
    const i = a.integrity;
    L.push("== dataset analysis ==");
    L.push(`records: ${i.recordCount}  uniqueKeys: ${i.uniquePositionKeys}  dupKeys: ${i.duplicateKeys}  malformed: ${i.malformedRows}  nullLabels: ${i.nullLabels}`);
    L.push(`distinct gameKeys: ${i.distinctGameKeys}  splitRecords: ${JSON.stringify(i.splitRecords)}  splitGames: ${JSON.stringify(i.splitGameCounts)}`);
    L.push(`game-level leakage (by gameKey): ${i.gameLevelLeakageByGameKey}  positionKeys crossing splits: ${i.positionKeysCrossingSplits}  missingMeta: ${i.missingMetadata}`);
    L.push(`engine: ${JSON.stringify(i.engine.versions)}  nodesReq: ${JSON.stringify(i.engine.nodesRequested)}`);
    L.push(`basename collisions: ${a.provenance.basenameCollisions.length}  sourceId collisions: ${a.provenance.sourceIdCollisions.length}`);
    L.push(`sources: ${Object.keys(a.provenance.bySourceId).length}`);
    for (const [id, s] of Object.entries(a.provenance.bySourceId)) L.push(`   ${(s.pctOfDataset + "%").padStart(6)}  ${s.records.toString().padStart(6)} recs  ${s.games} games  ${id}`);
    const p = a.positionDistribution;
    L.push(`stm w/b: ${p.whiteToMove}/${p.blackToMove}  phase: ${JSON.stringify(p.phase)}  inCheck: ${p.inCheck}  mate/nonMate: ${p.mate}/${p.nonMate}`);
    L.push(`hmBuckets: ${JSON.stringify(p.halfmoveBuckets)}  legalEP: ${p.legalEnPassant}`);
    const s = a.scoreDistribution;
    if (s.nonMate) L.push(`score cp: mean ${s.nonMate.mean} median ${s.nonMate.median} std ${s.nonMate.std} [${s.nonMate.min}..${s.nonMate.max}]  within: ${JSON.stringify(s.absWithin)}`);
    L.push(`mate: ${s.mate.total} (W ${s.mate.whiteMating} / B ${s.mate.blackMating})`);
    const c = a.coachVsStockfish;
    if (c.overall) { L.push(`Coach vs SF overall: n=${c.overall.n} MAE ${c.overall.MAE} medianAE ${c.overall.medianAE} RMSE ${c.overall.RMSE} r ${c.overall.pearson} rho ${c.overall.spearman} signed ${c.overall.meanSignedErr}`);
        L.push(`   by phase: ${["opening","middlegame","endgame"].map(k=>`${k}=MAE${c.byPhase[k]?.MAE ?? "-"}/r${c.byPhase[k]?.pearson ?? "-"}`).join("  ")}`); }
    return L.join("\n");
}

// ---------------- CLI ----------------
function arg(name) { const idx = process.argv.indexOf(name); return idx >= 0 ? process.argv[idx + 1] : undefined; }

function main() {
    const inPath = arg("--in");
    const jsonOut = arg("--json");
    if (!inPath) { console.error("--in <labelled.jsonl> required"); process.exit(2); }
    if (!fs.existsSync(inPath)) { console.error("input not found: " + inPath); process.exit(2); }
    const { records, malformed } = readJsonl(inPath);
    const report = analyzeDataset(records, { malformed: malformed.length });
    console.log(formatConsole(report));
    if (jsonOut) {
        const dir = path.dirname(path.resolve(jsonOut));
        if (!fs.existsSync(dir)) { console.error("output directory does not exist (create it first): " + dir); process.exit(2); }
        fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
        console.log("wrote " + jsonOut);
    }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
