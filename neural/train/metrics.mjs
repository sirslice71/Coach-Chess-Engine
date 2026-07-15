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
export const round = (x, d = 4) => (x == null ? null : +x.toFixed(d));
