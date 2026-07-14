//======================================================
// sampling.mjs
// Deterministic per-game position sampling.
//
// Stride-only sampling with a fixed skip collapses to one
// side to move (e.g. every=4 from ply 8 => always White).
// To avoid that colour skew we give each game a deterministic
// phase offset in [0, sampleEveryPlies), derived from the game
// key. Across many games the offsets spread, balancing
// White/Black to move while never oversampling consecutive plies.
//======================================================

import { mulberry32, deriveSeed, fnv1a } from "./prng.mjs";

export const DEFAULT_SAMPLING = {
    skipFirstPlies: 8,
    sampleEveryPlies: 4,
    maxPositionsPerGame: 20,
    includeTerminal: false,
    includeInCheck: true,
    balanceOffset: true, // per-game phase offset to balance side to move
    seed: 20260714,
};

export function sampleFrames(frames, gameKey, opts = {}) {
    const o = { ...DEFAULT_SAMPLING, ...opts };
    const offset = o.balanceOffset
        ? fnv1a("offset::" + gameKey) % o.sampleEveryPlies
        : 0;

    let eligible = frames.filter(
        (f) =>
            f.ply >= o.skipFirstPlies + offset &&
            (f.ply - o.skipFirstPlies - offset) % o.sampleEveryPlies === 0
    );

    if (!o.includeTerminal) eligible = eligible.filter((f) => !f.isTerminal);
    if (!o.includeInCheck) eligible = eligible.filter((f) => !f.inCheck);

    if (eligible.length > o.maxPositionsPerGame) {
        const rng = mulberry32(deriveSeed(o.seed, "sample::" + gameKey));
        const arr = eligible.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        eligible = arr.slice(0, o.maxPositionsPerGame).sort((a, b) => a.ply - b.ply);
    }
    return eligible;
}
