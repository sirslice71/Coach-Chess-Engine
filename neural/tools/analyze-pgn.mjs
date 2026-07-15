#!/usr/bin/env node
//======================================================
// tools/analyze-pgn.mjs
// Read-only, deterministic PGN corpus triage — run this BEFORE spending
// Stockfish time on a batch. Answers: how many games are actually valid,
// how many are exact replays, and how much opening diversity the book gave.
//
// A deterministic engine pair plus a non-randomising book can emit hundreds of
// byte-identical games from a handful of opening lines; raw game counts hide
// this completely. Duplicate games waste labelling time and inflate match
// statistics, so both are reported here.
//
// Usage (PowerShell):
//   node .\tools\analyze-pgn.mjs --in "C:\...\match.pgn" [--in "...\other.pgn"] `
//        [--player Coach] [--json "C:\...\pgn-report.json"]
//
// No engine dependency (pure PGN parsing) — structural legality is separately
// enforced by extract-positions.mjs, which replays every game through Coach.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readPgnFile } from "../lib/pgn-reader.mjs";
import { gameKey } from "../lib/splits.mjs";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : 0);

// CuteChess writes [Termination] only for abnormal endings; absent => normal.
export function terminationOf(headers) {
    const t = headers && headers.Termination;
    return t && String(t).toLowerCase() !== "normal" ? String(t) : "normal";
}

// Score statistics with a 95% CI, from per-game scores (1 / 0.5 / 0).
// A match score is an ESTIMATE: a 100-game match carries roughly +/-10 points
// of 95% uncertainty, so two batches differing by a point or two are not
// distinguishable. Reporting the interval alongside the point estimate keeps
// batch-to-batch comparisons honest.
// Elo is derived from the SCORE (not the win rate): elo = -400*log10(1/S - 1).
// Caveat: games are treated as independent; paired openings (-repeat) induce
// mild correlation, so the interval is approximate.
export function scoreStats(perGameScores) {
    const n = perGameScores.length;
    if (!n) return null;
    const mean = perGameScores.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? perGameScores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const se = Math.sqrt(variance / n);
    const clamp = (p) => Math.min(0.999999, Math.max(0.000001, p));
    const elo = (p) => +(-400 * Math.log10(1 / clamp(p) - 1)).toFixed(1);
    const lo = mean - 1.96 * se, hi = mean + 1.96 * se;
    return {
        scorePct: +(100 * mean).toFixed(2), sePct: +(100 * se).toFixed(2),
        ci95Pct: [+(100 * lo).toFixed(1), +(100 * hi).toFixed(1)],
        impliedElo: elo(mean), impliedEloCI: [elo(lo), elo(hi)],
    };
}

// Pure analysis over parsed games. `player` selects the score perspective.
export function analyzePgnGames(games, { player = "Coach" } = {}) {
    const byTermination = {};
    for (const g of games) { const t = terminationOf(g.headers); byTermination[t] = (byTermination[t] || 0) + 1; }
    const valid = games.filter((g) => terminationOf(g.headers) === "normal");
    const excluded = games.length - valid.length;

    // exact duplicate games (same gameKey == same headers + full mainline)
    const byKey = new Map();
    for (const g of valid) { const k = gameKey(g); (byKey.get(k) || byKey.set(k, []).get(k)).push(g); }
    const groups = [...byKey.values()].filter((v) => v.length > 1).sort((a, b) => b.length - a.length);

    // identical movetext played with the colours swapped
    const byMoves = new Map();
    for (const g of valid) { const k = g.sanMoves.join(" "); (byMoves.get(k) || byMoves.set(k, []).get(k)).push(g); }
    let colourReversed = 0;
    for (const v of byMoves.values()) if (v.length > 1 && new Set(v.map((g) => g.headers.White)).size > 1) colourReversed++;

    // opening diversity at several depths
    const linesAt = (n) => new Set(valid.map((g) => g.sanMoves.slice(0, n).join(" "))).size;
    const p8 = new Map();
    for (const g of valid) { const k = g.sanMoves.slice(0, 8).join(" "); p8.set(k, (p8.get(k) || 0) + 1); }
    const sorted = [...p8.values()].sort((a, b) => b - a);
    const topPct = (n) => pct(sorted.slice(0, n).reduce((a, b) => a + b, 0), valid.length);

    const eco = {};
    for (const g of valid) { const e = g.headers.ECO || "?"; eco[e] = (eco[e] || 0) + 1; }

    // score from `player`'s perspective (PGN tags are authoritative)
    let w = 0, l = 0, d = 0, wPts = 0, wN = 0, bPts = 0, bN = 0;
    const perGame = [];
    const re = new RegExp(player, "i");
    for (const g of valid) {
        const h = g.headers, isWhite = re.test(h.White || "");
        if (!isWhite && !re.test(h.Black || "")) continue;
        const p = h.Result === "1-0" ? (isWhite ? 1 : 0) : h.Result === "0-1" ? (isWhite ? 0 : 1) : 0.5;
        if (p === 1) w++; else if (p === 0) l++; else d++;
        if (isWhite) { wPts += p; wN++; } else { bPts += p; bN++; }
        perGame.push(p);
    }
    const lens = valid.map((g) => g.sanMoves.length);

    return {
        totalRecords: games.length, valid: valid.length, excluded, byTermination,
        duplicates: {
            distinctGames: byKey.size, duplicateGroups: groups.length,
            largestGroup: groups.length ? groups[0].length : 0,
            exactDuplicateRatePct: pct(valid.length - byKey.size, valid.length),
            colourReversedIdenticalMovetext: colourReversed,
        },
        openings: {
            distinctLines: { ply4: linesAt(4), ply8: linesAt(8), ply12: linesAt(12), ply16: linesAt(16) },
            largestOpeningGroup: sorted[0] ?? 0,
            top1Pct: topPct(1), top5Pct: topPct(5), top10Pct: topPct(10),
            distinctEco: Object.keys(eco).length,
            topEco: Object.fromEntries(Object.entries(eco).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6)),
        },
        score: { player, wins: w, losses: l, draws: d,
            winPct: pct(w, w + l + d), drawPct: pct(d, w + l + d), lossPct: pct(l, w + l + d),
            scorePct: pct(w + 0.5 * d, w + l + d), ...(scoreStats(perGame) || {}),
            asWhitePct: wN ? pct(wPts, wN) : null, asWhiteGames: wN,
            asBlackPct: bN ? pct(bPts, bN) : null, asBlackGames: bN },
        length: { avgPlies: +mean(lens).toFixed(1), medianPlies: median(lens),
            minPlies: lens.length ? Math.min(...lens) : null, maxPlies: lens.length ? Math.max(...lens) : null },
    };
}

// Heuristic verdict for "is this book/config worth a bigger run?"
export function bookVerdict(a) {
    const { exactDuplicateRatePct } = a.duplicates;
    const { top1Pct, distinctLines } = a.openings;
    if (exactDuplicateRatePct >= 15 || top1Pct >= 35) return "unsuitable — high replay/opening concentration";
    if (exactDuplicateRatePct >= 5 || top1Pct >= 20 || distinctLines.ply8 < 15) return "usable but still concentrated";
    return "good for larger corpus generation";
}

function main() {
    const argv = process.argv.slice(2);
    const ins = []; let json = null, player = "Coach";
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--in") ins.push(argv[++i]);
        else if (argv[i] === "--json") json = argv[++i];
        else if (argv[i] === "--player") player = argv[++i];
        else { console.error("unknown flag " + argv[i]); process.exit(2); }
    }
    if (!ins.length) { console.error("--in <file.pgn> required (repeatable)"); process.exit(2); }
    for (const p of ins) if (!fs.existsSync(p)) { console.error("input not found: " + p); process.exit(2); }
    if (json) { const d = path.dirname(path.resolve(json)); if (!fs.existsSync(d)) { console.error("output directory does not exist: " + d); process.exit(2); } }

    const report = {};
    for (const p of ins) {
        const a = analyzePgnGames(readPgnFile(p), { player });
        a.verdict = bookVerdict(a);
        report[path.basename(p)] = a;
        console.log("\n== " + path.basename(p) + " ==");
        console.log(`records ${a.totalRecords} | valid ${a.valid} | excluded ${a.excluded} ${JSON.stringify(a.byTermination)}`);
        console.log(`distinct games ${a.duplicates.distinctGames} | dup groups ${a.duplicates.duplicateGroups}`
            + ` | largest ${a.duplicates.largestGroup} | exact-dup ${a.duplicates.exactDuplicateRatePct}%`
            + ` | colour-reversed ${a.duplicates.colourReversedIdenticalMovetext}`);
        console.log(`distinct lines 4/8/12/16-ply: ${a.openings.distinctLines.ply4}/${a.openings.distinctLines.ply8}`
            + `/${a.openings.distinctLines.ply12}/${a.openings.distinctLines.ply16}`
            + ` | top1 ${a.openings.top1Pct}% top5 ${a.openings.top5Pct}% top10 ${a.openings.top10Pct}%`
            + ` | largest opening group ${a.openings.largestOpeningGroup} | distinct ECO ${a.openings.distinctEco}`);
        console.log(`${a.score.player}: W${a.score.wins} L${a.score.losses} D${a.score.draws}`
            + ` | win ${a.score.winPct}% draw ${a.score.drawPct}% loss ${a.score.lossPct}%`
            + ` -> SCORE ${a.score.scorePct}% 95%CI [${a.score.ci95Pct[0]}, ${a.score.ci95Pct[1]}]`
            + ` | Elo ${a.score.impliedElo} [${a.score.impliedEloCI[0]}, ${a.score.impliedEloCI[1]}]`);
        console.log(`   White ${a.score.asWhitePct}% (n=${a.score.asWhiteGames}) | Black ${a.score.asBlackPct}% (n=${a.score.asBlackGames})`);
        console.log(`plies avg/med/min/max: ${a.length.avgPlies}/${a.length.medianPlies}/${a.length.minPlies}/${a.length.maxPlies}`);
        console.log("VERDICT: " + a.verdict);
    }
    if (json) { fs.writeFileSync(json, JSON.stringify(report, null, 2)); console.log("\nwrote " + json); }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
