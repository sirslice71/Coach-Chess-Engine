//======================================================
// train/dataset.mjs
// Loads a labelled dataset into sparse feature vectors + targets,
// preserving the stored game-level train/val/test split EXACTLY.
// Only the FEN drives features (no label/source/split leaks in).
//======================================================

import fs from "node:fs";
import { encodeFen, FEATURE_DIM } from "../lib/features.mjs";

export const DEFAULT_TARGET = { kind: "tanh", scale: 400, clipCp: 1000, mateValue: 0.999 };

// White-relative target in a documented range. All conventions are
// White-positive (matching scoreCpWhite / mate). See README.
export function makeTarget(sf, cfg = DEFAULT_TARGET) {
    const isMate = sf.mate !== null && sf.mate !== undefined;
    if (cfg.kind === "cp") {
        if (isMate) return Math.sign(sf.mate) * cfg.clipCp;               // mate -> ±clip cp
        return Math.max(-cfg.clipCp, Math.min(cfg.clipCp, sf.scoreCpWhite));
    }
    if (cfg.kind === "tanh") {
        if (isMate) return Math.sign(sf.mate) * cfg.mateValue;           // mate -> ±mateValue (~±1)
        const cp = Math.max(-cfg.clipCp, Math.min(cfg.clipCp, sf.scoreCpWhite));
        return Math.tanh(cp / cfg.scale);
    }
    if (cfg.kind === "wdl") {
        if (sf.wdl && sf.wdl.length === 3) {
            const [w, d, l] = sf.wdl; const t = w + d + l;
            return t ? (w + 0.5 * d) / t : 0.5;                          // expected score in [0,1]
        }
        if (isMate) return sf.mate > 0 ? 1 : 0;
        return 1 / (1 + Math.exp(-sf.scoreCpWhite / cfg.scale));         // logistic fallback
    }
    throw new Error("unknown target kind: " + cfg.kind);
}

// Invert a tanh/cp target-space value back to centipawns (for cp-space MAE).
export function targetToCp(value, cfg = DEFAULT_TARGET) {
    if (cfg.kind === "cp") return value;
    if (cfg.kind === "tanh") {
        const v = Math.max(-0.999999, Math.min(0.999999, value));
        return Math.atanh(v) * cfg.scale;
    }
    if (cfg.kind === "wdl") {
        const p = Math.max(1e-6, Math.min(1 - 1e-6, value));
        return -cfg.scale * Math.log(1 / p - 1);
    }
    return value;
}

export function loadDataset(path, cfg = DEFAULT_TARGET) {
    const recs = fs.readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const splits = { train: [], val: [], test: [] };
    let skipped = 0;
    for (const r of recs) {
        if (!r.stockfish) { skipped++; continue; }
        const item = {
            idx: encodeFen(r.fen),               // sorted sparse active indices (only the FEN)
            target: makeTarget(r.stockfish, cfg),
            meta: {
                split: r.split, phase: r.gamePhase, stm: r.sideToMove, inCheck: !!r.inCheck,
                cp: r.stockfish.scoreCpWhite, mate: r.stockfish.mate,
                coach: typeof r.coachClassicalCpWhite === "number" ? r.coachClassicalCpWhite : null,
                queenless: !/[Qq]/.test(r.fen.split(" ")[0]),
                fen: r.fen,
            },
        };
        (splits[r.split] || (splits[r.split] = [])).push(item);
    }
    return { splits, featureDim: FEATURE_DIM, skipped, targetCfg: cfg };
}
