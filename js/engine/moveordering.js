//======================================
// moveordering.js
//======================================

import EngineDebug
    from "../dev/enginedebug.js";
import SEE from "./see.js";
import Attack from "./attack.js";

//----------------------------------
// Move Ordering Scores
//----------------------------------

const SCORE_PROMOTION = 10000;
const SCORE_CAPTURE   = 5000;
const SCORE_CAPTURE_WINNING = 30000;
const SCORE_CAPTURE_EQUAL   = 20000;
const SCORE_CAPTURE_LOSING  = 10000;
const SCORE_KING_EVASION    = 8500;

const SCORE_KILLER1   = 4000;
const SCORE_KILLER2   = 3900;

const SCORE_CENTER    = 1000;
const SCORE_KNIGHT    = 500;
const SCORE_BISHOP    = 250;

//----------------------------------
// Checking Move Bonus
//
// A small, cheap-to-compute bonus for moves that give check,
// so forcing moves tend to get searched a little earlier than
// otherwise-similar quiet moves. Kept well below the TT move
// (1,000,000), winning captures (SCORE_CAPTURE +
// SCORE_CAPTURE_WINNING = 35,000 floor before SEE/piece
// adjustments), and promotions (50,000) -- this only nudges
// ordering among moves that would otherwise be scored close
// together, never overrides genuinely stronger moves.
//----------------------------------

const SCORE_CHECK = 3000;

//----------------------------------
// MVV-LVA Piece Values
//----------------------------------

const MVV = {

    1: 100,   // Pawn
    2: 300,   // Knight
    3: 310,   // Bishop
    4: 500,   // Rook
    5: 900,   // Queen
    6: 20000  // King

};

export default class MoveOrdering {

    constructor(board) {

        this.board = board;
        this.moveHits = 0;

    }

    order(

        moves,

        killers = [-1, -1],

        ttMove = null,

        history = null,

        evasionMode = false

    ) {

        for (const move of moves) {

            this.scoreMove(

                move,

                killers,

                ttMove,

                history,

                evasionMode

            );

        }

        moves.sort(

            (a, b) =>

                b.score - a.score

        );

    }

    scoreMove(

        move,

        killers = [-1, -1],

        ttMove = null,

        history = null,

        evasionMode = false

    ) {

        let score = 0;

        //----------------------------------
        // TT Move
        //----------------------------------

        if (

            ttMove &&

            move.key === ttMove.key

        ) {

            move.score = 1000000;

            return move.score;

        }

        //----------------------------------
        // Captures
        //----------------------------------

        if (move.isCapture()) {

            const seeScore =
                SEE.evaluateCapture(
                    this.board,
                    move
                );

            move.seeScore = seeScore;

            score += SCORE_CAPTURE;

            if (seeScore > 0) {

                score += SCORE_CAPTURE_WINNING;

            }

            else if (seeScore === 0) {

                score += SCORE_CAPTURE_EQUAL;

            }

            else {

                score += SCORE_CAPTURE_LOSING;

            }

            score +=
                Math.max(
                    Math.min(seeScore, 999),
                    -999
                );

            score +=
                this.pieceValue(move.capturedPiece);

            score -=
                this.pieceValue(move.piece) / 10;

        }

        //----------------------------------
        // Promotions
        //----------------------------------

        if (move.isPromotion()) {

            score += 50000;

        }

        //----------------------------------
        // Killer Moves
        //----------------------------------

        if (!move.isCapture()) {

            if (
                evasionMode &&
                Math.abs(move.piece) === 6
            ) {

                score += SCORE_KING_EVASION;

            }

            if (move.key === killers[0]) {

                score += 9000;

            }

            else if (move.key === killers[1]) {

                score += 8000;

            }

        }

        //----------------------------------
        // History Heuristic
        //----------------------------------

        if (

            history &&

            !move.isCapture()

        ) {

            score +=

                history

                [

                    move.fromSquare

                ]

                [

                    move.toSquare

                ];

        }

        //----------------------------------
        // Checking Move Bonus
        //----------------------------------

        if (this.givesCheck(move)) {

            score += SCORE_CHECK;

        }

        move.score = score;

        return score;

    }

    moveKey(move) {

        return (move.fromSquare << 6) | move.toSquare;

    }

    pieceValue(piece) {

        return MVV[Math.abs(piece)] || 0;

    }

    //----------------------------------
    // Checking Move Detection
    //
    // A cheap, board-mutation-free estimate of whether `move`
    // gives check, used only to bias move ordering. It detects
    // DIRECT checks (the moving/promoted piece itself attacking
    // the enemy king from its new square) for knight, pawn,
    // bishop, rook, and queen moves. It deliberately does NOT
    // detect discovered checks -- that would require knowing
    // whether vacating the origin square unmasks an attack from
    // a different piece, which is materially more work than a
    // per-move geometry check. Since this only feeds a move-
    // ordering bonus (not search correctness), an occasional
    // missed discovered check just means that move is ordered
    // like any other quiet move -- never a correctness issue.
    //----------------------------------

    givesCheck(move) {

        const movingWhite = move.piece > 0;

        const enemyKingSquare =

            movingWhite

                ? this.board.blackKing

                : this.board.whiteKing;

        if (enemyKingSquare < 0) {

            return false;

        }

        const pieceType =
            Math.abs(move.promotedPiece || move.piece);

        if (pieceType === 2) {

            return this.isKnightHop(

                move.toSquare,

                enemyKingSquare

            );

        }

        if (pieceType === 1) {

            return this.isPawnAttack(

                move.toSquare,

                enemyKingSquare,

                movingWhite

            );

        }

        if (

            pieceType === 3 ||

            pieceType === 4 ||

            pieceType === 5

        ) {

            return this.rayConnects(

                move.toSquare,

                enemyKingSquare,

                pieceType

            );

        }

        // King moves cannot give direct check.
        return false;

    }

    isKnightHop(fromSquare, toSquare) {

        const fromRank = fromSquare >> 3;
        const fromFile = fromSquare & 7;

        const toRank = toSquare >> 3;
        const toFile = toSquare & 7;

        const rankDiff = Math.abs(fromRank - toRank);
        const fileDiff = Math.abs(fromFile - toFile);

        return (

            (rankDiff === 1 && fileDiff === 2) ||

            (rankDiff === 2 && fileDiff === 1)

        );

    }

    isPawnAttack(pawnSquare, targetSquare, pawnIsWhite) {

        const pawnFile = pawnSquare & 7;
        const targetFile = targetSquare & 7;

        if (Math.abs(pawnFile - targetFile) !== 1) {

            return false;

        }

        const pawnRank = pawnSquare >> 3;
        const targetRank = targetSquare >> 3;

        const rankStep = pawnIsWhite ? -1 : 1;

        return targetRank === pawnRank + rankStep;

    }

    rayConnects(fromSquare, kingSquare, pieceType) {

        const directions =

            pieceType === 4

                ? Attack.ROOK

                : pieceType === 3

                    ? Attack.BISHOP

                    : Attack.ROOK.concat(Attack.BISHOP);

        for (const direction of directions) {

            if (

                this.rayHitsSquare(

                    fromSquare,

                    kingSquare,

                    direction

                )

            ) {

                return true;

            }

        }

        return false;

    }

    //----------------------------------
    // Walks one ray from `fromSquare` in `direction`, stopping
    // at the edge of the board, a wraparound, or the first
    // occupied square. Returns true only if `targetSquare` is
    // reached before any of those stops -- i.e. the square the
    // piece just moved to has a clear line to the king.
    //----------------------------------

    rayHitsSquare(fromSquare, targetSquare, direction) {

        let current = fromSquare;

        while (true) {

            const previous = current;

            current += direction;

            if (current < 0 || current > 63) {

                return false;

            }

            const previousRank = previous >> 3;
            const previousFile = previous & 7;

            const currentRank = current >> 3;
            const currentFile = current & 7;

            const stepIsValid =

                (direction === -1 && currentRank === previousRank && currentFile === previousFile - 1) ||
                (direction === 1  && currentRank === previousRank && currentFile === previousFile + 1) ||
                (direction === -8 && currentFile === previousFile && currentRank === previousRank - 1) ||
                (direction === 8  && currentFile === previousFile && currentRank === previousRank + 1) ||
                (direction === -9 && currentRank === previousRank - 1 && currentFile === previousFile - 1) ||
                (direction === -7 && currentRank === previousRank - 1 && currentFile === previousFile + 1) ||
                (direction === 7  && currentRank === previousRank + 1 && currentFile === previousFile - 1) ||
                (direction === 9  && currentRank === previousRank + 1 && currentFile === previousFile + 1);

            if (!stepIsValid) {

                return false;

            }

            if (current === targetSquare) {

                return true;

            }

            if (this.board.pieceAt(current) !== 0) {

                return false;

            }

        }

    }

}
