//======================================
// transpositiontable.js
//======================================

//----------------------------------
// TT Flags
//----------------------------------

export const TTFlag = {

    EXACT: 0,

    LOWER: 1,

    UPPER: 2

};

//==================================
// Transposition Table
//==================================

export default class TranspositionTable {

    constructor(sizeMB = 32) {

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

    store(

        hash,

        depth,

        score,

        flag,

        move

    ) {

        this.stores++;

        this.table[

            this.index(hash)

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