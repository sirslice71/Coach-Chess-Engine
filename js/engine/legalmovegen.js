//==================================================
// legalmovegen.js
//==================================================

import Attack from "./attack.js";
import FEN from "../core/fen.js";
import EngineDebug from "../dev/enginedebug.js";
import { MoveFlags } from "../core/move.js";

export default class LegalMoveGenerator {

    constructor(board, moveGenerator) {

        this.board = board;
        this.moveGenerator = moveGenerator;

    }

    generateMoves(capturesOnly = false) {

        const legalMoves = [];

        //----------------------------------
        // Generate Pseudo Legal Moves
        //----------------------------------

        const pseudoMoves =

            this.moveGenerator.generateMoves(
                capturesOnly
            );

        //----------------------------------
        // Test Legality
        //----------------------------------

        for (const move of pseudoMoves) {

            this.board.makeMove(move);

            // sideToMove has already switched.
            // Test the king that just moved.

            const kingSquare =

                this.board.sideToMove > 0

                    ? this.board.blackKing

                    : this.board.whiteKing;

            const illegal =

                Attack.isSquareAttacked(

                    this.board,

                    kingSquare,

                    this.board.sideToMove > 0

                );

            this.board.undoMove();

            if (!illegal) {

                legalMoves.push(move);

            }

        }

        return legalMoves;

    }

    //----------------------------------
    // Generate Legal Captures
    //----------------------------------

    generateCaptures() {

        return this.generateMoves(true);

    }

}
