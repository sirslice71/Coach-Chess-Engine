//======================================================
// train/model.mjs
// Tiny sparse value model + deterministic Adam training.
// Two shapes:
//   linear:  781 --(tanh)--> 1
//   mlp:     781 --W1--> H (relu) --W2--> 1 (tanh)
// Input is a binary sparse vector (active feature indices).
// Output is a White-relative value in the target space.
//======================================================

import { mulberry32 } from "../lib/prng.mjs";

const OUT_ACT = { tanh: (z) => Math.tanh(z), identity: (z) => z };
const OUT_DACT = { tanh: (o) => 1 - o * o, identity: () => 1 };

function gaussian(rng) { // Box-Muller, deterministic from mulberry32
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function initModel({ dim = 781, hidden = 0, seed = 1, outputActivation = "tanh", initScale = 0.05 }) {
    const rng = mulberry32(seed >>> 0);
    if (hidden === 0) {
        return {
            kind: "linear", dim, hidden: 0, outputActivation,
            W: Float64Array.from({ length: dim }, () => gaussian(rng) * initScale),
            b: 0,
        };
    }
    const W1 = new Float64Array(dim * hidden);
    for (let i = 0; i < W1.length; i++) W1[i] = gaussian(rng) * initScale;
    const W2 = new Float64Array(hidden);
    const s2 = 1 / Math.sqrt(hidden);
    for (let j = 0; j < hidden; j++) W2[j] = gaussian(rng) * s2;
    return { kind: "mlp", dim, hidden, outputActivation, W1, b1: new Float64Array(hidden), W2, b2: 0 };
}

// Forward pass for one sparse example. Returns intermediates for backprop.
export function forward(model, idx) {
    const act = OUT_ACT[model.outputActivation];
    if (model.kind === "linear") {
        let z = model.b;
        for (const i of idx) z += model.W[i];
        return { o: act(z), z };
    }
    const { hidden, W1, b1, W2, b2, dim } = model;
    const pre = new Float64Array(hidden);
    const h = new Float64Array(hidden);
    for (let j = 0; j < hidden; j++) pre[j] = b1[j];
    for (const i of idx) { const base = i * hidden; for (let j = 0; j < hidden; j++) pre[j] += W1[base + j]; }
    let z = b2;
    for (let j = 0; j < hidden; j++) { const hv = pre[j] > 0 ? pre[j] : 0; h[j] = hv; z += W2[j] * hv; }
    return { o: act(z), z, h, pre };
}

export function predict(model, idx) { return forward(model, idx).o; }

// ---- deterministic Adam trainer ----
export function makeAdam(model, { lr = 0.01, l2 = 0.0, beta1 = 0.9, beta2 = 0.999, eps = 1e-8 } = {}) {
    const buffers = {};
    const mk = (n) => ({ m: new Float64Array(n), v: new Float64Array(n) });
    if (model.kind === "linear") { buffers.W = mk(model.dim); buffers.b = mk(1); }
    else { buffers.W1 = mk(model.W1.length); buffers.b1 = mk(model.hidden); buffers.W2 = mk(model.hidden); buffers.b2 = mk(1); }
    let t = 0;

    // One full-batch-of-indices gradient step over `batch` (array of {idx,target}).
    function step(batch) {
        t++;
        const dact = OUT_DACT[model.outputActivation];
        let loss = 0;
        if (model.kind === "linear") {
            const gW = new Float64Array(model.dim); let gb = 0;
            for (const ex of batch) {
                const { o } = forward(model, ex.idx);
                const err = o - ex.target; loss += err * err;
                const dz = err * dact(o);
                for (const i of ex.idx) gW[i] += dz;
                gb += dz;
            }
            adamApply(buffers.W, model.W, gW, batch.length, l2, lr, beta1, beta2, eps, t);
            const bArr = new Float64Array([model.b]);
            adamApply(buffers.b, bArr, new Float64Array([gb]), batch.length, 0, lr, beta1, beta2, eps, t);
            model.b = bArr[0];
            return loss / batch.length;
        }
        const { hidden } = model;
        const gW1 = new Float64Array(model.W1.length), gb1 = new Float64Array(hidden), gW2 = new Float64Array(hidden);
        let gb2 = 0;
        for (const ex of batch) {
            const { o, h, pre } = forward(model, ex.idx);
            const err = o - ex.target; loss += err * err;
            const dz = err * dact(o);
            gb2 += dz;
            for (let j = 0; j < hidden; j++) {
                gW2[j] += dz * h[j];
                const dh = dz * model.W2[j];
                const dpre = pre[j] > 0 ? dh : 0;   // relu'
                gb1[j] += dpre;
                if (dpre !== 0) for (const i of ex.idx) gW1[i * hidden + j] += dpre;
            }
        }
        adamApply(buffers.W1, model.W1, gW1, batch.length, l2, lr, beta1, beta2, eps, t);
        adamApply(buffers.b1, model.b1, gb1, batch.length, 0, lr, beta1, beta2, eps, t);
        adamApply(buffers.W2, model.W2, gW2, batch.length, l2, lr, beta1, beta2, eps, t);
        const b2Arr = new Float64Array([model.b2]);
        adamApply(buffers.b2, b2Arr, new Float64Array([gb2]), batch.length, 0, lr, beta1, beta2, eps, t);
        model.b2 = b2Arr[0];
        return loss / batch.length;
    }
    return { step, tRef: () => t };
}

function adamApply(buf, params, grad, n, l2, lr, beta1, beta2, eps, t) {
    const bc1 = 1 - Math.pow(beta1, t), bc2 = 1 - Math.pow(beta2, t);
    for (let i = 0; i < params.length; i++) {
        let g = grad[i] / n + l2 * params[i];
        buf.m[i] = beta1 * buf.m[i] + (1 - beta1) * g;
        buf.v[i] = beta2 * buf.v[i] + (1 - beta2) * g * g;
        const mh = buf.m[i] / bc1, vh = buf.v[i] / bc2;
        params[i] -= lr * mh / (Math.sqrt(vh) + eps);
    }
}

// ---- serialization (deterministic, plain JSON) ----
export function exportModel(model, extra = {}) {
    const round = (x) => x; // keep full precision for exact parity
    const base = { modelVersion: "coach-neural-proof-1", featureDim: model.dim, hidden: model.hidden,
        hiddenActivation: model.hidden ? "relu" : "none", outputActivation: model.outputActivation,
        output: "white-relative value in target space; see targetTransform to convert to cp", ...extra };
    if (model.kind === "linear") return { ...base, kind: "linear", layers: { W: Array.from(model.W, round), b: model.b } };
    return { ...base, kind: "mlp", layers: { W1: Array.from(model.W1, round), b1: Array.from(model.b1, round), W2: Array.from(model.W2, round), b2: model.b2 } };
}

export function importModel(obj) {
    if (!obj || typeof obj !== "object") throw new Error("model: not an object");
    if (obj.featureDim !== 781) throw new Error("model: featureDim must be 781, got " + obj.featureDim);
    if (!obj.layers) throw new Error("model: missing layers");
    const outputActivation = obj.outputActivation || "tanh";
    if (obj.kind === "linear") {
        const { W, b } = obj.layers;
        if (!Array.isArray(W) || W.length !== obj.featureDim) throw new Error("model: linear W length mismatch");
        return { kind: "linear", dim: obj.featureDim, hidden: 0, outputActivation, W: Float64Array.from(W), b: +b };
    }
    if (obj.kind === "mlp") {
        const { W1, b1, W2, b2 } = obj.layers;
        const H = obj.hidden;
        if (!Array.isArray(W1) || W1.length !== obj.featureDim * H) throw new Error("model: mlp W1 length mismatch");
        if (!Array.isArray(b1) || b1.length !== H) throw new Error("model: mlp b1 length mismatch");
        if (!Array.isArray(W2) || W2.length !== H) throw new Error("model: mlp W2 length mismatch");
        return { kind: "mlp", dim: obj.featureDim, hidden: H, outputActivation, W1: Float64Array.from(W1), b1: Float64Array.from(b1), W2: Float64Array.from(W2), b2: +b2 };
    }
    throw new Error("model: unknown kind " + obj.kind);
}
