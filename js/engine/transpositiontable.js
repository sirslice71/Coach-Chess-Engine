//======================================
// transpositiontable.js
//======================================

import { SearchConstants } from "./searchconstants.js";

//----------------------------------
// TT Flags
//----------------------------------

export const TTFlag = {

    EXACT: 0,

    LOWER: 1,

    UPPER: 2

};

export function isMateScore(score) {

    return (
        Number.isFinite(score) &&
        Math.abs(score) >= SearchConstants.MATE_THRESHOLD &&
        Math.abs(score) <= SearchConstants.MATE
    );

}

//----------------------------------
// TT mate-score normalization
//
// Search returns mate-class scores relative to the current
// root, e.g. "MATE - (rootPlyToMate)" or "-MATE +
// (rootPlyToMate)". The TT must store these in a root-
// independent form so the same position can be reused from a
// different ply later without shifting the mate distance.
//
// For a node searched at ply P:
//
//   winning score  MATE - (P + d)  -> store as  MATE - d
//   losing score  -MATE + (P + d)  -> store as -MATE + d
//
// where d is the number of plies from THIS position to mate.
// Probing inverts that transform back into the node-relative
// score needed for alpha/beta comparisons at the current ply.
//----------------------------------

export function scoreToTT(score, ply) {

    if (!isMateScore(score)) {
        return score;
    }

    return score > 0
        ? score + ply
        : score - ply;

}

export function scoreFromTT(score, ply) {

    if (!isMateScore(score)) {
        return score;
    }

    return score > 0
        ? score - ply
        : score + ply;

}

//==================================
// Transposition Table
//==================================

export default class TranspositionTable {

    constructor(sizeMB = 32) {

        this.sizeMB = sizeMB;

        const ENTRY_SIZE = 32;

        const bytes =
            sizeMB * 1024 * 1024;

        //----------------------------------
        // Power-of-two size
        //----------------------------------

        let entries = 1;

        while (

            entries * 2 <=

            Math.floor(bytes / ENTRY_SIZE)

        ) {

            entries *= 2;

        }

        this.size = entries;

        this.mask = entries - 1;

        this.table =
            new Array(entries);

        this.age = 0;

        this.probes = 0;
        this.hits = 0;
        this.stores = 0;

    }

    clear() {

        this.table.fill(undefined);

        this.probes = 0;
        this.hits = 0;
        this.stores = 0;

        console.log(

            "✓ Transposition Table cleared."

        );

    }

    nextAge() {

        this.age++;

    }

    index(hash) {

        return Number(

            hash & BigInt(this.mask)

        );

    }

    probe(hash) {

        this.probes++;

        const entry =

            this.table[

                this.index(hash)

            ];

        if (

            entry &&

            entry.hash === hash

        ) {

            this.hits++;

            return entry;

        }

        return null;

    }

    //----------------------------------
    // Replacement policy
    //
    // Conservative depth/age-aware replacement, replacing the
    // previous always-replace behavior. A new entry replaces
    // whatever occupies its slot when any of these hold:
    //   1. The slot is empty.
    //   2. The slot already stores this same position (hash
    //      match) -- always keep the position's entry current.
    //   3. The new entry is meaningfully deeper (strictly
    //      deeper) than the entry it would displace.
    //   4. The existing entry is from an older search (age
    //      generation) than the current one, so it's stale
    //      regardless of its depth.
    // Otherwise the existing (deeper, current-generation, and
    // for a different position) entry is kept. This does not
    // change probe() semantics or hash generation.
    //----------------------------------

    shouldReplace(existing, hash, depth) {

        if (!existing) {

            return true;

        }

        if (existing.hash === hash) {

            return true;

        }

        if (depth > existing.depth) {

            return true;

        }

        if (existing.age !== this.age) {

            return true;

        }

        return false;

    }

    store(

        hash,

        depth,

        score,

        flag,

        move

    ) {

        this.stores++;

        const index = this.index(hash);

        const existing = this.table[index];

        if (!this.shouldReplace(existing, hash, depth)) {

            return;

        }

        this.table[

            index

        ] = {

            hash,

            depth,

            score,

            flag,

            move,

            age: this.age

        };

    }

    stats() {

        let used = 0;

        for (const entry of this.table)

            if (entry)

                used++;

        return {

            entries: this.size,

            used,

            fill:

                (

                    used /

                    this.size *

                    100

                ).toFixed(2) + "%",

            probes: this.probes,

            hits: this.hits,

            stores: this.stores,

            hitRate:

                this.probes

                    ? (

                        this.hits /

                        this.probes *

                        100

                    ).toFixed(1) + "%"

                    : "0.0%",
                    age: this.age

        };

    }

}
