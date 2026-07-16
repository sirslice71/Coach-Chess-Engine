//======================================================
// lib/calibration.mjs
// Deterministic, offline post-hoc recalibration of a trained value
// model's centipawn OUTPUT (not its weights/features). Every transform
// is a pure function `cp -> cp'`, fit in closed form (or a small fixed
// grid search) from (modelCp, stockfishCp) pairs on a supplied row set.
//
// No retraining, no new input features, no search involvement. All
// transforms are bounded to +/-clipCp, matching the model's existing
// output contract (see train/dataset.mjs targetToCp / DEFAULT_TARGET).
//======================================================

const DEFAULT_CLIP = 1000;

function clip(x, clipCp) { return Math.max(-clipCp, Math.min(clipCp, x)); }

//----------------------------------
// 1. Global affine: cp' = a*cp + b
// Ordinary least squares, closed form.
//----------------------------------
export function fitGlobalAffine(rows) {
    const n = rows.length;
    if (!n) return { a: 1, b: 0 };
    const mx = rows.reduce((s, r) => s + r.cp, 0) / n;
    const my = rows.reduce((s, r) => s + r.sf, 0) / n;
    let sxy = 0, sxx = 0;
    for (const r of rows) { const dx = r.cp - mx, dy = r.sf - my; sxy += dx * dy; sxx += dx * dx; }
    const a = sxx ? sxy / sxx : 1;
    const b = my - a * mx;
    return { a, b };
}
export function applyGlobalAffine(cp, params, clipCp = DEFAULT_CLIP) {
    return clip(params.a * cp + params.b, clipCp);
}

//----------------------------------
// 2. Phase-dependent affine: one {a,b} per game phase.
// Falls back to identity for a phase with too few rows to fit safely.
//----------------------------------
export const PHASES = ["opening", "middlegame", "endgame"];
const MIN_ROWS_PER_PHASE = 20;

export function fitPhaseAffine(rows) {
    const byPhase = { opening: [], middlegame: [], endgame: [] };
    for (const r of rows) if (byPhase[r.phase]) byPhase[r.phase].push(r);
    const out = {};
    for (const phase of PHASES) {
        const group = byPhase[phase] || [];
        out[phase] = group.length >= MIN_ROWS_PER_PHASE ? fitGlobalAffine(group) : { a: 1, b: 0 };
    }
    return out;
}
export function applyPhaseAffine(cp, phase, params, clipCp = DEFAULT_CLIP) {
    const p = params[phase] || { a: 1, b: 0 };
    return clip(p.a * cp + p.b, clipCp);
}

//----------------------------------
// 3. Symmetric monotonic power compression/expansion:
// cp' = sign(cp) * a * |cp|^p. p<1 compresses large magnitudes
// relative to small ones, p>1 expands them. Fit by a small fixed
// grid over p; for each p the optimal scalar a has closed form
// (1-D least squares).
//----------------------------------
export function fitPowerCompression(rows, { pMin = 0.5, pMax = 1.5, pStep = 0.02 } = {}) {
    let best = null;
    for (let p = pMin; p <= pMax + 1e-9; p += pStep) {
        let num = 0, den = 0;
        for (const r of rows) {
            const x = Math.sign(r.cp) * Math.pow(Math.abs(r.cp), p);
            num += x * r.sf; den += x * x;
        }
        const a = den ? num / den : 1;
        let sse = 0;
        for (const r of rows) {
            const x = Math.sign(r.cp) * Math.pow(Math.abs(r.cp), p);
            const err = a * x - r.sf; sse += err * err;
        }
        if (!best || sse < best.sse) best = { p: +p.toFixed(4), a, sse };
    }
    return { p: best.p, a: best.a };
}
export function applyPowerCompression(cp, params, clipCp = DEFAULT_CLIP) {
    const v = Math.sign(cp) * params.a * Math.pow(Math.abs(cp), params.p);
    return clip(v, clipCp);
}

//----------------------------------
// 4. Bounded piecewise-linear calibration: fixed knot x-positions,
// y-value at each knot is the mean Stockfish score of rows nearest
// that knot (nearest-knot assignment on a sorted knot list is exactly
// the midpoint partition), then pooled to be monotonic non-decreasing
// (weighted PAVA / isotonic regression) so the calibration never
// inverts the model's own ranking. Linear interpolation between knots;
// flat (bounded) extrapolation beyond the outermost knots.
//----------------------------------
export const DEFAULT_KNOTS = [-1000, -500, -300, -150, -75, -25, 0, 25, 75, 150, 300, 500, 1000];

function weightedPava(values, weights) {
    const stack = [];
    for (let i = 0; i < values.length; i++) {
        let seg = { v: values[i], w: weights[i], n: 1 };
        while (stack.length && stack[stack.length - 1].v > seg.v) {
            const prev = stack.pop();
            const w = prev.w + seg.w;
            seg = { v: (prev.v * prev.w + seg.v * seg.w) / w, w, n: prev.n + seg.n };
        }
        stack.push(seg);
    }
    const out = [];
    for (const seg of stack) for (let i = 0; i < seg.n; i++) out.push(seg.v);
    return out;
}

export function fitPiecewiseLinear(rows, knots = DEFAULT_KNOTS) {
    const n = knots.length;
    const sums = new Array(n).fill(0), counts = new Array(n).fill(0);
    for (const r of rows) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < n; i++) { const d = Math.abs(r.cp - knots[i]); if (d < bd) { bd = d; bi = i; } }
        sums[bi] += r.sf; counts[bi]++;
    }
    // Empty bins fall back to the identity (knot value itself) so a sparse
    // tail knot never introduces an arbitrary jump.
    const raw = knots.map((k, i) => (counts[i] ? sums[i] / counts[i] : k));
    const weights = counts.map((c) => Math.max(c, 1));
    const values = weightedPava(raw, weights);
    return { knots, values };
}
export function applyPiecewiseLinear(cp, params, clipCp = DEFAULT_CLIP) {
    const { knots, values } = params;
    const n = knots.length;
    if (cp <= knots[0]) return clip(values[0], clipCp);
    if (cp >= knots[n - 1]) return clip(values[n - 1], clipCp);
    for (let i = 0; i < n - 1; i++) {
        if (cp >= knots[i] && cp <= knots[i + 1]) {
            const t = (cp - knots[i]) / (knots[i + 1] - knots[i]);
            return clip(values[i] + t * (values[i + 1] - values[i]), clipCp);
        }
    }
    return clip(cp, clipCp); // unreachable given the boundary checks above
}

//----------------------------------
// Registry: uniform {fit, apply} shape so callers can iterate transforms
// generically. `apply` always takes (cp, params, clipCp) except phase
// affine, which additionally needs the row's phase.
//----------------------------------
export const TRANSFORMS = {
    globalAffine: { fit: fitGlobalAffine, apply: (cp, params, clipCp, phase) => applyGlobalAffine(cp, params, clipCp) },
    phaseAffine: { fit: fitPhaseAffine, apply: (cp, params, clipCp, phase) => applyPhaseAffine(cp, phase, params, clipCp) },
    powerCompression: { fit: fitPowerCompression, apply: (cp, params, clipCp, phase) => applyPowerCompression(cp, params, clipCp) },
    piecewiseLinear: { fit: fitPiecewiseLinear, apply: (cp, params, clipCp, phase) => applyPiecewiseLinear(cp, params, clipCp) },
};
