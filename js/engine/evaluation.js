//======================================
// evaluation.js
//======================================

import { Eval } from "./evalconstants.js";
import {

    PawnTable,

    KnightTable,

    BishopTable,

    RookTable,

    QueenTable,

    KingMiddleGameTable,

    KingEndGameTable,

    mirror

} 
from "./pst.js";

import { Piece } from "../core/piece.js";

export default class Evaluation {

    constructor(board) {

        this.board = board;

    }

    //==================================
    // Main Evaluation
    //==================================

    evaluate() {

        const score = {

            total: 0,

            material: {

                total: this.material()

            },

            opening: {

                centerControl: 0,

                development: 0,

                bishopFreedom: 0,

                queenDiscipline: 0,

                castlingUrgency: 0,

                tempo: 0,

                coordination: 0,

                total: 0

            },

            position: {

                pieceSquares: 0,

                activity: 0,

                space: 0,

                openFiles: 0,

                bishopPair: 0,

                rookConnection: 0,

                total: 0

            },

            king: {

                castled: 0,

                pawnShield: 0,

                safety: 0,

                total: 0

            },

            pawns: {

                passed: 0,

                isolated: 0,

                doubled: 0,

                backward: 0,

                connected: 0,

                total: 0

            },

            mobility: {

                legalMoves: 0,

                total: 0

            },

            tactics: {

                pins: 0,

                forks: 0,

                hanging: 0,

                discovered: 0,

                total: 0

            }

        };

        //----------------------------------
        // Material
        //----------------------------------

        score.material.total =
            this.material();

        //----------------------------------
        // Opening
        //----------------------------------

        score.opening.centerOccupation =
            this.evaluateCenterOccupation();

        score.opening.development =
            this.evaluateDevelopment();

        score.opening.coordination =
            this.evaluateOpeningPrinciples();

        score.opening.bishopFreedom =
            this.evaluateBishopFreedom();

        score.opening.queenDiscipline =
            this.evaluateQueenDiscipline();

        score.opening.castlingUrgency =
            this.evaluateCastlingUrgency();

        score.opening.total =

            score.opening.centerOccupation +

            score.opening.development +

            score.opening.bishopFreedom +

            score.opening.queenDiscipline +

            score.opening.castlingUrgency +

            score.opening.tempo +

            score.opening.coordination;

        //----------------------------------
        // Position
        //----------------------------------

        score.position.pieceSquares =
            this.evaluatePieceSquares();

        score.position.total =

            score.position.pieceSquares +

            score.position.activity +

            score.position.space +

            score.position.openFiles +

            score.position.bishopPair +

            score.position.rookConnection;

        //----------------------------------
        // King
        //----------------------------------

        score.king.total =

            score.king.castled +

            score.king.pawnShield +

            score.king.safety;

        //----------------------------------
        // Pawns
        //----------------------------------

        const pawnScore = this.evaluatePawnStructure();

        score.pawns = pawnScore;

        //----------------------------------
        // Mobility
        //----------------------------------

        score.mobility.total =
            score.mobility.legalMoves;

        //----------------------------------
        // Tactics
        //----------------------------------

        score.tactics.total =

            score.tactics.pins +

            score.tactics.forks +

            score.tactics.hanging +

            score.tactics.discovered;

        //----------------------------------
        // Final Score
        //----------------------------------

        score.total =

            score.material.total +

            score.opening.total +

            score.position.total +

            score.king.total +

            score.pawns.total +

            score.mobility.total +

            score.tactics.total;

        return score;

    }

    //----------------------------------
    // Eval Center Occupation
    //----------------------------------

    evaluateCenterOccupation() {

        let score = 0;

        //----------------------------------
        // White center pawns
        //----------------------------------

        if (this.board.pieceAt(35) === Piece.WP) { // d4
            score += Eval.CENTER_PAWN;
        }

        if (this.board.pieceAt(36) === Piece.WP) { // e4
            score += Eval.CENTER_PAWN;
        }

        //----------------------------------
        // Black center pawns
        //----------------------------------

        if (this.board.pieceAt(27) === Piece.BP) { // d5
            score -= Eval.CENTER_PAWN;
        }

        if (this.board.pieceAt(28) === Piece.BP) { // e5
            score -= Eval.CENTER_PAWN;
        }

        return score;

    }  

    //----------------------------------
    // Evaluate Development
    //----------------------------------

    evaluateDevelopment() {

        let score = 0;

        let whiteMinorDeveloped = 0;
        let blackMinorDeveloped = 0;

        //----------------------------------
        // White Knights
        //----------------------------------

        if (this.board.pieceAt(57) !== Piece.WN) {

            score += 10;
            whiteMinorDeveloped++;

        }

        if (this.board.pieceAt(62) !== Piece.WN) {

            score += 10;
            whiteMinorDeveloped++;

        }

        //----------------------------------
        // White Bishops
        //----------------------------------

        if (this.board.pieceAt(58) !== Piece.WB) {

            score += 10;
            whiteMinorDeveloped++;

        }

        if (this.board.pieceAt(61) !== Piece.WB) {

            score += 10;
            whiteMinorDeveloped++;

        }

        //----------------------------------
        // Black Knights
        //----------------------------------

        if (this.board.pieceAt(1) !== Piece.BN) {

            score -= 10;
            blackMinorDeveloped++;

        }

        if (this.board.pieceAt(6) !== Piece.BN) {

            score -= 10;
            blackMinorDeveloped++;

        }

        //----------------------------------
        // Black Bishops
        //----------------------------------

        if (this.board.pieceAt(2) !== Piece.BB) {

            score -= 10;
            blackMinorDeveloped++;

        }

        if (this.board.pieceAt(5) !== Piece.BB) {

            score -= 10;
            blackMinorDeveloped++;

        }

        //----------------------------------
        // Fully Developed Bonus
        //----------------------------------

        if (whiteMinorDeveloped === 4) {

            score += 20;

        }

        if (blackMinorDeveloped === 4) {

            score -= 20;

        }

        //----------------------------------
        // Connected Rooks
        //----------------------------------

        if (

            this.board.pieceAt(59) === Piece.WQ ||

            this.board.pieceAt(60) === Piece.WK

        ) {

            // Queen or king still blocking

        }
        else {

            score += 15;

        }

        if (

            this.board.pieceAt(3) === Piece.BQ ||

            this.board.pieceAt(4) === Piece.BK

        ) {

            // still blocked

        }
        else {

            score -= 15;

        }

        return score;

    }

    //==================================
    // Material
    //==================================

    material() {

        return (

            this.board.whiteMaterial -

            this.board.blackMaterial

        );

    }

    evaluatePieceSquares() {

        let score = 0;

        //----------------------------------
        // White Pawns
        //----------------------------------

        for (const square of this.board.whitePieces.pawns) {

            score += PawnTable[square];

        }

        //----------------------------------
        // Black Pawns
        //----------------------------------

        for (const square of this.board.blackPieces.pawns) {

            score -= PawnTable[mirror(square)];

        }

        //----------------------------------
        // White Knights
        //----------------------------------

        for (const square of this.board.whitePieces.knights) {

            score += KnightTable[mirror(square)];

        }

        //----------------------------------
        // Black Knights
        //----------------------------------

        for (const square of this.board.blackPieces.knights) {

            score -= KnightTable[square];

        }

        //----------------------------------
        // White Bishops
        //----------------------------------

        for (const square of this.board.whitePieces.bishops) {

            score += BishopTable[mirror(square)];

        }

        //----------------------------------
        // Black Bishops
        //----------------------------------

        for (const square of this.board.blackPieces.bishops) {

            score -= BishopTable[square];

        }

        //----------------------------------
        // White Rooks
        //----------------------------------

        for (const square of this.board.whitePieces.rooks) {

            score += RookTable[mirror(square)];

        }

        //----------------------------------
        // Black Rooks
        //----------------------------------

        for (const square of this.board.blackPieces.rooks) {

            score -= RookTable[square];

        }

        //----------------------------------
        // White Queens
        //----------------------------------

        for (const square of this.board.whitePieces.queens) {

            score += QueenTable[mirror(square)];

        }

        //----------------------------------
        // Black Queens
        //----------------------------------

        for (const square of this.board.blackPieces.queens) {

            score -= QueenTable[square];

        }

        //----------------------------------
        // King Tables
        //----------------------------------

        const phase = this.gamePhase();

        const whiteMG =
            KingMiddleGameTable[
                mirror(this.board.whiteKing)
            ];

        const blackMG =
            KingMiddleGameTable[
                this.board.blackKing
            ];

        const whiteEG =
            KingEndGameTable[
                mirror(this.board.whiteKing)
            ];

        const blackEG =
            KingEndGameTable[
                this.board.blackKing
            ];

        score += Math.round(

            (whiteMG * phase +

            whiteEG * (24 - phase))

            / 24

        );

        score -= Math.round(

            (blackMG * phase +

            blackEG * (24 - phase))

            / 24

        );

        //----------------------------------
        // Development Completion
        //----------------------------------

        const whiteDeveloped =

            this.board.pieceAt(57) !== Piece.WN &&

            this.board.pieceAt(62) !== Piece.WN &&

            this.board.pieceAt(58) !== Piece.WB &&

            this.board.pieceAt(61) !== Piece.WB;

        if (whiteDeveloped) {

            score += 20;

        }

        const blackDeveloped =

            this.board.pieceAt(1) !== Piece.BN &&

            this.board.pieceAt(6) !== Piece.BN &&

            this.board.pieceAt(2) !== Piece.BB &&

            this.board.pieceAt(5) !== Piece.BB;

        if (blackDeveloped) {

            score -= 20;

        }

        return score;

    }

    debugPieceSquares(logPawns = false) {

        const score = {

            pawn: 0,

            knight: 0,

            bishop: 0,

            rook: 0,

            queen: 0,

            king: 0,

            total: 0

        };

        //----------------------------------
        // White Pawns
        //----------------------------------

        for (const square of this.board.whitePieces.pawns) {

            const index = square;
            const value = PawnTable[index];

            if (logPawns) {
                console.log(

                    `White Pawn ${square} -> PST[${index}] = ${value}`

                );
            }

            score.pawn += value;

        }

        //----------------------------------
        // Black Pawns
        //----------------------------------

        for (const square of this.board.blackPieces.pawns) {

            const index = mirror(square);
            const value = PawnTable[index];

            if (logPawns) {
                console.log(

                    `Black Pawn ${square} -> PST[${index}] = ${value}`

                );
            }

            score.pawn -= value;

        }

        //----------------------------------
        // White Knights
        //----------------------------------

        for (const square of this.board.whitePieces.knights) {

            score.knight += KnightTable[mirror(square)];

        }

        //----------------------------------
        // Black Knights
        //----------------------------------

        for (const square of this.board.blackPieces.knights) {

            score.knight -= KnightTable[square];

        }

        //----------------------------------
        // White Bishops
        //----------------------------------

        for (const square of this.board.whitePieces.bishops) {

            score.bishop += BishopTable[mirror(square)];

        }

        //----------------------------------
        // Black Bishops
        //----------------------------------

        for (const square of this.board.blackPieces.bishops) {

            score.bishop -= BishopTable[square];

        }

        //----------------------------------
        // White Rooks
        //----------------------------------

        for (const square of this.board.whitePieces.rooks) {

            score.rook += RookTable[mirror(square)];

        }

        //----------------------------------
        // Black Rooks
        //----------------------------------

        for (const square of this.board.blackPieces.rooks) {

            score.rook -= RookTable[square];

        }

        //----------------------------------
        // White Queens
        //----------------------------------

        for (const square of this.board.whitePieces.queens) {

            score.queen += QueenTable[mirror(square)];

        }

        //----------------------------------
        // Black Queens
        //----------------------------------

        for (const square of this.board.blackPieces.queens) {

            score.queen -= QueenTable[square];

        }

        //----------------------------------
        // King Tables
        //----------------------------------

        const phase = this.gamePhase();

        const whiteMG =
            KingMiddleGameTable[
                mirror(this.board.whiteKing)
            ];

        const blackMG =
            KingMiddleGameTable[
                this.board.blackKing
            ];

        const whiteEG =
            KingEndGameTable[
                mirror(this.board.whiteKing)
            ];

        const blackEG =
            KingEndGameTable[
                this.board.blackKing
            ];

        score.king += Math.round(

            (whiteMG * phase +

            whiteEG * (24 - phase))

            / 24

        );

        score.king -= Math.round(

            (blackMG * phase +

            blackEG * (24 - phase))

            / 24

        );

        //----------------------------------
        // Development Completion
        //----------------------------------

        const whiteDeveloped =

            this.board.pieceAt(57) !== Piece.WN &&

            this.board.pieceAt(62) !== Piece.WN &&

            this.board.pieceAt(58) !== Piece.WB &&

            this.board.pieceAt(61) !== Piece.WB;

        if (whiteDeveloped) {

            score.king += 20;

        }

        const blackDeveloped =

            this.board.pieceAt(1) !== Piece.BN &&

            this.board.pieceAt(6) !== Piece.BN &&

            this.board.pieceAt(2) !== Piece.BB &&

            this.board.pieceAt(5) !== Piece.BB;

        if (blackDeveloped) {

            score.king -= 20;

        }

        score.total =

            score.pawn +

            score.knight +

            score.bishop +

            score.rook +

            score.queen +

            score.king;

        return score;

    }

    //----------------------------------
    // Evaluate Pawn Structure
    //----------------------------------

    evaluatePawnStructure() {

        const score = {

            passed: 0,

            isolated: 0,

            doubled: 0,

            backward: 0,

            connected: 0,

            total: 0

        };

        //----------------------------------
        // White
        //----------------------------------

        const whiteFiles = new Uint8Array(8);

        for (const square of this.board.whitePieces.pawns) {

            whiteFiles[square & 7]++;

        }

        //----------------------------------
        // Black
        //----------------------------------

        const blackFiles = new Uint8Array(8);

        for (const square of this.board.blackPieces.pawns) {

            blackFiles[square & 7]++;

        }

        //----------------------------------
        // White Pawns
        //----------------------------------

        for (const square of this.board.whitePieces.pawns) {

            const file = square & 7;

            //----------------------------------
            // Doubled
            //----------------------------------

            if (whiteFiles[file] > 1) {

                score.doubled += Eval.DOUBLED_PAWN;

            }

            //----------------------------------
            // Isolated
            //----------------------------------

            const left =

                file > 0

                    ? whiteFiles[file - 1]

                    : 0;

            const right =

                file < 7

                    ? whiteFiles[file + 1]

                    : 0;

            if (left === 0 && right === 0) {

                score.isolated += Eval.ISOLATED_PAWN;

            }

            //----------------------------------
            // Passed Pawn
            //----------------------------------

            let passed = true;

            for (const enemy of this.board.blackPieces.pawns) {

                const enemyFile = enemy & 7;

                if (

                    Math.abs(enemyFile - file) <= 1 &&

                    enemy < square

                ) {

                    passed = false;

                    break;

                }

            }

            if (passed) {

                score.passed += Eval.PASSED_PAWN;

            }

            //----------------------------------
            // Connected Pawn
            //----------------------------------

            const leftConnected =

                this.board.whitePieces.pawns.some(

                    pawn =>

                        (pawn & 7) === file - 1 &&

                        Math.abs((pawn >> 3) - (square >> 3)) <= 1

                );

            const rightConnected =

                this.board.whitePieces.pawns.some(

                    pawn =>

                        (pawn & 7) === file + 1 &&

                        Math.abs((pawn >> 3) - (square >> 3)) <= 1

                );

            if (leftConnected || rightConnected) {

                score.connected += Eval.CONNECTED_PAWN;

            }

        }

        //----------------------------------
        // Black Pawns
        //----------------------------------

        for (const square of this.board.blackPieces.pawns) {

            const file = square & 7;

            //----------------------------------
            // Doubled
            //----------------------------------

            if (blackFiles[file] > 1) {

                score.doubled -= Eval.DOUBLED_PAWN;

            }

            //----------------------------------
            // Isolated
            //----------------------------------

            const left =

                file > 0

                    ? blackFiles[file - 1]

                    : 0;

            const right =

                file < 7

                    ? blackFiles[file + 1]

                    : 0;

            if (left === 0 && right === 0) {

                score.isolated -= Eval.ISOLATED_PAWN;

            }

            //----------------------------------
            // Passed Pawn
            //----------------------------------

            let passed = true;

            for (const enemy of this.board.whitePieces.pawns) {

                const enemyFile = enemy & 7;

                if (

                    Math.abs(enemyFile - file) <= 1 &&

                    enemy > square

                ) {

                    passed = false;

                    break;

                }

            }

            if (passed) {

                score.passed -= Eval.PASSED_PAWN;

            }

            //----------------------------------
            // Connected Pawn
            //----------------------------------

            const leftConnected =

                this.board.blackPieces.pawns.some(

                    pawn =>

                        (pawn & 7) === file - 1 &&

                        Math.abs((pawn >> 3) - (square >> 3)) <= 1

                );

            const rightConnected =

                this.board.blackPieces.pawns.some(

                    pawn =>

                        (pawn & 7) === file + 1 &&

                        Math.abs((pawn >> 3) - (square >> 3)) <= 1

                );

            if (leftConnected || rightConnected) {

                score.connected -= Eval.CONNECTED_PAWN;

            }

        }

        score.total =

            score.passed +

            score.connected +

            score.isolated +

            score.doubled +

            score.backward;

        return score;

    }

    //----------------------------------
    // Game Phase
    //----------------------------------

    gamePhase() {

        let phase = 24;

        phase -= this.board.whitePieces.queens.length * 4;
        phase -= this.board.blackPieces.queens.length * 4;

        phase -= this.board.whitePieces.rooks.length * 2;
        phase -= this.board.blackPieces.rooks.length * 2;

        phase -= this.board.whitePieces.bishops.length;
        phase -= this.board.blackPieces.bishops.length;

        phase -= this.board.whitePieces.knights.length;
        phase -= this.board.blackPieces.knights.length;

        if (phase < 0)
            phase = 0;

        if (phase > 24)
            phase = 24;

        return 24 - phase;

    }

    debugKnightPST() {

        console.table({

            b1: KnightTable[mirror(57)],
            c3: KnightTable[mirror(42)],
            a3: KnightTable[mirror(40)],

            g1: KnightTable[mirror(62)],
            f3: KnightTable[mirror(45)],
            h3: KnightTable[mirror(47)]

        });

    }

    debugEvaluation() {

        return this.evaluate();

    }

    //----------------------------------
    // Opening Principles
    //----------------------------------

    evaluateOpeningPrinciples() {

        // Opening only.
        if (!this.isOpening()) {
            return 0;
        }

        let score = 0;

        //----------------------------------
        // White
        //----------------------------------

        // Bishops developed
        if (this.board.pieceAt(58) !== Piece.WB) {
            score += Eval.DEVELOPED_BISHOP;
        }

        if (this.board.pieceAt(61) !== Piece.WB) {
            score += Eval.DEVELOPED_BISHOP;
        }

        // Knights developed
        if (this.board.pieceAt(57) !== Piece.WN) {
            score += Eval.DEVELOPED_KNIGHT;
        }

        if (this.board.pieceAt(62) !== Piece.WN) {
            score += Eval.DEVELOPED_KNIGHT;
        }

        //----------------------------------
        // Black
        //----------------------------------

        if (this.board.pieceAt(2) !== Piece.BB) {
            score -= Eval.DEVELOPED_BISHOP;
        }

        if (this.board.pieceAt(5) !== Piece.BB) {
            score -= Eval.DEVELOPED_BISHOP;
        }

        if (this.board.pieceAt(1) !== Piece.BN) {
            score -= Eval.DEVELOPED_KNIGHT;
        }

        if (this.board.pieceAt(6) !== Piece.BN) {
            score -= Eval.DEVELOPED_KNIGHT;
        }

        //----------------------------------
        // Early rooks (only if undeveloped pieces remain)
        //----------------------------------

        const whiteStillDeveloping =
            this.board.pieceAt(58) === Piece.WB ||
            this.board.pieceAt(61) === Piece.WB ||
            this.board.pieceAt(57) === Piece.WN ||
            this.board.pieceAt(62) === Piece.WN;

        if (
            whiteStillDeveloping &&
            !this.isCastled(true)
        ) {

            if (this.board.pieceAt(56) !== Piece.WR) {
                score += Eval.EARLY_ROOK;
            }

            if (this.board.pieceAt(63) !== Piece.WR) {
                score += Eval.EARLY_ROOK;
            }
        }

        const blackStillDeveloping =
            this.board.pieceAt(2) === Piece.BB ||
            this.board.pieceAt(5) === Piece.BB ||
            this.board.pieceAt(1) === Piece.BN ||
            this.board.pieceAt(6) === Piece.BN;

        if (
            blackStillDeveloping &&
            !this.isCastled(false)
        ) {

            if (this.board.pieceAt(0) !== Piece.BR) {
                score -= Eval.EARLY_ROOK;
            }

            if (this.board.pieceAt(7) !== Piece.BR) {
                score -= Eval.EARLY_ROOK;
            }
        }

        return score;

    }

    evaluateCastlingUrgency() {

        if (!this.isOpening()) {
            return 0;
        }

        let score = 0;

        const whiteDevelopmentStarted =
            this.board.pieceAt(57) !== Piece.WN ||
            this.board.pieceAt(62) !== Piece.WN ||
            this.board.pieceAt(58) !== Piece.WB ||
            this.board.pieceAt(61) !== Piece.WB;

        if (this.isCastled(true)) {
            score += Eval.CASTLING_COMPLETE;
        }
        else if (whiteDevelopmentStarted) {

            const readiness =
                this.castlingLaneStatus(true);

            if (readiness === 2) {
                score += Eval.CASTLING_READY;
            }
            else if (readiness === 1) {
                score += Eval.CASTLING_PARTIAL;
            }

        }

        const blackDevelopmentStarted =
            this.board.pieceAt(1) !== Piece.BN ||
            this.board.pieceAt(6) !== Piece.BN ||
            this.board.pieceAt(2) !== Piece.BB ||
            this.board.pieceAt(5) !== Piece.BB;

        if (this.isCastled(false)) {
            score -= Eval.CASTLING_COMPLETE;
        }
        else if (blackDevelopmentStarted) {

            const readiness =
                this.castlingLaneStatus(false);

            if (readiness === 2) {
                score -= Eval.CASTLING_READY;
            }
            else if (readiness === 1) {
                score -= Eval.CASTLING_PARTIAL;
            }

        }

        return score;

    }

    castlingLaneStatus(white) {

        const rights = this.board.castlingRights;
        let status = 0;

        const kingSide = white
            ? rights.whiteKingSide
            : rights.blackKingSide;

        if (kingSide) {

            const first = white ? 61 : 5;
            const second = white ? 62 : 6;

            const clear =
                (this.board.pieceAt(first) === Piece.EMPTY ? 1 : 0) +
                (this.board.pieceAt(second) === Piece.EMPTY ? 1 : 0);

            if (clear === 2) {
                return 2;
            }

            if (clear > 0) {
                status = 1;
            }

        }

        const queenSide = white
            ? rights.whiteQueenSide
            : rights.blackQueenSide;

        if (queenSide) {

            const first = white ? 57 : 1;
            const second = white ? 58 : 2;
            const third = white ? 59 : 3;

            const clear =
                (this.board.pieceAt(first) === Piece.EMPTY ? 1 : 0) +
                (this.board.pieceAt(second) === Piece.EMPTY ? 1 : 0) +
                (this.board.pieceAt(third) === Piece.EMPTY ? 1 : 0);

            if (clear === 3) {
                return 2;
            }

            if (clear > 0) {
                status = 1;
            }

        }

        return status;

    }

    isCastled(white) {

        if (white) {
            return (
                this.board.whiteKing === 62 ||
                this.board.whiteKing === 58
            );
        }

        return (
            this.board.blackKing === 6 ||
            this.board.blackKing === 2
        );

    }

    evaluateQueenDiscipline() {

        let score = 0;

        const whiteDevelopmentIncomplete =
            this.board.pieceAt(57) === Piece.WN ||
            this.board.pieceAt(62) === Piece.WN ||
            this.board.pieceAt(58) === Piece.WB ||
            this.board.pieceAt(61) === Piece.WB;

        const whiteCastled =
            this.isCastled(true);

        const whiteQueenMoved =
            this.board.whitePieces.queens.length > 0 &&
            this.board.pieceAt(59) !== Piece.WQ;

        if (
            whiteQueenMoved &&
            whiteDevelopmentIncomplete &&
            !whiteCastled
        ) {
            score += Eval.QUEEN_DISCIPLINE;
        }

        const blackDevelopmentIncomplete =
            this.board.pieceAt(1) === Piece.BN ||
            this.board.pieceAt(6) === Piece.BN ||
            this.board.pieceAt(2) === Piece.BB ||
            this.board.pieceAt(5) === Piece.BB;

        const blackCastled =
            this.isCastled(false);

        const blackQueenMoved =
            this.board.blackPieces.queens.length > 0 &&
            this.board.pieceAt(3) !== Piece.BQ;

        if (
            blackQueenMoved &&
            blackDevelopmentIncomplete &&
            !blackCastled
        ) {
            score -= Eval.QUEEN_DISCIPLINE;
        }

        return score;

    }

    isOpening() {

        // Stay in the opening while at least one
        // minor piece remains on its starting square.

        return (
            this.board.pieceAt(57) === Piece.WN ||
            this.board.pieceAt(62) === Piece.WN ||
            this.board.pieceAt(58) === Piece.WB ||
            this.board.pieceAt(61) === Piece.WB ||

            this.board.pieceAt(1) === Piece.BN ||
            this.board.pieceAt(6) === Piece.BN ||
            this.board.pieceAt(2) === Piece.BB ||
            this.board.pieceAt(5) === Piece.BB
        );

    }

    evaluateCenterOccupation() {

        let score = 0;

        //----------------------------------
        // White
        //----------------------------------

        if (this.board.pieceAt(36) === Piece.WP) { // e4
            score += Eval.CENTER_PAWN;
        }

        if (this.board.pieceAt(35) === Piece.WP) { // d4
            score += Eval.CENTER_PAWN;
        }

        //----------------------------------
        // Black
        //----------------------------------

        if (this.board.pieceAt(28) === Piece.BP) { // e5
            score -= Eval.CENTER_PAWN;
        }

        if (this.board.pieceAt(27) === Piece.BP) { // d5
            score -= Eval.CENTER_PAWN;
        }

        return score;

    }

    evaluateBishopFreedom() {

        let score = 0;

        //----------------------------------
        // White
        //----------------------------------

        // c1 bishop
        if (this.board.pieceAt(50) !== Piece.WP) { // c2 pawn moved
            score += 4;
        }

        if (this.board.pieceAt(51) !== Piece.WP) { // d2 pawn moved
            score += 4;
        }

        // f1 bishop
        if (this.board.pieceAt(52) !== Piece.WP) { // e2 pawn moved
            score += 8;
        }

        if (this.board.pieceAt(53) !== Piece.WP) { // f2 pawn moved
            score += 2;
        }

        //----------------------------------
        // Black
        //----------------------------------

        // c8 bishop
        if (this.board.pieceAt(10) !== Piece.BP) { // c7
            score -= 4;
        }

        if (this.board.pieceAt(11) !== Piece.BP) { // d7
            score -= 4;
        }

        // f8 bishop
        if (this.board.pieceAt(12) !== Piece.BP) { // e7
            score -= 8;
        }

        if (this.board.pieceAt(13) !== Piece.BP) { // f7
            score -= 2;
        }

        return score;

    }

}
