//======================================
// search.js
//======================================

import { SearchConstants } from "./searchconstants.js";
import MoveOrdering from "./moveordering.js";
import EngineDebug from "../dev/enginedebug.js";
import { Piece } from "../core/piece.js";
import Zobrist from "./zobrist.js";
import TranspositionTable from "./transpositiontable.js";
import { TTFlag }
    from "./transpositiontable.js";

const MAX_Q_PLY = 16;

export default class Search {

    constructor(board, legalMoveGenerator, evaluation) {

        this.board = board;

        this.legalMoveGenerator =
            legalMoveGenerator;

        this.evaluation =
            evaluation;

        this.nodes = 0;
        this.leafNodes = 0;
        this.cutoffs = 0;

        this.moveOrdering = new MoveOrdering(board);

        this.makeMoveTime = 0;
        this.undoMoveTime = 0;

        this.makeMoveTime = 0;
        this.undoMoveTime = 0;
        this.generateTime = 0;
        this.orderTime = 0;

        //----------------------------------
        // Statistics
        //----------------------------------

        this.nodes = 0;
        this.leafNodes = 0;
        this.cutoffs = 0;
        this.killerCutoffs = 0;

        //----------------------------------
        // Killer Moves
        //----------------------------------

        this.killers = [];

        //----------------------------------
        // Hashing
        //----------------------------------

        this.zobrist =
            board.zobrist ||
            new Zobrist();

        if (!board.zobrist) {

            this.zobrist.initialize();

            this.board.attachZobrist(
                this.zobrist
            );

        }

        //----------------------------------
        // Initial Position Hash
        //----------------------------------

        this.board.hashKey =
            this.zobrist.generate(this.board);

        //----------------------------------
        // Transposition Table
        //----------------------------------

        this.tt = new TranspositionTable();
        
        this.rootBestMove = null;

        this.lastSearchScore = 0;

        this.aspirationWindow = 25;     // 0.25 pawns
        this.aspirationResearches = 0;

        //----------------------------------
        // History Heuristic
        //----------------------------------

        this.history = Array.from(

            { length: 64 },

            () => new Int32Array(64)

        );
        
    }

    whiteRelativeEval() {

        return this.evaluation.evaluate().total;

    }

    toSideToMoveScore(whiteScore, sideToMove = this.board.sideToMove) {

        return sideToMove > 0

            ? whiteScore

            : -whiteScore;

    }

    toWhiteRelativeScore(sideScore, sideToMove = this.board.sideToMove) {

        return sideToMove > 0

            ? sideScore

            : -sideScore;

    }

    searchRoot(maxDepth = 1) {

        const rootSideToMove =
            this.board.sideToMove;

        this.killers = [];

        for (const row of this.history) {

            row.fill(0);

        }

        this.resetStatistics();

        this.rootBestMove = null;

        const startTime = performance.now();

        const iterations = [];

        let result = null;

        let previousScore = 0;

        //----------------------------------
        // Iterative Deepening
        //----------------------------------

        for (

            let depth = 1;

            depth <= maxDepth;

            depth++

        ) {

            const iterationStart = performance.now();

            const startNodes = this.nodes;

            this.tt.nextAge();

            let alpha = -SearchConstants.INFINITY;
            let beta  =  SearchConstants.INFINITY;

            if (depth > 1) {

                alpha = previousScore - this.aspirationWindow;
                beta  = previousScore + this.aspirationWindow;

            }

            result = this.searchIteration(

                depth,

                alpha,

                beta

            );

            //----------------------------------
            // Aspiration failed?
            //----------------------------------

            if (

                depth > 1 &&

                (

                    result.bestScore <= alpha ||

                    result.bestScore >= beta

                )

            ) {

                this.aspirationResearches++;

                result = this.searchIteration(
                    depth,
                    -SearchConstants.INFINITY,
                    SearchConstants.INFINITY
                );

            }

            previousScore = result.bestScore;

            const iterationTime =

                performance.now() - iterationStart;

            const iterationNodes =

                this.nodes - startNodes;

            iterations.push({

                Depth: depth,

                Move:

                    result.bestMove.toString(),

                Eval:

                    (
                        this.toWhiteRelativeScore(
                            result.bestScore,
                            rootSideToMove
                        ) / 100
                    ).toFixed(2),

                Nodes:

                    iterationNodes.toLocaleString(),

                Time:

                    iterationTime.toFixed(2) + " ms",

                NPS:

                    Math.round(

                        iterationNodes /

                        (iterationTime / 1000)

                    ).toLocaleString()

            });

        }

        const pv = this.buildPV();

        console.log("");

        console.table(iterations);

        console.log("");

        console.log(

            "PV:",

            pv.map(

                move => move.toString()

            ).join(" ")

        );

        //----------------------------------
        // Statistics
        //----------------------------------

        const elapsedMs =

            performance.now() - startTime;

        const nps =

            elapsedMs > 0

                ? Math.round(

                    this.nodes /

                    (elapsedMs / 1000)

                )

                : 0;

        //----------------------------------
        // Profile
        //----------------------------------

        console.log("");
        console.log("===== SEARCH PROFILE =====");
        console.log("Generate :", this.generateTime.toFixed(2), "ms");
        console.log("Order    :", this.orderTime.toFixed(2), "ms");
        console.log("MakeMove :", this.makeMoveTime.toFixed(2), "ms");
        console.log("UndoMove :", this.undoMoveTime.toFixed(2), "ms");
        console.log("==========================");
        console.log("");
        console.log("Board makeMove :", this.board.profileMakeMove.toFixed(2));
        console.log("Board undoMove :", this.board.profileUndoMove.toFixed(2));
        console.log("Update lists   :", this.board.profileUpdatePieceLists.toFixed(2));

        this.lastSearchScore =
            this.toWhiteRelativeScore(
                result.bestScore,
                rootSideToMove
            );

        //----------------------------------
        // Return
        //----------------------------------

        return {

            move: result.bestMove,

            notation:

                result.bestMove

                    ? result.bestMove.toString()

                    : null,

            evaluation:

                (this.lastSearchScore / 100).toFixed(2),

            depth: maxDepth,

            nodes: this.nodes,

            leafNodes: this.leafNodes,

            cutoffs: this.cutoffs,

            elapsedMs:

                elapsedMs.toFixed(2),

            nps,

            rootMoves: result.rootMoves,

            pv

        };
        
    }

    searchIteration(

        depth,

        alpha = -SearchConstants.INFINITY,

        beta = SearchConstants.INFINITY

    ) {

        //----------------------------------
        // Search
        //----------------------------------

        let bestMove = null;

        let bestScore =

            -SearchConstants.INFINITY;

        const rootMoves = [];

        let t = performance.now();

        const moves =

            this.legalMoveGenerator.generateMoves();

        this.generateTime +=

            performance.now() - t;

        //----------------------------------
        // TT Root Move
        //----------------------------------

        const ttEntry =

            this.tt.probe(

                this.board.hashKey

            );

        const ttMove =

            ttEntry

                ? ttEntry.move

                : null;

        //----------------------------------
        // Order
        //----------------------------------

        t = performance.now();

        this.moveOrdering.order(

            moves,

            [-1, -1],

            ttMove,

            this.history

        );

        this.orderTime +=

            performance.now() - t;

        //----------------------------------
        // Search Root
        //----------------------------------

        for (const move of moves) {

            t = performance.now();

            this.board.makeMove(move);

            this.makeMoveTime +=

                performance.now() - t;

            let score;

            try {

                score = -this.negamax(

                    depth - 1,

                    -beta,

                    -alpha,

                    1, 
                    
                    false

                );

            }

            finally {

                t = performance.now();

                this.board.undoMove();

                this.undoMoveTime +=

                    performance.now() - t;

            }

            rootMoves.push({

                move,

                notation: move.toString(),

                score

            });

            if (score > bestScore) {

                bestScore = score;

                bestMove = move;

                this.rootBestMove = move;

                if (score > alpha) {

                    alpha = score;

                }

            }

        }

        rootMoves.sort(

            (a, b) =>

                b.score - a.score

        );

        //----------------------------------
        // Store Root Position
        //----------------------------------

        this.tt.store(

            this.board.hashKey,

            depth,

            bestScore,

            TTFlag.EXACT,

            bestMove

        );

        return {

            bestMove,

            bestScore,

            rootMoves

        };

    }

    //----------------------------------
    // Negamax Alpha-Beta
    //----------------------------------
    // Negamax returns ONLY a score.
    // Never return moves or statistics.
    //----------------------------------

    negamax(depth, alpha, beta, ply = 0, isRoot = false) {
                
        this.nodes++;

        const alphaOriginal = alpha;

        //----------------------------------
        // Transposition Table Probe
        //----------------------------------

        const ttEntry =

            this.tt.probe(

                this.board.hashKey

            );

            let ttMove = null;

            if (ttEntry) {

                ttMove = ttEntry.move;

            }

            //----------------------------------
            // TT Lookup
            //----------------------------------

            if (

                !isRoot &&

                ttEntry &&

                ttEntry.depth >= depth

            ) {

            switch (ttEntry.flag) {

                case TTFlag.EXACT:

                    return ttEntry.score;

                case TTFlag.LOWER:

                    alpha =

                        Math.max(

                            alpha,

                            ttEntry.score

                        );

                    break;

                case TTFlag.UPPER:

                    beta =

                        Math.min(

                            beta,

                            ttEntry.score

                        );

                    break;

            }

            if (alpha >= beta) {

                return ttEntry.score;

            }

           }

        // console.log("TT HIT");



        if (depth === 0) {

            return this.quiescence(alpha, beta, ply, 0);

        }

        //----------------------------------
        // Generate Moves
        //----------------------------------

        let t = performance.now();

        const moves =
            this.legalMoveGenerator.generateMoves();

        this.generateTime += performance.now() - t;

        t = performance.now();

        const killers = this.getKillers(ply);

        this.moveOrdering.order(moves, killers, ttMove, this.history);

        this.orderTime += performance.now() - t;

        //----------------------------------
        // Mate / Stalemate
        //----------------------------------

        if (moves.length === 0) {

            if (this.board.isInCheck()) {

                return -SearchConstants.MATE + ply;

            }

            return SearchConstants.DRAW;

        }

        //----------------------------------
        // Search
        //----------------------------------

        let bestScore = -SearchConstants.INFINITY;

        let bestMove = null;

            for (const move of moves) {

                //----------------------------------
                // Make Move
                //----------------------------------

                t = performance.now();

                this.board.makeMove(move);

                this.makeMoveTime +=
                    performance.now() - t;

                //----------------------------------
                // Search Child
                //----------------------------------

                const score =
                    -this.negamax(

                        depth - 1,

                        -beta,

                        -alpha,

                        ply + 1

                    );

                //----------------------------------
                // Undo Move
                //----------------------------------

                t = performance.now();

                this.board.undoMove();

                this.undoMoveTime +=
                    performance.now() - t;


                //----------------------------------
                // Best Score
                //----------------------------------

                if (score > bestScore) {

                    bestScore = score;

                    bestMove = move;

                }

                if (score > alpha) {

                    alpha = score;

                }

                //----------------------------------
                // Beta Cutoff
                //----------------------------------

                if (alpha >= beta) {

                this.cutoffs++;

                //----------------------------------
                // Store Killer
                //----------------------------------

                if (!move.isCapture()) {

                    this.killerCutoffs++;

                    const killers = this.getKillers(ply);

                    const key = move.key;

                    if (killers[0] !== key) {

                        killers[1] = killers[0];

                        killers[0] = key;

                    }

                    //----------------------------------
                    // History Heuristic
                    //----------------------------------
                    if (!move.isPromotion()) {

                        this.history

                            [

                                move.fromSquare

                            ]

                            [

                                move.toSquare

                            ]

                        += depth * depth;

                    }
                }

                break;

            }

        }

        let flag;

        if (bestScore <= alphaOriginal) {

            flag = TTFlag.UPPER;

        }

        else if (bestScore >= beta) {

            flag = TTFlag.LOWER;

        }

        else {

            flag = TTFlag.EXACT;

        }

        //----------------------------------
        // Store Position
        //----------------------------------

        this.tt.store(

            this.board.hashKey,

            depth,

            bestScore,

            flag,

            bestMove

        );

        return bestScore;

    }

    //----------------------------------
    // Quiescence Search
    //----------------------------------

    quiescence(alpha, beta, ply = 0, qPly = 0) {

        this.leafNodes++;

        const inCheck = this.board.isInCheck();

        //----------------------------------
        // Stand Pat
        //----------------------------------

        if (!inCheck) {

            let standPat =
                this.toSideToMoveScore(
                    this.whiteRelativeEval()
                );

            //----------------------------------
            // Beta Cutoff
            //----------------------------------

            if (standPat >= beta) {

                return beta;

            }

            //----------------------------------
            // Raise Alpha
            //----------------------------------

            if (standPat > alpha) {

                alpha = standPat;

            }

            if (qPly >= MAX_Q_PLY) {

                return alpha;

            }

        }

        //----------------------------------
        // Search Captures or Check Evasions
        //----------------------------------

        const moves =

            inCheck

                ? this.legalMoveGenerator.generateMoves()

                : this.legalMoveGenerator.generateCaptures();

        if (inCheck && moves.length === 0) {

            return -SearchConstants.MATE + ply;

        }

        if (inCheck) {

            this.moveOrdering.order(

                moves,

                this.getKillers(ply),

                null,

                this.history

            );

        }
        else {

            this.moveOrdering.order(

                moves

            );

        }

        for (const move of moves) {

            this.board.makeMove(move);

            const score =

                -this.quiescence(

                    -beta,

                    -alpha,

                    ply + 1,

                    qPly + 1

                );

            this.board.undoMove();

            if (score >= beta) {

                return beta;

            }

            if (score > alpha) {

                alpha = score;

            }

        }

        return alpha;

    }

    //----------------------------------
    // Best Move
    //----------------------------------

    bestMove(depth = 1) {

        EngineDebug.searchLog(
            "***** NEW BESTMOVE *****"
        );

        return this.searchRoot(depth);

    }

    //----------------------------------
    // Analyze Position
    //----------------------------------

    analyze(depth = 4) {

        const rootSideToMove =
            this.board.sideToMove;

        const result =
            this.searchRoot(depth);

        console.table(

            result.rootMoves.map(

                r => ({

                    Move: r.notation,

                    "Search Eval (White)":
                        (
                            this.toWhiteRelativeScore(
                                r.score,
                                rootSideToMove
                            ) / 100
                        ).toFixed(2)

                })

            )

        );

        return result.rootMoves;

    }

    //----------------------------------
    // Benchmark
    //----------------------------------

    bench(depth = 5) {

        this.tt.clear();

        this.killers = [];

        this.resetStatistics();

        console.clear();

        //----------------------------------
        // Run Search
        //----------------------------------

        const start = performance.now();

        const result = this.searchRoot(depth);

        const elapsed = performance.now() - start;

        //----------------------------------
        // Header
        //----------------------------------

        console.log("");
        console.log("==========================================");
        console.log("         CHESS ENGINE BENCHMARK");
        console.log("==========================================");
        console.log("");

        //----------------------------------
        // Search Results
        //----------------------------------

        console.log("Depth       :", result.depth);
        console.log("Best Move   :", result.notation);
        console.log("Search Eval (White):", result.evaluation);

        console.log("");

        console.log("Nodes       :", result.nodes.toLocaleString());
        console.log("Leaf Nodes  :", result.leafNodes.toLocaleString());
        console.log("Cutoffs     :", result.cutoffs.toLocaleString());
        console.log("Killer Cutoffs :", this.killerCutoffs.toLocaleString());
        console.log("Aspiration Re-searches :",this.aspirationResearches);

        console.log("");

        console.log("Elapsed     :", elapsed.toFixed(2), "ms");
        console.log("NPS         :", result.nps.toLocaleString());

        console.log("");

        //----------------------------------
        // Profile
        //----------------------------------

        const total =

            this.generateTime +
            this.orderTime +
            this.makeMoveTime +
            this.undoMoveTime;

        const pct = value =>

            total > 0

                ? ((value / total) * 100).toFixed(1)

                : "0.0";

        console.log("");
        console.log("=============== PROFILE =================");

        console.log(
            `Generate     : ${this.generateTime.toFixed(2)} ms (${pct(this.generateTime)}%)`
        );

        console.log(
            `Ordering     : ${this.orderTime.toFixed(2)} ms (${pct(this.orderTime)}%)`
        );

        console.log(
            `Make Move    : ${this.makeMoveTime.toFixed(2)} ms (${pct(this.makeMoveTime)}%)`
        );

        console.log(
            `Undo Move    : ${this.undoMoveTime.toFixed(2)} ms (${pct(this.undoMoveTime)}%)`
        );

        console.log("");

        console.log(
            `Board Make   : ${this.board.profileMakeMove.toFixed(2)} ms`
        );

        console.log(
            `Board Undo   : ${this.board.profileUndoMove.toFixed(2)} ms`
        );

        console.log(
            `Update Lists : ${this.board.profileUpdatePieceLists.toFixed(2)} ms`
        );

        console.log("==========================================");
        console.log("");

        return result;

    }

    benchAll(maxDepth = 6) {

        console.clear();

        const results = [];

        for (let depth = 1; depth <= maxDepth; depth++) {

            const start = performance.now();

            const result = this.searchRoot(depth);

            const elapsed = performance.now() - start;

            results.push({

                Depth: depth,

                Move: result.notation,

                Eval: result.evaluation,

                Nodes: result.nodes,

                NPS: result.nps,

                Time: elapsed.toFixed(2) + " ms"

            });

        }

        console.table(results);

    }

    //----------------------------------
    // Reset Statistics
    //----------------------------------

    resetStatistics() {

        this.generateTime = 0;
        this.orderTime = 0;
        this.makeMoveTime = 0;
        this.undoMoveTime = 0;

        this.nodes = 0;
        this.leafNodes = 0;
        this.cutoffs = 0;
        this.killerCutoffs = 0;

        this.board.profileMakeMove = 0;
        this.board.profileUndoMove = 0;
        this.board.profileUpdatePieceLists = 0;

    }

    getKillers(ply) {

        if (!this.killers[ply]) {

            this.killers[ply] = [

                -1,

                -1

            ];

        }

        return this.killers[ply];

    }

    buildPV(maxDepth = 64) {

        const pv = [];

        //----------------------------------
        // Save Current Position
        //----------------------------------

        const startPly =

            this.board.moveHistory.length;

        //----------------------------------
        // Follow TT
        //----------------------------------

        for (

            let depth = 0;

            depth < maxDepth;

            depth++

        ) {

            const entry =

                this.tt.probe(

                    this.board.hashKey

                );

            if (!entry)
                break;

            if (!entry.move)
                break;

            pv.push(entry.move);

            this.board.makeMove(entry.move);

        }

        //----------------------------------
        // Restore Position
        //----------------------------------

        while (

            this.board.moveHistory.length >

            startPly

        ) {

            this.board.undoMove();

        }

        return pv;

    }

    compareRootMoves(depth = 1) {

        const rootSideToMove =
            this.board.sideToMove;

        const moves = this.legalMoveGenerator.generateMoves();

        const results = [];

        for (const move of moves) {

            //----------------------------------
            // Capture Before
            //----------------------------------

            const before = this.captureEvaluation();

            //----------------------------------
            // Search
            //----------------------------------

            this.board.makeMove(move);

            const score = -this.negamax(
                depth - 1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                1
            );

            //----------------------------------
            // Capture After
            //----------------------------------

            const after = this.captureEvaluation();

            this.board.undoMove();

            //----------------------------------
            // Delta
            //----------------------------------

            const delta = {

                total:
                    after.eval.total -
                    before.eval.total,

                center:
                    after.eval.opening.centerOccupation -
                    before.eval.opening.centerOccupation,

                development:
                    after.eval.opening.development -
                    before.eval.opening.development,

                bishopFreedom:
                    after.eval.opening.bishopFreedom -
                    before.eval.opening.bishopFreedom,

                coordination:
                    after.eval.opening.coordination -
                    before.eval.opening.coordination,

                queenDiscipline:
                    after.eval.opening.queenDiscipline -
                    before.eval.opening.queenDiscipline,

                castlingUrgency:
                    after.eval.opening.castlingUrgency -
                    before.eval.opening.castlingUrgency,

                opening:
                    after.eval.opening.total -
                    before.eval.opening.total,

                pawnPST:
                    after.pst.pawn -
                    before.pst.pawn,

                knightPST:
                    after.pst.knight -
                    before.pst.knight,

                bishopPST:
                    after.pst.bishop -
                    before.pst.bishop,

                rookPST:
                    after.pst.rook -
                    before.pst.rook,

                queenPST:
                    after.pst.queen -
                    before.pst.queen,

                kingPST:
                    after.pst.king -
                    before.pst.king,

                pawnShield:
                    after.eval.king.pawnShield -
                    before.eval.king.pawnShield,

                kingSafety:
                    after.eval.king.safety -
                    before.eval.king.safety,

                king:
                    after.eval.king.total -
                    before.eval.king.total,

                knightMobility:
                    after.eval.mobility.knights -
                    before.eval.mobility.knights,

                bishopMobility:
                    after.eval.mobility.bishops -
                    before.eval.mobility.bishops,

                mobility:
                    after.eval.mobility.total -
                    before.eval.mobility.total,

                pieceSquares:
                    after.pst.total -
                    before.pst.total,

                connected:
                    after.eval.pawns.connected -
                    before.eval.pawns.connected,

                passed:
                    after.eval.pawns.passed -
                    before.eval.pawns.passed,

                isolated:
                    after.eval.pawns.isolated -
                    before.eval.pawns.isolated,

                doubled:
                    after.eval.pawns.doubled -
                    before.eval.pawns.doubled,

                pawns:
                    after.eval.pawns.total -
                    before.eval.pawns.total,

                hanging:
                    after.eval.tactics.hanging -
                    before.eval.tactics.hanging,

                tactics:
                    after.eval.tactics.total -
                    before.eval.tactics.total

            };

            //----------------------------------
            // Static vs Search
            //----------------------------------

            const staticScore = after.eval.total;

            const searchScore =
                this.toWhiteRelativeScore(
                    score,
                    rootSideToMove
                );

            const deltaSearch = searchScore - staticScore;

            //----------------------------------
            // Save Results
            //----------------------------------

            results.push({

                Move: move.toString(),

                "Static Eval (White)": (staticScore / 100).toFixed(2),

                "Search Eval (White)": (searchScore / 100).toFixed(2),

                "Search - Static Δ": (deltaSearch / 100).toFixed(2),

                "Total Δ": delta.total,

                "Center Δ": delta.center,

                "Develop Δ": delta.development,

                "Bishop Freedom Δ": delta.bishopFreedom,

                "Early Rook Discipline Δ": delta.coordination,

                "Queen Discipline Δ": delta.queenDiscipline,

                "Castling Urgency Δ": delta.castlingUrgency,

                "Opening Δ": delta.opening,

                "Pawn PST Δ": delta.pawnPST,

                "Knight PST Δ": delta.knightPST,

                "Bishop PST Δ": delta.bishopPST,

                "Rook PST Δ": delta.rookPST,

                "Queen PST Δ": delta.queenPST,

                "King PST Δ": delta.kingPST,

                "Pawn Shield Δ": delta.pawnShield,

                "King Safety Δ": delta.kingSafety,

                "King Total Δ": delta.king,

                "Knight Mobility Δ": delta.knightMobility,

                "Bishop Mobility Δ": delta.bishopMobility,

                "Mobility Total Δ": delta.mobility,

                "PieceSq Δ": delta.pieceSquares,

                "Connected Pawns Δ": delta.connected,

                "Passed Pawns Δ": delta.passed,

                "Isolated Pawns Δ": delta.isolated,

                "Doubled Pawns Δ": delta.doubled,

                "Pawn Total Δ": delta.pawns,

                "Hanging Pieces Δ": delta.hanging,

                "Tactics Total Δ": delta.tactics

            });

        }

        results.sort(

            (a, b) =>

                rootSideToMove > 0

                    ? parseFloat(b["Search Eval (White)"]) -
                        parseFloat(a["Search Eval (White)"])

                    : parseFloat(a["Search Eval (White)"]) -
                        parseFloat(b["Search Eval (White)"])

        );

        console.log("");
        console.log("========================================");
        console.log("   COACH LAB 3.0 - WHITE-RELATIVE");
        console.log("========================================");
        console.log("");

        console.table(results);

        return results;

    }

    lab(moveString = null, depth = 1) {

        //----------------------------------
        // No move supplied:
        // Compare every legal move
        //----------------------------------

        if (moveString === null) {

            return this.compareRootMoves(depth);

        }

        //----------------------------------
        // Find requested move
        //----------------------------------

        const moves = this.legalMoveGenerator.generateMoves();

        const move = moves.find(

            m => m.toString() === moveString

        );

        if (!move) {

            console.error(

                `Illegal move: ${moveString}`

            );

            return null;

        }

        //----------------------------------
        // Analyze move
        //----------------------------------

        const before =
            this.captureEvaluation();

        this.board.makeMove(move);

        const after =
            this.captureEvaluation();

        this.board.undoMove();

        const delta = {

            material:
                after.eval.material.total -
                before.eval.material.total,

            center:
                after.eval.opening.centerOccupation -
                before.eval.opening.centerOccupation,

            development:
                after.eval.opening.development -
                before.eval.opening.development,

            bishopFreedom:
                after.eval.opening.bishopFreedom -
                before.eval.opening.bishopFreedom,

            coordination:
                after.eval.opening.coordination -
                before.eval.opening.coordination,

            queenDiscipline:
                after.eval.opening.queenDiscipline -
                before.eval.opening.queenDiscipline,

            castlingUrgency:
                after.eval.opening.castlingUrgency -
                before.eval.opening.castlingUrgency,

            opening:
                after.eval.opening.total -
                before.eval.opening.total,

            pawnPST:
                after.pst.pawn -
                before.pst.pawn,

            knightPST:
                after.pst.knight -
                before.pst.knight,

            bishopPST:
                after.pst.bishop -
                before.pst.bishop,

            rookPST:
                after.pst.rook -
                before.pst.rook,

            queenPST:
                after.pst.queen -
                before.pst.queen,

            kingPST:
                after.pst.king -
                before.pst.king,

            pieceSquares:
                after.pst.total -
                before.pst.total,

            passed:
                after.eval.pawns.passed -
                before.eval.pawns.passed,

            connected:
                after.eval.pawns.connected -
                before.eval.pawns.connected,

            isolated:
                after.eval.pawns.isolated -
                before.eval.pawns.isolated,

            doubled:
                after.eval.pawns.doubled -
                before.eval.pawns.doubled,

            pawns:
                after.eval.pawns.total -
                before.eval.pawns.total,

            king:
                after.eval.king.total -
                before.eval.king.total,

            pawnShield:
                after.eval.king.pawnShield -
                before.eval.king.pawnShield,

            kingSafety:
                after.eval.king.safety -
                before.eval.king.safety,

            knightMobility:
                after.eval.mobility.knights -
                before.eval.mobility.knights,

            bishopMobility:
                after.eval.mobility.bishops -
                before.eval.mobility.bishops,

            mobility:
                after.eval.mobility.total -
                before.eval.mobility.total,

            hanging:
                after.eval.tactics.hanging -
                before.eval.tactics.hanging,

            tactics:
                after.eval.tactics.total -
                before.eval.tactics.total,

            total:
                after.eval.total -
                before.eval.total

        };

        console.log("");

        console.log("======================================");
        console.log(" COACH LAB 3.0 - DETAILED MOVE VIEW");
        console.log("======================================");
        console.log("");

        this.printCoachReport(

            moveString,

            before,

            after,

            delta,

            after.eval.total

        );

        return {

            move: moveString,

            before,

            after,

            delta

        };

    }

    captureEvaluation() {

        return {

            eval: structuredClone(
                this.evaluation.evaluate()
            ),

            pst: structuredClone(
                this.evaluation.debugPieceSquares()
            )

        };

    }

    formatDelta(value) {

        if (value > 0)
            return `+${value}`;

        if (value < 0)
            return `${value}`;

        return "0";

    }

    printCoachReport(move, before, after, delta, searchScore) {

        console.clear();

        console.log("");
        console.log("==========================================================");
        console.log("         COACH LAB 4.0 - WHITE-RELATIVE");
        console.log("==========================================================");
        console.log("");

        console.log(`Move`);
        console.log("----");
        console.log(move);
        console.log("");

        console.log("Post-Move Static Eval (White-relative)");
        console.log("--------------------------------------");
        console.log(`${(after.eval.total / 100).toFixed(2)}`);
        console.log("");

        console.log("Search Eval (White-relative)");
        console.log("----------------------------");
        console.log("Not computed in detailed lab(move) mode");
        console.log("");

        console.log("Static Δ From Current Position");
        console.log("------------------------------");
        console.log(`${(delta.total / 100).toFixed(2)}`);

        console.log("");

        //----------------------------------
        // Material
        //----------------------------------

        this.printSection(

            "Material",

            [],

            "Material Total",

            delta.material

        );

        //----------------------------------
        // Opening
        //----------------------------------

        this.printSection(

            "Opening",

            [

                { label: "Center Occupation", value: delta.center },

                { label: "Development", value: delta.development },

                { label: "Bishop Freedom", value: delta.bishopFreedom },

                { label: "Queen Discipline", value: delta.queenDiscipline },

                { label: "Castling Urgency", value: delta.castlingUrgency },

                { label: "Early Rook Discipline", value: delta.coordination }

            ],

            "Opening Total",

            delta.opening

        );

        //----------------------------------
        // Piece Squares
        //----------------------------------

        this.printSection(

            "Piece-Square Tables",

            [

                { label: "Pawn PST", value: delta.pawnPST },

                { label: "Knight PST", value: delta.knightPST },

                { label: "Bishop PST", value: delta.bishopPST },

                { label: "Rook PST", value: delta.rookPST },

                { label: "Queen PST", value: delta.queenPST },

                { label: "King PST", value: delta.kingPST }

            ],

            "Piece-Square Total",

            delta.pieceSquares

        );

        //----------------------------------
        // Pawns
        //----------------------------------

        this.printSection(

            "Pawn Structure",

            [

                { label: "Connected", value: delta.connected },

                { label: "Passed", value: delta.passed },

                { label: "Isolated", value: delta.isolated },

                { label: "Doubled", value: delta.doubled }

            ],

            "Pawn Total",

            delta.pawns

        );

        //----------------------------------
        // King Safety
        //----------------------------------

        this.printSection(

            "King Safety",

            [

                { label: "Pawn Shield", value: delta.pawnShield },

                { label: "King Safety", value: delta.kingSafety }

            ],

            "King Total",

            delta.king

        );

        //----------------------------------
        // Mobility
        //----------------------------------

        this.printSection(

            "Mobility",

            [

                { label: "Knight Mobility", value: delta.knightMobility },

                { label: "Bishop Mobility", value: delta.bishopMobility }

            ],

            "Mobility Total",

            delta.mobility

        );

        //----------------------------------
        // Tactics
        //----------------------------------

        this.printSection(

            "Tactics",

            [

                { label: "Hanging Pieces", value: delta.hanging }

            ],

            "Tactics Total",

            delta.tactics

        );

        //----------------------------------
        // Final
        //----------------------------------

        console.log("==========================================================");

        console.log(
            "POST-MOVE STATIC SCORE".padEnd(28),
            `${after.eval.total >= 0 ? "+" : ""}${after.eval.total}`
        );

        console.log(
            "STATIC DELTA".padEnd(28),
            `${delta.total >= 0 ? "+" : ""}${delta.total}`
        );

        console.log("==========================================================");
    }

    printSection(title, rows, totalLabel, total) {

        console.log(title);

        console.log("--------------------------------");

        for (const row of rows) {

            const value = row.value;

            console.log(

                row.label.padEnd(24),

                `${value >= 0 ? "+" : ""}${value}`

            );

        }

        console.log("--------------------------------");

        console.log(

            totalLabel.padEnd(24),

            `${total >= 0 ? "+" : ""}${total}`

        );

        console.log("");

    }

}
