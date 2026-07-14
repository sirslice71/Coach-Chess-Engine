//======================================================
// prng.mjs
// Deterministic pseudo-random utilities. No Math.random.
// Everything reproducible from a fixed integer seed.
//======================================================

// FNV-1a 32-bit string hash. Stable across platforms.
export function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // h *= 16777619 (mod 2^32)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}

// mulberry32 PRNG: deterministic, seedable, returns [0,1).
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Derive a child seed deterministically from a base seed and a label.
export function deriveSeed(baseSeed, label) {
    return (fnv1a(String(baseSeed) + "::" + label) ^ (baseSeed >>> 0)) >>> 0;
}
