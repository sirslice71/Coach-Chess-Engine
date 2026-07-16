//======================================================
// endgame-features.test.mjs
// Unit tests for the endgame primitives and the optional feature groups.
// Positions are hand-constructed so the expected answer is checkable by eye.
//======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as E from "../lib/endgame.mjs";
import { encodeFen, encodeFenExtended, featureLayout, GROUP_DIM, GROUP_ORDER, FEATURE_DIM } from "../lib/features.mjs";

const B = (fen) => E.parseBoard(fen);
const sq = (name) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
const ALL = GROUP_ORDER;

// ---- layout ----
test("featureLayout: baseline untouched, groups canonical + contiguous", () => {
    assert.equal(FEATURE_DIM, 781);
    assert.deepEqual(featureLayout([]), { groups: [], dim: 781, offsets: {} });
    // order is canonical regardless of the order requested
    const l = featureLayout(["rook-ending", "passed-pawns"]);
    assert.deepEqual(l.groups, ["passed-pawns", "rook-ending"]);
    assert.equal(l.offsets["passed-pawns"], 781);
    assert.equal(l.offsets["rook-ending"], 781 + GROUP_DIM["passed-pawns"]);
    assert.equal(l.dim, 781 + GROUP_DIM["passed-pawns"] + GROUP_DIM["rook-ending"]);
    const all = featureLayout(ALL);
    assert.equal(all.dim, 781 + ALL.reduce((a, g) => a + GROUP_DIM[g], 0));
    assert.throws(() => featureLayout(["nope"]), /unknown feature group/);
});

test("encodeFenExtended with no groups is bit-identical to the 781 baseline", () => {
    const fens = ["8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"];
    for (const f of fens) assert.deepEqual(encodeFenExtended(f, []), encodeFen(f));
});

test("extended indices stay in range and baseline indices are preserved", () => {
    const fen = "8/5ppp/8/8/8/8/PPP5/8 w - - 0 1";
    const base = encodeFen(fen);
    const ext = encodeFenExtended(fen, ALL);
    const dim = featureLayout(ALL).dim;
    assert.ok(ext.every((i) => i >= 0 && i < dim));
    assert.deepEqual(ext.filter((i) => i < 781), base, "baseline block must be unchanged");
    assert.deepEqual([...ext].sort((a, b) => a - b), ext, "indices must be sorted");
    assert.equal(new Set(ext).size, ext.length, "no duplicate indices");
});

// ---- passed pawns ----
test("passedPawns: none when an enemy pawn blocks the file or an adjacent file", () => {
    // white d4 vs black d5 (same file) and e5 (adjacent) -> not passed
    assert.equal(E.passedPawns(B("8/8/8/3pp3/3P4/8/8/8 w - - 0 1"), true).length, 0);
    // white d4, black pawn on a7 far away -> passed
    const p = E.passedPawns(B("8/p7/8/8/3P4/8/8/8 w - - 0 1"), true);
    assert.equal(p.length, 1);
    assert.equal(p[0].sq, sq("d4"));
});

test("passedPawns: protected / connected / outside / mobile flags", () => {
    // white b4+c5: c5 is protected by b4, both passed, adjacent files -> connected
    const ps = E.passedPawns(B("8/8/8/2P5/1P6/8/8/8 w - - 0 1"), true);
    assert.equal(ps.length, 2);
    const c5 = ps.find((p) => p.sq === sq("c5"));
    assert.equal(c5.isProtected, true, "c5 defended by b4");
    assert.equal(c5.connected, true);
    assert.equal(c5.mobile, true, "c6 empty");
    // blocked passer: white d5 with a black KING on d6 -> not mobile (still passed)
    const bl = E.passedPawns(B("8/8/3k4/3P4/8/8/8/8 w - - 0 1"), true);
    assert.equal(bl.length, 1);
    assert.equal(bl[0].mobile, false, "d6 occupied");
    // outside passer: white a5 while every other pawn sits on the kingside
    const out = E.passedPawns(B("8/5ppp/8/P7/5PPP/8/8/8 w - - 0 1"), true);
    const a5 = out.find((p) => p.sq === sq("a5"));
    assert.ok(a5, "a5 is passed");
    assert.equal(a5.outside, true, "far from the pawn mass");
});

test("passedPawns: distance to promotion accounts for the double step", () => {
    const home = E.passedPawns(B("8/8/8/8/8/8/4P3/8 w - - 0 1"), true)[0];
    assert.equal(home.rank, 1);
    assert.equal(home.steps, 5, "e2: double-step means 5 moves, not 6");
    const e5 = E.passedPawns(B("8/8/8/4P3/8/8/8/8 w - - 0 1"), true)[0];
    assert.equal(e5.steps, 3);
    assert.equal(e5.promoSq, sq("e8"));
});

// ---- rule of the square ----
test("enemyKingOutsideSquare: king inside catches, king outside does not", () => {
    // white h5 pawn, black king e7 -> kd(e7,h8)=3, steps=3, black to move => caught
    let b = B("8/4k3/8/7P/8/8/8/8 b - - 0 1");
    let p = E.passedPawns(b, true)[0];
    assert.equal(E.enemyKingOutsideSquare(b, p, true), false, "black to move, king reaches h8");
    // same position, WHITE to move -> black gets one fewer move => outside
    b = B("8/4k3/8/7P/8/8/8/8 w - - 0 1");
    p = E.passedPawns(b, true)[0];
    assert.equal(E.enemyKingOutsideSquare(b, p, true), true, "white to move: pawn is a tempo ahead");
    // king far away -> clearly outside
    b = B("k7/8/8/7P/8/8/8/8 b - - 0 1");
    p = E.passedPawns(b, true)[0];
    assert.equal(E.enemyKingOutsideSquare(b, p, true), true);
});

// ---- opposition ----
test("oppositionState: direct and distant, held by the side NOT to move", () => {
    // kings e4/e6, one square between, black to move => WHITE holds the opposition
    let o = E.oppositionState(B("8/8/4k3/8/4K3/8/8/8 b - - 0 1"));
    assert.deepEqual(o, { kind: "direct", holder: "w" });
    // same kings, white to move => BLACK holds
    o = E.oppositionState(B("8/8/4k3/8/4K3/8/8/8 w - - 0 1"));
    assert.deepEqual(o, { kind: "direct", holder: "b" });
    // e2 vs e6: three squares between -> distant
    o = E.oppositionState(B("8/8/4k3/8/8/8/4K3/8 b - - 0 1"));
    assert.deepEqual(o, { kind: "distant", holder: "w" });
    // not aligned -> none
    assert.equal(E.oppositionState(B("8/8/5k2/8/4K3/8/8/8 b - - 0 1")).kind, "none");
});

// ---- material classes ----
test("materialClass + bishopColourState + nonPawnMaterial", () => {
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/4P3/4K3 w - - 0 1")), "pawn-only");
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/4N3/4K3 w - - 0 1")), "minor-piece");
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/4R3/4K3 w - - 0 1")), "rook");
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/4Q3/4K3 w - - 0 1")), "queen");
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/3RN3/4K3 w - - 0 1")), "queenless-mixed");
    assert.equal(E.materialClass(B("8/4k3/8/8/8/8/3QN3/4K3 w - - 0 1")), "mixed");
    // light-square vs dark-square bishop (verified by (file+rank0)%2 parity):
    // c7 (col 0) vs c2 (col 1) -> opposite; d7 (col 1) vs c2 (col 1) -> same
    assert.equal(E.bishopColourState(B("8/2b1k3/8/8/8/8/2B1K3/8 w - - 0 1")), "opposite-coloured");
    assert.equal(E.bishopColourState(B("8/3bk3/8/8/8/8/2B1K3/8 w - - 0 1")), "same-coloured");
    assert.equal(E.nonPawnMaterial(B("8/4k3/8/8/8/8/3RN3/4K3 w - - 0 1")).total, 8); // R5 + N3
});

// ---- rook geometry ----
test("rookBehindPasser: own rook behind, enemy rook behind (Tarrasch)", () => {
    // white a4 rook, white a5 passer -> rook behind own passer
    let r = E.rookBehindPasser(B("8/8/8/P7/R7/8/8/8 w - - 0 1"), true);
    assert.equal(r.ownBehind, 1);
    assert.equal(r.enemyBehind, 0);
    // black rook a1 behind white's a5 passer (from White's direction)
    r = E.rookBehindPasser(B("8/8/8/P7/8/8/8/r7 w - - 0 1"), true);
    assert.equal(r.ownBehind, 0);
    assert.equal(r.enemyBehind, 1);
    // rook in FRONT of the passer is not "behind"
    r = E.rookBehindPasser(B("8/R7/8/P7/8/8/8/8 w - - 0 1"), true);
    assert.equal(r.ownBehind, 0);
});

test("rooksOnSeventh / rookFileState / kingCutOffFromPasser", () => {
    assert.equal(E.rooksOnSeventh(B("8/R6R/8/8/8/8/8/4K2k w - - 0 1"), true), 2);
    assert.equal(E.rooksOnSeventh(B("8/8/8/8/8/8/r7/4K2k w - - 0 1"), false), 1, "black's 7th is rank 2");
    // rook on d-file with no pawns anywhere -> open
    let fs = E.rookFileState(B("8/8/8/8/8/8/PP6/3R4 w - - 0 1"), true);
    assert.equal(fs.open, 1);
    assert.equal(fs.semiOpen, 0);
    // rook on a-file with only an enemy pawn there -> semi-open
    fs = E.rookFileState(B("8/p7/8/8/8/8/1P6/R7 w - - 0 1"), true);
    assert.equal(fs.semiOpen, 1);
    // white passer a5, black king h8, white rook on d1 sits between files a and h -> cut off
    assert.equal(E.kingCutOffFromPasser(B("7k/8/8/P7/8/8/8/3R4 w - - 0 1"), true), 1);
    // rook on the far side of the king does not cut it off from the passer
    assert.equal(E.kingCutOffFromPasser(B("7k/8/8/P7/8/8/8/R7 w - - 0 1"), true), 0);
});

// ---- symmetry / sign convention ----
// Mirroring (swap colours + flip ranks + swap side to move) must map White's
// feature block onto Black's exactly. This pins the sign convention.
function mirrorFen(fen) {
    const [pl, stm, castling, ep, hm, fm] = fen.trim().split(/\s+/);
    const rows = pl.split("/").reverse().map((row) =>
        row.split("").map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : /[A-Z]/.test(c) ? c.toLowerCase() : c)).join(""));
    const cast = castling === "-" ? "-" : castling.split("").map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : c.toLowerCase())).sort().join("");
    return [rows.join("/"), stm === "w" ? "b" : "w", cast, "-", hm ?? "0", fm ?? "1"].join(" ");
}

test("mirrored position swaps the White and Black halves of every side-split group", () => {
    const fen = "8/8/8/2P5/1P6/6k1/8/6K1 w - - 0 1";     // white connected passers b4/c5
    const mir = mirrorFen(fen);                            // -> black connected passers b5/c4
    for (const g of ["passed-pawns", "king-distance", "rook-ending", "interactions"]) {
        const half = GROUP_DIM[g] / 2;
        const off = featureLayout([g]).offsets[g];
        const bits = (f) => new Set(encodeFenExtended(f, [g]).filter((i) => i >= off).map((i) => i - off));
        const whiteBlock = [...bits(fen)].filter((i) => i < half).sort((x, y) => x - y);
        const blackBlockOfMirror = [...bits(mir)].filter((i) => i >= half).map((i) => i - half).sort((x, y) => x - y);
        assert.deepEqual(whiteBlock, blackBlockOfMirror, `group ${g}: White block must mirror onto Black block`);
    }
});

test("mirrored position: colour-agnostic groups agree", () => {
    const fen = "8/8/8/8/4k3/8/4P3/4K3 w - - 0 1";
    const mir = mirrorFen(fen);
    const off = featureLayout(["endgame-material-class"]).offsets["endgame-material-class"];
    const bits = (f) => encodeFenExtended(f, ["endgame-material-class"]).filter((i) => i >= off);
    assert.deepEqual(bits(fen), bits(mir), "material class is colour-symmetric");
});

// ---- committed extended-feature parity fixture (Python cross-checks the same file) ----
test("extended-feature encoder matches the committed parity fixture (JS side; Python checked via features.py)", () => {
    const fx = JSON.parse(fs.readFileSync(new URL("../fixtures/endgame-feature-parity.json", import.meta.url)));
    assert.deepEqual(fx.groups, GROUP_ORDER, "fixture must cover every group in canonical order");
    for (const row of fx.fixtures) assert.deepEqual(encodeFenExtended(row.fen, fx.groups), row.indices, row.fen);
});

// ---- no leakage / determinism ----
test("features depend only on the FEN and are deterministic", () => {
    const fen = "8/2p5/8/1P6/8/6k1/8/6K1 w - - 7 42";
    const a = encodeFenExtended(fen, ALL);
    const b = encodeFenExtended(fen, ALL);
    assert.deepEqual(a, b);
    // clocks must not change the encoding (no halfmove feature is claimed)
    const c = encodeFenExtended("8/2p5/8/1P6/8/6k1/8/6K1 w - - 99 200", ALL);
    assert.deepEqual(a, c, "halfmove/fullmove must not leak into features");
});
