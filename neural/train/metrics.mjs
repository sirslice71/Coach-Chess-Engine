//======================================================
// train/metrics.mjs — pure metric helpers (no I/O).
//======================================================
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const mse = (p, t) => mean(p.map((v, i) => (v - t[i]) ** 2));
export const mae = (p, t) => mean(p.map((v, i) => Math.abs(v - t[i])));
export function pearson(x, y) {
    const n = x.length; if (n < 2) return null;
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function ranks(arr) {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    let i = 0;
    while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
        const avg = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
        i = j + 1;
    }
    return r;
}
export function spearman(x, y) { if (x.length < 2) return null; return pearson(ranks(x), ranks(y)); }
export const round = (x, d = 4) => (x == null ? null : +x.toFixed(d));
