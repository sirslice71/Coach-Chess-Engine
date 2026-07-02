//==================================================
// perft.js
//==================================================

import EngineDebug
    from "../dev/enginedebug.js";

export default class Perft {

    constructor(board, legalMoveGenerator) {

        this.board = board;
        this.legalMoveGenerator = legalMoveGenerator;

        this.nodes = 0;

    }

    search(depth) {

        if (depth === 0)
            return 1;

        let nodes = 0;

        const moves =
            this.legalMoveGenerator.generateMoves();

        for (const move of moves) {

            this.board.makeMove(move);

            nodes += this.search(depth - 1);

            this.board.undoMove();

        }

        return nodes;

    }

    run(depth) {

        const start = performance.now();

        const nodes = this.search(depth);

        const end = performance.now();

        return {

            depth,

            nodes,

            milliseconds: end - start,

            nps: Math.round(

                nodes /

                ((end - start) / 1000)

            )

        };

    }

    //----------------------------------
    // Verify Move Generation
    //----------------------------------

    verify(maxDepth = 5) {

        const expected = {

            1: 20,
            2: 400,
            3: 8902,
            4: 197281,
            5: 4865609,
            6: 119060324,
            7: 3195901860

        };

        console.clear();

        console.log("");
        console.log("========================================");
        console.log("      COACH ENGINE VERIFICATION");
        console.log("========================================");
        console.log("");

        console.log("Verifying move generation...");
        console.log("");

        const totalStart = performance.now();

        const results = [];

        for (let depth = 1; depth <= maxDepth; depth++) {

            const result = this.run(depth);

            const expectedNodes = expected[depth];

            const passed =

                expectedNodes === undefined ||

                result.nodes === expectedNodes;

            console.log(

                `Depth ${depth} ${passed ? "✓" : "✗"} ` +

                `${result.nodes.toLocaleString()} nodes ` +

                `(${result.milliseconds.toFixed(2)} ms)`

            );

            results.push({

                Depth: depth,

                Result: passed ? "✓ PASS" : "✗ FAIL",

                Nodes: result.nodes.toLocaleString(),

                Expected:

                    expectedNodes !== undefined

                        ? expectedNodes.toLocaleString()

                        : "-",

                Time:

                    result.milliseconds.toFixed(2) + " ms",

                NPS:

                    result.nps.toLocaleString()

            });

            if (!passed) {

                console.table(results);

                console.error("");

                console.error(

                    `Verification FAILED at depth ${depth}`

                );

                console.error(

                    `Expected ${expectedNodes.toLocaleString()} nodes`

                );

                console.error(

                    `Found    ${result.nodes.toLocaleString()} nodes`

                );

                return false;

            }

        }

        const elapsed = performance.now() - totalStart;

        console.table(results);

        console.log("");

        console.log("✓ All verification tests PASSED.");

        console.log("");

        console.log(

            `Verified depths : 1-${maxDepth}`

        );

        console.log(

            `Total Time      : ${elapsed.toFixed(2)} ms`

        );

        console.log("");

        return true;

    }

    divide(depth) {

        let total = 0;

        const moves =
            this.legalMoveGenerator.generateMoves();

        const results = [];

        for (const move of moves) {

            this.board.makeMove(move);

            const nodes =
                this.search(depth - 1);

            this.board.undoMove();

            total += nodes;

            results.push({

                move: move.toString(),

                nodes

            });

        }

        EngineDebug.moveOrderingTable(results);

        EngineDebug.searchLog("Total:", total);

        return total;

    }

    divideAfter(moveString, depth) {

        const rootMoves =
            this.legalMoveGenerator.generateMoves();

        for (const move of rootMoves) {

            if (move.toString() !== moveString)
                continue;

            this.board.makeMove(move);

            const replies =
                this.legalMoveGenerator.generateMoves();

            const results = [];

            for (const reply of replies) {

                this.board.makeMove(reply);

                const nodes =
                    this.search(depth - 2);

                this.board.undoMove();

                results.push({

                    move: reply.toString(),
                    nodes,
                    fen: this.board.fen
                        ? this.board.fen()
                        : null

                });

            }

            this.board.undoMove();

            EngineDebug.moveOrderingTable(results);

            return;
        }

        EngineDebug.searchLog("Move not found:", moveString);

    }

}