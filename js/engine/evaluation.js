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
import Attack from "./attack.js";

const KNIGHT_MOBILITY_OFFSETS = [

    [-2, -1], [-2, 1],

    [-1, -2], [-1, 2],

    [1, -2], [1, 2],

    [2, -1], [2, 1]

];

const BISHOP_MOBILITY_DIRECTIONS = [

    [-1, -1], [-1, 1],

    [1, -1], [1, 1]

];

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

                centerOccupation: 0,

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

                knights: 0,

                bishops: 0,

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

        score.position.openFiles =
            this.evaluateRookFileActivity();

        score.position.rookConnection =
            this.evaluateKingRookCoordination();

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

        score.king.pawnShield =
            this.evaluatePawnShield();

        score.king.safety =
            this.evaluateKingSafety();

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

        const mobilityScore =
            this.evaluateMinorPieceMobility();

        score.mobility.knights =
            mobilityScore.knights;

        score.mobility.bishops =
            mobilityScore.bishops;

        score.mobility.total =
            mobilityScore.total;

        //----------------------------------
        // Tactics
        //----------------------------------

        score.tactics.hanging =
            this.evaluateHangingPieces();

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
    // Evaluate Hanging Pieces
    //----------------------------------

    evaluateHangingPieces() {

        let score = 0;

        score += this.evaluateHangingPieceList(
            this.board.whitePieces.knights,
            true,
            Eval.HANGING_KNIGHT
        );

        score += this.evaluateHangingPieceList(
            this.board.whitePieces.bishops,
            true,
            Eval.HANGING_BISHOP
        );

        score += this.evaluateHangingPieceList(
            this.board.whitePieces.rooks,
            true,
            Eval.HANGING_ROOK
        );

        score += this.evaluateHangingPieceList(
            this.board.whitePieces.queens,
            true,
            Eval.HANGING_QUEEN
        );

        score += this.evaluateHangingPieceList(
            this.board.blackPieces.knights,
            false,
            Eval.HANGING_KNIGHT
        );

        score += this.evaluateHangingPieceList(
            this.board.blackPieces.bishops,
            false,
            Eval.HANGING_BISHOP
        );

        score += this.evaluateHangingPieceList(
            this.board.blackPieces.rooks,
            false,
            Eval.HANGING_ROOK
        );

        score += this.evaluateHangingPieceList(
            this.board.blackPieces.queens,
            false,
            Eval.HANGING_QUEEN
        );

        return score;

    }

    evaluateHangingPieceList(squares, white, penalty) {

        let score = 0;

        for (const square of squares) {

            const attacked =
                Attack.isSquareAttacked(
                    this.board,
                    square,
                    !white
                );

            if (!attacked) {
                continue;
            }

            const defended =
                Attack.isSquareAttacked(
                    this.board,
                    square,
                    white
                );

            if (!defended) {
                score += white ? penalty : -penalty;
            }

        }

        return score;

    }

    //----------------------------------
    // Evaluate Minor-Piece Mobility
    //----------------------------------

    evaluateMinorPieceMobility() {

        let whiteKnightMobility = 0;
        let blackKnightMobility = 0;
        let whiteBishopMobility = 0;
        let blackBishopMobility = 0;

        for (const square of this.board.whitePieces.knights) {

            whiteKnightMobility +=
                this.countKnightMobility(square, true);

        }

        for (const square of this.board.blackPieces.knights) {

            blackKnightMobility +=
                this.countKnightMobility(square, false);

        }

        for (const square of this.board.whitePieces.bishops) {

            whiteBishopMobility +=
                this.countBishopMobility(square, true);

        }

        for (const square of this.board.blackPieces.bishops) {

            blackBishopMobility +=
                this.countBishopMobility(square, false);

        }

        const knights =
            (whiteKnightMobility - blackKnightMobility) *
            Eval.KNIGHT_MOBILITY;

        const bishops =
            (whiteBishopMobility - blackBishopMobility) *
            Eval.BISHOP_MOBILITY;

        return {

            knights,

            bishops,

            total: knights + bishops

        };

    }

    countKnightMobility(square, white) {

        const rank = square >> 3;
        const file = square & 7;

        let mobility = 0;

        for (const [rankOffset, fileOffset] of KNIGHT_MOBILITY_OFFSETS) {

            const targetRank = rank + rankOffset;
            const targetFile = file + fileOffset;

            if (

                targetRank < 0 ||

                targetRank > 7 ||

                targetFile < 0 ||

                targetFile > 7

            ) {

                continue;

            }

            const targetPiece =
                this.board.pieceAt(

                    targetRank * 8 + targetFile

                );

            if (

                targetPiece === Piece.EMPTY ||

                (white ? targetPiece < 0 : targetPiece > 0)

            ) {

                mobility++;

            }

        }

        return mobility;

    }

    countBishopMobility(square, white) {

        const rank = square >> 3;
        const file = square & 7;

        let mobility = 0;

        for (const [rankStep, fileStep] of BISHOP_MOBILITY_DIRECTIONS) {

            let targetRank = rank + rankStep;
            let targetFile = file + fileStep;

            while (

                targetRank >= 0 &&

                targetRank <= 7 &&

                targetFile >= 0 &&

                targetFile <= 7

            ) {

                const targetPiece =
                    this.board.pieceAt(

                        targetRank * 8 + targetFile

                    );

                if (targetPiece === Piece.EMPTY) {

                    mobility++;

                }

                else {

                    if (

                        white

                            ? targetPiece < 0

                            : targetPiece > 0

                    ) {

                        mobility++;

                    }

                    break;

                }

                targetRank += rankStep;
                targetFile += fileStep;

            }

        }

        return mobility;

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

            score += Eval.DEVELOP_MINOR;
            whiteMinorDeveloped++;

        }

        if (this.board.pieceAt(62) !== Piece.WN) {

            score += Eval.DEVELOP_MINOR;
            whiteMinorDeveloped++;

        }

        //----------------------------------
        // White Bishops
        //----------------------------------

        if (this.board.pieceAt(58) !== Piece.WB) {

            score += Eval.DEVELOP_MINOR;
            whiteMinorDeveloped++;

        }

        if (this.board.pieceAt(61) !== Piece.WB) {

            score += Eval.DEVELOP_MINOR;
            whiteMinorDeveloped++;

        }

        //----------------------------------
        // Black Knights
        //----------------------------------

        if (this.board.pieceAt(1) !== Piece.BN) {

            score -= Eval.DEVELOP_MINOR;
            blackMinorDeveloped++;

        }

        if (this.board.pieceAt(6) !== Piece.BN) {

            score -= Eval.DEVELOP_MINOR;
            blackMinorDeveloped++;

        }

        //----------------------------------
        // Black Bishops
        //----------------------------------

        if (this.board.pieceAt(2) !== Piece.BB) {

            score -= Eval.DEVELOP_MINOR;
            blackMinorDeveloped++;

        }

        if (this.board.pieceAt(5) !== Piece.BB) {

            score -= Eval.DEVELOP_MINOR;
            blackMinorDeveloped++;

        }

        //----------------------------------
        // Fully Developed Bonus
        //----------------------------------

        if (whiteMinorDeveloped === 4) {

            score += Eval.DEVELOPMENT_COMPLETE;

        }

        if (blackMinorDeveloped === 4) {

            score -= Eval.DEVELOPMENT_COMPLETE;

        }

        //----------------------------------
        // Penalize early knight development
        // before any center-pawn move
        //----------------------------------

        const whiteCenterPawnsUntouched =
            this.board.pieceAt(51) === Piece.WP &&
            this.board.pieceAt(52) === Piece.WP;

        if (
            whiteCenterPawnsUntouched &&
            !this.isCastled(true)
        ) {

            if (this.board.pieceAt(57) !== Piece.WN) {
                score -= Eval.PREMATURE_KNIGHT;
            }

            if (this.board.pieceAt(62) !== Piece.WN) {
                score -= Eval.PREMATURE_KNIGHT;
            }

        }

        const blackCenterPawnsUntouched =
            this.board.pieceAt(11) === Piece.BP &&
            this.board.pieceAt(12) === Piece.BP;

        if (
            blackCenterPawnsUntouched &&
            !this.isCastled(false)
        ) {

            if (this.board.pieceAt(1) !== Piece.BN) {
                score += Eval.PREMATURE_KNIGHT;
            }

            if (this.board.pieceAt(6) !== Piece.BN) {
                score += Eval.PREMATURE_KNIGHT;
            }

        }

        //----------------------------------
        // Connected Rooks
        //----------------------------------

        if (this.hasConnectedRooks(true)) {

            score += Eval.CONNECTED_ROOKS;

        }

        if (this.hasConnectedRooks(false)) {

            score -= Eval.CONNECTED_ROOKS;

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

    evaluateRookFileActivity() {

        const whiteFiles = new Int8Array(8);
        const blackFiles = new Int8Array(8);

        for (const square of this.board.whitePieces.pawns) {
            whiteFiles[square & 7]++;
        }

        for (const square of this.board.blackPieces.pawns) {
            blackFiles[square & 7]++;
        }

        let score = 0;

        for (const square of this.board.whitePieces.rooks) {

            const file = square & 7;

            if (whiteFiles[file] !== 0) {
                continue;
            }

            score += blackFiles[file] === 0
                ? Eval.ROOK_OPEN_FILE
                : Eval.ROOK_HALF_OPEN_FILE;

        }

        for (const square of this.board.blackPieces.rooks) {

            const file = square & 7;

            if (blackFiles[file] !== 0) {
                continue;
            }

            score -= whiteFiles[file] === 0
                ? Eval.ROOK_OPEN_FILE
                : Eval.ROOK_HALF_OPEN_FILE;

        }

        return score;

    }

    evaluateKingRookCoordination() {

        const phase = this.gamePhase();

        if (phase < 8) {
            return 0;
        }

        const whiteCoordination =
            this.evaluateKingRookCoordinationForSide(true);

        const blackCoordination =
            this.evaluateKingRookCoordinationForSide(false);

        return Math.round(
            (whiteCoordination - blackCoordination) *
            phase / 24
        );

    }

    evaluateKingRookCoordinationForSide(white) {

        if (this.isCastled(white)) {
            return 0;
        }

        const enemyHeavyPieces = white
            ? this.board.blackPieces.queens.length +
                this.board.blackPieces.rooks.length
            : this.board.whitePieces.queens.length +
                this.board.whitePieces.rooks.length;

        if (enemyHeavyPieces === 0) {
            return 0;
        }

        const kingSquare = white
            ? this.board.whiteKing
            : this.board.blackKing;

        const kingSideBlock =
            white
                ? kingSquare === 61 &&
                    this.board.pieceAt(63) === Piece.WR
                : kingSquare === 5 &&
                    this.board.pieceAt(7) === Piece.BR;

        const queenSideBlock =
            white
                ? kingSquare === 59 &&
                    this.board.pieceAt(56) === Piece.WR
                : kingSquare === 3 &&
                    this.board.pieceAt(0) === Piece.BR;

        if (!kingSideBlock && !queenSideBlock) {
            return 0;
        }

        return Eval.KING_BLOCKS_ROOK;

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
        // Passed Pawn Squares
        //
        // Computed once per side up front so the
        // per-pawn loops below can look up passed
        // status (and each other's passed pawns, for
        // the connected-passed bonus) without
        // recomputing the detection loop.
        //----------------------------------

        const phase = this.gamePhase();

        const whitePassedSquares =
            this.computePassedPawnSquares(
                this.board.whitePieces.pawns,
                this.board.blackPieces.pawns,
                true
            );

        const blackPassedSquares =
            this.computePassedPawnSquares(
                this.board.blackPieces.pawns,
                this.board.whitePieces.pawns,
                false
            );

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

            if (whitePassedSquares.has(square)) {

                score.passed += this.evaluatePassedPawnBonus(
                    square,
                    true,
                    phase,
                    whitePassedSquares
                );

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

            if (blackPassedSquares.has(square)) {

                score.passed -= this.evaluatePassedPawnBonus(
                    square,
                    false,
                    phase,
                    blackPassedSquares
                );

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
    // Passed Pawn Detection
    //
    // A pawn is passed when no enemy pawn on its own
    // file or an adjacent file stands between it and
    // its promotion square. Extracted as its own helper
    // (same logic evaluatePawnStructure() already used
    // inline) so it can be computed once per side up
    // front -- the bonus calculation below needs each
    // side's full set of passed pawns anyway, for the
    // connected-passed bonus.
    //----------------------------------

    computePassedPawnSquares(ownPawns, enemyPawns, white) {

        const passedSquares = new Set();

        for (const square of ownPawns) {

            const file = square & 7;

            let passed = true;

            for (const enemy of enemyPawns) {

                const enemyFile = enemy & 7;

                if (Math.abs(enemyFile - file) > 1) {
                    continue;
                }

                const blocksWhite = white && enemy < square;
                const blocksBlack = !white && enemy > square;

                if (blocksWhite || blocksBlack) {
                    passed = false;
                    break;
                }

            }

            if (passed) {
                passedSquares.add(square);
            }

        }

        return passedSquares;

    }

    //----------------------------------
    // Chebyshev (king-move) distance between two
    // squares. Used only by the passed-pawn king-
    // support term below.
    //----------------------------------

    squareDistance(a, b) {

        const rankA = a >> 3;
        const fileA = a & 7;

        const rankB = b >> 3;
        const fileB = b & 7;

        return Math.max(
            Math.abs(rankA - rankB),
            Math.abs(fileA - fileB)
        );

    }

    //----------------------------------
    // Passed Pawn Bonus (v1 endgame conversion helper)
    //
    // base:      rank + phase tapered bonus, using the
    //            same MG/EG blend already used for the
    //            King piece-square tables.
    // connected: extra bonus if an adjacent-file passed
    //            pawn stands within one rank.
    // protected: extra bonus if the pawn is currently
    //            defended by any friendly unit.
    // king:      extra bonus in the endgame when the
    //            advancing side's own king is close to
    //            the pawn or the square directly in
    //            front of it (only checked once the
    //            pawn is already fairly advanced).
    // blocked:   penalty if an enemy piece sits directly
    //            in front of the pawn, larger if that
    //            piece is the enemy king.
    //
    // Values are intentionally modest -- see
    // evalconstants.js. This is v1, not a full
    // endgame engine.
    //----------------------------------

    evaluatePassedPawnBonus(square, white, phase, ownPassedSquares) {

        const rankIndex = square >> 3;

        // Own-perspective advancement: 2 = starting
        // rank, 7 = one step from promotion.
        const advancement = white
            ? 8 - rankIndex
            : rankIndex + 1;

        const mgBonus =
            Eval.PASSED_PAWN_BY_RANK_MG[advancement] || 0;

        const egBonus =
            Eval.PASSED_PAWN_BY_RANK_EG[advancement] || 0;

        let bonus = Math.round(
            (mgBonus * phase + egBonus * (24 - phase)) / 24
        );

        const file = square & 7;
        const rank = square >> 3;

        const frontSquare = white
            ? square - 8
            : square + 8;

        //----------------------------------
        // Connected passed pawn
        //----------------------------------

        let hasConnectedPasser = false;

        for (const otherSquare of ownPassedSquares) {

            if (otherSquare === square) {
                continue;
            }

            const otherFile = otherSquare & 7;
            const otherRank = otherSquare >> 3;

            if (
                Math.abs(otherFile - file) === 1 &&
                Math.abs(otherRank - rank) <= 1
            ) {

                bonus += Eval.CONNECTED_PASSED_PAWN;
                hasConnectedPasser = true;
                break;

            }

        }

        //----------------------------------
        // Protected passed pawn
        //----------------------------------

        if (Attack.isSquareAttacked(this.board, square, white)) {
            bonus += Eval.PROTECTED_PASSED_PAWN;
        }

        //----------------------------------
        // King support (endgame only, and only
        // once the pawn is already fairly advanced)
        //----------------------------------

        let kingSupported = false;

        if (advancement >= 5) {

            const kingSquare = white
                ? this.board.whiteKing
                : this.board.blackKing;

            const distanceToPawn =
                this.squareDistance(kingSquare, square);

            const distanceToFront =
                (frontSquare >= 0 && frontSquare <= 63)
                    ? this.squareDistance(kingSquare, frontSquare)
                    : distanceToPawn;

            const bestDistance =
                Math.min(distanceToPawn, distanceToFront);

            if (bestDistance <= 2) {

                kingSupported = true;

                const endgameWeight = (24 - phase) / 24;

                bonus += Math.round(
                    Eval.KING_SUPPORTS_PASSED_PAWN *
                    endgameWeight
                );

            }

        }

        //----------------------------------
        // Blocker penalty
        //----------------------------------

        if (frontSquare >= 0 && frontSquare <= 63) {

            const frontPiece =
                this.board.pieceAt(frontSquare);

            if (frontPiece !== Piece.EMPTY) {

                const isEnemyPiece = white
                    ? frontPiece < 0
                    : frontPiece > 0;

                if (isEnemyPiece) {

                    const enemyKingSquare = white
                        ? this.board.blackKing
                        : this.board.whiteKing;

                    bonus += (frontSquare === enemyKingSquare)
                        ? Eval.PASSED_PAWN_BLOCKED_BY_KING
                        : Eval.PASSED_PAWN_BLOCKED;

                }

            }

        }

        //----------------------------------
        // Lone runner damping (rook-ending guard)
        //
        // A far-advanced passer with no king escort, no
        // connected passer and no pawn defence, while the enemy
        // still has a rook in a low-piece ending, is often
        // caught before promoting. Shave a little off the raw
        // advancement bonus, scaled by how far it has run and by
        // how deep into the endgame we are. See evalconstants.js.
        //----------------------------------

        if (
            advancement >= Eval.LONE_RUNNER_MIN_ADVANCEMENT &&
            phase <= Eval.LONE_RUNNER_PHASE_MAX &&
            !kingSupported &&
            !hasConnectedPasser &&
            this.enemyHasRook(white) &&
            !this.isDefendedByOwnPawn(square, white)
        ) {

            const endgameWeight = (24 - phase) / 24;

            bonus += Math.round(
                Eval.LONE_RUNNER_ENDGAME *
                (advancement - 5) *
                endgameWeight
            );

        }

        return Math.max(0, bonus);

    }

    //----------------------------------
    // Does the enemy of `white` still have a rook? Used only
    // by the lone-runner passed-pawn damping above to keep it
    // scoped to rook endings.
    //----------------------------------

    enemyHasRook(white) {

        return white
            ? this.board.blackPieces.rooks.length > 0
            : this.board.whitePieces.rooks.length > 0;

    }

    //----------------------------------
    // Is `square` defended by a friendly pawn of `white`?
    // A pawn-defended passer is genuinely strong, so the
    // lone-runner damping above excludes it. Only checks the
    // two diagonal defender squares behind the pawn.
    //----------------------------------

    isDefendedByOwnPawn(square, white) {

        const file = square & 7;

        const ownPawn = white
            ? Piece.WP
            : Piece.BP;

        if (white) {

            if (file > 0 &&
                this.board.pieceAt(square + 7) === ownPawn) {
                return true;
            }

            if (file < 7 &&
                this.board.pieceAt(square + 9) === ownPawn) {
                return true;
            }

        }
        else {

            if (file < 7 &&
                this.board.pieceAt(square - 7) === ownPawn) {
                return true;
            }

            if (file > 0 &&
                this.board.pieceAt(square - 9) === ownPawn) {
                return true;
            }

        }

        return false;

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

    evaluatePawnShield() {

        const phase = this.gamePhase();

        if (phase === 0) {
            return 0;
        }

        const whiteShield =
            this.evaluatePawnShieldForSide(true);

        const blackShield =
            this.evaluatePawnShieldForSide(false);

        return Math.round(
            (whiteShield - blackShield) *
            phase / 24
        );

    }

    evaluatePawnShieldForSide(white) {

        if (!this.isCastled(white)) {
            return 0;
        }

        const kingSquare = white
            ? this.board.whiteKing
            : this.board.blackKing;

        const pawn = white
            ? Piece.WP
            : Piece.BP;

        const homeStart = white
            ? (kingSquare === 62 ? 53 : 49)
            : (kingSquare === 6 ? 13 : 9);

        const advancedStart = white
            ? homeStart - 8
            : homeStart + 8;

        let score = 0;

        for (let offset = 0; offset < 3; offset++) {

            if (
                this.board.pieceAt(homeStart + offset) === pawn
            ) {
                continue;
            }

            if (
                this.board.pieceAt(advancedStart + offset) === pawn
            ) {
                score += Eval.KING_SHIELD_ADVANCED;
            }
            else {
                score += Eval.KING_SHIELD_MISSING;
            }

        }

        return score;

    }

    evaluateKingSafety() {

        const phase = this.gamePhase();

        if (phase < 8) {
            return 0;
        }

        const whiteSafety =
            this.evaluateKingExposureForSide(true);

        const blackSafety =
            this.evaluateKingExposureForSide(false);

        return Math.round(
            (whiteSafety - blackSafety) *
            phase / 24
        );

    }

    evaluateKingExposureForSide(white) {

        const kingSquare = white
            ? this.board.whiteKing
            : this.board.blackKing;

        const homeSquare = white
            ? 60
            : 4;

        if (
            kingSquare === homeSquare ||
            this.isCastled(white) ||
            !this.hasCastledRookStructure(white)
        ) {
            return 0;
        }

        const enemyHeavyPieces = white
            ? this.board.blackPieces.queens.length +
                this.board.blackPieces.rooks.length
            : this.board.whitePieces.queens.length +
                this.board.whitePieces.rooks.length;

        if (enemyHeavyPieces === 0) {
            return 0;
        }

        return Eval.KING_EXPOSED;

    }

    hasCastledRookStructure(white) {

        if (white) {

            const kingSideCastle =
                this.board.pieceAt(61) === Piece.WR &&
                this.board.pieceAt(63) !== Piece.WR;

            const queenSideCastle =
                this.board.pieceAt(59) === Piece.WR &&
                this.board.pieceAt(56) !== Piece.WR;

            return kingSideCastle || queenSideCastle;

        }

        const kingSideCastle =
            this.board.pieceAt(5) === Piece.BR &&
            this.board.pieceAt(7) !== Piece.BR;

        const queenSideCastle =
            this.board.pieceAt(3) === Piece.BR &&
            this.board.pieceAt(0) !== Piece.BR;

        return kingSideCastle || queenSideCastle;

    }

    evaluateCastlingUrgency() {

        if (!this.shouldEvaluateCastlingUrgency()) {
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
        else if (this.board.whiteKing !== 60) {

            score += Eval.CASTLING_ABORTED;

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
        else if (this.board.blackKing !== 4) {

            score -= Eval.CASTLING_ABORTED;

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

    shouldEvaluateCastlingUrgency() {

        if (this.isOpening()) {
            return true;
        }

        const rights = this.board.castlingRights;

        if (
            rights.whiteKingSide ||
            rights.whiteQueenSide ||
            rights.blackKingSide ||
            rights.blackQueenSide
        ) {
            return true;
        }

        const phase = this.gamePhase();

        if (phase < 8) {
            return false;
        }

        const whiteAbandoned =
            !this.isCastled(true) &&
            this.board.whiteKing !== 60;

        const blackAbandoned =
            !this.isCastled(false) &&
            this.board.blackKing !== 4;

        return whiteAbandoned || blackAbandoned;

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

    hasConnectedRooks(white) {

        const rooks = white
            ? this.board.whitePieces.rooks
            : this.board.blackPieces.rooks;

        if (rooks.length < 2) {
            return false;
        }

        for (let i = 0; i < rooks.length - 1; i++) {

            for (let j = i + 1; j < rooks.length; j++) {

                const first = rooks[i];
                const second = rooks[j];

                const sameRank =
                    (first >> 3) === (second >> 3);

                const sameFile =
                    (first & 7) === (second & 7);

                if (!sameRank && !sameFile) {
                    continue;
                }

                const step = sameRank
                    ? (first < second ? 1 : -1)
                    : (first < second ? 8 : -8);

                let clear = true;

                for (
                    let square = first + step;
                    square !== second;
                    square += step
                ) {

                    if (
                        this.board.pieceAt(square) !==
                        Piece.EMPTY
                    ) {

                        clear = false;
                        break;

                    }

                }

                if (clear) {
                    return true;
                }

            }

        }

        return false;

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
