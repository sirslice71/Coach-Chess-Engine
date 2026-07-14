//======================================================
// moveutil.mjs
// Square/move helpers shared by replay + validation.
// Assumes Coach square index 0 = a8 ... 63 = h1
// (rank = 8 - (sq>>3), file = sq & 7).
//======================================================

const PROMO = { 2: "n", 3: "b", 4: "r", 5: "q" };

export function squareToAlgebraic(sq) {
    const file = "abcdefgh"[sq & 7];
    const rank = 8 - (sq >> 3);
    return file + rank;
}

export function moveToUci(move) {
    let u = squareToAlgebraic(move.fromSquare) + squareToAlgebraic(move.toSquare);
    const isPromo = typeof move.isPromotion === "function"
        ? move.isPromotion()
        : !!move.promotedPiece;
    if (isPromo) u += PROMO[Math.abs(move.promotedPiece || 5)] || "q";
    return u;
}

export function legalUciSet(core) {
    const set = new Set();
    for (const m of core.legalMoveGenerator.generateMoves()) set.add(moveToUci(m));
    return set;
}
