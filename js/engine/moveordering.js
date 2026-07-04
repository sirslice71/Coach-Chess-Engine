//======================================
// moveordering.js
//======================================

import EngineDebug
    from "../dev/enginedebug.js";
import SEE from "./see.js";

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

        move.score = score;

        return score;

    }

    moveKey(move) {

        return (move.fromSquare << 6) | move.toSquare;

    }

    pieceValue(piece) {

        return MVV[Math.abs(piece)] || 0;

    }

}
