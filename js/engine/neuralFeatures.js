//======================================================
// neuralFeatures.js
// EXPERIMENTAL, isolated from production evaluation. Vendored copy of the
// 781-dim baseline sparse feature encoder from the neural-eval worktree
// (neural/lib/features.mjs), kept self-contained so this experimental
// engine build has no cross-worktree dependency. Pure function of a FEN
// string; identical algorithm to the accepted neural pipeline's baseline
// encoder (parity-tested there against 27 fixtures).
//======================================================

export const FEATURE_DIM = 781;
const PLANE = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };

export function encodeFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const placement = parts[0];
    const stm = parts[1];
    const castling = parts[2] || "-";
    const ep = parts[3] || "-";

    const idx = [];
    const rows = placement.split("/");
    for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const ch of rows[r]) {
            if (ch >= "1" && ch <= "8") { file += Number(ch); continue; }
            const plane = PLANE[ch];
            const rank0 = 7 - r;
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
        const f = ep.charCodeAt(0) - 97;
        if (f >= 0 && f < 8) idx.push(773 + f);
    }
    idx.sort((a, b) => a - b);
    return idx;
}
