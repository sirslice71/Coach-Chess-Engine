#!/usr/bin/env node
//======================================================
// inspect-dataset.mjs
// Distribution report + evaluation histogram + Coach
// classical vs Stockfish static comparison. Research only.
//
// Usage: node inspect-dataset.mjs --in labelled.jsonl [--json out.json]
//======================================================

import fs from "node:fs";
import { readJsonl } from "./lib/jsonl.mjs";

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

const BUCKETS = [
    [-1e9, -500], [-500, -200], [-200, -100], [-100, -50],
    [-50, 50], [50, 100], [100, 200], [200, 500], [500, 1e9],
];
const bucketLabel = (b) =>
    b[0] === -1e9 ? "<= -500" : b[1] === 1e9 ? ">= 500" : `${b[0]}..${b[1]}`;

function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pearson(x, y) {
    const n = x.length; if (n < 2) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

const inPath = arg("--in");
if (!inPath) { console.error("--in required"); process.exit(1); }
const records = readJsonl(inPath).records;

const rep = {
    total: records.length,
    splits: {}, sideToMove: { w: 0, b: 0 }, phase: {},
    inCheck: 0, mateLabelled: 0,
    castling: {}, materialTop: {}, histogram: {}, mateSplit: { whiteMates: 0, blackMates: 0 },
    decisiveVsBalanced: { decisive: 0, balanced: 0 },
};
for (const b of BUCKETS) rep.histogram[bucketLabel(b)] = 0;

const matCount = new Map();
const coachV = [], sfV = [], outliers = [];

for (const r of records) {
    rep.splits[r.split] = (rep.splits[r.split] || 0) + 1;
    rep.sideToMove[r.sideToMove]++;
    rep.phase[r.gamePhase] = (rep.phase[r.gamePhase] || 0) + 1;
    if (r.inCheck) rep.inCheck++;
    const castling = r.fen.trim().split(/\s+/)[2] || "-";
    rep.castling[castling] = (rep.castling[castling] || 0) + 1;
    matCount.set(r.materialSignature, (matCount.get(r.materialSignature) || 0) + 1);

    const sf = r.stockfish;
    if (!sf) continue;
    if (sf.mate !== null) {
        rep.mateLabelled++;
        if (sf.mate > 0) rep.mateSplit.whiteMates++; else rep.mateSplit.blackMates++;
        rep.decisiveVsBalanced.decisive++;
        continue;
    }
    if (sf.scoreCpWhite === null) continue;
    const cp = sf.scoreCpWhite;
    for (const b of BUCKETS) if (cp > b[0] && cp <= b[1]) { rep.histogram[bucketLabel(b)]++; break; }
    if (Math.abs(cp) >= 150) rep.decisiveVsBalanced.decisive++; else rep.decisiveVsBalanced.balanced++;

    if (typeof r.coachClassicalCpWhite === "number") {
        coachV.push(r.coachClassicalCpWhite);
        sfV.push(cp);
        outliers.push({ fen: r.fen, coach: r.coachClassicalCpWhite, sf: cp, ae: Math.abs(r.coachClassicalCpWhite - cp) });
    }
}

// material top 8
rep.materialTop = Object.fromEntries([...matCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));

// coach vs sf
const aes = outliers.map((o) => o.ae);
const cmp = {
    n: outliers.length,
    meanAbsError: aes.length ? Math.round(aes.reduce((a, b) => a + b, 0) / aes.length) : null,
    medianAbsError: median(aes),
    pearson: pearson(coachV, sfV),
    worstOutliers: outliers.sort((a, b) => b.ae - a.ae).slice(0, 8),
};

console.log("== distribution ==");
console.log("total:        ", rep.total);
console.log("splits:       ", rep.splits);
console.log("side to move: ", rep.sideToMove);
console.log("phase:        ", rep.phase);
console.log("in check:     ", rep.inCheck);
console.log("mate-labelled:", rep.mateLabelled, rep.mateSplit);
console.log("decisive/bal: ", rep.decisiveVsBalanced);
console.log("castling combos:", rep.castling);
console.log("top material: ", rep.materialTop);
console.log("eval histogram (cp, White persp):");
for (const [k, v] of Object.entries(rep.histogram)) console.log("   " + k.padStart(9) + " :", v);
console.log("== Coach classical vs Stockfish (static) ==");
console.log("n:              ", cmp.n);
console.log("mean abs error: ", cmp.meanAbsError, "cp");
console.log("median abs err: ", cmp.medianAbsError, "cp");
console.log("pearson r:      ", cmp.pearson ? cmp.pearson.toFixed(3) : null);
console.log("worst outliers (coach vs sf):");
for (const o of cmp.worstOutliers) console.log(`   ae=${o.ae} coach=${o.coach} sf=${o.sf}  ${o.fen}`);

const jsonOut = arg("--json");
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify({ distribution: rep, coachVsStockfish: cmp }, null, 2)); console.log("wrote", jsonOut); }
