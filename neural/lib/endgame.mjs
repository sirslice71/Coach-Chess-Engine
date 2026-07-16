//======================================================
// lib/endgame.mjs
// Pure, deterministic board primitives for endgame-aware features and
// endgame diagnostics. Derived ONLY from the FEN (placement + side to move
// + clocks) — no Stockfish, no Coach evaluation, no search, no metadata.
//
// Squares are 0..63 with a1=0, b1=1 ... h1=7, a2=8 ... h8=63 — the SAME
// convention as lib/features.mjs (rank0*8 + file), so indices line up.
//
// Everything here is White-relative in sign: a positive quantity favours
// White. Mirrored (colour-swapped + vertically flipped) positions must
// produce negated values; tests pin this.
//======================================================

export function parseBoard(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const rows = parts[0].split("/");
    const squares = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const ch of rows[r]) {
            if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
            squares[(7 - r) * 8 + file] = ch;
            file++;
        }
    }
    return { squares, stm: parts[1] === "w" ? "w" : "b", halfmove: Number(parts[4] ?? 0) };
}

export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 3;               // 0 = rank 1
export const chebyshev = (a, b) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
export const manhattan = (a, b) => Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));

export function pieceList(board, piece) {
    const out = [];
    for (let s = 0; s < 64; s++) if (board.squares[s] === piece) out.push(s);
    return out;
}
export function counts(board) {
    const c = {};
    for (const p of board.squares) if (p) c[p] = (c[p] || 0) + 1;
    return c;
}
export const kingSq = (board, white) => pieceList(board, white ? "K" : "k")[0] ?? null;

// Distance from a square to the nearest central square (d4/e4/d5/e5).
export function centralization(sq) {
    const f = fileOf(sq), r = rankOf(sq);
    return Math.max(Math.abs(f - 3.5) - 0.5, Math.abs(r - 3.5) - 0.5); // 0 (centre) .. 3 (corner)
}

// ---- passed pawns -------------------------------------------------------
// A white pawn is passed when no black pawn stands on its file or an adjacent
// file on any strictly higher rank (and vice versa). This is a conjunction /
// negation over many enemy-pawn squares, which is exactly what an additive
// piece-square model cannot represent.
export function passedPawns(board, white) {
    const own = pieceList(board, white ? "P" : "p");
    const enemy = pieceList(board, white ? "p" : "P");
    const ownAll = own;
    const out = [];
    for (const sq of own) {
        const f = fileOf(sq), r = rankOf(sq);
        let blocked = false;
        for (const e of enemy) {
            const ef = fileOf(e), er = rankOf(e);
            if (Math.abs(ef - f) > 1) continue;
            if (white ? er > r : er < r) { blocked = true; break; }
        }
        if (blocked) continue;
        // distance to promotion (double-step allowed from the home rank)
        const homeRank = white ? 1 : 6;
        const stepsPlain = white ? 7 - r : r;
        const steps = r === homeRank ? stepsPlain - 1 : stepsPlain;
        // protected: defended by an own pawn diagonally behind
        const backR = white ? r - 1 : r + 1;
        const isProtected = ownAll.some((o) => rankOf(o) === backR && Math.abs(fileOf(o) - f) === 1);
        // mobile: square directly ahead is empty
        const ahead = white ? sq + 8 : sq - 8;
        const mobile = ahead >= 0 && ahead < 64 && board.squares[ahead] === null;
        out.push({ sq, file: f, rank: r, steps, promoSq: white ? 56 + f : f, isProtected, mobile });
    }
    // connected: another passer of the same colour on an adjacent file
    for (const p of out) p.connected = out.some((q) => q !== p && Math.abs(q.file - p.file) === 1);
    // outside: >=3 files away from the centre of mass of every other pawn on the board
    const others = [...pieceList(board, "P"), ...pieceList(board, "p")];
    for (const p of out) {
        const rest = others.filter((s) => s !== p.sq);
        if (!rest.length) { p.outside = false; continue; }
        const com = rest.reduce((a, s) => a + fileOf(s), 0) / rest.length;
        p.outside = Math.abs(p.file - com) >= 3;
    }
    return out;
}

// ---- rule of the square -------------------------------------------------
// Can the defending king catch an unaided passer? The pawn needs `steps`
// moves; the defender needs `kd` moves to reach the promotion square, and
// gets one fewer move when the pawn's side is to move.
export function enemyKingOutsideSquare(board, passer, white) {
    const ek = kingSq(board, !white);
    if (ek === null) return false;
    const kd = chebyshev(ek, passer.promoSq);
    const defenderToMove = board.stm === (white ? "b" : "w");
    const budget = defenderToMove ? passer.steps : passer.steps - 1;
    return kd > budget;
}

// ---- king opposition ----------------------------------------------------
// Kings on the same file/rank with an odd number of squares between them and
// the OTHER side to move => that side is in opposition. Direct = 1 square
// between; distant = 3 or 5. Joint function of both kings + side to move.
export function oppositionState(board) {
    const wk = kingSq(board, true), bk = kingSq(board, false);
    if (wk === null || bk === null) return { kind: "none", holder: null };
    const df = Math.abs(fileOf(wk) - fileOf(bk)), dr = Math.abs(rankOf(wk) - rankOf(bk));
    const aligned = df === 0 || dr === 0 || df === dr;   // same file, same rank, or same diagonal
    if (!aligned) return { kind: "none", holder: null };
    const gap = Math.max(df, dr) - 1;                     // squares strictly between the kings
    if (gap !== 1 && gap !== 3 && gap !== 5) return { kind: "none", holder: null };
    // the side NOT to move holds the opposition
    const holder = board.stm === "w" ? "b" : "w";
    return { kind: gap === 1 ? "direct" : "distant", holder };
}

// ---- material classification -------------------------------------------
export function materialClass(board) {
    const c = counts(board);
    const n = (k) => (c[k] || 0) + (c[k.toLowerCase()] || 0);
    const q = n("Q"), r = n("R"), b = n("B"), kn = n("N");
    const minors = b + kn;
    if (q === 0 && r === 0 && minors === 0) return "pawn-only";
    if (q === 0 && r === 0 && minors > 0) return "minor-piece";
    if (q === 0 && r > 0 && minors === 0) return "rook";
    if (q > 0 && r === 0 && minors === 0) return "queen";
    if (q === 0) return "queenless-mixed";
    return "mixed";
}

// Bishops on opposite colours (exactly one each side).
export function bishopColourState(board) {
    const wb = pieceList(board, "B"), bb = pieceList(board, "b");
    if (wb.length !== 1 || bb.length !== 1) return "n/a";
    const col = (s) => (fileOf(s) + rankOf(s)) % 2;
    return col(wb[0]) === col(bb[0]) ? "same-coloured" : "opposite-coloured";
}

// Total non-pawn material in classical-ish units (White + Black).
export function nonPawnMaterial(board) {
    const c = counts(board);
    const v = { N: 3, B: 3, R: 5, Q: 9 };
    let w = 0, b = 0;
    for (const [k, val] of Object.entries(v)) { w += (c[k] || 0) * val; b += (c[k.toLowerCase()] || 0) * val; }
    return { white: w, black: b, total: w + b };
}

// ---- rook-ending geometry ----------------------------------------------
// Rook behind a passer (same file, behind it from the pawn's direction), and
// whether a rook cuts the enemy king off on a file or rank.
export function rookBehindPasser(board, white) {
    const rooks = pieceList(board, white ? "R" : "r");
    let ownBehind = 0, enemyBehind = 0;
    for (const p of passedPawns(board, white)) {
        for (const rk of rooks) if (fileOf(rk) === p.file && (white ? rankOf(rk) < p.rank : rankOf(rk) > p.rank)) ownBehind++;
        const eRooks = pieceList(board, white ? "r" : "R");
        for (const rk of eRooks) if (fileOf(rk) === p.file && (white ? rankOf(rk) < p.rank : rankOf(rk) > p.rank)) enemyBehind++;
    }
    return { ownBehind, enemyBehind };
}
// Rook on the 7th (White) / 2nd (Black) — the classic activity marker.
export function rooksOnSeventh(board, white) {
    const rooks = pieceList(board, white ? "R" : "r");
    const target = white ? 6 : 1;                       // rank 7 (0-indexed 6) / rank 2
    return rooks.filter((s) => rankOf(s) === target).length;
}

// Rook on a file with no pawns at all (open) or no own pawns (semi-open).
export function rookFileState(board, white) {
    const rooks = pieceList(board, white ? "R" : "r");
    const ownP = pieceList(board, white ? "P" : "p").map(fileOf);
    const enemyP = pieceList(board, white ? "p" : "P").map(fileOf);
    let open = 0, semiOpen = 0;
    for (const rk of rooks) {
        const f = fileOf(rk);
        const hasOwn = ownP.includes(f), hasEnemy = enemyP.includes(f);
        if (!hasOwn && !hasEnemy) open++;
        else if (!hasOwn) semiOpen++;
    }
    return { open, semiOpen };
}

// Enemy king cut off from the passer's file by an own rook standing on a file
// strictly between them (a defensible, testable reading of "cut off").
export function kingCutOffFromPasser(board, white) {
    const rooks = pieceList(board, white ? "R" : "r");
    const ek = kingSq(board, !white);
    if (ek === null) return 0;
    let cut = 0;
    for (const p of passedPawns(board, white)) {
        for (const rk of rooks) {
            const rf = fileOf(rk), kf = fileOf(ek), pf = p.file;
            if ((rf > pf && rf < kf) || (rf < pf && rf > kf)) { cut++; break; }
        }
    }
    return cut;
}
