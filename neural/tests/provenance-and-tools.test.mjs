//======================================================
// provenance-and-tools.test.mjs
// Tests for source-provenance / gameKey-authoritative split
// validation and the read-only analyze-dataset tool.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

import { sourceIdFor, normalizeSep, abnormalTermination, loadSourceManifest } from "../extract-positions.mjs";
import { splitIntegrity } from "../validate-dataset.mjs";
import { analyzeDataset, stats, pearson, spearman } from "../tools/analyze-dataset.mjs";
import { mergeRecords, verifySplitsPreserved } from "../tools/merge-corpus.mjs";
import { analyzePgnGames, terminationOf, bookVerdict, scoreStats } from "../tools/analyze-pgn.mjs";

const tmp = (name) => path.join(os.tmpdir(), `neural-prov-${process.pid}-${name}`);

// minimal valid record builder
let seq = 0;
function mk(o = {}) {
    seq++;
    return {
        fen: o.fen ?? "8/8/8/8/8/8/8/K6k w - - 0 1",
        positionKey: o.positionKey ?? ("K" + seq),
        source: o.source ?? { file: o.file ?? "a.pgn", id: o.id ?? "dir/a.pgn", gameIndex: o.gameIndex ?? 0, gameKey: o.gameKey ?? "GK0", ply: o.ply ?? 10 },
        sideToMove: o.stm ?? "w",
        gamePhase: o.phase ?? "middlegame",
        materialSignature: o.mat ?? "K|k",
        result: o.result ?? "*",
        inCheck: o.inCheck ?? false,
        coachClassicalCpWhite: o.coach ?? 0,
        split: o.split ?? "train",
        stockfish: o.stockfish === null ? null : (o.stockfish ?? { version: "Stockfish 18", depth: 10, seldepth: 15, nodes: 50000, scoreCpWhite: o.cp ?? 0, mate: o.mate ?? null, wdl: [100, 800, 100], bestMove: "a1a2", pv: ["a1a2"], timeMs: 1 }),
        labelling: o.labelling === null ? null : (o.labelling ?? { engine: "stockfish", version: "Stockfish 18", nodesLimit: 50000, depthLimit: null, hash: 64, threads: 1, multipv: 1, showWDL: true, hashResetPerPosition: true, scorePerspective: "white", labelledAt: "t" }),
    };
}

// ---------- provenance: source id ----------
test("sourceIdFor: same basename in different dirs -> distinct ids, '/'-normalized, no root/absolute path", () => {
    const root = "C:\\data\\pgns";
    const a = sourceIdFor("C:\\data\\pgns\\Coach AB\\baseline.pgn", root);
    const b = sourceIdFor("C:\\data\\pgns\\Coach Null AB\\baseline.pgn", root);
    assert.equal(a, "Coach AB/baseline.pgn");
    assert.equal(b, "Coach Null AB/baseline.pgn");
    assert.notEqual(a, b);
    assert.ok(!a.includes("\\") && !b.includes("\\"), "separators normalized to /");
    assert.ok(!a.includes("C:") && !a.includes("data"), "no absolute path / root retained");
    // deterministic
    assert.equal(a, sourceIdFor("C:\\data\\pgns\\Coach AB\\baseline.pgn", root));
});

test("sourceIdFor: fallback without root uses <parentDir>/<basename>; normalizeSep", () => {
    assert.equal(sourceIdFor("C:\\x\\Coach AB\\g.pgn", null), "Coach AB/g.pgn");
    assert.equal(normalizeSep("a\\b\\c"), "a/b/c");
    // path outside root falls back rather than emitting '..'
    const id = sourceIdFor("C:\\other\\g.pgn", "C:\\root");
    assert.ok(!id.startsWith(".."), id);
});

// ---------- splitIntegrity (gameKey authoritative) ----------
test("splitIntegrity: same gameKey, one split -> clean & authoritative", () => {
    const recs = [mk({ gameKey: "G1", split: "train" }), mk({ gameKey: "G1", split: "train" })];
    const r = splitIntegrity(recs);
    assert.equal(r.authoritative, true);
    assert.equal(r.failures.length, 0);
    assert.equal(r.gameLeak, 0);
    assert.equal(r.distinctGames, 1);
});

test("splitIntegrity: same gameKey spanning two splits -> failure", () => {
    const recs = [mk({ gameKey: "G1", split: "train" }), mk({ gameKey: "G1", split: "val" })];
    const r = splitIntegrity(recs);
    assert.equal(r.gameLeak, 1);
    assert.ok(r.failures.some(f => f.msg.includes("game spans multiple splits")));
});

test("splitIntegrity: different gameKeys sharing basename+gameIndex -> NO false failure (the fix)", () => {
    // Two DIFFERENT games that collide on basename+index but have distinct gameKeys.
    const recs = [
        mk({ file: "baseline.pgn", id: "Coach AB/baseline.pgn", gameIndex: 11, gameKey: "76d2bfbd", split: "train" }),
        mk({ file: "baseline.pgn", id: "Coach Null AB/baseline.pgn", gameIndex: 11, gameKey: "aba3baf9", split: "val" }),
    ];
    const r = splitIntegrity(recs);
    assert.equal(r.gameLeak, 0, "distinct gameKeys must not be reported as leakage");
    assert.equal(r.failures.length, 0);
    assert.equal(r.distinctGames, 2);
});

test("splitIntegrity: duplicate positionKey across splits -> failure", () => {
    const recs = [mk({ positionKey: "DUP", gameKey: "G1", split: "train" }), mk({ positionKey: "DUP", gameKey: "G2", split: "test" })];
    const r = splitIntegrity(recs);
    assert.ok(r.failures.some(f => f.msg === "positionKey occurs in multiple splits"));
    assert.ok(r.failures.some(f => f.msg === "duplicate positionKey"));
});

test("splitIntegrity: legacy dataset (no gameKey) with basename collision -> WARNING, not failure", () => {
    const recs = [
        mk({ source: { file: "baseline.pgn", game: 11, ply: 10 }, split: "train" }),
        mk({ source: { file: "baseline.pgn", game: 11, ply: 20 }, split: "val" }),
    ];
    const r = splitIntegrity(recs);
    assert.equal(r.authoritative, false);
    assert.equal(r.failures.length, 0, "legacy leakage is a warning, not a failure");
    assert.ok(r.warnings.some(w => w.includes("LEGACY") || w.includes("proxy")));
});

test("splitIntegrity: missing new-format provenance fields -> failure", () => {
    const recs = [mk({ gameKey: "G1" }), mk({ source: { file: "a.pgn", gameIndex: 0, ply: 5 } /* no id/gameKey */ })];
    const r = splitIntegrity(recs);
    assert.ok(r.failures.some(f => f.msg === "missing source.gameKey"));
    assert.ok(r.failures.some(f => f.msg === "missing source.id"));
});

// ---------- analyze tool math ----------
test("stats: known array", () => {
    const s = stats([1, 2, 3, 4, 5]);
    assert.equal(s.n, 5); assert.equal(s.mean, 3); assert.equal(s.median, 3);
    assert.equal(s.min, 1); assert.equal(s.max, 5); assert.equal(s.p25, 2); assert.equal(s.p75, 4);
});

test("pearson: perfect +/- correlation", () => {
    assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
    assert.equal(pearson([1, 2, 3], [6, 4, 2]), -1);
    assert.equal(spearman([1, 2, 3, 4], [1, 2, 3, 4]), 1);
});

// ---------- analyzeDataset ----------
test("analyzeDataset: exact counts, mate counts, basename collision, leakage true/false", () => {
    const recs = [
        mk({ positionKey: "A", gameKey: "G1", split: "train", cp: 50, coach: 40, file: "x.pgn", id: "d1/x.pgn" }),
        mk({ positionKey: "B", gameKey: "G1", split: "train", cp: -30, coach: -10, file: "x.pgn", id: "d1/x.pgn" }),
        mk({ positionKey: "C", gameKey: "G2", split: "val", mate: 2, cp: null, file: "x.pgn", id: "d2/x.pgn" }), // basename collision d1 vs d2
        mk({ positionKey: "D", gameKey: "G3", split: "test", mate: -1, cp: null, file: "y.pgn", id: "d1/y.pgn" }),
    ];
    const a = analyzeDataset(recs);
    assert.equal(a.integrity.recordCount, 4);
    assert.equal(a.integrity.uniquePositionKeys, 4);
    assert.equal(a.integrity.duplicateKeys, 0);
    assert.equal(a.integrity.distinctGameKeys, 3);
    assert.equal(a.integrity.gameLevelLeakageByGameKey, 0);
    assert.equal(a.scoreDistribution.mate.total, 2);
    assert.equal(a.scoreDistribution.mate.whiteMating, 1);
    assert.equal(a.scoreDistribution.mate.blackMating, 1);
    // basename "x.pgn" is shared by ids d1/x.pgn and d2/x.pgn -> collision reported (allowed)
    assert.equal(a.provenance.basenameCollisions.length, 1);
    assert.equal(a.provenance.basenameCollisions[0].basename, "x.pgn");
});

test("analyzeDataset: detects true gameKey leakage; avoids basename false-positive", () => {
    const leak = analyzeDataset([mk({ positionKey: "A", gameKey: "G1", split: "train" }), mk({ positionKey: "B", gameKey: "G1", split: "val" })]);
    assert.equal(leak.integrity.gameLevelLeakageByGameKey, 1);
    const noLeak = analyzeDataset([
        mk({ positionKey: "A", file: "b.pgn", id: "d1/b.pgn", gameIndex: 5, gameKey: "GA", split: "train" }),
        mk({ positionKey: "B", file: "b.pgn", id: "d2/b.pgn", gameIndex: 5, gameKey: "GB", split: "val" }),
    ]);
    assert.equal(noLeak.integrity.gameLevelLeakageByGameKey, 0);
});

test("analyzeDataset: coachVsStockfish pearson on a known series", () => {
    const recs = [
        mk({ positionKey: "A", gameKey: "G1", coach: 100, cp: 100 }),
        mk({ positionKey: "B", gameKey: "G2", coach: 200, cp: 200 }),
        mk({ positionKey: "C", gameKey: "G3", coach: 300, cp: 300 }),
    ];
    const a = analyzeDataset(recs);
    assert.equal(a.coachVsStockfish.overall.n, 3);
    assert.equal(a.coachVsStockfish.overall.MAE, 0);
    assert.equal(a.coachVsStockfish.overall.pearson, 1);
});

test("analyzeDataset: JSON report is deterministic", () => {
    const build = () => [
        mk({ positionKey: "A", gameKey: "G1", split: "train", cp: 10, coach: 5 }),
        mk({ positionKey: "B", gameKey: "G2", split: "val", cp: -40, coach: -20 }),
    ];
    seq = 0; const a1 = JSON.stringify(analyzeDataset(build()));
    seq = 0; const a2 = JSON.stringify(analyzeDataset(build()));
    assert.equal(a1, a2);
});

// ---------- PGN validation: abnormal terminations ----------
test("abnormalTermination: absent/normal -> null; abnormal -> the tag value", () => {
    // CuteChess only writes [Termination] for abnormal endings
    assert.equal(abnormalTermination({}), null);
    assert.equal(abnormalTermination({ Termination: "normal" }), null);
    assert.equal(abnormalTermination({ Termination: "Normal" }), null);
    assert.equal(abnormalTermination({ Termination: "abandoned" }), "abandoned");
    assert.equal(abnormalTermination({ Termination: "time forfeit" }), "time forfeit");
    assert.equal(abnormalTermination({ Termination: "illegal move" }), "illegal move");
});

test("loadSourceManifest: reads ids+meta, rejects missing fields and duplicate ids", () => {
    const p = tmp("man.json");
    fs.writeFileSync(p, JSON.stringify({ sources: [
        { path: "C:\\a\\x.pgn", id: "src-a", meta: { opponent: "X", timeControl: "1s/move" } },
        { path: "C:\\b\\x.pgn", id: "src-b" },
    ] }));
    const m = loadSourceManifest(p);
    assert.deepEqual(m.paths, ["C:\\a\\x.pgn", "C:\\b\\x.pgn"]);
    assert.equal(m.idByPath.get("C:\\a\\x.pgn"), "src-a");
    assert.deepEqual(m.metaById["src-a"], { opponent: "X", timeControl: "1s/move" });
    // duplicate id rejected
    fs.writeFileSync(p, JSON.stringify({ sources: [{ path: "a", id: "dup" }, { path: "b", id: "dup" }] }));
    assert.throws(() => loadSourceManifest(p), /duplicate manifest id/);
    // missing id rejected
    fs.writeFileSync(p, JSON.stringify({ sources: [{ path: "a" }] }));
    assert.throws(() => loadSourceManifest(p), /require both/);
    fs.unlinkSync(p);
});

// ---------- safe incremental corpus merge ----------
test("mergeRecords: first dataset wins on duplicate keys; later adds only new", () => {
    const oldDs = { name: "old", records: [
        mk({ positionKey: "A", gameKey: "G1", split: "train", cp: 10 }),
        mk({ positionKey: "B", gameKey: "G1", split: "train", cp: 20 }),
    ] };
    const newDs = { name: "new", records: [
        mk({ positionKey: "B", gameKey: "G9", split: "test", cp: 999 }), // dup key -> dropped
        mk({ positionKey: "C", gameKey: "G2", split: "val", cp: 30 }),
    ] };
    const r = mergeRecords([oldDs, newDs]);
    assert.equal(r.merged.length, 3);
    assert.equal(r.contributed.old, 2);
    assert.equal(r.contributed.new, 1);
    assert.equal(r.dropped.new, 1);
    assert.equal(r.failures.length, 0);
    // the surviving "B" is the OLD record (label + split preserved)
    const b = r.merged.find((x) => x.positionKey === "B");
    assert.equal(b.stockfish.scoreCpWhite, 20);
    assert.equal(b.split, "train");
    assert.equal(r.origin.B, "old");
});

test("mergeRecords: detects gameKey spanning splits and positionKey in two splits", () => {
    const ds = { name: "d", records: [
        mk({ positionKey: "A", gameKey: "G1", split: "train" }),
        mk({ positionKey: "B", gameKey: "G1", split: "test" }), // same game, two splits
    ] };
    const r = mergeRecords([ds]);
    assert.equal(r.gameKeyLeak, 1);
    assert.ok(r.failures.some((f) => f.msg === "gameKey spans multiple splits"));
});

test("verifySplitsPreserved: reports unchanged vs changed prior splits", () => {
    const prior = [mk({ positionKey: "A", split: "train" }), mk({ positionKey: "B", split: "val" })];
    const ok = verifySplitsPreserved(prior, [mk({ positionKey: "A", split: "train" }), mk({ positionKey: "B", split: "val" })]);
    assert.deepEqual(ok, { checked: 2, changed: 0 });
    const bad = verifySplitsPreserved(prior, [mk({ positionKey: "A", split: "test" }), mk({ positionKey: "B", split: "val" })]);
    assert.equal(bad.changed, 1);
});

// ---------- PGN corpus triage (opening diversity / duplicate games) ----------
const pgnGame = (o = {}) => ({
    index: o.index ?? 0,
    headers: { Event: o.event ?? "E", Site: "?", Date: "2026.01.01", Round: "1",
        White: o.white ?? "Coach", Black: o.black ?? "Opp", Result: o.result ?? "1-0",
        ECO: o.eco ?? "A00", ...(o.termination ? { Termination: o.termination } : {}) },
    sanMoves: o.moves ?? ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"],
});

test("terminationOf: absent/normal -> 'normal'; abnormal -> tag value", () => {
    assert.equal(terminationOf({}), "normal");
    assert.equal(terminationOf({ Termination: "normal" }), "normal");
    assert.equal(terminationOf({ Termination: "abandoned" }), "abandoned");
});

test("analyzePgnGames: counts, exact duplicates, exclusions, score perspective", () => {
    const line = ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"];
    const games = [
        pgnGame({ index: 0, moves: line, result: "1-0", white: "Coach" }),          // dup A
        pgnGame({ index: 1, moves: line, result: "1-0", white: "Coach" }),          // dup A (identical)
        pgnGame({ index: 2, moves: ["e4", "c5", "Nf3", "d6"], result: "0-1", white: "Coach" }),
        pgnGame({ index: 3, moves: ["e4", "e6"], result: "1/2-1/2", white: "Opp", black: "Coach" }),
        pgnGame({ index: 4, moves: line, result: "1-0", termination: "abandoned" }), // excluded
    ];
    const a = analyzePgnGames(games, { player: "Coach" });
    assert.equal(a.totalRecords, 5);
    assert.equal(a.valid, 4);
    assert.equal(a.excluded, 1);
    assert.deepEqual(a.byTermination, { normal: 4, abandoned: 1 });
    // two identical games collapse to one gameKey -> 3 distinct of 4 valid
    assert.equal(a.duplicates.distinctGames, 3);
    assert.equal(a.duplicates.duplicateGroups, 1);
    assert.equal(a.duplicates.largestGroup, 2);
    assert.equal(a.duplicates.exactDuplicateRatePct, 25);
    // Coach: win(0), win(1), loss(2), draw(3) => 2W 1L 1D = 62.5%
    assert.equal(a.score.wins, 2); assert.equal(a.score.losses, 1); assert.equal(a.score.draws, 1);
    assert.equal(a.score.scorePct, 62.5);
    assert.equal(a.score.asWhiteGames, 3);
    assert.equal(a.score.asBlackGames, 1);
});

test("analyzePgnGames: opening diversity + concentration", () => {
    const A = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"];
    const B = ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"];
    // 3 games on line A, 1 on line B -> 2 distinct 8-ply lines, top1 = 75%
    const games = [pgnGame({ moves: A, eco: "C78" }), pgnGame({ moves: [...A, "O-O"], eco: "C78" }),
        pgnGame({ moves: [...A, "d3"], eco: "C78" }), pgnGame({ moves: B, eco: "D37" })];
    const a = analyzePgnGames(games);
    assert.equal(a.openings.distinctLines.ply8, 2);
    assert.equal(a.openings.largestOpeningGroup, 3);
    assert.equal(a.openings.top1Pct, 75);
    assert.equal(a.openings.distinctEco, 2);
});

test("scoreStats: score%, CI and Elo from per-game scores (1/0.5/0)", () => {
    // The real SF2000 batch-1 result: W39 D8 L53 -> (39 + 4)/100 = 43.00%
    const b1 = [...Array(39).fill(1), ...Array(8).fill(0.5), ...Array(53).fill(0)];
    const s1 = scoreStats(b1);
    assert.equal(s1.scorePct, 43);
    assert.equal(s1.sePct, 4.77);
    assert.deepEqual(s1.ci95Pct, [33.7, 52.3]);
    assert.equal(s1.impliedElo, -49);           // -400*log10(1/0.43 - 1)
    // The real batch-2 result: W81 D8 L111 -> (81 + 4)/200 = 42.50%
    const b2 = [...Array(81).fill(1), ...Array(8).fill(0.5), ...Array(111).fill(0)];
    const s2 = scoreStats(b2);
    assert.equal(s2.scorePct, 42.5);
    assert.deepEqual(s2.ci95Pct, [35.8, 49.2]);
    // more games -> tighter interval
    assert.ok(s2.sePct < s1.sePct, "200 games must give a smaller SE than 100");
    // a 50% score is 0 Elo; CI brackets the point estimate
    const even = [...Array(50).fill(1), ...Array(50).fill(0)];
    assert.equal(scoreStats(even).impliedElo, 0);
    assert.equal(scoreStats([]), null);
});

test("analyzePgnGames: exposes win/draw/loss vs total score and a CI", () => {
    const games = [
        pgnGame({ index: 0, result: "1-0", white: "Coach" }),   // win
        pgnGame({ index: 1, result: "1/2-1/2", white: "Coach" }), // draw
        pgnGame({ index: 2, result: "0-1", white: "Coach" }),   // loss
        pgnGame({ index: 3, result: "0-1", white: "Coach" }),   // loss
    ];
    const a = analyzePgnGames(games, { player: "Coach" });
    // win% 25, draw% 25, loss% 50 -> score% = (1 + 0.5)/4 = 37.5 (distinct from win%)
    assert.equal(a.score.winPct, 25);
    assert.equal(a.score.drawPct, 25);
    assert.equal(a.score.lossPct, 50);
    assert.equal(a.score.scorePct, 37.5);
    assert.ok(Array.isArray(a.score.ci95Pct) && a.score.ci95Pct.length === 2);
    assert.ok(a.score.ci95Pct[0] < a.score.scorePct && a.score.ci95Pct[1] > a.score.scorePct);
});

test("bookVerdict: flags replay/concentration, passes a diverse book", () => {
    const mk = (dupPct, top1, ply8) => ({ duplicates: { exactDuplicateRatePct: dupPct }, openings: { top1Pct: top1, distinctLines: { ply8 } } });
    assert.match(bookVerdict(mk(40, 51, 5)), /unsuitable/);      // the komodo case
    assert.match(bookVerdict(mk(0, 62, 5)), /unsuitable/);       // no dupes but one line dominates
    assert.match(bookVerdict(mk(6, 12, 30)), /still concentrated/);
    assert.match(bookVerdict(mk(0, 6, 39)), /good for larger/);  // the rodent case
});

test("analyze read path leaves the input file byte-identical", () => {
    const p = tmp("in.jsonl");
    const recs = [mk({ positionKey: "A", gameKey: "G1" }), mk({ positionKey: "B", gameKey: "G2" })];
    fs.writeFileSync(p, recs.map(r => JSON.stringify(r)).join("\n") + "\n");
    const before = fs.readFileSync(p);
    const parsed = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    analyzeDataset(parsed);
    const after = fs.readFileSync(p);
    assert.ok(before.equals(after), "input file must not be modified by analysis");
    fs.unlinkSync(p);
});
