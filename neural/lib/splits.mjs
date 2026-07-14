//======================================================
// splits.mjs
// Deterministic GAME-LEVEL train/val/test assignment.
// All positions from one game share one split => no
// position-level leakage across splits.
//======================================================

import { fnv1a } from "./prng.mjs";

export const DEFAULT_SPLIT = {
    train: 0.8,
    val: 0.1,
    test: 0.1,
    seed: 20260714,
};

// Stable identity for a game independent of file ordering.
export function gameKey(game) {
    const h = game.headers || {};
    const parts = [
        h.Event, h.Site, h.Date, h.Round,
        h.White, h.Black, h.Result,
        (game.sanMoves || []).join(" "),
    ];
    return fnv1a(parts.join("|")).toString(16).padStart(8, "0");
}

export function assignSplit(game, opts = {}) {
    const o = { ...DEFAULT_SPLIT, ...opts };
    const key = gameKey(game);
    const h = fnv1a(String(o.seed) + "::split::" + key);
    const r = h / 4294967296; // [0,1)
    if (r < o.train) return "train";
    if (r < o.train + o.val) return "val";
    return "test";
}
