//==================================================
// developer.js
//==================================================

import FEN from "../core/fen.js";

import {
    algebraic
}
from "../core/square.js";

//==================================================
// Developer
//==================================================

export default class Developer {

    //----------------------------------
    // Constructor
    //----------------------------------

    constructor(

        board,

        ui,

        search,

        evaluation

    ) {

        this.board = board;

        this.ui = ui;

        this.search = search;

        this.evaluation = evaluation;

        //----------------------------------
        // Snapshot History
        //----------------------------------

        this.snapshots = [];

        this.maxSnapshots = 20;

        this.nextSnapshotId = 1;

        //----------------------------------
        // Integrity Testing
        //----------------------------------

        this.integrityNodes = 0;
        this.lastProgress = 0;

    }

    //----------------------------------
    // Current FEN
    //----------------------------------

    fen() {

        const fen =

            FEN.export(this.board);

        console.log(fen);

        return fen;

    }

    //----------------------------------
    // Snapshot
    //----------------------------------

    snapshot(name = "") {

        const lastMove =

            this.board.moveHistory.length > 0

                ? this.board.moveHistory[
                    this.board.moveHistory.length - 1
                ]

                : null;

        const snapshot = {

            id: this.nextSnapshotId++,

            name,

            time:
                new Date().toLocaleTimeString(),

            fen:
                FEN.export(this.board),

            sideToMove:
                this.board.sideToMove,

            evaluation:
                this.evaluation.evaluate(),

            lastMove:
                lastMove
                    ? `${algebraic(lastMove.from)}-${algebraic(lastMove.to)}`
                    : "Start Position",

            ply:
                this.board.moveHistory.length,

            repetitionTable:
                structuredClone(
                    this.board.repetitionTable
                ),

            moveHistory:
                structuredClone(
                    this.board.moveHistory
                )

        };

        this.snapshots.push(snapshot);

        while (

            this.snapshots.length >

            this.maxSnapshots

        ) {

            this.snapshots.shift();

        }

        console.log(

            `Snapshot "${name}" saved.`

        );

        return snapshot;

    }

    //----------------------------------
    // Restore Snapshot
    //----------------------------------

    restore(id = null) {

        if (this.snapshots.length === 0) {

            console.warn(

                "No snapshots available."

            );

            return;

        }

        let snapshot;

        //----------------------------------
        // Most Recent
        //----------------------------------

        if (id === null) {

            snapshot =

                this.snapshots[
                    this.snapshots.length - 1
                ];

        }

        //----------------------------------
        // Restore by ID
        //----------------------------------

        else if (typeof id === "number") {

            snapshot =

                this.snapshots.find(

                    s => s.id === id

                );

        }

        //----------------------------------
        // Restore by Name
        //----------------------------------

        else {

            snapshot =

                this.snapshots.find(

                    s =>

                        s.name &&

                        s.name

                            .toLowerCase()

                            .includes(

                                id.toLowerCase()

                            )

                );

        }

        if (!snapshot) {

            console.warn(

                `Snapshot "${id}" not found.`

            );

            return;

        }

        FEN.import(

            this.board,

            snapshot.fen

        );

        //----------------------------------
        // Restore Move History
        //----------------------------------

        this.board.moveHistory =

            structuredClone(
                snapshot.moveHistory
            );

        this.board.repetitionTable =

            structuredClone(
                snapshot.repetitionTable
            );

        //----------------------------------
        // Rebuild Internal State
        //----------------------------------

        this.board.updatePieceLists();

        this.board.verify();

        //----------------------------------
        // Draw Board
        //----------------------------------

        this.ui.draw();

        //----------------------------------
        // Verify Restore
        //----------------------------------

        const restoredFen =

            FEN.export(this.board);

        if (restoredFen !== snapshot.fen) {

            console.error("");

            console.error("RESTORE FAILED");

            console.log("Expected:");

            console.log(snapshot.fen);

            console.log("Actual:");

            console.log(restoredFen);

            debugger;

        }

        console.log("");

        console.log(

            "Snapshot Restored"

        );

        console.table(snapshot);

        return snapshot;

    }

    //----------------------------------
    // List Snapshots
    //----------------------------------

    list() {

        if (

            this.snapshots.length === 0

        ) {

            console.log(

                "No snapshots."

            );

            return;

        }

        console.table(

            this.snapshots.map(

                snapshot => ({

                    ID:

                        snapshot.id,

                    Name:

                        snapshot.name,

                    Ply:

                        snapshot.ply,

                    Move:

                        snapshot.lastMove,

                    Side:

                        snapshot.sideToMove > 0

                            ? "White"

                            : "Black",

                    Eval:

                        (

                            snapshot.evaluation.total /

                            100

                        ).toFixed(2),

                    Time:

                        snapshot.time

                })

            )

        );

    }

    //----------------------------------
    // Current Position
    //----------------------------------

    position() {

        console.log(

            "FEN:",

            FEN.export(this.board)

        );

        console.log(

            "Evaluation:",

            (

                this.evaluation.evaluate().total /

                100

            ).toFixed(2)

        );

        console.log(

            "Side:",

            this.board.sideToMove > 0

                ? "White"

                : "Black"

        );

    }

    //----------------------------------
    // Move History
    //----------------------------------

    moves() {

        if (

            this.board.moveHistory.length === 0

        ) {

            console.log(

                "No moves."

            );

            return;

        }

        const history =

            this.board.moveHistory.map(

                (move, index) => ({

                    Ply:

                        index + 1,

                    Move:

                        `${

                            algebraic(move.from)

                        }-${
                            algebraic(move.to)
                        }`

                })

            );

        console.table(history);

    }

    //----------------------------------
    // Make/Undo Integrity Test
    //----------------------------------

    testMakeUndo() {

        console.clear();

        console.log("==================================");
        console.log("MAKE / UNDO INTEGRITY TEST");
        console.log("==================================");

        const originalFen =
            FEN.export(this.board);

        const moves =
            window.chess.legalMoveGenerator.generateMoves();

        console.log(
            `${moves.length} legal moves`
        );

        for (const move of moves) {

            const before =
                FEN.export(this.board);

            this.board.makeMove(move);

            this.board.undoMove();

            const after =
                FEN.export(this.board);

            if (before !== after) {

                console.error("");
                console.error("FAILED");
                console.error("Move:", move.toString());
                console.error("Flags:", move.flags);
                console.error("Before:", before);
                console.error("After :", after);

                debugger;

                return false;

            }

        }

        const finalFen =
            FEN.export(this.board);

        if (originalFen !== finalFen) {

            console.error("");
            console.error("BOARD CHANGED!");
            console.error(originalFen);
            console.error(finalFen);

            debugger;

            return false;

        }

        console.log("");
        console.log("PASSED");
        console.log("Board restored correctly.");

        return true;

    }

    //----------------------------------
    // Recursive Integrity Test
    //----------------------------------

    testSearchIntegrity(

        depth = 4,

        {

            progressInterval = 10000,

            maxNodes = Infinity,

            maxSeconds = Infinity

        } = {}

    ) {

        console.clear();

        console.log("========================================");
        console.log("SEARCH INTEGRITY TEST");
        console.log("========================================");
        console.log("Depth:", depth);

        const original =
            this.boardState();

        const startTime =
            performance.now();

        this.integrityNodes = 0;
        this.lastProgress = 0;

        const path = [];

        let stop = false;

        const test = (ply) => {

            if (stop)
                return false;

            if (ply === 0)
                return true;

            const moves =
                window.chess.legalMoveGenerator.generateMoves();

            for (const move of moves) {

                path.push(move.toString());

                const before =
                    this.boardState();

                this.board.makeMove(move);

                this.integrityNodes++;

                //----------------------------------
                // Progress
                //----------------------------------

                if (

                    this.integrityNodes -

                    this.lastProgress >=

                    progressInterval

                ) {

                    this.lastProgress =
                        this.integrityNodes;

                    const elapsed =

                        (performance.now() -

                            startTime) / 1000;

                    const nps =

                        Math.round(

                            this.integrityNodes /

                            elapsed

                        );

                    console.log(

                        `${this.integrityNodes.toLocaleString()} nodes`

                        + ` | ${elapsed.toFixed(1)} sec`

                        + ` | ${nps.toLocaleString()} nps`

                        + ` | ${path.join("  ")}`

                    );

                }

                //----------------------------------
                // Limits
                //----------------------------------

                if (

                    this.integrityNodes >= maxNodes ||

                    (performance.now() - startTime) / 1000 >= maxSeconds

                ) {

                    stop = true;

                    console.warn(

                        "Stopped by limit."

                    );

                    this.board.undoMove();

                    return false;

                }

                if (!test(ply - 1))
                    return false;

                this.board.undoMove();

                const after =
                    this.boardState();

                if (

                    JSON.stringify(before) !==

                    JSON.stringify(after)

                ) {

                    console.error("");

                    console.error("========================================");

                    console.error("SEARCH CORRUPTION");

                    console.error("========================================");

                    console.log("Depth:", ply);

                    console.log("Path:");

                    console.table(path);

                    console.log("Before:");

                    console.log(before);

                    console.log("After:");

                    console.log(after);

                    debugger;

                    return false;

                }

                path.pop();

            }

            return true;

        };

        const ok =
            test(depth);

        const elapsed =

            (performance.now() -

                startTime) / 1000;

        const final =
            this.boardState();

        console.log("");

        console.log("========================================");

        if (

            ok &&

            JSON.stringify(original) ===

            JSON.stringify(final)

        ) {

            console.log("PASSED");

        }
        else {

            console.log("FAILED");

        }

        console.log("========================================");

        console.log(

            "Nodes:",

            this.integrityNodes.toLocaleString()

        );

        console.log(

            "Time:",

            elapsed.toFixed(2),

            "sec"

        );

        console.log(

            "Speed:",

            Math.round(

                this.integrityNodes /

                elapsed

            ).toLocaleString(),

            "nps"

        );

        return ok;

    }

    //----------------------------------
    // Root Move Integrity Test
    //----------------------------------

    testRootMoves(depth = 4) {

        console.clear();

        const moves =

            window.chess

                .legalMoveGenerator

                .generateMoves();

        console.log(

            `${moves.length} root moves`

        );

        let index = 1;

        for (const move of moves) {

            console.log("");

            console.log(

                `[${index}/${moves.length}]`,

                move.toString()

            );

            this.board.makeMove(move);

            const ok =

                this.testSearchIntegrity(

                    depth - 1,

                    {

                        progressInterval:50000

                    }

                );

            this.board.undoMove();

            if (!ok) {

                console.error("");

                console.error(

                    "FAILED ROOT MOVE:",

                    move.toString()

                );

                return false;

            }

            index++;

        }

        console.log("");

        console.log(

            "ALL ROOT MOVES PASSED"

        );

        return true;

    }

    //----------------------------------
    // Board State
    //----------------------------------

    boardState() {

        return {

            fen: FEN.export(this.board),

            whiteKing: this.board.whiteKing,
            blackKing: this.board.blackKing,

            whiteMaterial: this.board.whiteMaterial,
            blackMaterial: this.board.blackMaterial,

            whitePieces:
                structuredClone(this.board.whitePieces),

            blackPieces:
                structuredClone(this.board.blackPieces),

            history:
                structuredClone(this.board.moveHistory),

            repetition:
                this.board.repetitionTable.length

        };

    }

    //----------------------------------
    // Regression Test
    //----------------------------------

    regression() {

        console.clear();

        console.log("==================================");

        console.log("COACH REGRESSION TEST");

        console.log("==================================");

        const start = performance.now();

        //----------------------------------
        // Make / Undo
        //----------------------------------

        console.log("");

        console.log("Make / Undo...");

        const makeUndo = this.testMakeUndo();

        //----------------------------------
        // Search Integrity
        //----------------------------------

        console.log("");

        console.log("Search Integrity...");

        const search =
            this.testSearchIntegrity(4);

        //----------------------------------
        // Root Move Integrity
        //----------------------------------

        console.log("");

        console.log("Root Move Integrity...");

        const root =
            this.testRootMoves(4);

        //----------------------------------
        // Timing
        //----------------------------------

        const elapsed =
            performance.now() - start;

        console.log("");

        console.log("==================================");

        console.log(

            "Elapsed:",

            elapsed.toFixed(2),

            "ms"

        );

        console.log("==================================");

        return (

            makeUndo &&

            search &&

            root

        );

    }

    //----------------------------------
    // Bench
    //----------------------------------

    bench(depth = 5) {

        console.clear();

        console.log("==================================");

        console.log("COACH BENCHMARK");

        console.log("==================================");

        const result =

            this.search.searchRoot(depth);

        console.table({

            Depth: result.depth,

            Nodes: result.nodes,

            LeafNodes: result.leafNodes,

            Cutoffs: result.cutoffs,

            TimeMS: result.elapsedMs,

            NPS: result.nps,

            Eval: result.evaluation

        });

        return result;

    }

}