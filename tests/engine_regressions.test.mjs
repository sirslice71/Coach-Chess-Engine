import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";
import { Piece } from "../js/core/piece.js";
import { SearchConstants } from "../js/engine/searchconstants.js";

function createEngine(fen) {

    const board = new Board();
    const zobrist = new Zobrist();

    zobrist.initialize();

    board.attachZobrist(zobrist);

    FEN.import(board, fen);

    const moveGenerator =
        new MoveGenerator(board);

    const legalMoveGenerator =
        new LegalMoveGenerator(
            board,
            moveGenerator
        );

    const evaluation =
        new Evaluation(board);

    const search =
        new Search(
            board,
            legalMoveGenerator,
            evaluation
        );

    return {
        board,
        zobrist,
        evaluation,
        search,
        legalMoveGenerator
    };

}

function withMutedConsole(fn) {

    const original = {
        clear: console.clear,
        error: console.error,
        log: console.log,
        table: console.table,
        trace: console.trace,
        warn: console.warn
    };

    console.clear = () => {};
    console.error = () => {};
    console.log = () => {};
    console.table = () => {};
    console.trace = () => {};
    console.warn = () => {};

    try {

        return fn();

    }

    finally {

        console.clear = original.clear;
        console.error = original.error;
        console.log = original.log;
        console.table = original.table;
        console.trace = original.trace;
        console.warn = original.warn;

    }

}

function findMove(legalMoveGenerator, notation) {

    const move =
        legalMoveGenerator
            .generateMoves()
            .find(candidate =>
                candidate.toString() === notation
            );

    assert.ok(move, `Expected legal move ${notation}`);

    return move;

}

function snapshotBoard(board) {

    return {
        fen: FEN.export(board),
        hashKey: board.hashKey,
        whiteMaterial: board.whiteMaterial,
        blackMaterial: board.blackMaterial,
        whitePieces: structuredClone(board.whitePieces),
        blackPieces: structuredClone(board.blackPieces)
    };

}

function assertBoardSnapshot(board, expected) {

    assert.equal(FEN.export(board), expected.fen);
    assert.equal(board.hashKey, expected.hashKey);
    assert.equal(board.whiteMaterial, expected.whiteMaterial);
    assert.equal(board.blackMaterial, expected.blackMaterial);
    assert.deepEqual(board.whitePieces, expected.whitePieces);
    assert.deepEqual(board.blackPieces, expected.blackPieces);

}

function evaluatePosition(fen) {

    const { evaluation } =
        createEngine(fen);

    return evaluation.evaluate().total;

}

function searchBestMove(fen, depth) {

    const { search } =
        createEngine(fen);

    return withMutedConsole(
        () => search.bestMove(depth)
    );

}

function searchMoveScore(fen, notation, depth) {

    const {
        board,
        search,
        legalMoveGenerator
    } = createEngine(fen);

    const rootSideToMove =
        board.sideToMove;

    const move =
        findMove(
            legalMoveGenerator,
            notation
        );

    board.makeMove(move);

    const score =
        withMutedConsole(
            () => -search.negamax(
                depth - 1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                1
            )
        );

    board.undoMove();

    return search.toWhiteRelativeScore(
        score,
        rootSideToMove
    );

}

test("static evaluation stays White-relative regardless of side to move", () => {

    const whiteUpQueenWhiteToMove =
        evaluatePosition(
            "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1"
        );

    const whiteUpQueenBlackToMove =
        evaluatePosition(
            "4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1"
        );

    const blackUpQueenWhiteToMove =
        evaluatePosition(
            "4k3/4q3/8/8/8/8/8/4K3 w - - 0 1"
        );

    const blackUpQueenBlackToMove =
        evaluatePosition(
            "4k3/4q3/8/8/8/8/8/4K3 b - - 0 1"
        );

    assert.ok(
        whiteUpQueenWhiteToMove > 800,
        "White-up-queen position should evaluate positive"
    );

    assert.equal(
        whiteUpQueenWhiteToMove,
        whiteUpQueenBlackToMove
    );

    assert.ok(
        blackUpQueenWhiteToMove < -800,
        "Black-up-queen position should evaluate negative"
    );

    assert.equal(
        blackUpQueenWhiteToMove,
        blackUpQueenBlackToMove
    );

});

test("queen capture regression keeps Qg2 from scoring as a Black win", () => {

    const fen =
        "r3k2r/ppp2ppp/2n5/8/1PBpP3/P4PP1/1B5q/R2Q1KN1 b kq - 0 1";

    const {
        board,
        evaluation,
        legalMoveGenerator
    } = createEngine(fen);

    const queenCheck =
        findMove(
            legalMoveGenerator,
            "h2-g2"
        );

    board.makeMove(queenCheck);

    const queenTake =
        findMove(
            legalMoveGenerator,
            "f1-g2"
        );

    assert.equal(queenTake.capturedPiece, Piece.BQ);

    board.makeMove(queenTake);

    assert.ok(
        board.whiteMaterial - board.blackMaterial > 500,
        "White should be materially ahead after taking the queen"
    );

    assert.ok(
        evaluation.evaluate().total > 300,
        "Static evaluation should be strongly White-favorable"
    );

    board.undoMove();
    board.undoMove();

    assert.ok(
        searchMoveScore(fen, "h2-g2", 1) > 0,
        "Depth-1 search should not think Qg2 wins for Black"
    );

    assert.ok(
        searchMoveScore(fen, "h2-g2", 2) > 0,
        "Depth-2 search should not think Qg2 wins for Black"
    );

});

test("search scores threefold repetition lines as draws when history returns to the same position", () => {

    const fen =
        "8/1R2Rp1p/5Pkn/8/4N3/5K2/8/5r2 w - - 9 55";

    const {
        board,
        search,
        legalMoveGenerator
    } = createEngine(fen);

    const historyCycle = [
        "e4-f2",
        "f1-a1",
        "f2-e4",
        "a1-f1",
        "f3-e2",
        "f1-a1"
    ];

    for (const notation of historyCycle) {

        board.makeMove(
            findMove(
                legalMoveGenerator,
                notation
            )
        );

    }

    const rootSideToMove =
        board.sideToMove;

    const repeatingMove =
        findMove(
            legalMoveGenerator,
            "e2-f3"
        );

    board.makeMove(repeatingMove);

    const forcedDrawScore =
        withMutedConsole(
            () => -search.negamax(
                3,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                1
            )
        );

    const rookReturn =
        findMove(
            legalMoveGenerator,
            "a1-f1"
        );

    board.makeMove(rookReturn);

    assert.equal(
        board.isThreefoldRepetition(),
        true
    );

    board.undoMove();
    board.undoMove();

    assert.equal(
        search.toWhiteRelativeScore(
            forcedDrawScore,
            rootSideToMove
        ),
        SearchConstants.DRAW
    );

    const bestMoveResult =
        withMutedConsole(
            () => search.bestMove(4)
        );

    assert.notEqual(
        bestMoveResult.move.toString(),
        "e2-f3"
    );

});

test("bishop capture regression preserves material, hash, and piece lists through make and undo", () => {

    const fen =
        "r3k2r/ppp2ppp/2n1b3/8/1PPpP3/P4PP1/1B3K2/R2Q1BNq b kq - 1 1";

    const {
        board,
        legalMoveGenerator
    } = createEngine(fen);

    const before =
        snapshotBoard(board);

    const bishopCapture =
        findMove(
            legalMoveGenerator,
            "e6-c4"
        );

    board.makeMove(bishopCapture);

    const afterBlackMove =
        snapshotBoard(board);

    const bishopRecapture =
        findMove(
            legalMoveGenerator,
            "f1-c4"
        );

    assert.equal(bishopRecapture.capturedPiece, Piece.BB);

    board.makeMove(bishopRecapture);

    assert.equal(
        board.blackMaterial,
        afterBlackMove.blackMaterial - 310
    );

    board.undoMove();

    assertBoardSnapshot(
        board,
        afterBlackMove
    );

    board.undoMove();

    assertBoardSnapshot(
        board,
        before
    );

});

test("depth-5 regression position does not return to early Qh5", () => {

    const result =
        searchBestMove(
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
            5
        );

    assert.notEqual(result.notation, "d1-h5");

});

test("depth-5 castling regression prefers castling over the king walk", () => {

    const result =
        searchBestMove(
            "r3k2r/ppp1nppp/2n1pq2/3p4/3P1P2/2PQ1NP1/PP1N1P1P/R3K2R b KQkq - 0 1",
            5
        );

    assert.ok(
        [
            "e8-g8",
            "e8-c8"
        ].includes(result.notation),
        `Expected Black to castle, got ${result.notation}`
    );

});

test("static evaluation prefers rook recapture over exposed king recapture", () => {

    const fen =
        "rq3rk1/p1pn1Pp1/2p1p2p/3pQ3/1P1P4/2P1PP2/P6P/RN3RK1 b - - 0 1";

    const kingRecapture =
        searchMoveScore(fen, "g8-f7", 1);

    const rookRecapture =
        searchMoveScore(fen, "f8-f7", 1);

    assert.ok(
        rookRecapture < kingRecapture,
        `Expected Rxf7 to evaluate better than Kxf7, got ${rookRecapture} vs ${kingRecapture}`
    );

});

test("depth-5 Nxe5 rook regression keeps the tactical bishop move", () => {

    const result =
        searchBestMove(
            "2k2b1r/ppp2ppp/5n2/4Nb2/8/1PNrP3/PB1P1PPP/2R1K2R b K - 0 1",
            5
        );

    assert.equal(result.notation, "f8-b4");

});

//----------------------------------
// Quiescence: SEE Capture Pruning /
// In-Check Ply Cap regression tests
//----------------------------------

test("quiescence prunes a clearly losing non-promotion capture", () => {

    // White rook on d1 can only play Rxd5, but the pawn on
    // d5 is defended twice (c6 and e6 pawns). SEE(-400) is
    // well below the pruning threshold, so quiescence should
    // skip it entirely and return the stand-pat score
    // unchanged rather than searching the losing trade.

    const { search } =
        createEngine(
            "4k3/8/2p1p3/3p4/8/8/8/3RK3 w - - 0 1"
        );

    const standPat =
        search.toSideToMoveScore(
            search.whiteRelativeEval()
        );

    const result =
        withMutedConsole(
            () => search.quiescence(
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                0,
                0
            )
        );

    assert.equal(
        result,
        standPat,
        "Expected the losing rook capture to be pruned, leaving quiescence at stand-pat"
    );

});

test("quiescence still searches a clearly winning capture", () => {

    // White queen on a1 can play Qxa8, winning an undefended
    // rook for free (SEE +500). This capture must still be
    // searched normally -- SEE pruning only removes clearly
    // losing captures, never winning ones.

    const { search } =
        createEngine(
            "r5k1/8/8/8/8/8/8/Q6K w - - 0 1"
        );

    const standPat =
        search.toSideToMoveScore(
            search.whiteRelativeEval()
        );

    const result =
        withMutedConsole(
            () => search.quiescence(
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                0,
                0
            )
        );

    assert.ok(
        result > standPat,
        `Expected the winning rook capture to still be searched, got ${result} vs stand-pat ${standPat}`
    );

});

test("quiescence in-check ply cap returns a normal evaluation, not a false mate", () => {

    // White king on e1 is in check from the Black queen on e2,
    // but Kxe2 is a legal reply -- this is NOT checkmate. Forcing
    // qPly past the in-check cap must fall back to the static
    // evaluation, never a mate-magnitude score.

    const { board, search } =
        createEngine(
            "4k3/8/8/8/8/8/4q3/4K3 w - - 0 1"
        );

    assert.ok(board.isInCheck());

    const result =
        withMutedConsole(
            () => search.quiescence(
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                0,
                999
            )
        );

    assert.ok(
        Math.abs(result) < SearchConstants.MATE_THRESHOLD,
        `Expected a normal evaluation at the in-check ply cap, got ${result}`
    );

});

test("quiescence still detects real checkmate even past the in-check ply cap", () => {

    // Standard back-rank mate: Black king on g8 boxed in by its
    // own pawns, Rook on a8 delivering mate. This has zero legal
    // moves and must still be reported as mate even when qPly is
    // already past the cap -- the ply cap must never suppress a
    // genuine, verified checkmate.

    const { board, search } =
        createEngine(
            "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1"
        );

    assert.ok(board.isInCheck());

    const result =
        withMutedConsole(
            () => search.quiescence(
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                3,
                999
            )
        );

    assert.equal(
        result,
        -SearchConstants.MATE + 3,
        "Expected real checkmate to still be reported despite the in-check ply cap"
    );

});

//----------------------------------
// Late Move Reduction regression tests
//
// LMR (js/engine/search.js, LMR_* constants) must stay
// conservative: no reductions at shallow depth or at the
// root, never a reduced score used as a move's final score,
// and no board-state leakage from the extra search calls.
//----------------------------------

test("LMR-active search leaves board, hash, material, and piece lists untouched", () => {

    const { board, search } =
        createEngine(
            "r1bq1rk1/pp2bppp/2n1pn2/3p2B1/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 9"
        );

    const before = snapshotBoard(board);

    const result =
        withMutedConsole(
            () => search.bestMove(6, { quiet: true })
        );

    assert.ok(result.move, "search should produce a move");

    assert.ok(
        search.lmrReductions > 0,
        `expected LMR to fire in a depth-6 middlegame search, got ${search.lmrReductions}`
    );

    assertBoardSnapshot(board, before);

});

test("LMR never fires in a depth-5 search (shallow-depth and root gates)", () => {

    const { search } =
        createEngine(
            "r1bq1rk1/pp2bppp/2n1pn2/3p2B1/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 9"
        );

    withMutedConsole(
        () => search.bestMove(5, { quiet: true })
    );

    //----------------------------------
    // LMR_MIN_DEPTH is 5 and root moves are never reduced,
    // so a depth-5 search contains no node deep enough to
    // reduce. This is also what keeps the depth-5 Nxe5
    // tactical regression test above meaningful.
    //----------------------------------

    assert.equal(
        search.lmrReductions,
        0,
        "no reductions may fire anywhere in a depth-5 search"
    );

});

test("LMR-active depth-6 search still finds the tactical bishop move", () => {

    const { search } =
        createEngine(
            "2k2b1r/ppp2ppp/5n2/4Nb2/8/1PNrP3/PB1P1PPP/2R1K2R b K - 0 1"
        );

    const result =
        withMutedConsole(
            () => search.bestMove(6, { quiet: true })
        );

    assert.ok(
        search.lmrReductions > 0,
        "reductions should be active at depth 6"
    );

    assert.equal(result.notation, "f8-b4");

});

test("LMR-active search still finds a back-rank mate", () => {

    const { search } =
        createEngine(
            "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1"
        );

    const result =
        withMutedConsole(
            () => search.bestMove(6, { quiet: true })
        );

    assert.equal(result.notation, "e1-e8");

    assert.ok(
        search.lastSearchScore >= SearchConstants.MATE_THRESHOLD,
        `expected a mate score, got ${search.lastSearchScore}`
    );

});

test("search timeout during an LMR-active search leaves the board clean", () => {

    const { board, search } =
        createEngine(
            "r1bq1rk1/pp2bppp/2n1pn2/3p2B1/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 9"
        );

    const before = snapshotBoard(board);

    //----------------------------------
    // A deadline short enough to interrupt the search midway
    // through a deep iteration, but long enough for depth 1
    // to complete so a move is still returned.
    //----------------------------------

    const result =
        withMutedConsole(
            () => search.bestMove(
                64,
                {
                    quiet: true,
                    deadlineMs: performance.now() + 300
                }
            )
        );

    assert.ok(result.move, "timeout search should still return a move");

    assertBoardSnapshot(board, before);

});

//----------------------------------
// Lone-King Mop-Up regression tests
//
// evaluateLoneKingMopUp() (js/engine/evaluation.js,
// Eval.MOPUP_* constants) must reward confining a bare king
// and closing the king distance in KX vs K, and must be
// exactly zero the moment the weaker side has any material.
//----------------------------------

test("lone-king mop-up rewards edge confinement and king proximity in KQ vs K", () => {

    //----------------------------------
    // Same material, both White to move, bare White king.
    // Cornered king + close attacking king must evaluate
    // clearly better for Black (more negative white-relative)
    // than a centralized king with a distant attacker.
    //----------------------------------

    const cornered =
        createEngine("7q/8/8/8/8/2k5/8/1K6 w - - 0 1");

    const central =
        createEngine("q7/k7/8/8/4K3/8/8/8 w - - 0 1");

    const corneredEval =
        withMutedConsole(() => cornered.evaluation.evaluate());

    const centralEval =
        withMutedConsole(() => central.evaluation.evaluate());

    assert.ok(
        corneredEval.king.mopUp < 0,
        `mop-up should favor Black against the bare White king, got ${corneredEval.king.mopUp}`
    );

    assert.ok(
        corneredEval.king.mopUp < centralEval.king.mopUp,
        `cornered+close (${corneredEval.king.mopUp}) should out-score central+far (${centralEval.king.mopUp}) for Black`
    );

});

test("lone-king mop-up is inactive when the weaker side has any material", () => {

    //----------------------------------
    // Same shape as above but the White king now owns a pawn:
    // no side is a bare king, so the term must be exactly 0.
    //----------------------------------

    const withPawn =
        createEngine("7q/8/8/8/8/2k5/P7/1K6 w - - 0 1");

    const evalScore =
        withMutedConsole(() => withPawn.evaluation.evaluate());

    assert.equal(
        evalScore.king.mopUp,
        0,
        "mop-up must be zero when the weaker side is not a bare king"
    );

    //----------------------------------
    // K+P vs bare K (no rook or queen on the strong side)
    // must also stay 0: mating material is not guaranteed and
    // pawn-race logic owns those positions.
    //----------------------------------

    const kpk =
        createEngine("8/8/4k3/8/4P3/4K3/8/8 w - - 0 1");

    const kpkEval =
        withMutedConsole(() => kpk.evaluation.evaluate());

    assert.equal(
        kpkEval.king.mopUp,
        0,
        "mop-up must be zero in K+P vs K"
    );

});

//----------------------------------
// Repetition / PV-reconstruction regression tests
//
// The repetition table keys on the Zobrist hash (BigInt).
// These tests pin the semantics that keying depends on:
// castling rights and en passant state distinguish otherwise
// identical placements, threefold is detected, make/undo
// restores hash and table exactly, and buildPV() cannot loop
// forever through TT entry cycles.
//----------------------------------

test("threefold repetition is detected after a knight shuffle", () => {

    const { board, legalMoveGenerator } = createEngine(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    for (const notation of [
        "g1-f3", "g8-f6", "f3-g1", "f6-g8",
        "g1-f3", "g8-f6", "f3-g1", "f6-g8"
    ]) {
        board.makeMove(findMove(legalMoveGenerator, notation));
    }

    assert.equal(board.repetitionCount(), 3);
    assert.equal(board.isThreefoldRepetition(), true);

});

test("changed castling rights break repetition sameness", () => {

    const { board, legalMoveGenerator } = createEngine(
        "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"
    );

    //----------------------------------
    // Rooks shuffle out and back: the piece placement matches
    // the start again, but queenside castling rights are gone
    // on both sides, so this must NOT count as a repetition.
    //----------------------------------

    for (const notation of ["a1-b1", "a8-b8", "b1-a1", "b8-a8"]) {
        board.makeMove(findMove(legalMoveGenerator, notation));
    }

    assert.equal(board.repetitionCount(), 1);

});

test("make/undo restores hash and repetition table through EP, castling, and promotion", () => {

    const { board, search, legalMoveGenerator } = createEngine(
        "r3k2r/1P6/8/3pP3/8/8/8/R3K2R w KQkq d6 0 1"
    );

    const hashBefore = board.hashKey;
    const tableBefore = board.repetitionTable.length;

    const line = ["e5-d6", "e8-g8", "b7-b8", "a8-b8", "e1-c1"];
    let made = 0;

    for (const notation of line) {

        const move =
            legalMoveGenerator
                .generateMoves()
                .find(candidate =>
                    candidate.toString().startsWith(notation)
                );

        assert.ok(move, `expected a legal move ${notation}`);
        board.makeMove(move);
        made++;

    }

    //----------------------------------
    // Incremental hash must match a from-scratch regeneration
    // after the EP capture, castle, promotion, and capture.
    //----------------------------------

    assert.equal(board.hashKey, search.zobrist.generate(board));

    assert.equal(
        board.repetitionTable.length,
        tableBefore + made
    );

    for (let i = 0; i < made; i++) {
        board.undoMove();
    }

    assert.equal(board.hashKey, hashBefore);
    assert.equal(board.repetitionTable.length, tableBefore);

});

test("buildPV stops when TT entries form a repetition cycle", () => {

    const { board, search, legalMoveGenerator } = createEngine(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    //----------------------------------
    // Hand-plant TT entries that walk knights out and back:
    // after four plies the starting position (and hash)
    // recurs, so an unguarded TT walk would loop for the full
    // 64 plies. The guard must stop it within one lap plus the
    // repeating move.
    //----------------------------------

    const cycle = ["g1-f3", "g8-f6", "f3-g1", "f6-g8"];
    const made = [];

    for (const notation of cycle) {

        const move = findMove(legalMoveGenerator, notation);

        search.tt.store(board.hashKey, 1, 0, 0, move);
        board.makeMove(move);
        made.push(move);

    }

    for (let i = 0; i < made.length; i++) {
        board.undoMove();
    }

    const pv = search.buildPV();

    assert.ok(
        pv.length <= cycle.length + 1,
        `buildPV should stop at the repetition, got length ${pv.length}`
    );

});
