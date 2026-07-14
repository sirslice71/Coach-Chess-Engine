//======================================================
// position.mjs
// Position identity + metadata derived from a Coach core.
//
// positionKey (dedup identity) = normalized FEN made of:
//   piece placement | side to move | castling rights |
//   en-passant square ONLY IF a legal en-passant capture
//   exists in this position | halfmove-clock bucket.
// The FULLMOVE counter is excluded (it never changes the set
// of legal continuations). The HALFMOVE clock is kept only as
// a coarse bucket (0-49 / 50-79 / 80-99 / 100+) so that two
// otherwise-identical positions sitting in different fifty-move
// regimes (one far from a draw claim, one on its doorstep) are
// NOT merged, while trivial clock differences still dedup.
//======================================================

const PIECE_ORDER_W = ["K", "Q", "R", "B", "N", "P"];
const PIECE_ORDER_B = ["k", "q", "r", "b", "n", "p"];

// Split a full FEN into fields.
export function fenFields(fen) {
    const p = fen.trim().split(/\s+/);
    return {
        placement: p[0],
        stm: p[1],
        castling: p[2] || "-",
        ep: p[3] || "-",
        halfmove: p[4] !== undefined ? Number(p[4]) : 0,
        fullmove: p[5] !== undefined ? Number(p[5]) : 1,
    };
}

// Count pieces from the placement field.
export function pieceCounts(placement) {
    const c = {};
    for (const ch of placement) {
        if (/[a-zA-Z]/.test(ch)) c[ch] = (c[ch] || 0) + 1;
    }
    return c;
}

export function materialSignature(placement) {
    const c = pieceCounts(placement);
    const side = (order) =>
        order.map((k) => k.repeat(c[k] || 0)).join("");
    return side(PIECE_ORDER_W) + "|" + side(PIECE_ORDER_B);
}

// 24-point non-pawn phase (start = 24, bare kings = 0).
export function phaseScore(placement) {
    const c = pieceCounts(placement);
    const n = (k) => c[k] || 0;
    const minors = n("N") + n("n") + n("B") + n("b");
    const rooks = n("R") + n("r");
    const queens = n("Q") + n("q");
    return Math.min(24, minors * 1 + rooks * 2 + queens * 4);
}

export function gamePhase(fen) {
    const f = fenFields(fen);
    const ps = phaseScore(f.placement);
    if (ps <= 6) return "endgame";
    if (ps >= 22 && f.fullmove <= 10) return "opening";
    return "middlegame";
}

// Does a legal en-passant capture exist? (Coach legal movegen.)
export function hasLegalEnPassant(core, MoveFlags) {
    if (core.board.enPassantSquare === -1) return false;
    const moves = core.legalMoveGenerator.generateMoves();
    for (const m of moves) {
        if ((m.flags & MoveFlags.EN_PASSANT) !== 0) return true;
    }
    return false;
}

// Coarse halfmove-clock bucket used in the dedup key.
// Buckets: 0-49, 50-79, 80-99, 100+ (the fifty-move rule fires at 100
// halfmoves). Positions differing only within a bucket still dedup;
// positions straddling a boundary are kept distinct.
export function halfmoveBucket(hm) {
    const n = Number.isFinite(hm) ? hm : 0;
    if (n >= 100) return "hm100+";
    if (n >= 80) return "hm80-99";
    if (n >= 50) return "hm50-79";
    return "hm0-49";
}

// Compute the canonical position identity in one pass:
//   key           - dedup identity (placement stm castling ep hmBucket)
//   canonicalFen  - full FEN whose ep field is normalized to '-' unless a
//                   legal en-passant capture exists, so the stored record,
//                   the dedup key, and the sparse feature encoder all agree
//                   on the en-passant state. Clocks are preserved.
//   epLegal       - whether a legal en-passant capture exists.
export function positionIdentity(core, FEN, MoveFlags) {
    const fen = FEN.export(core.board);
    const f = fenFields(fen);
    const epLegal = hasLegalEnPassant(core, MoveFlags);
    const ep = epLegal ? f.ep : "-";
    const castling = f.castling === "" ? "-" : f.castling;
    const key = [f.placement, f.stm, castling, ep, halfmoveBucket(f.halfmove)].join(" ");
    const canonicalFen = [f.placement, f.stm, castling, ep, f.halfmove, f.fullmove].join(" ");
    return { key, canonicalFen, epLegal };
}

// Build the canonical dedup key for the current core position.
export function positionKey(core, FEN, MoveFlags) {
    return positionIdentity(core, FEN, MoveFlags).key;
}
