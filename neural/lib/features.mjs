//======================================================
// features.mjs  (stage-5 groundwork)
// Sparse feature encoder. Pure function of the FEN string
// so the JS and Python encoders produce identical indices.
//
// Index layout (dimension = 781):
//   0..767   piece-square planes: plane*64 + square
//            plane order: WP WN WB WR WQ WK BP BN BB BR BQ BK  (0..11)
//            square = rank0based_from_white_side*8 + file
//                     a1=0, b1=1 ... h1=7, a2=8 ... h8=63
//   768      side to move: set iff White to move
//   769..772 castling rights: K, Q, k, q
//   773..780 en-passant file a..h: set iff FEN ep field != '-'
//======================================================

export const FEATURE_DIM = 781;
const PLANE = { P:0, N:1, B:2, R:3, Q:4, K:5, p:6, n:7, b:8, r:9, q:10, k:11 };

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
