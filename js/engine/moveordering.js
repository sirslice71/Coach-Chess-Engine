//======================================
// moveordering.js
//======================================

import EngineDebug
    from "../dev/enginedebug.js";

//----------------------------------
// Move Ordering Scores
//----------------------------------

const SCORE_PROMOTION = 10000;
const SCORE_CAPTURE   = 5000;

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

        history = null

    ) {

        for (const move of moves) {

            this.scoreMove(

                move,

                killers,

                ttMove,

                history

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

        history = null

    ) {

        let score = 0;

        //----------------------------------
        // TT Move
        //----------------------------------

        if (

            ttMove &&

            move.key === ttMove.key

        ) {

            return 1000000;

        }

        //----------------------------------
        // Captures
        //----------------------------------

        if (move.isCapture()) {

            score += 100000;

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
