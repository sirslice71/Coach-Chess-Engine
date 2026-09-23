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
const SCORE_EXTENDED_CENTER = 500;
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

                (b.score - a.score) ||
                this.compareMoveIdentity(a, b)

        );

    }

    stagedPicker(

        moves,

        killers = [-1, -1],

        ttMove = null,

        history = null,

        evasionMode = false

    ) {

        const ttMoves = [];
        const forcingMoves = [];
        const priorityQuiets = [];
        const quietMoves = [];

        for (const move of moves) {

            if (
                ttMove &&
                move.key === ttMove.key
            ) {

                move.score = 1000000;
                ttMoves.push(move);
                continue;

            }

            if (move.isCapture() || move.isPromotion()) {
                forcingMoves.push(move);
                continue;
            }

            if (
                move.key === killers[0] ||
                move.key === killers[1] ||
                (
                    evasionMode &&
                    Math.abs(move.piece) === 6
                )
            ) {
                priorityQuiets.push(move);
                continue;
            }

            quietMoves.push(move);

        }

        const buckets = [
            {
                moves: ttMoves,
                scored: true
            },
            {
                moves: forcingMoves,
                scored: false
            },
            {
                moves: priorityQuiets,
                scored: false
            },
            {
                moves: quietMoves,
                scored: false
            }
        ];

        let bucketIndex = 0;
        let moveIndex = 0;

        const prepareBucket = bucket => {

            if (bucket.scored) {
                return;
            }

            this.scoreAndSort(
                bucket.moves,
                killers,
                null,
                history,
                evasionMode
            );

            bucket.scored = true;

        };

        return {

            next: () => {

                while (bucketIndex < buckets.length) {

                    const bucket =
                        buckets[bucketIndex];

                    prepareBucket(bucket);

                    if (moveIndex < bucket.moves.length) {
                        return bucket.moves[moveIndex++];
                    }

                    bucketIndex++;
                    moveIndex = 0;

                }

                return null;

            }

        };

    }

    scoreAndSort(

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
                (b.score - a.score) ||
                this.compareMoveIdentity(a, b)
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
        // Quiet Pawn Centralization
        //
        // A cheap ordering nudge for quiet pawn advances that
        // land in the center or extended center. This helps
        // stabilizing central pawn moves compete with otherwise
        // similar quiet piece shuffles without adding static
        // evaluation work to move ordering.
        //----------------------------------

        if (
            !move.isCapture() &&
            !move.isPromotion() &&
            Math.abs(move.piece) === 1
        ) {

            score +=
                this.quietPawnCenterBonus(
                    move.toSquare
                );

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

        return move.key;

    }

    compareMoveIdentity(a, b) {

        const squareDiff =
            a.squareKey - b.squareKey;

        if (squareDiff !== 0) {

            return squareDiff;

        }

        return (
            this.promotionOrder(a.promotedPiece) -
            this.promotionOrder(b.promotedPiece)
        );

    }

    promotionOrder(piece) {

        switch (Math.abs(piece)) {

            case 5:
                return 0;

            case 4:
                return 1;

            case 3:
                return 2;

            case 2:
                return 3;

            default:
                return 0;

        }

    }

    pieceValue(piece) {

        return MVV[Math.abs(piece)] || 0;

    }

    quietPawnCenterBonus(toSquare) {

        const rank = toSquare >> 3;
        const file = toSquare & 7;

        const inCentralFiles =
            file >= 2 && file <= 5;

        const inCentralRanks =
            rank >= 2 && rank <= 5;

        if (!inCentralFiles || !inCentralRanks) {

            return 0;

        }

        const inCoreCenter =
            file >= 3 && file <= 4 &&
            rank >= 3 && rank <= 4;

        return inCoreCenter

            ? SCORE_CENTER

            : SCORE_EXTENDED_CENTER;

    }

    //----------------------------------
    // Checking Move Detection
    //
    // A cheap, board-mutation-free estimate of whether `move`
    // gives check, used only to bias move ordering. It detects
    // DIRECT checks (the moving/promoted piece itself attacking
    // the enemy king from its new square) for knight, pawn,
    // bishop, rook, and queen moves, plus cheap discovered
    // checks where vacating the origin square opens a friendly
    // bishop/rook/queen ray to the enemy king. Since this only
    // feeds a move-ordering bonus (not search correctness), the
    // detector stays board-mutation-free and conservative.
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

            if (this.isKnightHop(

                move.toSquare,

                enemyKingSquare

            )) {

                return true;

            }

        }

        if (pieceType === 1) {

            if (this.isPawnAttack(

                move.toSquare,

                enemyKingSquare,

                movingWhite

            )) {

                return true;

            }

        }

        if (

            pieceType === 3 ||

            pieceType === 4 ||

            pieceType === 5

        ) {

            if (this.rayConnects(

                move.toSquare,

                enemyKingSquare,

                pieceType

            )) {

                return true;

            }

        }

        if (this.givesDiscoveredCheck(move, enemyKingSquare)) {

            return true;

        }

        // King moves cannot give direct check.
        return false;

    }

    givesDiscoveredCheck(move, enemyKingSquare) {

        const direction =
            this.rayDirectionFromKing(
                enemyKingSquare,
                move.fromSquare
            );

        if (direction === 0) {

            return false;

        }

        if (
            this.squareBlocksRay(
                enemyKingSquare,
                move.toSquare,
                direction,
                move.fromSquare
            )
        ) {

            return false;

        }

        let current =
            enemyKingSquare + direction;

        while (current !== move.fromSquare) {

            if (
                current < 0 ||
                current > 63 ||
                !this.stepIsValid(
                    current - direction,
                    current,
                    direction
                ) ||
                this.board.pieceAt(current) !== 0
            ) {

                return false;

            }

            current += direction;

        }

        current += direction;

        while (
            current >= 0 &&
            current <= 63 &&
            this.stepIsValid(
                current - direction,
                current,
                direction
            )
        ) {

            const piece =
                this.board.pieceAt(current);

            if (piece === 0) {

                current += direction;
                continue;

            }

            if ((piece > 0) !== (move.piece > 0)) {

                return false;

            }

            return this.sliderAttacksAlongDirection(
                piece,
                direction
            );

        }

        return false;

    }

    rayDirectionFromKing(kingSquare, blockerSquare) {

        const kingRank = kingSquare >> 3;
        const kingFile = kingSquare & 7;
        const blockerRank = blockerSquare >> 3;
        const blockerFile = blockerSquare & 7;
        const rankDelta = blockerRank - kingRank;
        const fileDelta = blockerFile - kingFile;

        if (rankDelta === 0 && fileDelta !== 0) {
            return fileDelta > 0 ? 1 : -1;
        }

        if (fileDelta === 0 && rankDelta !== 0) {
            return rankDelta > 0 ? 8 : -8;
        }

        if (
            Math.abs(rankDelta) === Math.abs(fileDelta) &&
            rankDelta !== 0
        ) {

            if (rankDelta > 0) {
                return fileDelta > 0 ? 9 : 7;
            }

            return fileDelta > 0 ? -7 : -9;

        }

        return 0;

    }

    squareBlocksRay(kingSquare, square, direction, stopSquare) {

        let current =
            kingSquare + direction;

        while (current !== stopSquare) {

            if (
                current < 0 ||
                current > 63 ||
                !this.stepIsValid(
                    current - direction,
                    current,
                    direction
                )
            ) {

                return false;

            }

            if (current === square) {

                return true;

            }

            current += direction;

        }

        return false;

    }

    sliderAttacksAlongDirection(piece, direction) {

        const pieceType =
            Math.abs(piece);

        if (pieceType === 5) {

            return true;

        }

        const orthogonal =
            direction === -1 ||
            direction === 1 ||
            direction === -8 ||
            direction === 8;

        if (orthogonal) {

            return pieceType === 4;

        }

        return pieceType === 3;

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

        const direction =
            this.rayDirectionToKing(
                fromSquare,
                kingSquare,
                pieceType
            );

        if (direction === 0) {

            return false;

        }

        return this.rayHitsSquare(

            fromSquare,

            kingSquare,

            direction

        );

    }

    rayDirectionToKing(fromSquare, kingSquare, pieceType) {

        const fromRank = fromSquare >> 3;
        const fromFile = fromSquare & 7;

        const kingRank = kingSquare >> 3;
        const kingFile = kingSquare & 7;

        const rankDelta = kingRank - fromRank;
        const fileDelta = kingFile - fromFile;

        if (
            pieceType !== 3 &&
            rankDelta === 0 &&
            fileDelta !== 0
        ) {

            return fileDelta > 0 ? 1 : -1;

        }

        if (
            pieceType !== 3 &&
            fileDelta === 0 &&
            rankDelta !== 0
        ) {

            return rankDelta > 0 ? 8 : -8;

        }

        if (
            pieceType !== 4 &&
            Math.abs(rankDelta) === Math.abs(fileDelta) &&
            rankDelta !== 0
        ) {

            if (rankDelta > 0) {

                return fileDelta > 0 ? 9 : 7;

            }

            return fileDelta > 0 ? -7 : -9;

        }

        return 0;

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

            if (!this.stepIsValid(previous, current, direction)) {

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

    stepIsValid(previous, current, direction) {

        const previousRank = previous >> 3;
        const previousFile = previous & 7;

        const currentRank = current >> 3;
        const currentFile = current & 7;

        return (
            (direction === -1 && currentRank === previousRank && currentFile === previousFile - 1) ||
            (direction === 1  && currentRank === previousRank && currentFile === previousFile + 1) ||
            (direction === -8 && currentFile === previousFile && currentRank === previousRank - 1) ||
            (direction === 8  && currentFile === previousFile && currentRank === previousRank + 1) ||
            (direction === -9 && currentRank === previousRank - 1 && currentFile === previousFile - 1) ||
            (direction === -7 && currentRank === previousRank - 1 && currentFile === previousFile + 1) ||
            (direction === 7  && currentRank === previousRank + 1 && currentFile === previousFile - 1) ||
            (direction === 9  && currentRank === previousRank + 1 && currentFile === previousFile + 1)
        );

    }

}
