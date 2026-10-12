//======================================
// search.js
//======================================

import { SearchConstants } from "./searchconstants.js";
import MoveOrdering from "./moveordering.js";
import EngineDebug from "../dev/enginedebug.js";
import { Piece } from "../core/piece.js";
import { algebraic } from "../core/square.js";
import Zobrist from "./zobrist.js";
import TranspositionTable from "./transpositiontable.js";
import {
    TTFlag,
    scoreFromTT,
    scoreToTT
}
    from "./transpositiontable.js";

const MAX_Q_PLY = 16;

const ROOT_PLATEAU_EARLY_STOP_MIN_DEPTH = 7;
const ROOT_PLATEAU_EARLY_STOP_MIN_TIED_ROWS = 8;
const ROOT_PLATEAU_EARLY_STOP_MAX_BAND_CP = 0;

function promotionSuffix(piece) {

    switch (Math.abs(piece)) {

        case Math.abs(Piece.WQ):
            return "q";

        case Math.abs(Piece.WR):
            return "r";

        case Math.abs(Piece.WB):
            return "b";

        case Math.abs(Piece.WN):
            return "n";

        default:
            return "";

    }

}

function moveToLabUci(move) {

    let notation =
        algebraic(move.fromSquare) +
        algebraic(move.toSquare);

    if (move.isPromotion()) {
        notation += promotionSuffix(move.promotedPiece);
    }

    return notation;

}

function parseLabMoveString(moveString) {

    if (typeof moveString !== "string") {

        return {
            error:
                "Invalid move format. Use e2-e4 or e2e4; " +
                "promotion moves must include q, r, b, or n."
        };

    }

    const trimmed =
        moveString.trim();

    const normalized =
        trimmed.toLowerCase();

    const exactMatch =
        normalized.match(
            /^([a-h][1-8])-?([a-h][1-8])(?:=?([qrbn]))?$/
        );

    if (exactMatch) {

        return {
            from: exactMatch[1],
            to: exactMatch[2],
            promotion: exactMatch[3] || null
        };

    }

    const malformedPromotionMatch =
        normalized.match(
            /^([a-h][1-8])-?([a-h][1-8])(?:=?(.+))$/
        );

    if (malformedPromotionMatch) {

        return {
            error:
                `Invalid promotion suffix "${malformedPromotionMatch[3]}". ` +
                "Use q, r, b, or n."
        };

    }

    return {
        error:
            `Invalid move format: ${moveString}. ` +
            "Use e2-e4 or e2e4; promotion moves must include q, r, b, or n."
    };

}

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
// the regression appeared; -250 keeps a deliberate margin below
// that while pruning a few more hopeless captures. Practically,
// this means the
// pruning now only removes captures that lose at least a minor
// piece for little or nothing in return -- clearly hopeless
// exchanges -- while any capture that only gives up "a piece
// for a pawn or two" (which is exactly the range that turned
// out to sometimes carry real tactical follow-up in this
// engine's search) is still searched in full. Losing captures
// are never pruned if they are also promotions.
//----------------------------------

const QSEARCH_SEE_PRUNE_THRESHOLD = -250;

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
// Quiescence: Quiet Forcing Moves
//
// The normal not-in-check qsearch searches captures only. That
// is fast, but it is blind to near-horizon mate nets where the
// forcing move is a quiet check or a quiet promotion. Search
// those forcing quiet moves only in the first qsearch ply so
// the extension is tactical rather than a second full search.
//----------------------------------

const MAX_Q_QUIET_FORCING_PLY = 1;

// Quiet queen checks in sparse mixed-material positions can
// create a false mate horizon while ultra-sparse promotion
// conversions rely on the same qsearch resource. Keep the gate
// between those two observed classes.
const QSEARCH_QUIET_QUEEN_MIN_NON_KING_PIECES = 4;
const QSEARCH_QUIET_QUEEN_MAX_NON_KING_PIECES = 6;

// Capture-first lazy generation pays an extra capture pass when a
// node reaches its quiet stage. Restrict it to material-rich
// positions where broad branching makes skipped quiet generation
// worthwhile; sparse endings retain the single-pass baseline.
const LAZY_QUIET_MIN_NON_KING_PIECES = 10;

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

//----------------------------------
// Late Move Reductions (conservative v1)
//
// With good move ordering, moves far down the ordered list at
// a node rarely turn out best. LMR searches such moves with a
// null window at a shallower depth first; only if that
// reduced probe suggests the move might actually beat alpha
// is it re-searched at full depth (still null-window), and
// only if THAT beats alpha inside an open window does the
// normal PVS full-window re-search run. A move's final score
// is therefore never taken from a reduced search alone.
//
// v1 is deliberately conservative. A move is reduced only
// when ALL of these hold:
//
//   - the node is a PVS scout candidate already, which
//     requires: not the first ordered move, side to move NOT
//     in check, and depth >= PVS_MIN_DEPTH
//   - depth >= LMR_MIN_DEPTH (never near the horizon)
//   - moveIndex >= LMR_MIN_MOVE_INDEX (the first few ordered
//     moves -- including the TT move, which is always ordered
//     first -- are always searched at full depth)
//   - the move is not a capture and not a promotion
//   - the move is not either killer move for this ply
//   - the move does not give check (verified exactly on the
//     board AFTER the move is made, so discovered checks are
//     also excluded -- unlike the move-ordering heuristic,
//     this must not miss any checking move)
//
// Root moves are never reduced: searchIteration() has its own
// move loop that does not go through this path.
//
// Reduction is a single ply. With LMR_MIN_DEPTH = 5 the
// reduced child depth is at least 3, so a reduction can never
// drop a search directly into quiescence, let alone below
// zero. The threshold is 5 (not 4) because the depth-5 Nxe5
// tactical regression test showed reductions inside a
// depth-5 tree costing a quiet pinning move (f8-b4): with
// the threshold at 5, a depth-5 search contains no node deep
// enough to reduce, and deeper searches keep at least a
// 4-ply full-width core above every reduced child.
//----------------------------------

const LMR_MIN_DEPTH = 5;

const LMR_MIN_MOVE_INDEX = 4;

const LMR_REDUCTION = 1;

//----------------------------------
// Null-Move Pruning (conservative v1)
//
// See the gate list at the null-move block inside negamax().
// R = 2 with a minimum depth of 3 means the null child depth
// is at least 0, i.e. at worst a direct quiescence probe.
//----------------------------------

const NULL_MOVE_MIN_DEPTH = 3;

const NULL_MOVE_REDUCTION = 2;

//----------------------------------
// Null-move decisive-disadvantage margin (centipawns).
//
// When beta for the side to move is already at or below
// -NULL_MOVE_DECISIVE_MARGIN, the node is asking "can I prove
// I am not losing decisively?" -- which is exactly where the
// opponent tends to have a deep forcing attack or mate net,
// and where a depth-reduced null probe is most likely to fail
// high on a horizon mirage and hide the refutation (observed
// directly: the queen/rook mate sentinel lost its forced mate
// to such a cutoff during screening, even with the static-eval
// gate active). Nodes this lopsided are a small fraction of
// the tree, so disabling null moves there costs little and
// keeps deep mate proofs intact. Screening showed some such
// gate is necessary for Coach's current mate-net handling;
// 500 is retained as the current middle ground pending a
// broader mate-corpus audit.
//----------------------------------

const NULL_MOVE_DECISIVE_MARGIN = 500;

const REVERSE_FUTILITY_DEPTH = 1;

const REVERSE_FUTILITY_MARGIN = 300;

const LATE_MOVE_PRUNING_DEPTH = 1;
const LATE_MOVE_PRUNING_MIN_INDEX = 7;
const LATE_MOVE_PRUNING_STATIC_MARGIN = 200;
const LATE_MOVE_PRUNING_MIN_NON_KING_PIECES = 10;

const QSEARCH_TT_SIZE_DIVISOR = 4;
const QSEARCH_TT_MAX_MB = 8;
const QSEARCH_TT_MIN_NON_KING_PIECES = 10;
const QSEARCH_TT_HASH_MIX = 0x9e3779b97f4a7c15n;
const QSEARCH_TT_HASH_MASK = (1n << 64n) - 1n;

//----------------------------------
// Check Extension (near-horizon only, budget-capped v2)
//
// A move that gives check is forcing; searching the reply one
// ply deeper can reveal a mate/tactic that would otherwise fall
// past the horizon. The unconditional v1 extended checking
// lines throughout the whole tree and exploded in breadth in
// queen-rich positions. v2 only extends when the current node
// is already near the negamax->quiescence horizon
// (depth <= CHECK_EXTENSION_MAX_DEPTH), so extensions happen
// only in the shallow subtrees at the bottom of the tree where
// the missing continuation actually lives. Each root-to-leaf
// line may still spend at most MAX_CHECK_EXTENSIONS extension,
// threaded through negamax()'s recursive calls (extensionsLeft),
// which also stops a run of consecutive near-horizon checks from
// extending indefinitely. Never applied at the root move loop
// (searchIteration) and never inside quiescence().
//----------------------------------

const MAX_CHECK_EXTENSIONS = 1;

//----------------------------------
// Root forcing-check search
//
// Quiet checking moves can be the shortest route to a forced mate
// but lose root-order priority to promotions and captures. A root-
// only boost searches those forcing checks early without changing
// move ordering inside the tree. The paired root-only extension
// gives the checked child enough depth to prove medium mates without
// globally increasing check-extension budget at every node.
//----------------------------------

const ROOT_CHECK_ORDER_BONUS = 48000;
const ROOT_CHECK_EXTENSION = 3;
const ROOT_CHECK_MAX_REPLIES = 8;

const ROOT_BARE_KING_ROOK_PAWN_MIN_DEPTH = 8;
const ROOT_BARE_KING_ROOK_PAWN_MAX_MOVES = 5;
const ROOT_BARE_KING_ROOK_PAWN_EXTENSION = 1;

function sideHasPawnOnSeventh(board, sideToMove) {

    const pawn =
        sideToMove > 0
            ? Piece.WP
            : Piece.BP;

    const start =
        sideToMove > 0
            ? 8
            : 48;

    for (let square = start; square < start + 8; square++) {

        if (board.pieceAt(square) === pawn) {
            return true;
        }

    }

    return false;

}

function countRootScoreTies(rootMoves, score) {

    return rootMoves.filter(row => row.score === score).length;

}

function isNonMateRootPlateau(rootMoves) {

    if (
        !Array.isArray(rootMoves) ||
        rootMoves.length < ROOT_PLATEAU_EARLY_STOP_MIN_TIED_ROWS
    ) {
        return false;
    }

    const topRows =
        rootMoves.slice(0, ROOT_PLATEAU_EARLY_STOP_MIN_TIED_ROWS);

    const topScore =
        topRows[0].score;

    if (Math.abs(topScore) >= SearchConstants.MATE_THRESHOLD) {
        return false;
    }

    if (
        topRows.some(row =>
            Math.abs(row.score) >= SearchConstants.MATE_THRESHOLD
        )
    ) {
        return false;
    }

    const band =
        topRows[0].score - topRows.at(-1).score;

    return (
        band <= ROOT_PLATEAU_EARLY_STOP_MAX_BAND_CP &&
        countRootScoreTies(rootMoves, topScore) >=
            ROOT_PLATEAU_EARLY_STOP_MIN_TIED_ROWS
    );

}

const CHECK_EXTENSION_MAX_DEPTH = 3;

const ROOT_TIE_VERIFY_MIN_DEPTH = 6;

const ROOT_TIE_VERIFY_SCORE_FLOOR = 300;

const ROOT_PAWN_ENDING_TIE_VERIFY_SCORE_FLOOR = 150;

const ROOT_EXTENDED_ENDING_TIE_VERIFY_SCORE_FLOOR = 1000;

const ROOT_TIE_VERIFY_MAX_MOVES = 6;

const ROOT_TIE_VERIFY_LOW_NON_PAWN_MAX_MOVES = 8;

const ROOT_TIE_VERIFY_SCORE_TOLERANCE = 10;

const ROOT_TIE_VERIFY_MAX_NON_PAWN_MATERIAL = 4;

// Static evaluation is a pure function of the fully hashed board state.
// A modest direct-mapped cache captures transpositions and repeated
// iterative-deepening leaves without retaining positions between roots.
const STATIC_EVAL_CACHE_ENTRIES = 1 << 16;

export class SearchTimeout extends Error {}

export default class Search {

    static STAGED_MOVE_ORDERING =
        typeof process === "undefined" ||
        process.env?.COACH_STAGED_MOVE_ORDERING !== "0";

    static LAZY_QUIET_MOVE_GENERATION =
        typeof process === "undefined" ||
        process.env?.COACH_LAZY_QUIET_MOVE_GENERATION !== "0";

    static QSEARCH_TT =
        typeof process === "undefined" ||
        process.env?.COACH_QSEARCH_TT !== "0";

    static LATE_MOVE_PRUNING =
        typeof process === "undefined" ||
        process.env?.COACH_LATE_MOVE_PRUNING !== "0";

    static STATIC_EVAL_CACHE =
        typeof process === "undefined" ||
        process.env?.COACH_STATIC_EVAL_CACHE !== "0";

    static qsearchTableSizeMB(hashSizeMB) {

        return Math.min(
            QSEARCH_TT_MAX_MB,
            Math.max(
                1,
                Math.floor(hashSizeMB / QSEARCH_TT_SIZE_DIVISOR)
            )
        );

    }

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
        this.qtt = new TranspositionTable(
            Search.qsearchTableSizeMB(this.tt.sizeMB)
        );

        this.staticEvalTable =
            new Array(STATIC_EVAL_CACHE_ENTRIES);

        this.staticEvalMask =
            STATIC_EVAL_CACHE_ENTRIES - 1;

        this.staticEvalProbes = 0;
        this.staticEvalHits = 0;
        this.staticEvalStores = 0;
        
        this.rootBestMove = null;

        this.lastSearchScore = 0;

        this.aspirationWindow = 25;     // 0.25 pawns
        this.aspirationResearches = 0;
        this.pvsResearches = 0;
        this.lmrReductions = 0;
        this.lmrResearches = 0;
        this.nullAttempts = 0;
        this.nullCutoffs = 0;
        this.reverseFutilityCutoffs = 0;
        this.lazyMovePickerNodes = 0;
        this.lazyQuietGenerationCalls = 0;
        this.lazyQuietGenerationSkips = 0;
        this.qttProbes = 0;
        this.qttHits = 0;
        this.qttCutoffs = 0;
        this.qttStores = 0;
        this.lateMovePrunes = 0;

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

        if (!Search.STATIC_EVAL_CACHE) {
            return this.evaluation.evaluate().total;
        }

        const hash = this.board.hashKey;
        const index = Number(hash & BigInt(this.staticEvalMask));
        const entry = this.staticEvalTable[index];

        this.staticEvalProbes++;

        if (entry && entry.hash === hash) {
            this.staticEvalHits++;
            return entry.score;
        }

        const score = this.evaluation.evaluate().total;

        this.staticEvalTable[index] = { hash, score };
        this.staticEvalStores++;

        return score;

    }

    clearStaticEvalCache() {

        this.staticEvalTable.fill(undefined);
        this.staticEvalProbes = 0;
        this.staticEvalHits = 0;
        this.staticEvalStores = 0;

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

    generateQuiescenceMoves(qPly) {

        const captures =
            this.legalMoveGenerator.generateCaptures();

        if (qPly >= MAX_Q_QUIET_FORCING_PLY) {
            return captures;
        }

        const captureKeys =
            new Set(captures.map(move => move.key));

        const quietForcingMoves = [];

        for (const move of this.legalMoveGenerator.generateMoves()) {

            if (captureKeys.has(move.key)) {
                continue;
            }

            if (move.isCapture()) {
                continue;
            }

            if (move.isPromotion()) {
                quietForcingMoves.push(move);
                continue;
            }

            const movingPiece =
                Math.abs(this.board.pieceAt(move.fromSquare));
            this.board.makeMove(move);

            let givesCheck;

            try {
                givesCheck = this.board.isInCheck();
            }

            finally {
                this.board.undoMove();
            }

            if (
                givesCheck &&
                !(
                    movingPiece === Math.abs(Piece.WQ) &&
                    this.board.pieceCount() >=
                        QSEARCH_QUIET_QUEEN_MIN_NON_KING_PIECES &&
                    this.board.pieceCount() <=
                        QSEARCH_QUIET_QUEEN_MAX_NON_KING_PIECES
                )
            ) {
                quietForcingMoves.push(move);
            }

        }

        return captures.concat(quietForcingMoves);

    }

    verifyRootTie(depth, result) {

        const scoreFloor =
            this.rootTieVerificationScoreFloor();
        const nonPawnMaterial =
            this.rootTieVerificationNonPawnMaterial();

        if (
            depth < ROOT_TIE_VERIFY_MIN_DEPTH ||
            !result.bestMove ||
            !Array.isArray(result.rootMoves) ||
            result.rootMoves.length < 2 ||
            scoreFloor === null ||
            Math.abs(result.bestScore) < scoreFloor ||
            !this.isRootTieVerificationMaterialEligible()
        ) {
            return result;
        }

        const topScore =
            result.rootMoves[0].score;
        const verifyMaxMoves =
            nonPawnMaterial <= 1
                ? ROOT_TIE_VERIFY_LOW_NON_PAWN_MAX_MOVES
                : ROOT_TIE_VERIFY_MAX_MOVES;

        const tiedMoves =
            result.rootMoves
                .filter(rootMove => rootMove.score === topScore)
                .slice(0, verifyMaxMoves);

        if (tiedMoves.length < 2) {
            return result;
        }

        let bestVerified = {
            rootMove: tiedMoves[0],
            score: -SearchConstants.INFINITY
        };

        const useIsolatedVerificationTable =
            nonPawnMaterial <= 1;
        const searchTable =
            this.tt;
        const qsearchTable =
            this.qtt;

        try {

            for (const rootMove of tiedMoves) {

                if (useIsolatedVerificationTable) {

                    const verificationTable =
                        new TranspositionTable(searchTable.sizeMB);

                    verificationTable.age = searchTable.age;
                    this.tt = verificationTable;

                    const qsearchVerificationTable =
                        new TranspositionTable(qsearchTable.sizeMB);

                    qsearchVerificationTable.age = qsearchTable.age;
                    this.qtt = qsearchVerificationTable;

                }

                this.board.makeMove(rootMove.move);

                let score;

                try {

                    score =
                        -this.negamax(
                            depth,
                            -SearchConstants.INFINITY,
                            SearchConstants.INFINITY,
                            1,
                            false
                        );

                }

                finally {

                    this.board.undoMove();

                    if (useIsolatedVerificationTable) {
                        this.tt = searchTable;
                        this.qtt = qsearchTable;
                    }

                }

                const scoreDelta =
                    score - bestVerified.score;

                if (
                    scoreDelta > ROOT_TIE_VERIFY_SCORE_TOLERANCE ||
                    (
                        Math.abs(scoreDelta) <= ROOT_TIE_VERIFY_SCORE_TOLERANCE &&
                        this.rootTiePreference(rootMove) >
                            this.rootTiePreference(bestVerified.rootMove)
                    )
                ) {

                    bestVerified = {
                        rootMove,
                        score
                    };

                }

            }

        }

        catch (error) {

            if (error instanceof SearchTimeout) {
                return result;
            }

            throw error;

        }

        if (
            bestVerified.rootMove.move.key !== result.bestMove.key ||
            bestVerified.score !== result.bestScore
        ) {

            const verifiedRootMoves =
                result.rootMoves
                    .map(rootMove =>
                        rootMove.move.key === bestVerified.rootMove.move.key
                            ? {
                                ...rootMove,
                                score: bestVerified.score,
                                verified: true
                            }
                            : rootMove
                    )
                    .sort((a, b) =>
                        b.score - a.score
                    );

            if (!this.hasRepetitionHistory()) {

                this.tt.store(
                    this.board.hashKey,
                    depth,
                    scoreToTT(
                        bestVerified.score,
                        0
                    ),
                    TTFlag.EXACT,
                    bestVerified.rootMove.move
                );

            }

            return {
                ...result,
                bestMove: bestVerified.rootMove.move,
                bestScore: bestVerified.score,
                rootMoves: verifiedRootMoves
            };

        }

        return result;

    }

    hasRepetitionHistory() {

        return this.board.repetitionCount() > 1;

    }

    rootTiePreference(rootMove) {

        const move = rootMove.move;
        const piece = Math.abs(move.piece);

        if (move.isPromotion()) {
            return 4;
        }

        if (move.isCapture()) {
            return 3;
        }

        if (piece === Math.abs(Piece.WK)) {
            return 2;
        }

        if (piece !== Math.abs(Piece.WP)) {
            return 1;
        }

        return 0;

    }

    hasReverseFutilityMaterial() {

        const sidePieces =
            this.board.sideToMove > 0
                ? this.board.whitePieces
                : this.board.blackPieces;

        return (
            sidePieces.rooks.length +
            sidePieces.queens.length
        ) > 0;

    }

    isLowMaterialEnding() {

        const whitePieces = this.board.whitePieces;
        const blackPieces = this.board.blackPieces;

        const nonPawnMaterial =
            whitePieces.knights.length +
            whitePieces.bishops.length +
            whitePieces.rooks.length +
            whitePieces.queens.length +
            blackPieces.knights.length +
            blackPieces.bishops.length +
            blackPieces.rooks.length +
            blackPieces.queens.length;

        return nonPawnMaterial <= 2;

    }

    rootTieVerificationNonPawnMaterial() {

        const whitePieces = this.board.whitePieces;
        const blackPieces = this.board.blackPieces;

        return (
            whitePieces.knights.length +
            whitePieces.bishops.length +
            whitePieces.rooks.length +
            whitePieces.queens.length +
            blackPieces.knights.length +
            blackPieces.bishops.length +
            blackPieces.rooks.length +
            blackPieces.queens.length
        );

    }

    isRootTieVerificationMaterialEligible() {

        return (
            this.rootTieVerificationNonPawnMaterial() <=
            ROOT_TIE_VERIFY_MAX_NON_PAWN_MATERIAL
        );

    }

    rootTieVerificationScoreFloor() {

        if (this.isPurePawnEnding()) {
            return ROOT_PAWN_ENDING_TIE_VERIFY_SCORE_FLOOR;
        }

        const nonPawnMaterial =
            this.rootTieVerificationNonPawnMaterial();

        if (nonPawnMaterial <= 2) {
            return ROOT_TIE_VERIFY_SCORE_FLOOR;
        }

        if (nonPawnMaterial <= ROOT_TIE_VERIFY_MAX_NON_PAWN_MATERIAL) {
            return ROOT_EXTENDED_ENDING_TIE_VERIFY_SCORE_FLOOR;
        }

        return null;

    }

    isPurePawnEnding() {

        const whitePieces = this.board.whitePieces;
        const blackPieces = this.board.blackPieces;

        const nonPawnMaterial =
            whitePieces.knights.length +
            whitePieces.bishops.length +
            whitePieces.rooks.length +
            whitePieces.queens.length +
            blackPieces.knights.length +
            blackPieces.bishops.length +
            blackPieces.rooks.length +
            blackPieces.queens.length;

        return (
            nonPawnMaterial === 0 &&
            (
                whitePieces.pawns.length +
                blackPieces.pawns.length
            ) > 0
        );

    }

    isBareKingRookPawnConversionRoot(moves) {

        if (moves.length > ROOT_BARE_KING_ROOK_PAWN_MAX_MOVES) {
            return false;
        }

        const sidePieces =
            this.board.sideToMove > 0
                ? this.board.whitePieces
                : this.board.blackPieces;

        const opponentPieces =
            this.board.sideToMove > 0
                ? this.board.blackPieces
                : this.board.whitePieces;

        const sideNonKingMaterial =
            sidePieces.pawns.length +
            sidePieces.knights.length +
            sidePieces.bishops.length +
            sidePieces.rooks.length +
            sidePieces.queens.length;

        if (sideNonKingMaterial !== 0) {
            return false;
        }

        return (
            opponentPieces.rooks.length === 1 &&
            opponentPieces.pawns.length > 0 &&
            opponentPieces.knights.length === 0 &&
            opponentPieces.bishops.length === 0 &&
            opponentPieces.queens.length === 0
        );

    }

    canReverseFutilityPrune(depth, alpha, beta, isRoot, inCheck) {

        return (
            !isRoot &&
            depth === REVERSE_FUTILITY_DEPTH &&
            beta === alpha + 1 &&
            !inCheck &&
            Math.abs(alpha) < SearchConstants.MATE_THRESHOLD &&
            Math.abs(beta) < SearchConstants.MATE_THRESHOLD &&
            this.hasReverseFutilityMaterial() &&
            !this.isLowMaterialEnding()
        );

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

        this.clearStaticEvalCache();

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
        let previousRootPlateauBestKey = null;

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
            this.qtt.nextAge();

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

            if (
                options.rootPlateauEarlyStop === true &&
                this.searchDeadlineMs !== null &&
                completedDepth >= ROOT_PLATEAU_EARLY_STOP_MIN_DEPTH - 1 &&
                result.bestMove &&
                isNonMateRootPlateau(result.rootMoves)
            ) {

                if (
                    completedDepth >= ROOT_PLATEAU_EARLY_STOP_MIN_DEPTH &&
                    previousRootPlateauBestKey === result.bestMove.key
                ) {
                    break;
                }

                previousRootPlateauBestKey = result.bestMove.key;

            }
            else {
                previousRootPlateauBestKey = null;
            }

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
                                uci: moveToLabUci(fallbackMove),
                                score: 0
                            }
                        ]
                        : []
            };

        }

        result =
            this.verifyRootTie(completedDepth, result);

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

            uci:

                result.bestMove

                    ? moveToLabUci(result.bestMove)

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

        const rootHasPawnOnSeventh =
            sideHasPawnOnSeventh(
                this.board,
                this.board.sideToMove
            );

        const rootBareKingRookPawnConversion =
            depth >= ROOT_BARE_KING_ROOK_PAWN_MIN_DEPTH &&
            this.isBareKingRookPawnConversionRoot(moves);

        let rootForcingCheckMoveKey = null;
        let rootQuietCheckCount = 0;

        if (rootHasPawnOnSeventh) {

            for (const move of moves) {

                if (
                    !move.isCapture() &&
                    !move.isPromotion() &&
                    this.moveOrdering.givesCheck(move)
                ) {

                    rootQuietCheckCount++;
                    rootForcingCheckMoveKey = move.key;

                    if (rootQuietCheckCount > 1) {
                        rootForcingCheckMoveKey = null;
                        break;
                    }

                }

            }

        }

        if (
            ROOT_CHECK_ORDER_BONUS > 0 &&
            rootForcingCheckMoveKey !== null
        ) {

            for (const move of moves) {

                if (move.key === rootForcingCheckMoveKey) {
                    move.score += ROOT_CHECK_ORDER_BONUS;
                }

            }

            moves.sort(
                (a, b) =>
                    (b.score - a.score) ||
                    this.moveOrdering.compareMoveIdentity(a, b)
            );

        }

        if (this.profileEnabled) {

            this.orderTime +=

                performance.now() - t;

        }

        //----------------------------------
        // Search Root
        //----------------------------------

        let move;
        let rootMoveIndex = 0;

        while ((move = moves[rootMoveIndex++]) !== undefined) {

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

                const rootGivesCheck =
                    this.board.isInCheck();

                const rootQuietCheck =
                    rootGivesCheck &&
                    move.key === rootForcingCheckMoveKey &&
                    !move.isCapture() &&
                    !move.isPromotion();

                const rootCheckReplyCount =
                    rootQuietCheck
                        ? this.legalMoveGenerator.generateMoves().length
                        : Infinity;

                const childDepth =
                    depth - 1 +
                    (
                        rootQuietCheck &&
                        rootCheckReplyCount <= ROOT_CHECK_MAX_REPLIES
                            ? ROOT_CHECK_EXTENSION
                            : 0
                    ) +
                    (
                        rootBareKingRookPawnConversion
                            ? ROOT_BARE_KING_ROOK_PAWN_EXTENSION
                            : 0
                    );

                score = -this.negamax(

                    childDepth,

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

                uci: moveToLabUci(move),

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

            //----------------------------------
            // Root Fail-High: stop searching root moves.
            //
            // Under an aspiration window, a root move can score at
            // or above beta (fail-hard leaves clamp to beta, so
            // exact equality is common). Before this check, the
            // loop kept going with alpha == beta, which made every
            // remaining root move's child search run with an EMPTY
            // window (alpha >= beta at entry). Such a degenerate
            // call examines exactly one reply -- negamax's beta-
            // cutoff test "alpha >= beta" is already true after the
            // first move regardless of its score -- and then stores
            // its truncated one-move fail-soft result in the TT as
            // an UPPER bound. That bound is unsound: an upper bound
            // on a max requires having examined every move, but the
            // truncated loop examined one. Concretely diagnosed on
            // r3r1k1/pp3ppp/3B2n1/4p1q1/1Q6/P4P2/1PP2P1P/R4R1K b
            // (depth 7): the node after 1...Nf4 was entered with
            // alpha = beta = -220, searched only the losing reply
            // 2.Qxb7?? (genuinely mated), stored "UPPER -99997" --
            // i.e. "White is mated no matter what" -- and the
            // aspiration full-window re-search then probed that
            // entry, clamped beta to the mate score, and published
            // a false mate-in-2 while the real defense 2.Rg1! was
            // never searched.
            //
            // Breaking here is the standard fail-high response: the
            // iteration's bestScore >= beta is detected by
            // searchRoot() immediately after this loop and answered
            // with a full-window re-search, exactly as before. No
            // remaining root move needs to be (or can meaningfully
            // be) searched with an empty window.
            //----------------------------------

            if (alpha >= beta) {

                break;

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

                scoreToTT(
                    bestScore,
                    0
                ),

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

    negamax(depth, alpha, beta, ply = 0, isRoot = false, extensionsLeft = MAX_CHECK_EXTENSIONS, nullAllowed = true) {

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

            const ttScore =
                scoreFromTT(
                    ttEntry.score,
                    ply
                );

            switch (ttEntry.flag) {

                case TTFlag.EXACT:

                    return ttScore;

                case TTFlag.LOWER:

                    alpha =

                        Math.max(

                            alpha,

                            ttScore

                        );

                    break;

                case TTFlag.UPPER:

                    beta =

                        Math.min(

                            beta,

                            ttScore

                        );

                    break;

            }

            if (alpha >= beta) {

                return ttScore;

            }

           }

        // console.log("TT HIT");



        if (depth === 0) {

            return this.quiescence(alpha, beta, ply, 0);

        }

        //----------------------------------
        // Null-Move Pruning (conservative v1)
        //
        // If the side to move could pass the turn and a reduced
        // null-window search STILL fails high against beta, the
        // real position (where an actual move gets to be played)
        // will almost certainly fail high as well, so the subtree
        // is cut off. Gated hard, all conditions required:
        //   - never at the root
        //   - never in PV (full-window) nodes
        //   - never while in check
        //   - never twice in a row (nullAllowed flag)
        //   - never when beta is a mate-class bound
        //   - never without heavy material (rook or queen) for
        //     the side to move; minor-piece endings were safe in
        //     shallow screening but offered little benefit and
        //     more zugzwang risk than rook/queen positions
        // The reduced child keeps the check-extension budget
        // unchanged and may not answer with a second null. A
        // cutoff returns plain fail-hard beta and is never
        // stored in the TT, so null results cannot pollute PV
        // reconstruction, TT bounds, or mate normalization.
        //----------------------------------

        const inCheck = this.board.isInCheck();

        let staticEval = null;

        const getStaticEval = () => {

            if (staticEval === null) {

                staticEval =
                    this.toSideToMoveScore(
                        this.whiteRelativeEval()
                    );

            }

            return staticEval;

        };

        if (
            this.canReverseFutilityPrune(
                depth,
                alpha,
                beta,
                isRoot,
                inCheck
            ) &&
            getStaticEval() - REVERSE_FUTILITY_MARGIN >= beta
        ) {

            this.reverseFutilityCutoffs++;

            return beta;

        }

        if (
            !isRoot &&
            nullAllowed &&
            !inCheck &&
            beta === alpha + 1 &&
            depth >= NULL_MOVE_MIN_DEPTH &&
            beta > -NULL_MOVE_DECISIVE_MARGIN
        ) {

            if (Math.abs(beta) < SearchConstants.MATE_THRESHOLD) {

                const sidePieces =
                    this.board.sideToMove > 0
                        ? this.board.whitePieces
                        : this.board.blackPieces;

                const hasHeavyPiece =
                    sidePieces.rooks.length +
                    sidePieces.queens.length > 0;

                //----------------------------------
                // Static-eval gate (N2): only try a null move
                // when the standing evaluation already meets
                // beta. A side that is statically below beta
                // gains nothing provable by passing, and -- far
                // more important -- this keeps null cutoffs out
                // of the losing side's nodes inside deep mate
                // proofs, where a reduced null probe can
                // otherwise fail high on a horizon mirage and
                // hide the mate (observed directly on the
                // queen/rook mate sentinel during screening).
                //----------------------------------

                if (
                    hasHeavyPiece &&
                    getStaticEval() >= beta
                ) {

                    this.nullAttempts++;

                    this.board.makeNullMove();

                    let nullScore;

                    try {

                        nullScore =
                            -this.negamax(
                                depth - 1 - NULL_MOVE_REDUCTION,
                                -beta,
                                -beta + 1,
                                ply + 1,
                                false,
                                extensionsLeft,
                                false
                            );

                    }

                    finally {

                        this.board.undoNullMove();

                    }

                    if (nullScore >= beta) {

                        this.nullCutoffs++;

                        return beta;

                    }

                }

            }

        }

        //----------------------------------
        // Generate Moves
        //----------------------------------

        let t =
            this.profileEnabled
                ? performance.now()
                : 0;

        const useLazyQuietGeneration =
            Search.LAZY_QUIET_MOVE_GENERATION &&
            Search.STAGED_MOVE_ORDERING &&
            !inCheck &&
            this.board.pieceCount() >=
                LAZY_QUIET_MIN_NON_KING_PIECES &&
            (!ttMove || ttMove.isCapture()) &&
            !this.hasPromotionReadyPawn();

        const moves =
            useLazyQuietGeneration
                ? this.legalMoveGenerator.generateCaptures()
                : this.legalMoveGenerator.generateMoves();

        if (this.profileEnabled) {

            this.generateTime +=
                performance.now() - t;

        }

        t =
            this.profileEnabled
                ? performance.now()
                : 0;

        const killers = this.getKillers(ply);

        const movePicker =
            useLazyQuietGeneration
                ? this.createLazyQuietMovePicker(
                    moves,
                    killers,
                    ttMove,
                    this.history
                )
                : this.createMovePicker(
                    moves,
                    killers,
                    ttMove,
                    this.history
                );

        if (useLazyQuietGeneration) {
            this.lazyMovePickerNodes++;
        }

        if (this.profileEnabled) {

            this.orderTime +=
                performance.now() - t;

        }

        //----------------------------------
        // Mate / Stalemate
        //----------------------------------

        if (!useLazyQuietGeneration && moves.length === 0) {

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

            let move;

            while ((move = movePicker.next()) !== null) {

                const pruneLateMoveCandidate =
                    this.canLateMovePrune(
                        depth,
                        alpha,
                        beta,
                        isRoot,
                        inCheck,
                        repetitionHistory,
                        moveIndex,
                        move,
                        killers,
                        getStaticEval
                    );

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

                //----------------------------------
                // Check extension (near-horizon only): does the
                // move just made give check (board-verified,
                // incl. discovered)? If so, this line still has
                // budget, AND the node is near the horizon
                // (depth <= CHECK_EXTENSION_MAX_DEPTH), search the
                // child one ply deeper. Budget decremented only
                // when the extension is actually spent.
                //----------------------------------

                const givesCheck = this.board.isInCheck();

                const extend =
                    (givesCheck &&
                        extensionsLeft > 0 &&
                        depth <= CHECK_EXTENSION_MAX_DEPTH)
                        ? 1
                        : 0;

                const childDepth = depth - 1 + extend;

                const childExtensions = extensionsLeft - extend;

                if (
                    pruneLateMoveCandidate &&
                    !givesCheck
                ) {

                    this.lateMovePrunes++;

                    t =
                        this.profileEnabled
                            ? performance.now()
                            : 0;

                    this.board.undoMove();

                    if (this.profileEnabled) {
                        this.undoMoveTime +=
                            performance.now() - t;
                    }

                    moveIndex++;
                    continue;

                }

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

                        //----------------------------------
                        // Late Move Reduction (scout only)
                        //
                        // See the LMR_* constants above for the
                        // full gate list and rationale. The
                        // gives-check test is exact: the move has
                        // already been made on the board here, so
                        // this.board.isInCheck() asks whether the
                        // OPPONENT is now in check, including
                        // discovered checks.
                        //----------------------------------

                        const reduceMove =

                            depth >= LMR_MIN_DEPTH &&

                            moveIndex >= LMR_MIN_MOVE_INDEX &&

                            !move.isCapture() &&

                            !move.isPromotion() &&

                            move.key !== killers[0] &&

                            move.key !== killers[1] &&

                            !givesCheck;

                        if (reduceMove) {

                            this.lmrReductions++;

                            score =
                                -this.negamax(

                                    depth - 1 - LMR_REDUCTION,

                                    -alpha - 1,

                                    -alpha,

                                    ply + 1,

                                    false,

                                    childExtensions

                                );

                            //----------------------------------
                            // Reduced probe suggests the move may
                            // beat alpha: verify at full depth
                            // (still null-window) before the
                            // normal PVS logic below decides
                            // whether a full-window re-search is
                            // needed. A reduced score is never
                            // used as a move's final score.
                            //----------------------------------

                            if (score > alpha) {

                                this.lmrResearches++;

                                score =
                                    -this.negamax(

                                        childDepth,

                                        -alpha - 1,

                                        -alpha,

                                        ply + 1,

                                        false,

                                        childExtensions

                                    );

                            }

                        }

                        else {

                            score =
                                -this.negamax(

                                    childDepth,

                                    -alpha - 1,

                                    -alpha,

                                    ply + 1,

                                    false,

                                    childExtensions

                                );

                        }

                        if (score > alpha && score < beta) {

                            this.pvsResearches++;

                            score =
                                -this.negamax(

                                    childDepth,

                                    -beta,

                                    -alpha,

                                    ply + 1,

                                    false,

                                    childExtensions

                                );

                        }

                    }
                    else {

                        score =
                            -this.negamax(

                                childDepth,

                                -beta,

                                -alpha,

                                ply + 1,

                                false,

                                childExtensions

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

        if (
            useLazyQuietGeneration &&
            !movePicker.quietGenerated
        ) {
            this.lazyQuietGenerationSkips++;
        }

        if (moveIndex === 0) {
            return inCheck
                ? -SearchConstants.MATE + ply
                : SearchConstants.DRAW;
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

                scoreToTT(
                    bestScore,
                    ply
                ),

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

        const alphaOriginal = alpha;
        const repetitionHistory =
            this.hasRepetitionHistory();
        const qttEligible =
            Search.QSEARCH_TT &&
            !repetitionHistory &&
            this.board.pieceCount() >=
                QSEARCH_TT_MIN_NON_KING_PIECES;
        const qttKey =
            qttEligible
                ? this.qsearchTableKey(
                    this.board.hashKey,
                    qPly,
                    this.board.halfMoveClock
                )
                : null;

        if (qttEligible) {

            this.qttProbes++;

            const qttEntry =
                this.qtt.probe(qttKey);

            if (qttEntry) {

                this.qttHits++;

                const qttScore =
                    scoreFromTT(
                        qttEntry.score,
                        ply
                    );

                if (qttEntry.flag === TTFlag.EXACT) {
                    this.qttCutoffs++;
                    return qttScore;
                }

                if (
                    qttEntry.flag === TTFlag.LOWER &&
                    qttScore >= beta
                ) {
                    this.qttCutoffs++;
                    return beta;
                }

                if (
                    qttEntry.flag === TTFlag.UPPER &&
                    qttScore <= alpha
                ) {
                    this.qttCutoffs++;
                    return alpha;
                }

            }

        }

        const score =
            this.searchQuiescenceNode(
                alpha,
                beta,
                ply,
                qPly
            );

        if (qttEligible) {

            let flag = TTFlag.EXACT;

            if (score <= alphaOriginal) {
                flag = TTFlag.UPPER;
            }
            else if (score >= beta) {
                flag = TTFlag.LOWER;
            }

            this.qtt.store(
                qttKey,
                0,
                scoreToTT(score, ply),
                flag,
                null
            );

            this.qttStores++;

        }

        return score;

    }

    searchQuiescenceNode(alpha, beta, ply, qPly) {

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

                : this.generateQuiescenceMoves(qPly);

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

            const movePicker =
                this.createMovePicker(

                moves,

                this.getKillers(ply),

                null,

                this.history,

                true

                );

            for (
                let move = movePicker.next();
                move !== null;
                move = movePicker.next()
            ) {

                const score =
                    this.searchQuiescenceMove(
                        move,
                        alpha,
                        beta,
                        ply,
                        qPly,
                        inCheck
                    );

                if (score >= beta) {
                    return beta;
                }

                if (score > alpha) {
                    alpha = score;
                }

            }

            return alpha;

        }
        else {

            const movePicker =
                this.createMovePicker(

                moves

            );

            for (
                let move = movePicker.next();
                move !== null;
                move = movePicker.next()
            ) {

                const score =
                    this.searchQuiescenceMove(
                        move,
                        alpha,
                        beta,
                        ply,
                        qPly,
                        inCheck
                    );

                if (score >= beta) {
                    return beta;
                }

                if (score > alpha) {
                    alpha = score;
                }

            }

            return alpha;

        }

    }

    qsearchTableKey(
        hash,
        qPly,
        halfMoveClock = this.board.halfMoveClock
    ) {

        const context =
            BigInt(qPly + 1) |
            (BigInt(halfMoveClock + 1) << 8n);
        const contextMix =
            (
                context *
                QSEARCH_TT_HASH_MIX
            ) & QSEARCH_TT_HASH_MASK;

        return hash ^ contextMix;

    }

    canLateMovePrune(
        depth,
        alpha,
        beta,
        isRoot,
        inCheck,
        repetitionHistory,
        moveIndex,
        move,
        killers,
        getStaticEval
    ) {

        return (
            Search.LATE_MOVE_PRUNING &&
            depth === LATE_MOVE_PRUNING_DEPTH &&
            beta === alpha + 1 &&
            !isRoot &&
            !inCheck &&
            !repetitionHistory &&
            Math.abs(beta) < SearchConstants.MATE_THRESHOLD &&
            moveIndex >= LATE_MOVE_PRUNING_MIN_INDEX &&
            !move.isCapture() &&
            !move.isPromotion() &&
            move.key !== killers[0] &&
            move.key !== killers[1] &&
            this.board.pieceCount() >=
                LATE_MOVE_PRUNING_MIN_NON_KING_PIECES &&
            !this.hasPromotionReadyPawn() &&
            getStaticEval() + LATE_MOVE_PRUNING_STATIC_MARGIN <= alpha
        );

    }

    searchQuiescenceMove(
        move,
        alpha,
        beta,
        ply,
        qPly,
        inCheck
    ) {

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

            return alpha;

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

        return score;

    }

    createMovePicker(
        moves,
        killers = [-1, -1],
        ttMove = null,
        history = null,
        evasionMode = false
    ) {

        if (Search.STAGED_MOVE_ORDERING) {

            return this.moveOrdering.stagedPicker(
                moves,
                killers,
                ttMove,
                history,
                evasionMode
            );

        }

        this.moveOrdering.order(
            moves,
            killers,
            ttMove,
            history,
            evasionMode
        );

        let index = 0;

        return {
            next: () =>
                index < moves.length
                    ? moves[index++]
                    : null
        };

    }

    hasPromotionReadyPawn() {

        const pawns =
            this.board.sideToMove > 0
                ? this.board.whitePieces.pawns
                : this.board.blackPieces.pawns;
        const promotionReadyRank =
            this.board.sideToMove > 0 ? 1 : 6;

        return pawns.some(
            square => (square >> 3) === promotionReadyRank
        );

    }

    createLazyQuietMovePicker(
        captures,
        killers,
        ttMove,
        history
    ) {

        const capturePicker =
            this.createMovePicker(
                captures,
                killers,
                ttMove,
                history
            );
        let quietPicker = null;
        const picker = {
            quietGenerated: false,
            next: () => {

                const capture = capturePicker.next();

                if (capture !== null) {
                    return capture;
                }

                if (quietPicker === null) {

                    let t =
                        this.profileEnabled
                            ? performance.now()
                            : 0;
                    const quiets =
                        this.legalMoveGenerator
                            .generateMoves()
                            .filter(move => !move.isCapture());

                    if (this.profileEnabled) {
                        this.generateTime += performance.now() - t;
                    }

                    t =
                        this.profileEnabled
                            ? performance.now()
                            : 0;
                    quietPicker =
                        this.createMovePicker(
                            quiets,
                            killers,
                            null,
                            history
                        );

                    if (this.profileEnabled) {
                        this.orderTime += performance.now() - t;
                    }

                    picker.quietGenerated = true;
                    this.lazyQuietGenerationCalls++;

                }

                return quietPicker.next();

            }
        };

        return picker;

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
        this.qtt.clear();

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
        this.lmrReductions = 0;
        this.lmrResearches = 0;
        this.reverseFutilityCutoffs = 0;
        this.lazyMovePickerNodes = 0;
        this.lazyQuietGenerationCalls = 0;
        this.lazyQuietGenerationSkips = 0;
        this.qttProbes = 0;
        this.qttHits = 0;
        this.qttCutoffs = 0;
        this.qttStores = 0;
        this.lateMovePrunes = 0;

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
        // Cycle Guard
        //
        // The PV is reconstructed by walking TT entries. TT
        // entries in shuffle-prone positions can point at each
        // other in a loop (A's move leads to B, whose move leads
        // back toward A), so an unguarded walk emits the same
        // handful of moves over and over until maxDepth -- e.g.
        // the 64-ply "g5f6 h1g2 g6f4 g2h1 f4e2 h1g2 e2f4 ..."
        // line observed on the false-mate sentinel FEN. That is
        // purely a reconstruction artifact: the search itself
        // scores repetitions as draws (see the threefold
        // regression tests) and never consults buildPV for
        // decisions. Track visited position hashes and stop the
        // walk the first time a position repeats; the repeating
        // move itself is kept so the reason the line ends is
        // visible in the PV.
        //----------------------------------

        const visited = new Set();

        visited.add(this.board.hashKey);

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

            if (visited.has(this.board.hashKey)) {
                break;
            }

            visited.add(this.board.hashKey);

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

                castlingLiveReadiness:
                    after.eval.opening.castlingLiveReadiness -
                    before.eval.opening.castlingLiveReadiness,

                castlingCompleteHistory:
                    after.eval.opening.castlingCompleteHistory -
                    before.eval.opening.castlingCompleteHistory,

                castlingAbortedHistory:
                    after.eval.opening.castlingAbortedHistory -
                    before.eval.opening.castlingAbortedHistory,

                castlingHistoricalTotal:
                    after.eval.opening.castlingHistoricalTotal -
                    before.eval.opening.castlingHistoricalTotal,

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

                promotionDanger:
                    after.eval.pawns.promotionDanger -
                    before.eval.pawns.promotionDanger,

                stopperQuality:
                    after.eval.pawns.stopperQuality -
                    before.eval.pawns.stopperQuality,

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

                "Search - Static Delta": (deltaSearch / 100).toFixed(2),

                "Total Delta": delta.total,

                "Center Delta": delta.center,

                "Develop Delta": delta.development,

                "Bishop Freedom Delta": delta.bishopFreedom,

                "Early Rook Discipline Delta": delta.coordination,

                "Queen Discipline Delta": delta.queenDiscipline,

                "Castling Live Readiness Delta":
                    delta.castlingLiveReadiness,

                "Castling Complete History Delta":
                    delta.castlingCompleteHistory,

                "Castling Aborted History Delta":
                    delta.castlingAbortedHistory,

                "Castling Historical Total Delta":
                    delta.castlingHistoricalTotal,

                "Castling Urgency Delta": delta.castlingUrgency,

                "Opening Delta": delta.opening,

                "Pawn PST Delta": delta.pawnPST,

                "Knight PST Delta": delta.knightPST,

                "Bishop PST Delta": delta.bishopPST,

                "Rook PST Delta": delta.rookPST,

                "Queen PST Delta": delta.queenPST,

                "King PST Delta": delta.kingPST,

                "Rook Files Delta": delta.rookFiles,

                "King/Rook Coord Delta": delta.rookCoordination,

                "Position Delta": delta.position,

                "Pawn Shield Delta": delta.pawnShield,

                "King Safety Delta": delta.kingSafety,

                "King Total Delta": delta.king,

                "Knight Mobility Delta": delta.knightMobility,

                "Bishop Mobility Delta": delta.bishopMobility,

                "Mobility Total Delta": delta.mobility,

                "PieceSq Delta": delta.pieceSquares,

                "Connected Pawns Delta": delta.connected,

                "Passed Pawns Delta": delta.passed,

                "Promotion Danger Delta": delta.promotionDanger,

                "Stopper Quality Delta": delta.stopperQuality,

                "Isolated Pawns Delta": delta.isolated,

                "Doubled Pawns Delta": delta.doubled,

                "Pawn Total Delta": delta.pawns,

                "Hanging Pieces Delta": delta.hanging,

                "Tactics Total Delta": delta.tactics

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

    resolveLabMove(
        moveString,
        legalMoves = null
    ) {

        const parsedMove =
            parseLabMoveString(moveString);

        if (parsedMove.error) {

            return {
                move: null,
                error: parsedMove.error
            };

        }

        const moves =
            legalMoves ||
            this.legalMoveGenerator.generateMoves();

        const fromTo =
            parsedMove.from +
            parsedMove.to;

        const candidates =
            moves.filter(move =>
                algebraic(move.fromSquare) +
                algebraic(move.toSquare) === fromTo
            );

        if (parsedMove.promotion !== null) {

            const exactMove =
                candidates.find(move =>
                    moveToLabUci(move) ===
                    fromTo + parsedMove.promotion
                );

            return {
                move: exactMove || null,
                error: exactMove
                    ? null
                    : `Illegal move: ${moveString}`
            };

        }

        if (candidates.length === 1) {

            return {
                move: candidates[0],
                error: null
            };

        }

        if (candidates.some(move => move.isPromotion())) {

            return {
                move: null,
                error:
                    `Ambiguous promotion move: ${moveString}. ` +
                    "Include q, r, b, or n."
            };

        }

        return {
            move: null,
            error: `Illegal move: ${moveString}`
        };

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

        const {
            move,
            error
        } = this.resolveLabMove(moveString);

        if (!move) {

            console.error(error);

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

            castlingLiveReadiness:
                after.eval.opening.castlingLiveReadiness -
                before.eval.opening.castlingLiveReadiness,

            castlingCompleteHistory:
                after.eval.opening.castlingCompleteHistory -
                before.eval.opening.castlingCompleteHistory,

            castlingAbortedHistory:
                after.eval.opening.castlingAbortedHistory -
                before.eval.opening.castlingAbortedHistory,

            castlingHistoricalTotal:
                after.eval.opening.castlingHistoricalTotal -
                before.eval.opening.castlingHistoricalTotal,

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

            promotionDanger:
                after.eval.pawns.promotionDanger -
                before.eval.pawns.promotionDanger,

            stopperQuality:
                after.eval.pawns.stopperQuality -
                before.eval.pawns.stopperQuality,

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

        console.log("Static Delta From Current Position");
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

                {
                    label: "Castling Live Readiness",
                    value: delta.castlingLiveReadiness
                },

                {
                    label: "Castling Complete History",
                    value: delta.castlingCompleteHistory
                },

                {
                    label: "Castling Aborted History",
                    value: delta.castlingAbortedHistory
                },

                {
                    label: "Castling Historical Total",
                    value: delta.castlingHistoricalTotal
                },

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

                { label: "Promotion Danger", value: delta.promotionDanger },

                { label: "Stopper Quality", value: delta.stopperQuality },

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
