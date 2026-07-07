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

//----------------------------------
// Quiescence: SEE Capture Pruning
//
// Only applied when NOT in check (see quiescence()). Skips
// clearly losing captures rather than searching them out --
// SEE is already computed for every capture during move
// ordering (MoveOrdering.scoreMove sets move.seeScore), so
// this reuses that value instead of recomputing SEE.
//
// -50 (roughly "losing half a pawn") was the initial, more
// aggressive starting point, but it broke an existing search
// regression test (the depth-5 "Nxe5 rook regression" test in
// tests/engine_regressions.test.mjs): pruning captures down to
// -50, or even down to -200, silently removed a capture with
// SEE exactly -210 that later ply relied on to correctly value
// a tactical bishop move, collapsing dozens of otherwise
// distinct root moves to an identical score. Testing the exact
// boundary empirically (by re-running that regression test at
// several thresholds) showed -210 was the precise cutoff where
// the regression appeared; -300 leaves a full, deliberate
// safety margin below that. Practically, this means the
// pruning now only removes captures that lose at least a minor
// piece for little or nothing in return -- clearly hopeless
// exchanges -- while any capture that only gives up "a piece
// for a pawn or two" (which is exactly the range that turned
// out to sometimes carry real tactical follow-up in this
// engine's search) is still searched in full. Losing captures
// are never pruned if they are also promotions.
//----------------------------------

const QSEARCH_SEE_PRUNE_THRESHOLD = -300;

//----------------------------------
// Quiescence: In-Check Ply Cap
//
// The not-in-check branch already stops recursing at
// MAX_Q_PLY via the stand-pat block below. The in-check
// (check-evasion) branch had no equivalent cap, so a long
// non-repeating chain of checks had no explicit qsearch depth
// limit. Reusing MAX_Q_PLY here keeps both branches capped at
// the same conservative depth rather than introducing a
// second tunable constant.
//----------------------------------

const MAX_Q_CHECK_PLY = MAX_Q_PLY;

//----------------------------------
// Principal Variation Search (PVS)
//
// Only applied inside negamax()'s own move loop (never the
// root loop in searchIteration(), and never quiescence()).
// The first ordered move at a node is always searched with
// the full alpha-beta window, exactly as before. Later moves
// are first searched with a cheap null/scout window; if a
// scout search unexpectedly beats alpha (while still below
// beta), that move is re-searched with the full window before
// its score is trusted, so the final result is identical to a
// full-window search either way -- PVS only changes how many
// nodes it costs to get there.
//
// Kept conservative on purpose: skipped while the side to
// move is in check (forced, tactical positions where a cheap
// scout window is least likely to pay off), and skipped below
// PVS_MIN_DEPTH (very shallow remaining depth, right next to
// the quiescence handoff, where the bookkeeping overhead of a
// possible re-search isn't worth it).
//----------------------------------

const PVS_MIN_DEPTH = 3;

export class SearchTimeout extends Error {}

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
        this.pvsResearches = 0;

        //----------------------------------
        // History Heuristic
        //----------------------------------

        this.history = Array.from(

            { length: 64 },

            () => new Int32Array(64)

        );

        this.searchDeadlineMs = null;
        this.searchQuiet = false;
        this.profileEnabled = false;
        
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

    isRuleDraw() {

        return (
            this.board.isThreefoldRepetition() ||
            this.board.isFiftyMoveDraw()
        );

    }

    hasRepetitionHistory() {

        return this.board.repetitionCount() > 1;

    }

    searchRoot(maxDepth = 1, options = {}) {

        const rootSideToMove =
            this.board.sideToMove;

        this.searchDeadlineMs =
            options.deadlineMs ?? null;

        this.searchQuiet =
            options.quiet ?? false;

        this.profileEnabled =
            options.profile ?? false;

        this.board.profileEnabled =
            this.profileEnabled;

        this.killers = [];

        for (const row of this.history) {

            row.fill(0);

        }

        this.resetStatistics();

        this.rootBestMove = null;

        const startTime = performance.now();

        const iterations = [];

        let result = null;
        let completedDepth = 0;

        let previousScore = 0;

        const fallbackMove =
            this.pickFallbackMove();

        //----------------------------------
        // Iterative Deepening
        //
        // `result` is only ever assigned from a validated
        // `iterationResult` below -- never directly from a
        // just-returned search call. This matters because an
        // aspiration-window search that fails high/low is only a
        // bound, not the true score: if the corrective full-window
        // re-search that follows is itself interrupted by
        // SearchTimeout, there must be no trusted value to publish
        // for this depth, and `result` must keep holding whatever
        // the last fully completed, trusted depth produced (or
        // remain null if depth 1 itself never completed).
        //----------------------------------

        for (

            let depth = 1;

            depth <= maxDepth;

            depth++

        ) {

            this.checkSearchDeadline();

            const iterationStart = performance.now();

            const startNodes = this.nodes;

            this.tt.nextAge();

            let alpha = -SearchConstants.INFINITY;
            let beta  =  SearchConstants.INFINITY;

            if (depth > 1) {

                alpha = previousScore - this.aspirationWindow;
                beta  = previousScore + this.aspirationWindow;

            }

            //----------------------------------
            // Narrow (aspiration) window search. Its outcome is
            // NOT trusted yet -- see the note above the loop.
            //----------------------------------

            let iterationResult;

            try {

                iterationResult = this.searchIteration(

                    depth,

                    alpha,

                    beta

                );

            }

            catch (error) {

                if (error instanceof SearchTimeout) {
                    break;
                }

                throw error;

            }

            //----------------------------------
            // Aspiration failed?
            //----------------------------------

            if (

                depth > 1 &&

                (

                    iterationResult.bestScore <= alpha ||

                    iterationResult.bestScore >= beta

                )

            ) {

                this.aspirationResearches++;

                try {

                    iterationResult = this.searchIteration(
                        depth,
                        -SearchConstants.INFINITY,
                        SearchConstants.INFINITY
                    );

                }

                catch (error) {

                    //----------------------------------
                    // The full-window re-search was interrupted
                    // before producing a trustworthy result.
                    // iterationResult still holds the failed
                    // narrow-window bound from just above -- that
                    // is only a lower/upper bound, not a real
                    // score, and must never be published. Discard
                    // it and stop iterating; `result` still holds
                    // the last fully completed, trusted depth.
                    //----------------------------------

                    if (error instanceof SearchTimeout) {
                        break;
                    }

                    throw error;

                }

            }

            //----------------------------------
            // Reaching here means iterationResult is trustworthy:
            // either the aspiration window held on the first try,
            // or the full-window re-search completed without being
            // interrupted. Commit it as the new trusted result.
            //----------------------------------

            result = iterationResult;

            previousScore = result.bestScore;
            completedDepth = depth;

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

        if (!result) {

            result = {
                bestMove: fallbackMove,
                bestScore: 0,
                rootMoves:
                    fallbackMove
                        ? [
                            {
                                move: fallbackMove,
                                notation: fallbackMove.toString(),
                                score: 0
                            }
                        ]
                        : []
            };

        }

        const pv =
            completedDepth > 0 && result.bestMove
                ? this.buildPV()
                : result.bestMove
                    ? [result.bestMove]
                    : [];

        if (
            !this.searchQuiet &&
            this.profileEnabled
        ) {

            console.log("");

            console.table(iterations);

            console.log("");

            console.log(

                "PV:",

                pv.map(

                    move => move.toString()

                ).join(" ")

            );

        }

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

        if (!this.searchQuiet) {

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

        }

        this.lastSearchScore =
            this.toWhiteRelativeScore(
                result.bestScore,
                rootSideToMove
            );

        this.searchDeadlineMs = null;
        this.searchQuiet = false;
        this.profileEnabled = false;
        this.board.profileEnabled = false;

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

            depth: completedDepth,

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

        //----------------------------------
        // Remember the window this call actually entered with
        // (before the loop below raises `alpha`), so the root
        // position can be stored with an honest EXACT/LOWER/UPPER
        // flag afterwards -- exactly like negamax() does. Without
        // this, a fail-high/fail-low result (bestScore outside the
        // window that was searched) would be mislabeled EXACT in
        // the TT, and a later buildPV()/probe() could pick up that
        // untrustworthy bound as if it were a real, exact score.
        //----------------------------------

        const alphaOriginal = alpha;

        const rootMoves = [];

        let t =
            this.profileEnabled
                ? performance.now()
                : 0;

        const moves =

            this.legalMoveGenerator.generateMoves();

        if (this.profileEnabled) {

            this.generateTime +=

                performance.now() - t;

        }

        //----------------------------------
        // TT Root Move
        //----------------------------------

        const ttEntry =

            this.hasRepetitionHistory()
                ? null
                : this.tt.probe(

                    this.board.hashKey

                );

        const ttMove =

            ttEntry

                ? ttEntry.move

                : null;

        //----------------------------------
        // Order
        //----------------------------------

        t =
            this.profileEnabled
                ? performance.now()
                : 0;

        this.moveOrdering.order(

            moves,

            [-1, -1],

            ttMove,

            this.history

        );

        if (this.profileEnabled) {

            this.orderTime +=

                performance.now() - t;

        }

        //----------------------------------
        // Search Root
        //----------------------------------

        for (const move of moves) {

            this.checkSearchDeadline();

            t =
                this.profileEnabled
                    ? performance.now()
                    : 0;

            this.board.makeMove(move);

            if (this.profileEnabled) {

                this.makeMoveTime +=

                    performance.now() - t;

            }

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

                t =
                    this.profileEnabled
                        ? performance.now()
                        : 0;

                this.board.undoMove();

                if (this.profileEnabled) {

                    this.undoMoveTime +=

                        performance.now() - t;

                }

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
        //
        // Classify exactly like negamax(): only EXACT when the
        // returned score actually fell strictly inside the window
        // this call was given. A fail-low (bestScore <=
        // alphaOriginal) or fail-high (bestScore >= beta) result is
        // only a bound, not the true value, and must be stored as
        // such -- otherwise a failed aspiration-window call could
        // leave a bogus EXACT entry for the root position that a
        // later buildPV() or TT probe would wrongly trust.
        //----------------------------------

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

        if (!this.hasRepetitionHistory()) {

            this.tt.store(

                this.board.hashKey,

                depth,

                bestScore,

                flag,

                bestMove

            );

        }

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

        this.checkSearchDeadline();

        this.nodes++;

        if (this.isRuleDraw()) {
            return SearchConstants.DRAW;
        }

        const alphaOriginal = alpha;
        const repetitionHistory =
            this.hasRepetitionHistory();

        //----------------------------------
        // Transposition Table Probe
        //----------------------------------

        const ttEntry =

            repetitionHistory
                ? null
                : this.tt.probe(

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

        let t =
            this.profileEnabled
                ? performance.now()
                : 0;

        const moves =
            this.legalMoveGenerator.generateMoves();

        if (this.profileEnabled) {

            this.generateTime +=
                performance.now() - t;

        }

        t =
            this.profileEnabled
                ? performance.now()
                : 0;

        const killers = this.getKillers(ply);

        this.moveOrdering.order(moves, killers, ttMove, this.history);

        if (this.profileEnabled) {

            this.orderTime +=
                performance.now() - t;

        }

        //----------------------------------
        // Mate / Stalemate
        //----------------------------------

        const inCheck = this.board.isInCheck();

        if (moves.length === 0) {

            if (inCheck) {

                return -SearchConstants.MATE + ply;

            }

            return SearchConstants.DRAW;

        }

        //----------------------------------
        // Search
        //----------------------------------

        let bestScore = -SearchConstants.INFINITY;

        let bestMove = null;

        let moveIndex = 0;

            for (const move of moves) {

                //----------------------------------
                // Make Move
                //----------------------------------

                t =
                    this.profileEnabled
                        ? performance.now()
                        : 0;

                this.board.makeMove(move);

                if (this.profileEnabled) {

                    this.makeMoveTime +=
                        performance.now() - t;

                }

                //----------------------------------
                // Search Child (Principal Variation Search)
                //
                // The first ordered move always gets the full
                // alpha-beta window, exactly as before PVS. Later
                // moves are only scouted with a null window when
                // it is safe to do so (not in check, and enough
                // depth remains -- see PVS_MIN_DEPTH above); a
                // scout that beats alpha but stays below beta is
                // re-searched with the full window before being
                // trusted, so the final score is never taken from
                // a null-window search alone.
                //----------------------------------

                const usePvsScout =

                    moveIndex > 0 &&

                    !inCheck &&

                    depth >= PVS_MIN_DEPTH;

                let score;

                //----------------------------------
                // Search Child / Undo Move (paired)
                //
                // Wrapped in try/finally so that board.undoMove()
                // always runs exactly once for the board.makeMove()
                // above -- even if this.negamax() throws
                // SearchTimeout partway through. Without this, a
                // deadline firing several plies down would leave
                // this.board with an un-undone move applied (wrong
                // sideToMove, king squares, castling rights, hash
                // key, and an extra moveHistory/repetitionTable
                // entry), silently corrupting the board for the
                // rest of this search call and for whatever reads
                // this.board afterwards (including the
                // rootSideToMove used to convert the final score
                // back to UCI's side-relative convention in
                // handleGo() -- an odd number of orphaned plies
                // there can flip the sign of the score reported to
                // the GUI). searchIteration()'s own root-level loop
                // already had this protection; negamax() and
                // quiescence() did not.
                //----------------------------------

                try {

                    if (usePvsScout) {

                        score =
                            -this.negamax(

                                depth - 1,

                                -alpha - 1,

                                -alpha,

                                ply + 1

                            );

                        if (score > alpha && score < beta) {

                            this.pvsResearches++;

                            score =
                                -this.negamax(

                                    depth - 1,

                                    -beta,

                                    -alpha,

                                    ply + 1

                                );

                        }

                    }
                    else {

                        score =
                            -this.negamax(

                                depth - 1,

                                -beta,

                                -alpha,

                                ply + 1

                            );

                    }

                }

                finally {

                    //----------------------------------
                    // Undo Move
                    //----------------------------------

                    t =
                        this.profileEnabled
                            ? performance.now()
                            : 0;

                    this.board.undoMove();

                    if (this.profileEnabled) {

                        this.undoMoveTime +=
                            performance.now() - t;

                    }

                }

                moveIndex++;


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

        if (!repetitionHistory) {

            this.tt.store(

                this.board.hashKey,

                depth,

                bestScore,

                flag,

                bestMove

            );

        }

        return bestScore;

    }

    //----------------------------------
    // Quiescence Search
    //----------------------------------

    quiescence(alpha, beta, ply = 0, qPly = 0) {

        this.checkSearchDeadline();

        this.leafNodes++;

        if (this.isRuleDraw()) {
            return SearchConstants.DRAW;
        }

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

        //----------------------------------
        // In-Check Ply Cap
        //
        // This only fires once we already know (above) that
        // the position is NOT checkmate -- there was at least
        // one legal evasion. Reaching the cap here just means
        // "stop recursing further down this forced-check
        // chain," never "this is mate." Falling back to the
        // static evaluation is a safety valve for the rare,
        // very deep, non-repeating check sequence; it is not
        // used to manufacture a mate score.
        //----------------------------------

        if (inCheck && qPly >= MAX_Q_CHECK_PLY) {

            return this.toSideToMoveScore(
                this.whiteRelativeEval()
            );

        }

        if (inCheck) {

            this.moveOrdering.order(

                moves,

                this.getKillers(ply),

                null,

                this.history,

                true

            );

        }
        else {

            this.moveOrdering.order(

                moves

            );

        }

        for (const move of moves) {

            //----------------------------------
            // SEE Capture Pruning
            //
            // Only when NOT in check. Never prunes promotions,
            // even capture-promotions, regardless of SEE. Only
            // skips captures clearly losing more than half a
            // pawn (see QSEARCH_SEE_PRUNE_THRESHOLD comment).
            //----------------------------------

            if (

                !inCheck &&

                move.isCapture() &&

                !move.isPromotion() &&

                move.seeScore !== undefined &&

                move.seeScore < QSEARCH_SEE_PRUNE_THRESHOLD

            ) {

                continue;

            }

            this.board.makeMove(move);

            let score;

            //----------------------------------
            // try/finally so board.undoMove() always runs even if
            // this.quiescence() throws SearchTimeout partway
            // through -- see the matching comment in negamax()'s
            // move loop above for why an unmatched makeMove() here
            // corrupts this.board for the rest of the search call.
            //----------------------------------

            try {

                score =

                    -this.quiescence(

                        -beta,

                        -alpha,

                        ply + 1,

                        qPly + 1

                    );

            }

            finally {

                this.board.undoMove();

            }

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

    bestMove(depth = 1, options = {}) {

        EngineDebug.searchLog(
            "***** NEW BESTMOVE *****"
        );

        return this.searchRoot(depth, options);

    }

    shouldStopSearch() {

        return (
            this.searchDeadlineMs !== null &&
            (this.nodes & 1023) === 0 &&
            performance.now() >= this.searchDeadlineMs
        );

    }

    checkSearchDeadline() {

        if (this.shouldStopSearch()) {
            throw new SearchTimeout();
        }

    }

    pickFallbackMove() {

        const moves =
            this.legalMoveGenerator.generateMoves();

        return moves.length
            ? moves[0]
            : null;

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

        const result = this.searchRoot(
            depth,
            { profile: true }
        );

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
        this.pvsResearches = 0;

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

                rookFiles:
                    after.eval.position.openFiles -
                    before.eval.position.openFiles,

                rookCoordination:
                    after.eval.position.rookConnection -
                    before.eval.position.rookConnection,

                position:
                    after.eval.position.total -
                    before.eval.position.total,

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

                "Rook Files Δ": delta.rookFiles,

                "King/Rook Coord Δ": delta.rookCoordination,

                "Position Δ": delta.position,

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

            rookFiles:
                after.eval.position.openFiles -
                before.eval.position.openFiles,

            rookCoordination:
                after.eval.position.rookConnection -
                before.eval.position.rookConnection,

            position:
                after.eval.position.total -
                before.eval.position.total,

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
        // Position
        //----------------------------------

        this.printSection(

            "Position",

            [

                { label: "Rook File Activity", value: delta.rookFiles },

                { label: "King/Rook Coordination", value: delta.rookCoordination }

            ],

            "Position Total",

            delta.position

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
