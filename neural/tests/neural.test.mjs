//======================================================
// neural.test.mjs
// node --test suite for the neural data pipeline.
// Coach-dependent tests resolve the engine via COACH_ROOT
// (or the parent of neural/ in the worktree).
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

import { fnv1a, mulberry32, deriveSeed } from "../lib/prng.mjs";
import { positionKey, positionIdentity, halfmoveBucket, materialSignature, gamePhase } from "../lib/position.mjs";
import { fenSanity } from "../validate-dataset.mjs";
import { sampleFrames } from "../lib/sampling.mjs";
import { assignSplit, gameKey } from "../lib/splits.mjs";
import { encodeFen, FEATURE_DIM } from "../lib/features.mjs";
import { splitGames, extractSanMoves, normalizeSan } from "../lib/pgn-reader.mjs";
import { replayGame, START_FEN } from "../lib/replay.mjs";
import { AppendWriter, readJsonl, labelledKeySet } from "../lib/jsonl.mjs";
import { Stockfish } from "../lib/stockfish.mjs";
import { loadCoach } from "../lib/coach.mjs";

const tmp = (name) => path.join(os.tmpdir(), `neural-test-${process.pid}-${name}`);

test("prng deterministic", () => {
    assert.equal(fnv1a("abc"), fnv1a("abc"));
    const a = mulberry32(42), b = mulberry32(42);
    assert.equal(a(), b());
    assert.equal(deriveSeed(1, "x"), deriveSeed(1, "x"));
});

test("positionKey buckets clocks, normalizes en-passant", async () => {
    const coach = await loadCoach();
    const { FEN, MoveFlags, createEngineCore } = coach;
    // differ only in halfmove within the same bucket (0..49) -> same key
    const k1 = positionKey(createEngineCore("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), FEN, MoveFlags);
    const k2 = positionKey(createEngineCore("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 9 25"), FEN, MoveFlags);
    assert.equal(k1, k2);
    // ep square present but NO legal ep capture -> ep dropped, ends before hm bucket
    const noEp = positionKey(createEngineCore("rnbqkbnr/pp1ppppp/8/2p5/8/5N2/PPPPPPPP/RNBQKB1R w KQkq c6 0 2"), FEN, MoveFlags);
    assert.ok(/ - hm0-49$/.test(noEp), "ep should be dropped when no legal ep capture: " + noEp);
    // ep with a real legal capture -> ep retained
    const withEp = positionKey(createEngineCore("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"), FEN, MoveFlags);
    assert.ok(/ f6 hm0-49$/.test(withEp), "ep should be retained when legal: " + withEp);
});

test("halfmove bucket distinguishes fifty-move regimes", async () => {
    const coach = await loadCoach();
    const { FEN, MoveFlags, createEngineCore } = coach;
    assert.equal(halfmoveBucket(0), "hm0-49");
    assert.equal(halfmoveBucket(49), "hm0-49");
    assert.equal(halfmoveBucket(50), "hm50-79");
    assert.equal(halfmoveBucket(80), "hm80-99");
    assert.equal(halfmoveBucket(99), "hm80-99");
    assert.equal(halfmoveBucket(100), "hm100+");
    // Same board, different fifty-move regime -> DISTINCT keys (not deduped).
    const near = "8/5k2/8/8/8/8/3K4/6R1 w - - 98 120";
    const far = "8/5k2/8/8/8/8/3K4/6R1 w - - 10 80";
    const kNear = positionKey(createEngineCore(near), FEN, MoveFlags);
    const kFar = positionKey(createEngineCore(far), FEN, MoveFlags);
    assert.notEqual(kNear, kFar);
    assert.ok(kNear.endsWith(" hm80-99"));
    assert.ok(kFar.endsWith(" hm0-49"));
});

test("canonicalFen normalizes irrelevant ep, keeps legal ep and clocks", async () => {
    const coach = await loadCoach();
    const { FEN, MoveFlags, createEngineCore } = coach;
    // After 1.e4 the ep target e3 has no legal capture -> normalized to '-'.
    const afterE4 = positionIdentity(createEngineCore("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"), FEN, MoveFlags);
    assert.equal(afterE4.epLegal, false);
    assert.equal(afterE4.canonicalFen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    // Legal ep is preserved in the canonical FEN, clocks untouched.
    const legalEp = positionIdentity(createEngineCore("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"), FEN, MoveFlags);
    assert.equal(legalEp.epLegal, true);
    assert.ok(legalEp.canonicalFen.includes(" f6 0 3"));
});

test("fenSanity flags illegal boards, accepts legal ones", () => {
    assert.deepEqual(fenSanity("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), []);
    assert.ok(fenSanity("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1").includes("invalid side-to-move token"));
    assert.ok(fenSanity("rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").includes("black king count != 1"));
    // pawn on rank 8 (back rank) is impossible
    assert.ok(fenSanity("Pnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").includes("pawn on rank 8"));
    assert.ok(fenSanity("rnbqkbnr/8/8/8/8/8/8/RNBQKBNP w KQkq - 0 1").includes("pawn on rank 1"));
});

test("material signature and phase", () => {
    assert.equal(materialSignature("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"), "KQRRBBNNPPPPPPPP|kqrrbbnnpppppppp");
    assert.equal(gamePhase(START_FEN), "opening");
    assert.equal(gamePhase("8/5k2/8/8/8/8/3K4/8 w - - 0 40"), "endgame");
});

test("sampling deterministic, no consecutive plies, colour balance", () => {
    const frames = Array.from({ length: 60 }, (_, ply) => ({ ply, isTerminal: false, inCheck: false }));
    const a = sampleFrames(frames, "gameA", {});
    const b = sampleFrames(frames, "gameA", {});
    assert.deepEqual(a.map(f => f.ply), b.map(f => f.ply));
    for (let i = 1; i < a.length; i++) assert.ok(a[i].ply - a[i - 1].ply >= 4);
    // colour balance across many games
    let w = 0, tot = 0;
    for (let g = 0; g < 200; g++)
        for (const f of sampleFrames(frames, "game" + g, {})) { tot++; if (f.ply % 2 === 0) w++; }
    const ratio = w / tot;
    assert.ok(ratio > 0.35 && ratio < 0.65, "colour skew: " + ratio);
});

test("splits deterministic, game-level, all buckets used", () => {
    const mk = (i) => ({ headers: { White: "A", Black: "B", Date: "d", Round: String(i), Event: "e", Site: "s", Result: "1-0" }, sanMoves: ["e4", "e5", "Nf3" + i] });
    const seen = { train: 0, val: 0, test: 0 };
    for (let i = 0; i < 300; i++) {
        const g = mk(i);
        const s1 = assignSplit(g), s2 = assignSplit(g);
        assert.equal(s1, s2);        // deterministic
        seen[s1]++;
    }
    assert.ok(seen.train > 0 && seen.val > 0 && seen.test > 0, JSON.stringify(seen));
    assert.ok(seen.train > seen.val && seen.train > seen.test);
});

test("feature encoder + parity fixture", () => {
    const start = encodeFen(START_FEN);
    // 32 pieces + side-to-move + 4 castling = 37 active
    assert.equal(start.length, 37);
    assert.ok(start.includes(768) && start.includes(769) && start.includes(772));
    assert.equal(FEATURE_DIM, 781);
    const fx = JSON.parse(fs.readFileSync(new URL("../fixtures/feature-parity.json", import.meta.url)));
    for (const row of fx.fixtures) assert.deepEqual(encodeFen(row.fen), row.indices, row.fen);
});

test("pgn reader strips comments/variations/NAGs", () => {
    const pgn = `[Event "t"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 {best} e5 (1... c5 $10 {sicilian}) 2. Nf3 Nc6 1-0\n`;
    const games = splitGames(pgn);
    assert.equal(games.length, 1);
    const moves = extractSanMoves(games[0].moveText);
    assert.deepEqual(moves, ["e4", "e5", "Nf3", "Nc6"]);
    assert.equal(normalizeSan("Nf3+"), "Nf3");
    assert.equal(normalizeSan("O-O#"), "O-O");
});

test("replay produces correct FENs", async () => {
    const coach = await loadCoach();
    const game = { index: 0, headers: { Result: "*" }, sanMoves: ["e4", "e5", "Nf3"] };
    const { frames, error } = replayGame(coach, game);
    assert.equal(error, null);
    assert.equal(frames.length, 4);
    assert.equal(frames[1].fen.split(" ").slice(0, 4).join(" "),
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3");
    assert.equal(frames[3].sideToMove, "b");
});

test("jsonl append/read roundtrip, torn line dropped, key set", () => {
    const p = tmp("a.jsonl");
    const w = new AppendWriter(p);
    w.append({ positionKey: "k1", v: 1 });
    w.append({ positionKey: "k2", v: 2 });
    w.close();
    fs.appendFileSync(p, '{"positionKey":"k3", "v":');  // torn trailing write
    const { records, droppedTrailing } = readJsonl(p);
    assert.equal(records.length, 2);
    assert.equal(droppedTrailing, true);
    assert.deepEqual([...labelledKeySet(p)].sort(), ["k1", "k2"]);
    fs.unlinkSync(p);
});

test("AppendWriter heals a torn trailing line before resuming", () => {
    const p = tmp("heal.jsonl");
    const w = new AppendWriter(p);
    w.append({ positionKey: "k1", v: 1 });
    w.append({ positionKey: "k2", v: 2 });
    w.close();
    // Simulate a crash mid-write: a partial record with no trailing newline.
    fs.appendFileSync(p, '{"positionKey":"k3","stockfish":');
    // Resuming opens a new writer, which must heal (truncate) the torn line
    // so the next append does not merge onto it.
    const w2 = new AppendWriter(p);
    w2.append({ positionKey: "k3", v: 3 });
    w2.close();
    const { records, malformed, droppedTrailing } = readJsonl(p);
    assert.equal(malformed.length, 0, "no merged/corrupt line");
    assert.equal(droppedTrailing, false);
    assert.deepEqual(records.map((r) => r.positionKey), ["k1", "k2", "k3"]);
    fs.unlinkSync(p);
});

test("stockfish parse normalizes to White perspective", () => {
    const sf = new Stockfish("/nonexistent");
    // Black to move, side-relative +120 => White is worse (-120)
    let r = sf._parse("info depth 10 score cp 120 wdl 100 800 100 nodes 5 time 1 pv e7e5", "e7e5", "b");
    assert.equal(r.scoreCpWhite, -120);
    assert.deepEqual(r.wdl, [100, 800, 100]); // symmetric here
    // Black to move mate in 2 for side to move => White gets mated => -2
    r = sf._parse("info depth 3 score mate 2 wdl 1000 0 0 nodes 5 time 1 pv a1a2", "a1a2", "b");
    assert.equal(r.mate, -2);
    assert.equal(r.scoreCpWhite, null);
    assert.deepEqual(r.wdl, [0, 0, 1000]); // win-for-black => White loss
    // White to move, positive stays positive
    r = sf._parse("info depth 10 score cp 55 wdl 300 600 100 nodes 5 time 1 pv d2d4", "d2d4", "w");
    assert.equal(r.scoreCpWhite, 55);
    assert.deepEqual(r.wdl, [300, 600, 100]);
});
