import test from "node:test";
import assert from "node:assert/strict";

import Board from "../js/core/board.js";
import FEN from "../js/core/fen.js";
import MoveGenerator from "../js/engine/movegen.js";
import LegalMoveGenerator from "../js/engine/legalmovegen.js";
import Zobrist from "../js/engine/zobrist.js";
import Evaluation from "../js/engine/evaluation.js";
import Search from "../js/engine/search.js";
import Attack from "../js/engine/attack.js";
import MoveOrdering from "../js/engine/moveordering.js";
import { MoveFlags } from "../js/core/move.js";
import TranspositionTable, {
    TTFlag,
    scoreFromTT,
    scoreToTT
} from "../js/engine/transpositiontable.js";
import { Piece } from "../js/core/piece.js";
import { SearchConstants } from "../js/engine/searchconstants.js";
import { moveToUci } from "../js/uci/uciengine.js";

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

function captureConsoleError(fn) {

    const originalError =
        console.error;

    const errors = [];

    console.error = (...args) => {
        errors.push(args.join(" "));
    };

    try {

        return {
            result: fn(),
            errors
        };

    }

    finally {

        console.error = originalError;

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

function castlingCalibrationSnapshot(fen) {

    const {
        board,
        evaluation
    } = createEngine(fen);

    const score =
        evaluation.evaluate();

    return {
        fen,
        phase: evaluation.gamePhase(),
        queens:
            board.whitePieces.queens.length +
            board.blackPieces.queens.length,
        rooks:
            board.whitePieces.rooks.length +
            board.blackPieces.rooks.length,
        rights:
            FEN.export(board).split(" ")[2],
        whiteKing: board.whiteKing,
        blackKing: board.blackKing,
        live:
            score.opening.castlingLiveReadiness,
        complete:
            score.opening.castlingCompleteHistory,
        aborted:
            score.opening.castlingAbortedHistory,
        historical:
            score.opening.castlingHistoricalTotal,
        urgency:
            score.opening.castlingUrgency
    };

}

function searchBestMove(fen, depth) {

    const { search } =
        createEngine(fen);

    return withMutedConsole(
        () => search.bestMove(depth)
    );

}

function searchBestMovesByDepth(fen, depths) {

    return depths.map(depth => {

        const result =
            searchBestMove(fen, depth);

        return {
            depth,
            notation: result.notation,
            evaluation: result.evaluation,
            nodes: result.nodes
        };

    });

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

function promotionMoves(fen, predicate = () => true) {

    const { legalMoveGenerator } =
        createEngine(fen);

    return legalMoveGenerator
        .generateMoves()
        .filter(move =>
            move.isPromotion() &&
            predicate(move)
        );

}

const PGN_COLLAPSE_REGRESSIONS = [
    {
        label: "game 4 vs Stash move 37",
        fen: "8/Qp1q2k1/2pN3p/2Pb2p1/3P3n/P7/1P4PP/4R1K1 w - - 1 37",
        target: "a7-b7",
        current: [
            {
                depth: 5,
                notation: "e1-e3",
                evaluation: "5.26"
            },
            {
                depth: 6,
                notation: "e1-e3",
                evaluation: "5.05"
            }
        ]
    },
    {
        label: "game 8 vs Shallowblue move 73",
        fen: "8/k7/7p/P2q2p1/3b1pB1/2p4P/P1P1QP2/6K1 w - - 1 73",
        target: "g4-f3",
        current: [
            {
                depth: 5,
                notation: "e2-e7",
                evaluation: "0.84"
            },
            {
                depth: 6,
                notation: "e2-e7",
                evaluation: "0.84"
            }
        ]
    },
    {
        label: "game 10 vs Stash move 24",
        fen: "2r1r1k1/1p1b1ppp/4p3/PP1p4/NRn2B2/6P1/P5KP/3R4 b - - 1 24",
        target: "e6-e5",
        current: [
            {
                depth: 5,
                notation: "c4-a3",
                evaluation: "-3.47"
            },
            {
                depth: 6,
                notation: "c4-a3",
                evaluation: "-3.47"
            }
        ]
    },
    {
        label: "game 2 vs Shallowblue move 29",
        fen: "r1r5/pp2kN1N/2b3p1/4P3/n7/1B2B3/PP4PP/2R3K1 b - - 0 29",
        target: "c8-h8",
        current: [
            {
                depth: 5,
                notation: "a4-b2",
                evaluation: "3.73"
            },
            {
                depth: 6,
                notation: "a4-b2",
                evaluation: "5.17"
            }
        ]
    },
    {
        label: "game 11 vs Casper move 9",
        fen: "rnbqkb1r/5pp1/p2ppn1p/1p6/3NP1P1/2N1BP2/PPP4P/R2QKB1R w KQkq - 0 9",
        target: "d1-d2",
        current: [
            {
                depth: 5,
                notation: "f1-d3",
                evaluation: "0.82"
            },
            {
                depth: 6,
                notation: "g4-g5",
                evaluation: "0.59"
            }
        ]
    },
    {
        label: "20260709 round 1 vs Shallowblue move 37",
        event: "20260709 Arena tournament",
        opponent: "Shallowblue_x86-64",
        coachColor: "Black",
        fen: "1bk2rr1/3n2p1/p2P1pP1/2B1pB1p/2P4P/3K1P2/1R6/R7 b - - 1 37",
        target: "e5-e4",
        coachPlayed: "c8-d8",
        originalReference: "Earlier diagnosis treated e5-e4 as the clean Stockfish target while Coach played c8-d8.",
        currentReference: "Longer Stockfish analysis still prefers e5-e4, but also treats f8-e8, c8-d8, f8-f7, and g8-h8 as serious mating or near-mating continuations.",
        theme: "advanced passer / multiple winning continuations / defensive calculation / mate-net conversion",
        whySkipped: "This is no longer a clean one-move failure sentinel. Coach's c8-d8 should not be framed as a clear collapse/blunder, so the position remains diagnostic only.",
        activatesWhen: "Do not activate as a strict single-move regression unless future analysis again isolates one clearly superior move. Keep it as a skipped advanced-passer calculation diagnostic for now.",
        current: [
            {
                depth: 5,
                notation: "a6-a5",
                evaluation: "1.90"
            },
            {
                depth: 6,
                notation: "c8-d8",
                evaluation: "2.54"
            }
        ]
    },
    {
        label: "20260709 round 2 vs Shallowblue move 54",
        event: "20260709 Arena tournament",
        opponent: "Shallowblue_x86-64",
        coachColor: "White",
        fen: "5r1k/6pp/5q2/1Rb1p3/4p3/1QP3Pb/P3RP2/6K1 w - - 3 54",
        target: "g1-h2",
        coachPlayed: "c3-c4",
        theme: "queen-rook endgame defense / mate-net avoidance",
        whySkipped: "Coach still drifts in the defensive queen-rook ending and does not yet pick the prophylactic king move consistently.",
        activatesWhen: "Activate once Coach reliably finds the defensive king retreat g1-h2 instead of the collapsing queen-side push.",
        current: [
            {
                depth: 5,
                notation: "b5-b8",
                evaluation: "-1.66"
            },
            {
                depth: 6,
                notation: "c3-c4",
                evaluation: "-2.31"
            }
        ]
    }
];

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

test("PGN collapse sentinel positions load and keep target moves legal", () => {

    for (const position of PGN_COLLAPSE_REGRESSIONS) {

        const {
            board,
            legalMoveGenerator
        } = createEngine(position.fen);

        assert.equal(
            FEN.export(board),
            position.fen,
            `${position.label} should round-trip through FEN import/export`
        );

        const legalMoves =
            legalMoveGenerator.generateMoves();

        assert.ok(
            legalMoves.some(move =>
                move.toString() === position.target
            ),
            `${position.label} should keep target move ${position.target} legal`
        );

    }

});

test("PGN collapse regression: game 8 vs Shallowblue move 73 finds g4-f3 at depth 8", () => {

    const result =
        searchBestMove(
            "8/k7/7p/P2q2p1/3b1pB1/2p4P/P1P1QP2/6K1 w - - 1 73",
            8
        );

    assert.equal(
        result.notation,
        "g4-f3"
    );

});

test("PGN collapse regression: game 4 vs Stash move 37 finds a7-b7 at depth 9", () => {

    const result =
        searchBestMove(
            "8/Qp1q2k1/2pN3p/2Pb2p1/3P3n/P7/1P4PP/4R1K1 w - - 1 37",
            9
        );

    assert.equal(
        result.notation,
        "a7-b7"
    );

});

test("PGN collapse regression: game 10 vs Stash move 24 finds e6-e5 at depth 8", () => {

    const result =
        searchBestMove(
            "2r1r1k1/1p1b1ppp/4p3/PP1p4/NRn2B2/6P1/P5KP/3R4 b - - 1 24",
            8
        );

    assert.equal(
        result.notation,
        "e6-e5"
    );

});

test("post-extension Game 6 quiet promotion-race defense finds the strongest rook family", () => {

    //----------------------------------
    // This position is objectively lost for Black. The point
    // of the regression is narrower: Stockfish's longer mate
    // line comes from the quiet defensive rook family e8-e7 /
    // e6-e7, while the flashy king move g7-g8 shortens the
    // mate. We only guard recognition of that stronger
    // defensive resource family here, not a claim that Black
    // is saving the game or that only one move is legal.
    //----------------------------------

    const result =
        searchBestMove(
            "3Qr3/1R4k1/4q1p1/P3P3/3pP3/2bp4/6PP/5RK1 b - - 8 61",
            8
        );

    assert.ok(
        [
            "e8-e7",
            "e6-e7"
        ].includes(result.notation),
        `Expected quiet defensive rook family e8-e7/e6-e7, got ${result.notation}`
    );

    assert.notEqual(
        result.notation,
        "g7-g8",
        "Depth-8 regression should no longer fall back to the shorter-mate king move"
    );

});

for (const position of PGN_COLLAPSE_REGRESSIONS) {

    test.skip(
        `diagnostic PGN collapse target: ${position.label} should eventually prefer ${position.target}`,
        () => {

            const results =
                searchBestMovesByDepth(
                    position.fen,
                    [5, 6]
                );

            assert.deepEqual(
                results,
                position.current.map(entry => ({
                    ...entry,
                    nodes: results.find(
                        result =>
                            result.depth === entry.depth
                    )?.nodes
                })),
                "Update the diagnostic snapshot if current Coach behavior changes before this target starts passing."
            );

            assert.equal(
                results.at(-1)?.notation,
                position.target
            );

        }
    );

}

test.skip(
    "castling calibration: queenless aborted-history residue",
    () => {

        //----------------------------------
        // This queenless low-material position still carries a
        // full white aborted-castling penalty even though the
        // remaining danger is far smaller than in the opening.
        // Broad removal was unsafe, so this stays as a skipped
        // calibration diagnostic rather than an active engine
        // change request.
        //----------------------------------

        const fen =
            "r3k2r/8/8/8/8/3P4/4K3/R6R w kq - 0 1";

        const first =
            castlingCalibrationSnapshot(fen);

        const second =
            castlingCalibrationSnapshot(fen);

        assert.deepEqual(second, first);

        assert.deepEqual(
            first,
            {
                fen,
                phase: 8,
                queens: 0,
                rooks: 4,
                rights: "kq",
                whiteKing: 52,
                blackKing: 4,
                live: 8,
                complete: 0,
                aborted: -60,
                historical: -60,
                urgency: -52
            }
        );

    }
);

test.skip(
    "castling calibration: combined historical residue",
    () => {

        //----------------------------------
        // This tournament position carries a full +/-78 of
        // combined castling history (completed + aborted) even
        // though no live castling opportunity remains. The
        // audit showed that broad suppression can improve the
        // score story here without isolating a safe rule, so we
        // preserve it as calibration evidence only.
        //----------------------------------

        const fen =
            "1bk2rr1/3n2p1/p2P1pP1/2B1pB1p/2P4P/3K1P2/1R6/R7 b - - 1 37";

        const first =
            castlingCalibrationSnapshot(fen);

        const second =
            castlingCalibrationSnapshot(fen);

        assert.deepEqual(second, first);

        assert.deepEqual(
            first,
            {
                fen,
                phase: 12,
                queens: 0,
                rooks: 4,
                rights: "-",
                whiteKing: 43,
                blackKing: 2,
                live: 0,
                complete: -18,
                aborted: -60,
                historical: -78,
                urgency: -78
            }
        );

    }
);

test.skip(
    "castling calibration: completed history after structure dissolves",
    () => {

        //----------------------------------
        // Black has already castled, but the castled rook is no
        // longer on its post-castling square and the entire pawn
        // shield is gone. Completed-castling credit still
        // contributes, so this remains a useful skipped residue
        // diagnostic for future state-validity work.
        //----------------------------------

        const fen =
            "r4rk1/8/8/8/8/8/8/R3K2R b KQ - 0 1";

        const first =
            castlingCalibrationSnapshot(fen);

        const second =
            castlingCalibrationSnapshot(fen);

        assert.deepEqual(second, first);

        assert.deepEqual(
            first,
            {
                fen,
                phase: 8,
                queens: 0,
                rooks: 4,
                rights: "KQ",
                whiteKing: 60,
                blackKing: 6,
                live: 8,
                complete: -18,
                aborted: 0,
                historical: -18,
                urgency: -26
            }
        );

    }
);

test.skip(
    "castling calibration control: live readiness remains relevant",
    () => {

        //----------------------------------
        // Control case: this is an honest live-castling position.
        // Rights remain, king and rook geometry are valid, and
        // the score comes entirely from live readiness with no
        // historical residue. This guards against treating every
        // castling term as stale.
        //----------------------------------

        const fen =
            "rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R b KQkq - 0 5";

        const first =
            castlingCalibrationSnapshot(fen);

        const second =
            castlingCalibrationSnapshot(fen);

        assert.deepEqual(second, first);

        assert.deepEqual(
            first,
            {
                fen,
                phase: 24,
                queens: 2,
                rooks: 4,
                rights: "KQkq",
                whiteKing: 60,
                blackKing: 4,
                live: 4,
                complete: 0,
                aborted: 0,
                historical: 0,
                urgency: 4
            }
        );

    }
);

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

test("quiescence does not prune a winning capture when the only recapturer is absolutely pinned", () => {

    const {
        board,
        search
    } = createEngine(
        "4k3/4p3/3n4/2Q5/8/8/8/4R1K1 w - - 0 1"
    );

    const before =
        snapshotBoard(board);

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
        result > standPat + 200,
        `Expected qsearch to search the winning Qxd6 capture, got ${result} vs stand-pat ${standPat}`
    );

    assertBoardSnapshot(board, before);

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
// Transposition-table mate-score normalization regression
//
// Mate scores in search.js are root-relative ("MATE - plyToMate"
// or "-MATE + plyToMate"), so a TT entry written at one ply must
// be normalized before reuse at another ply. These tests pin both
// the pure score transform and the real negamax probe path.
//----------------------------------

test("TT mate-score normalization round-trips winning and losing mates across plies", () => {

    const winningAtPly3 =
        SearchConstants.MATE - 8;

    const winningStored =
        scoreToTT(
            winningAtPly3,
            3
        );

    assert.equal(
        winningStored,
        SearchConstants.MATE - 5
    );

    assert.equal(
        scoreFromTT(winningStored, 3),
        winningAtPly3
    );

    assert.equal(
        scoreFromTT(winningStored, 1),
        SearchConstants.MATE - 6
    );

    assert.equal(
        scoreFromTT(winningStored, 5),
        SearchConstants.MATE - 10
    );

    const losingAtPly3 =
        -SearchConstants.MATE + 8;

    const losingStored =
        scoreToTT(
            losingAtPly3,
            3
        );

    assert.equal(
        losingStored,
        -SearchConstants.MATE + 5
    );

    assert.equal(
        scoreFromTT(losingStored, 3),
        losingAtPly3
    );

    assert.equal(
        scoreFromTT(losingStored, 1),
        -SearchConstants.MATE + 6
    );

    assert.equal(
        scoreFromTT(losingStored, 5),
        -SearchConstants.MATE + 10
    );

});

test("TT mate-score normalization leaves ordinary evaluations unchanged", () => {

    for (const score of [
        -SearchConstants.MATE_THRESHOLD + 1,
        -1200,
        0,
        1200,
        SearchConstants.MATE_THRESHOLD - 1
    ]) {

        assert.equal(
            scoreToTT(score, 7),
            score
        );

        assert.equal(
            scoreFromTT(score, 7),
            score
        );

    }

});

test("TT replacement keeps normalized mate scores valid", () => {

    const tt =
        new TranspositionTable(1);

    const hash = 1n;

    tt.store(
        hash,
        4,
        scoreToTT(
            SearchConstants.MATE - 8,
            3
        ),
        TTFlag.EXACT,
        null
    );

    tt.store(
        hash,
        6,
        scoreToTT(
            SearchConstants.MATE - 10,
            5
        ),
        TTFlag.EXACT,
        null
    );

    const entry =
        tt.probe(hash);

    assert.ok(entry, "expected TT entry after replacement");

    assert.equal(entry.depth, 6);

    assert.equal(
        scoreFromTT(entry.score, 5),
        SearchConstants.MATE - 10
    );

});

test("TT exact mate hits are normalized back to the current ply", () => {

    const fen =
        "7k/8/6K1/8/8/8/8/R7 w - - 0 1";

    const seeded =
        createEngine(fen);

    const seededScore =
        withMutedConsole(
            () => seeded.search.negamax(
                1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                1
            )
        );

    const fresh =
        createEngine(fen);

    const freshPly3 =
        withMutedConsole(
            () => fresh.search.negamax(
                1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                3
            )
        );

    const reused =
        createEngine(fen);

    reused.search.tt = seeded.search.tt;

    const reusedPly3 =
        withMutedConsole(
            () => reused.search.negamax(
                1,
                -SearchConstants.INFINITY,
                SearchConstants.INFINITY,
                3
            )
        );

    assert.equal(
        reusedPly3,
        freshPly3,
        "TT exact hit should return the node-relative mate score for the current ply"
    );

    assert.notEqual(
        reusedPly3,
        seededScore,
        "the same position searched at a deeper ply must not keep the older root-relative mate distance"
    );

});

test("TT mate bounds use normalized scores for alpha/beta decisions", () => {

    const winningFen =
        "7k/8/6K1/8/8/8/8/R7 w - - 0 1";

    const winningSeed =
        createEngine(winningFen);

    withMutedConsole(
        () => winningSeed.search.negamax(
            1,
            -SearchConstants.INFINITY,
            SearchConstants.INFINITY,
            1
        )
    );

    const winningEntry =
        winningSeed.search.tt.probe(
            winningSeed.board.hashKey
        );

    assert.ok(winningEntry, "expected seeded winning TT entry");

    const winningLower =
        createEngine(winningFen);

    winningLower.search.tt.store(
        winningLower.board.hashKey,
        1,
        winningEntry.score,
        TTFlag.LOWER,
        winningEntry.move
    );

    const winningResult =
        withMutedConsole(
            () => winningLower.search.negamax(
                1,
                SearchConstants.MATE - 4,
                SearchConstants.MATE - 3,
                3
            )
        );

    assert.equal(
        winningResult,
        SearchConstants.MATE - 4,
        "winning LOWER-bound hit should not trigger a false cutoff from an over-large stale mate score"
    );

    const losingFen =
        "7k/8/6K1/8/8/8/8/R7 b - - 0 1";

    const losingSeed =
        createEngine(losingFen);

    withMutedConsole(
        () => losingSeed.search.negamax(
            2,
            -SearchConstants.INFINITY,
            SearchConstants.INFINITY,
            1
        )
    );

    const losingEntry =
        losingSeed.search.tt.probe(
            losingSeed.board.hashKey
        );

    assert.ok(losingEntry, "expected seeded losing TT entry");

    const losingUpper =
        createEngine(losingFen);

    losingUpper.search.tt.store(
        losingUpper.board.hashKey,
        2,
        losingEntry.score,
        TTFlag.UPPER,
        losingEntry.move
    );

    const losingResult =
        withMutedConsole(
            () => losingUpper.search.negamax(
                2,
                -SearchConstants.MATE + 4,
                -SearchConstants.MATE + 5,
                3
            )
        );

    assert.equal(
        losingResult,
        -SearchConstants.MATE + 5,
        "losing UPPER-bound hit should not trigger a false cutoff from an over-large stale mate score"
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

test("occupied en-passant target is treated as a normal capture and undo restores it", () => {

    const fen =
        "4k3/8/2n1n3/3Pp3/2P1P3/3N1N2/8/4K3 w - e6 0 1";

    const { board, search, legalMoveGenerator } =
        createEngine(fen);

    const before = snapshotBoard(board);
    const hashBefore = board.hashKey;

    const move =
        findMove(legalMoveGenerator, "d5-e6");

    assert.equal(
        (move.flags & MoveFlags.EN_PASSANT) !== 0,
        false
    );

    assert.equal(move.capturedPiece, Piece.BN);

    board.makeMove(move);
    board.undoMove();

    assert.deepEqual(snapshotBoard(board), before);
    assert.equal(FEN.export(board), fen);
    assert.equal(board.hashKey, hashBefore);
    assert.equal(board.hashKey, search.zobrist.generate(board));

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

//----------------------------------
// Attack-detection regression tests
//
// Pinned after the isSquareAttacked de-duplication (the
// redundant queen() re-scan removal) and static attacker
// tables in js/engine/attack.js. Squares: 0 = a8 ... 63 = h1.
//----------------------------------

test("isSquareAttacked sees every attacker type", () => {

    const { board } = createEngine(
        "8/8/3k4/8/8/1P6/2N5/K2R2B1 w - - 0 1"
    );

    // pawn b3 attacks c4 (34) and a4 (32)
    assert.equal(Attack.isSquareAttacked(board, 34, true), true);
    assert.equal(Attack.isSquareAttacked(board, 32, true), true);

    // knight c2 attacks b4 (33)
    assert.equal(Attack.isSquareAttacked(board, 33, true), true);

    // rook d1 attacks d6 (19) up the open file
    assert.equal(Attack.isSquareAttacked(board, 19, true), true);

    // bishop g1 attacks c5 (26) along the long diagonal
    assert.equal(Attack.isSquareAttacked(board, 26, true), true);

    // king a1 attacks b2 (49)
    assert.equal(Attack.isSquareAttacked(board, 49, true), true);

    // h8 (7) is attacked by nothing white
    assert.equal(Attack.isSquareAttacked(board, 7, true), false);

    const queens = createEngine("8/8/8/8/8/8/8/Q6K w - - 0 1");

    // queen a1 attacks a8 (0) on the file and h8 (7) on the diagonal
    assert.equal(Attack.isSquareAttacked(queens.board, 0, true), true);
    assert.equal(Attack.isSquareAttacked(queens.board, 7, true), true);

});

test("pinned bishop has no legal moves", () => {

    const { legalMoveGenerator } = createEngine(
        "4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1"
    );

    const fromE2 =
        legalMoveGenerator
            .generateMoves()
            .filter(move => move.toString().startsWith("e2-"));

    assert.equal(
        fromE2.length,
        0,
        "the e2 bishop is pinned on the e-file and may not move"
    );

});

test("en passant that exposes the king along the rank is illegal", () => {

    const { legalMoveGenerator } = createEngine(
        "8/8/8/K1pP3q/8/8/8/6k1 w - c6 0 1"
    );

    //----------------------------------
    // dxc6 en passant removes BOTH the c5 pawn and the d5
    // pawn from the 5th rank, exposing Ka5 to the h5 queen,
    // so it must not be generated as legal.
    //----------------------------------

    const notations =
        legalMoveGenerator
            .generateMoves()
            .map(move => move.toString());

    assert.ok(
        !notations.some(n => n.startsWith("d5-c6")),
        `en passant d5xc6 must be illegal, got: ${notations.join(", ")}`
    );

});

test("castling through an attacked square and stepping into check are illegal", () => {

    const { legalMoveGenerator } = createEngine(
        "4k3/8/8/8/8/8/5r2/4K2R w K - 0 1"
    );

    const notations =
        legalMoveGenerator
            .generateMoves()
            .map(move => move.toString());

    assert.ok(
        !notations.includes("e1-g1"),
        "O-O through the attacked f1 square must be illegal"
    );

    assert.ok(
        !notations.some(n => n.startsWith("e1-f1")),
        "the king may not step onto the attacked f1 square"
    );

    assert.ok(
        notations.some(n => n.startsWith("e1-d1")),
        "the quiet escape e1-d1 should remain legal"
    );

});

test("double check permits only king moves", () => {

    const { board, legalMoveGenerator } = createEngine(
        "4k3/8/8/8/7b/3n4/8/4K3 w - - 0 1"
    );

    const moves = legalMoveGenerator.generateMoves();

    assert.ok(moves.length > 0, "double check is not mate here");

    for (const move of moves) {

        assert.equal(
            move.fromSquare,
            board.whiteKing,
            `only king moves escape double check, got ${move.toString()}`
        );

    }

});

//----------------------------------
// Underpromotion generation regression tests
//
// js/engine/movegen.js must generate ALL FOUR promotion
// choices (Q, R, B, N) for every promoting pawn move -- push
// and capture, both colors. An earlier revision generated
// only queen promotions (caught by the perft harness:
// Kiwipete depth 4 was short of the published total).
//----------------------------------

function promotionPieces(moves, fromSquare, toSquare) {

    return moves
        .filter(move =>
            move.fromSquare === fromSquare &&
            move.toSquare === toSquare &&
            move.isPromotion()
        )
        .map(move => move.promotedPiece)
        .sort((a, b) => a - b);

}

test("quiet promotion generates exactly four promotion choices", () => {

    const { legalMoveGenerator } = createEngine(
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1"
    );

    // a7 = square 8, a8 = square 0
    const pieces = promotionPieces(
        legalMoveGenerator.generateMoves(), 8, 0
    );

    assert.deepEqual(
        pieces,
        [Piece.WN, Piece.WB, Piece.WR, Piece.WQ].sort((a, b) => a - b),
        `expected N/B/R/Q promotions, got piece codes ${pieces}`
    );

});

test("capture promotion generates exactly four promotion choices", () => {

    const { legalMoveGenerator } = createEngine(
        "1nr3k1/2P5/8/8/8/8/8/4K3 w - - 0 1"
    );

    const moves = legalMoveGenerator.generateMoves();

    // c7 = square 10; captures on b8 = square 1 (c8 is blocked)
    const captures = promotionPieces(moves, 10, 1);

    assert.deepEqual(
        captures,
        [Piece.WN, Piece.WB, Piece.WR, Piece.WQ].sort((a, b) => a - b)
    );

    assert.ok(
        captures.length === 4 &&
        moves
            .filter(m => m.fromSquare === 10 && m.toSquare === 1)
            .every(m => m.isCapture() && m.isPromotion()),
        "all four b8 promotions must be capture-promotions"
    );

    // quiet push c7-c8 is blocked by the rook: no promotions there
    assert.equal(promotionPieces(moves, 10, 2).length, 0);

});

test("black promotion generates exactly four promotion choices", () => {

    const { legalMoveGenerator } = createEngine(
        "4k3/8/8/8/8/8/p7/4K3 b - - 0 1"
    );

    // a2 = square 48, a1 = square 56
    const pieces = promotionPieces(
        legalMoveGenerator.generateMoves(), 48, 56
    );

    assert.deepEqual(
        pieces,
        [Piece.BQ, Piece.BR, Piece.BB, Piece.BN].sort((a, b) => a - b)
    );

});

test("Coach Lab exposes pawn promotion terms without mutating board state", () => {

    const fen =
        "r1r5/pp2kN1N/2b3p1/4P3/n7/1B2B3/PP4PP/2R3K1 b - - 0 29";

    const {
        board,
        search
    } = createEngine(fen);

    const before =
        snapshotBoard(board);

    const quick =
        withMutedConsole(() =>
            search.compareRootMoves(1)
        );

    const detailed =
        withMutedConsole(() =>
            search.lab("a4-b2", 1)
        );

    assertBoardSnapshot(board, before);

    const quickRow =
        quick.find(row => row.Move === "a4-b2");

    assert.ok(quickRow, "quick lab should include a4-b2");

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            quickRow,
            "Promotion Danger Delta"
        ),
        "quick lab should report the promotion danger delta"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            quickRow,
            "Stopper Quality Delta"
        ),
        "quick lab should report the stopper quality delta"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            detailed.before.eval.pawns,
            "promotionDanger"
        ),
        "detailed lab should expose before.eval.pawns.promotionDanger"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            detailed.before.eval.pawns,
            "stopperQuality"
        ),
        "detailed lab should expose before.eval.pawns.stopperQuality"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            detailed.after.eval.pawns,
            "promotionDanger"
        ),
        "detailed lab should expose after.eval.pawns.promotionDanger"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            detailed.after.eval.pawns,
            "stopperQuality"
        ),
        "detailed lab should expose after.eval.pawns.stopperQuality"
    );

    assert.equal(
        typeof detailed.delta.promotionDanger,
        "number",
        "detailed lab should compute a numeric promotion danger delta"
    );

    assert.equal(
        typeof detailed.delta.stopperQuality,
        "number",
        "detailed lab should compute a numeric stopper quality delta"
    );

});

test("Coach Lab resolves exact promotion moves without ambiguity", () => {

    const fen =
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1";

    const { search } =
        createEngine(fen);

    for (const notation of [
        "a7a8q",
        "a7a8r",
        "a7a8b",
        "a7a8n"
    ]) {

        const resolved =
            search.resolveLabMove(notation);

        assert.equal(resolved.error, null);
        assert.ok(resolved.move, `expected ${notation} to resolve`);
        assert.equal(moveToUci(resolved.move), notation);

    }

    const dashedQueen =
        search.resolveLabMove("a7-a8=Q");

    assert.equal(dashedQueen.error, null);
    assert.ok(dashedQueen.move);
    assert.equal(moveToUci(dashedQueen.move), "a7a8q");

    const start =
        createEngine(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        );

    const legacyMove =
        start.search.resolveLabMove("e2-e4");

    assert.equal(legacyMove.error, null);
    assert.ok(legacyMove.move);
    assert.equal(moveToUci(legacyMove.move), "e2e4");

    const uciMove =
        start.search.resolveLabMove("g1f3");

    assert.equal(uciMove.error, null);
    assert.ok(uciMove.move);
    assert.equal(moveToUci(uciMove.move), "g1f3");

});

test("Coach Lab rejects ambiguous or malformed promotion requests clearly", () => {

    const fen =
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1";

    const { search } =
        createEngine(fen);

    const ambiguousDashed =
        search.resolveLabMove("a7-a8");

    assert.equal(ambiguousDashed.move, null);
    assert.match(
        ambiguousDashed.error,
        /Ambiguous promotion move/
    );

    const ambiguousUci =
        search.resolveLabMove("a7a8");

    assert.equal(ambiguousUci.move, null);
    assert.match(
        ambiguousUci.error,
        /Ambiguous promotion move/
    );

    const invalidSuffix =
        search.resolveLabMove("a7a8x");

    assert.equal(invalidSuffix.move, null);
    assert.match(
        invalidSuffix.error,
        /Invalid promotion suffix "x"/
    );

    const fresh =
        createEngine(fen);

    const before =
        snapshotBoard(fresh.board);

    const labResult =
        captureConsoleError(() =>
            fresh.search.lab("a7a8", 1)
        );

    assert.equal(labResult.result, null);
    assert.match(
        labResult.errors[0],
        /Ambiguous promotion move: a7a8/
    );

    assertBoardSnapshot(
        fresh.board,
        before
    );

});

test("promotion siblings have unique move keys while non-promotions keep the historical key", () => {

    const quietWhite =
        promotionMoves(
            "6k1/P7/8/8/8/8/8/4K3 w - - 0 1"
        );

    const captureWhite =
        promotionMoves(
            "1nr3k1/2P5/8/8/8/8/8/4K3 w - - 0 1",
            move => move.isCapture()
        );

    const quietBlack =
        promotionMoves(
            "4k3/8/8/8/8/8/p7/4K3 b - - 0 1"
        );

    const captureBlack =
        promotionMoves(
            "4k3/8/8/8/8/8/1p6/R3K3 b - - 0 1",
            move => move.isCapture()
        );

    for (const family of [
        quietWhite,
        captureWhite,
        quietBlack,
        captureBlack
    ]) {

        assert.equal(family.length, 4);

        assert.equal(
            new Set(family.map(move => move.key)).size,
            4,
            "promotion siblings should no longer collide in move.key"
        );

        assert.equal(
            new Set(family.map(move => move.squareKey)).size,
            1,
            "promotion siblings should still share the same from/to squareKey"
        );

    }

    const {
        legalMoveGenerator
    } = createEngine(
        "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
    );

    const quietKingMove =
        legalMoveGenerator
            .generateMoves()
            .find(move => move.toString() === "e1-e2");

    assert.ok(quietKingMove);

    assert.equal(
        quietKingMove.key,
        quietKingMove.squareKey,
        "non-promotion move keys should stay unchanged"
    );

});

test("TT move ordering matches the exact quiet and capture promotion piece", () => {

    for (const {
        fen,
        predicate
    } of [
        {
            fen: "6k1/P7/8/8/8/8/8/4K3 w - - 0 1",
            predicate: () => true
        },
        {
            fen: "1nr3k1/2P5/8/8/8/8/8/4K3 w - - 0 1",
            predicate: move => move.isCapture()
        }
    ]) {

        const {
            board,
            legalMoveGenerator,
            search
        } = createEngine(fen);

        const moveOrdering =
            new MoveOrdering(board);

        const promotions =
            promotionMoves(fen, predicate);

        for (const ttMove of promotions) {

            const moves =
                legalMoveGenerator.generateMoves();

            moveOrdering.order(
                moves,
                [-1, -1],
                ttMove,
                search.history
            );

            const orderedPromotions =
                moves.filter(move =>
                    move.isPromotion() &&
                    predicate(move)
                );

            assert.equal(
                moveToUci(orderedPromotions[0]),
                moveToUci(ttMove)
            );

            assert.equal(
                orderedPromotions.filter(
                    move => move.score === 1000000
                ).length,
                1,
                "exact TT promotion match should bonus only one sibling"
            );

        }

    }

});

test("killer matching does not leak across sibling promotions", () => {

    const fen =
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1";

    const {
        board,
        legalMoveGenerator
    } = createEngine(fen);

    const moveOrdering =
        new MoveOrdering(board);

    const promotions =
        promotionMoves(fen);

    const knightPromotion =
        promotions.find(move =>
            moveToUci(move) === "a7a8n"
        );

    assert.ok(knightPromotion);

    const moves =
        legalMoveGenerator.generateMoves();

    moveOrdering.order(
        moves,
        [knightPromotion.key, -1],
        null,
        null
    );

    const orderedPromotions =
        moves.filter(move => move.isPromotion());

    assert.equal(
        moveToUci(orderedPromotions[0]),
        "a7a8n"
    );

    assert.equal(
        orderedPromotions.filter(
            move => move.score >= 59000
        ).length,
        1,
        "only the exact killer promotion should receive the killer bonus"
    );

});

test("PV reconstruction preserves the exact underpromotion suffix from TT", () => {

    const fen =
        "6k1/P7/8/8/8/8/8/4K3 w - - 0 1";

    const { board, search } =
        createEngine(fen);

    const knightPromotion =
        promotionMoves(fen)
            .find(move =>
                moveToUci(move) === "a7a8n"
            );

    assert.ok(knightPromotion);

    search.tt.store(
        board.hashKey,
        1,
        0,
        TTFlag.EXACT,
        knightPromotion
    );

    const pv =
        search.buildPV(1);

    assert.equal(pv.length, 1);

    assert.equal(
        moveToUci(pv[0]),
        "a7a8n"
    );

});
