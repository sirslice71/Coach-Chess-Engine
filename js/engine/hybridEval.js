//======================================================
// hybridEval.js
// EXPERIMENTAL evaluation hybrid. NOT wired into production. Disabled by
// default; only active when COACH_HYBRID_MODEL_PATH is set. Combines the
// existing classical Evaluation with an offline-trained linear neural value
// model, routed by a deterministic, label-independent material-class rule.
//
// Routing rule (reconstructed exactly from the accepted offline study):
//   route to CLASSICAL iff phase === "endgame" AND materialClass in
//   { "pawn-only", "rook", "queenless-mixed" }; NEURAL otherwise.
//   "endgame" here means the same 24-point non-pawn phase score used
//   throughout the neural pipeline: phaseScore <= 6.
//
// The rule is a pure function of the current position (FEN placement +
// side to move for the phase score). It does NOT look at source family,
// Stockfish labels, test-set metadata, or match results, and it is NOT
// altered based on search-match outcomes.
//======================================================

import fs from "node:fs";
import FEN from "../core/fen.js";
import { encodeFen, FEATURE_DIM } from "./neuralFeatures.js";

const WEAK_ENDGAME_CLASSES = new Set(["pawn-only", "rook", "queenless-mixed"]);

// ---- material class (vendored, byte-for-byte logic match to
// neural/lib/endgame.mjs materialClass(), operating on FEN fields instead
// of a parsed board object -- same algorithm, different input shape). ----
function pieceCounts(placement) {
    const c = {};
    for (const ch of placement) if (/[a-zA-Z]/.test(ch)) c[ch] = (c[ch] || 0) + 1;
    return c;
}
export function materialClass(placement) {
    const c = pieceCounts(placement);
    const n = (k) => (c[k] || 0) + (c[k.toLowerCase()] || 0);
    const q = n("Q"), r = n("R"), minors = n("B") + n("N");
    if (q === 0 && r === 0 && minors === 0) return "pawn-only";
    if (q === 0 && r === 0 && minors > 0) return "minor-piece";
    if (q === 0 && r > 0 && minors === 0) return "rook";
    if (q > 0 && r === 0 && minors === 0) return "queen";
    if (q === 0) return "queenless-mixed";
    return "mixed";
}

// ---- phase score (vendored, byte-for-byte match to neural/lib/position.mjs) ----
export function phaseScore(placement) {
    const c = pieceCounts(placement);
    const n = (k) => c[k] || 0;
    const minors = n("N") + n("n") + n("B") + n("b");
    const rooks = n("R") + n("r");
    const queens = n("Q") + n("q");
    return Math.min(24, minors * 1 + rooks * 2 + queens * 4);
}
export function isEndgamePhase(placement) { return phaseScore(placement) <= 6; }

// Deterministic, label-independent routing decision for a placement string.
export function shouldRouteToClassical(placement) {
    return isEndgamePhase(placement) && WEAK_ENDGAME_CLASSES.has(materialClass(placement));
}

// ---- model loading: ONE-TIME, at module import, never per-evaluation ----
function loadModel() {
    const path = process.env.COACH_HYBRID_MODEL_PATH;
    if (!path) return null;
    try {
        const raw = fs.readFileSync(path, "utf8");
        const obj = JSON.parse(raw);
        if (obj.kind !== "linear" || obj.featureDim !== FEATURE_DIM) {
            process.stderr.write(`hybridEval: model kind/dim mismatch (kind=${obj.kind} dim=${obj.featureDim}), hybrid disabled\n`);
            return null;
        }
        const W = Float64Array.from(obj.layers.W);
        if (W.length !== FEATURE_DIM) {
            process.stderr.write(`hybridEval: weight length mismatch, hybrid disabled\n`);
            return null;
        }
        const tt = obj.targetTransform || { kind: "tanh", scale: 400, clipCp: 1000 };
        return { W, b: Number(obj.layers.b), scale: tt.scale, clipCp: tt.clipCp };
    } catch (e) {
        process.stderr.write(`hybridEval: failed to load model at "${path}": ${e.message}; hybrid disabled\n`);
        return null;
    }
}

// Module-scope singleton: loaded exactly once per process, never reloaded.
const MODEL = loadModel();

function neuralForwardCp(placement, stm, castling, ep) {
    const idx = encodeFen(`${placement} ${stm} ${castling} ${ep}`);
    let z = MODEL.b;
    for (const i of idx) z += MODEL.W[i];
    const v = Math.tanh(z);
    // invert the training-time tanh(cp/scale) transform back to centipawns
    const clamped = Math.max(-0.999999, Math.min(0.999999, v));
    const cp = Math.atanh(clamped) * MODEL.scale;
    return Math.max(-MODEL.clipCp, Math.min(MODEL.clipCp, cp));
}

//======================================================
// HybridEvaluator
// One instance per Search (constructed once per game/position reset, not
// per node). Diagnostics are OFF by default and add no work on the hot path
// unless explicitly enabled.
//======================================================
export class HybridEvaluator {
    constructor({ diagnostics = false } = {}) {
        this.enabled = MODEL !== null;
        this.diagnosticsEnabled = diagnostics;
        this.lastDiagnostics = null;
        // Lightweight, always-on route-frequency counters (two integer
        // increments; negligible cost, unlike the full per-call diagnostics
        // object above which stays behind the disabled-by-default flag).
        // Used to audit actual in-search routing share vs the offline
        // corpus's 23.3% dataset share (Phase 14).
        this.classicalRouteCalls = 0;
        this.neuralRouteCalls = 0;
    }

    resetRouteCounters() { this.classicalRouteCalls = 0; this.neuralRouteCalls = 0; }
    get totalRouteCalls() { return this.classicalRouteCalls + this.neuralRouteCalls; }
    get classicalRoutePct() { return this.totalRouteCalls ? 100 * this.classicalRouteCalls / this.totalRouteCalls : null; }

    // board: Coach's Board instance. evaluation: the existing Evaluation
    // instance already bound to the same board (reused, never duplicated).
    // Returns a White-relative centipawn value, matching evaluation.evaluate().total's convention.
    evaluate(board, evaluation) {
        if (!this.enabled) return evaluation.evaluate().total;

        const fen = FEN.export(board);
        const [placement, stm, castling, ep] = fen.trim().split(/\s+/);
        const routeToClassical = shouldRouteToClassical(placement);

        let out, classicalRaw = null, neuralRaw = null;
        if (routeToClassical) {
            this.classicalRouteCalls++;
            classicalRaw = evaluation.evaluate().total;
            // Scale-compatibility clamp (evidenced, not cosmetic smoothing):
            // the neural branch is trained-and-clamped to +/-clipCp, but
            // classical is unbounded and reaches 2000-2600+ cp on lopsided
            // material. Measured on 209 boundary-crossing transitions this
            // produced a route-switch discontinuity of median 200cp / p95
            // 699cp, traceable almost entirely to this scale mismatch, not
            // to the routing rule itself. Clamping ONLY the value used by
            // this experimental wrapper -- evaluation.js itself, and its
            // return value everywhere else in the engine, are untouched.
            out = Math.max(-MODEL.clipCp, Math.min(MODEL.clipCp, classicalRaw));
        } else {
            this.neuralRouteCalls++;
            neuralRaw = neuralForwardCp(placement, stm, castling || "-", ep || "-");
            out = neuralRaw;
        }

        if (this.diagnosticsEnabled) {
            this.lastDiagnostics = {
                route: routeToClassical ? "classical" : "neural",
                materialClass: materialClass(placement),
                phase: isEndgamePhase(placement) ? "endgame" : "non-endgame",
                neuralRaw, classicalRaw, hybridOutput: out,
                modelLoaded: this.enabled,
            };
        }
        return out;
    }
}

export function hybridModelLoaded() { return MODEL !== null; }
