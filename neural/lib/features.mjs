//======================================================
// features.mjs  (stage-5 groundwork)
// Sparse feature encoder. Pure function of the FEN string
// so the JS and Python encoders produce identical indices.
//
// BASELINE index layout (dimension = 781) — unchanged, still the default:
//   0..767   piece-square planes: plane*64 + square
//            plane order: WP WN WB WR WQ WK BP BN BB BR BQ BK  (0..11)
//            square = rank0based_from_white_side*8 + file
//                     a1=0, b1=1 ... h1=7, a2=8 ... h8=63
//   768      side to move: set iff White to move
//   769..772 castling rights: K, Q, k, q
//   773..780 en-passant file a..h: set iff FEN ep field != '-'
//
// OPTIONAL endgame groups (encodeFenExtended) append AFTER 780. The baseline
// is a piece-square table: a sum of independent per-piece terms. Relational
// endgame concepts (king-to-pawn distance, passed pawns, opposition, rule of
// the square) are NOT additively separable, so a linear model over the
// baseline provably cannot represent them and an MLP can only learn them
// sample-inefficiently. These groups supply those relations directly, as
// compact BUCKETED ONE-HOT bits (never a dense pair explosion), so the
// existing binary sparse representation is preserved.
//
// Groups are enabled independently for ablation. Offsets are assigned in the
// canonical GROUP_ORDER over the ENABLED groups only, so a model must record
// its group list (see exportModel/featureGroups) for inference to reproduce
// the encoding. Everything is derived from the FEN alone — no engine, no
// labels, no metadata.
//======================================================

import * as E from "./endgame.mjs";

export const FEATURE_DIM = 781;      // baseline dimension (unchanged)
const BASE_DIM = 781;
const PLANE = { P:0, N:1, B:2, R:3, Q:4, K:5, p:6, n:7, b:8, r:9, q:10, k:11 };

// Canonical order + width of each optional group.
export const GROUP_ORDER = ["endgame-material-class", "passed-pawns", "king-distance", "king-pawn-geometry", "rook-ending", "interactions"];
export const GROUP_DIM = {
    "endgame-material-class": 13,
    "passed-pawns": 38,
    "king-distance": 34,
    "king-pawn-geometry": 11,
    "rook-ending": 16,
    "interactions": 8,
};
export const FEATURE_SCHEMA_VERSION = "coach-neural-features-2";

// Validate + canonicalise a group list; returns { groups, dim, offsets }.
export function featureLayout(groups = []) {
    for (const g of groups) if (!GROUP_DIM[g]) throw new Error("unknown feature group: " + g);
    const canon = GROUP_ORDER.filter((g) => groups.includes(g));
    const offsets = {};
    let off = BASE_DIM;
    for (const g of canon) { offsets[g] = off; off += GROUP_DIM[g]; }
    return { groups: canon, dim: off, offsets };
}

const bucket = (v, edges) => { for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return i; return edges.length; };

export function encodeFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const placement = parts[0];
    const stm = parts[1];
    const castling = parts[2] || "-";
    const ep = parts[3] || "-";

    const idx = [];
    const rows = placement.split("/"); // rows[0] = rank 8
    for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const ch of rows[r]) {
            if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
            const plane = PLANE[ch];
            const rank0 = 7 - r;            // rank 8 row -> 7
            const sq = rank0 * 8 + file;
            idx.push(plane * 64 + sq);
            file++;
        }
    }
    if (stm === "w") idx.push(768);
    if (castling.includes("K")) idx.push(769);
    if (castling.includes("Q")) idx.push(770);
    if (castling.includes("k")) idx.push(771);
    if (castling.includes("q")) idx.push(772);
    if (ep !== "-") {
        const f = ep.charCodeAt(0) - 97; // 'a' -> 0
        if (f >= 0 && f < 8) idx.push(773 + f);
    }
    idx.sort((a, b) => a - b);
    return idx;
}

// ---- optional endgame groups -------------------------------------------
// Every emitter is a pure function of the parsed board. `push(bit)` writes an
// index relative to the group's offset.

function bestPasser(passers, white) {
    if (!passers.length) return null;
    return passers.reduce((a, b) => ((white ? b.rank > a.rank : b.rank < a.rank) ? b : a));
}

function emitMaterialClass(board, push) {
    const cls = E.materialClass(board);
    const order = ["pawn-only", "minor-piece", "rook", "queen", "queenless-mixed", "mixed"];
    const i = order.indexOf(cls);
    if (i >= 0) push(i);                                     // 0..5
    const bc = E.bishopColourState(board);
    if (bc === "opposite-coloured") push(6);
    if (bc === "same-coloured") push(7);
    push(8 + bucket(E.nonPawnMaterial(board).total, [3, 6, 12, 20]));   // 8..12
}

function emitPassedPawns(board, push) {
    for (const [white, base] of [[true, 0], [false, 19]]) {
        const ps = E.passedPawns(board, white);
        push(base + Math.min(3, ps.length));                 // count bucket 0..3
        const best = bestPasser(ps, white);
        if (best) {
            const advance = white ? best.rank : 7 - best.rank;   // 1..6
            push(base + 4 + Math.min(5, Math.max(0, advance - 1)));  // rank one-hot 4..9
            if (ps.some((p) => p.isProtected)) push(base + 10);
            if (ps.some((p) => p.connected)) push(base + 11);
            if (ps.some((p) => p.outside)) push(base + 12);
            if (ps.some((p) => p.mobile)) push(base + 13);
            push(base + 14 + bucket(best.steps, [1, 2, 3, 4]));   // dist-to-promo 14..18
        }
    }
}

function emitKingDistance(board, push) {
    for (const [white, base] of [[true, 0], [false, 17]]) {
        const ok = E.kingSq(board, white), ek = E.kingSq(board, !white);
        const ps = E.passedPawns(board, white);
        const best = bestPasser(ps, white);
        if (best && ok !== null) push(base + bucket(E.chebyshev(ok, best.sq), [1, 3, 5]));            // 0..3
        if (best && ek !== null) push(base + 4 + bucket(E.chebyshev(ek, best.promoSq), [1, 3, 5]));   // 4..7
        if (ok !== null) push(base + 8 + Math.min(3, Math.round(E.centralization(ok))));              // 8..11
        const ownPawns = E.pieceList(board, white ? "P" : "p");
        if (ok !== null && ownPawns.length) {
            const d = Math.min(...ownPawns.map((p) => E.chebyshev(ok, p)));
            push(base + 12 + bucket(d, [1, 3]));                                                      // 12..14
        }
        if (best && E.enemyKingOutsideSquare(board, best, white)) {
            push(base + 15);                                                                          // rule of square
            if (board.stm === (white ? "w" : "b")) push(base + 16);   // explicit side-to-move handling
        }
    }
}

function emitKingPawnGeometry(board, push) {
    const o = E.oppositionState(board);
    if (o.kind === "direct") push(o.holder === "w" ? 0 : 1);
    if (o.kind === "distant") push(o.holder === "w" ? 2 : 3);
    const wk = E.kingSq(board, true), bk = E.kingSq(board, false);
    if (wk === null || bk === null) return;
    const df = Math.abs(E.fileOf(wk) - E.fileOf(bk)), dr = Math.abs(E.rankOf(wk) - E.rankOf(bk));
    if (df === 0) push(4);
    if (dr === 0) push(5);
    if (df === dr) push(6);
    push(7 + bucket(Math.max(df, dr), [1, 2, 3]));            // 7..10
}

function emitRookEnding(board, push) {
    for (const [white, base] of [[true, 0], [false, 8]]) {
        const rb = E.rookBehindPasser(board, white);
        if (rb.ownBehind > 0) push(base + 0);
        if (rb.enemyBehind > 0) push(base + 1);
        push(base + 2 + Math.min(2, E.rooksOnSeventh(board, white)));    // 2..4
        const fs = E.rookFileState(board, white);
        if (fs.open > 0) push(base + 5);
        if (fs.semiOpen > 0) push(base + 6);
        if (E.kingCutOffFromPasser(board, white) > 0) push(base + 7);
    }
}

function emitInteractions(board, push) {
    for (const [white, base] of [[true, 0], [false, 4]]) {
        const ps = E.passedPawns(board, white);
        const best = bestPasser(ps, white);
        if (!best) continue;
        const advance = white ? best.rank : 7 - best.rank;
        const outside = E.enemyKingOutsideSquare(board, best, white);
        if (advance >= 4 && outside) push(base + 0);                       // advanced + uncatchable
        if (E.materialClass(board) === "rook" && E.rookBehindPasser(board, white).ownBehind > 0) push(base + 1);
        const ok = E.kingSq(board, white), ek = E.kingSq(board, !white);
        if (E.nonPawnMaterial(board).total <= 6 && ok !== null && ek !== null
            && E.chebyshev(ok, best.sq) < E.chebyshev(ek, best.sq)) push(base + 2);   // low material + king closer
        if (best.isProtected && advance >= 4) push(base + 3);
    }
}

const EMITTERS = {
    "endgame-material-class": emitMaterialClass,
    "passed-pawns": emitPassedPawns,
    "king-distance": emitKingDistance,
    "king-pawn-geometry": emitKingPawnGeometry,
    "rook-ending": emitRookEnding,
    "interactions": emitInteractions,
};

// Baseline 781 features plus any enabled endgame groups. `groups` = [] gives
// exactly encodeFen (bit-identical), so the baseline is always preserved.
export function encodeFenExtended(fen, groups = []) {
    const idx = encodeFen(fen);
    if (!groups.length) return idx;
    const layout = featureLayout(groups);
    const board = E.parseBoard(fen);
    for (const g of layout.groups) {
        const off = layout.offsets[g];
        const dim = GROUP_DIM[g];
        EMITTERS[g](board, (bit) => {
            if (bit < 0 || bit >= dim) throw new Error(`feature group ${g} emitted out-of-range bit ${bit}`);
            idx.push(off + bit);
        });
    }
    idx.sort((a, b) => a - b);
    return idx;
}
