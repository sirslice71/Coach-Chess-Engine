//==================================================
// attack.js
//==================================================

import { Piece } from "../core/piece.js";
import EngineDebug from "../dev/enginedebug.js";

export default class Attack {

    //------------------------------------------
    // Direction Tables
    //------------------------------------------

    static KNIGHT = [
        -17,-15,-10,-6,
          6, 10, 15,17
    ];

    static KING = [
        -9,-8,-7,
        -1,   1,
         7, 8, 9
    ];

    static BISHOP = [
        -9,-7,7,9
    ];

    static ROOK = [
        -8,-1,1,8
    ];

    //------------------------------------------
    // Static attacker/offset tables
    //
    // These used to be rebuilt as fresh array literals on
    // EVERY pawn()/bishop()/rook() call. Attack detection is
    // the hottest code in the engine (rayAttack alone measured
    // 14% of search time, with the garbage collector at ~8%),
    // so per-call allocations here were pure churn. Hoisting
    // them is behavior-identical.
    //------------------------------------------

    static PAWN_OFFSETS_WHITE = [7, 9];

    static PAWN_OFFSETS_BLACK = [-7, -9];

    static DIAGONAL_WHITE = [Piece.WB, Piece.WQ];

    static DIAGONAL_BLACK = [Piece.BB, Piece.BQ];

    static STRAIGHT_WHITE = [Piece.WR, Piece.WQ];

    static STRAIGHT_BLACK = [Piece.BR, Piece.BQ];

    //------------------------------------------

    static isSquareAttacked(board, square, byWhite) {

        if (this.pawn(board, square, byWhite))
            return true;

        if (this.knight(board, square, byWhite))
            return true;

        //----------------------------------
        // Queens are already covered: bishop() scans the
        // diagonals for [bishop, queen] and rook() scans the
        // files/ranks for [rook, queen]. The old extra
        // this.queen() call here re-ran BOTH slider scans a
        // second time for every non-attacked square -- pure
        // duplicate work that roughly doubled the cost of the
        // hottest function in the engine. queen() itself is
        // kept for debug use.
        //----------------------------------

        if (this.bishop(board, square, byWhite))
            return true;

        if (this.rook(board, square, byWhite))
            return true;

        if (this.king(board, square, byWhite))
            return true;

        return false;

    }

    static attackCount(board, square, byWhite) {

        let count = 0;

        // TODO:
        // Count pawn attacks
        // Count knight attacks
        // Count bishop attacks
        // Count rook attacks
        // Count queen attacks
        // Count king attacks

        return count;

    }    

    //------------------------------------------

    static pawn(board,square,byWhite){

        const offsets =
            byWhite
                ? this.PAWN_OFFSETS_WHITE
                : this.PAWN_OFFSETS_BLACK;

        const file = square & 7;

        for(const offset of offsets){

            const target = square + offset;

            if(target < 0 || target > 63)
                continue;

            const targetFile = target & 7;

            if(Math.abs(targetFile-file)!==1)
                continue;

            const piece = board.pieceAt(target);

            if(byWhite){

                if(piece===Piece.WP)
                    return true;

            }else{

                if(piece===Piece.BP)
                    return true;

            }

        }

        return false;

    }

    //------------------------------------------

    static knight(board,square,byWhite){

        const rank = square >> 3;
        const file = square & 7;

        for(const offset of this.KNIGHT){

            const target = square + offset;

            if(target<0 || target>63)
                continue;

            const tr = target >> 3;
            const tf = target & 7;

            if(Math.abs(tr-rank)>2)
                continue;

            if(Math.abs(tf-file)>2)
                continue;

            const piece = board.pieceAt(target);

            if(byWhite){

                if(piece===Piece.WN)
                    return true;

            }else{

                if(piece===Piece.BN)
                    return true;

            }

        }

        return false;

    }

    //------------------------------------------
    // TODO
    //------------------------------------------

    static bishop(board, square, byWhite) {

        return this.rayAttack(

            board,

            square,

            this.BISHOP,

            this.DIAGONAL_WHITE,

            this.DIAGONAL_BLACK,

            byWhite

        );

    }

    static rook(board, square, byWhite) {

        return this.rayAttack(

            board,

            square,

            this.ROOK,

            this.STRAIGHT_WHITE,

            this.STRAIGHT_BLACK,

            byWhite

        );

    }

    static queen(board, square, byWhite) {

        return (

            this.bishop(board, square, byWhite) ||

            this.rook(board, square, byWhite)

        );

    }

    static king(board, square, byWhite) {

        const rank = square >> 3;
        const file = square & 7;

        for (const offset of this.KING) {

            const target = square + offset;

            if (target < 0 || target > 63)
                continue;

            const tr = target >> 3;
            const tf = target & 7;

            if (Math.abs(tr - rank) > 1)
                continue;

            if (Math.abs(tf - file) > 1)
                continue;

            const piece = board.pieceAt(target);

            if (byWhite) {

                if (piece === Piece.WK)
                    return true;

            } else {

                if (piece === Piece.BK)
                    return true;

            }

        }

        return false;

    }

    static rayAttack(board, square, directions, whitePieces, blackPieces, byWhite) {

        for (const direction of directions) {

            let current = square;

            while (true) {

                const previous = current;

                current += direction;

                if (current < 0 || current >= 64)
                    break;

                const prevRank = previous >> 3;
                const prevFile = previous & 7;

                const currRank = current >> 3;
                const currFile = current & 7;

                const rankDiff = currRank - prevRank;
                const fileDiff = currFile - prevFile;

                switch (direction) {

                    case -1:
                        if (!(currRank === prevRank &&
                            currFile === prevFile - 1))
                            current = -1;
                        break;

                    case 1:
                        if (!(currRank === prevRank &&
                            currFile === prevFile + 1))
                            current = -1;
                        break;

                    case -8:
                        if (!(currRank === prevRank - 1 &&
                            currFile === prevFile))
                            current = -1;
                        break;

                    case 8:
                        if (!(currRank === prevRank + 1 &&
                            currFile === prevFile))
                            current = -1;
                        break;

                    case -9:
                        if (!(currRank === prevRank - 1 &&
                            currFile === prevFile - 1))
                            current = -1;
                        break;

                    case -7:
                        if (!(currRank === prevRank - 1 &&
                            currFile === prevFile + 1))
                            current = -1;
                        break;

                    case 7:
                        if (!(currRank === prevRank + 1 &&
                            currFile === prevFile - 1))
                            current = -1;
                        break;

                    case 9:
                        if (!(currRank === prevRank + 1 &&
                            currFile === prevFile + 1))
                            current = -1;
                        break;

                }

                if (current === -1)
                    break;

                const piece = board.pieceAt(current);

                if (piece === Piece.EMPTY)
                    continue;

                if (byWhite) {

                    if (whitePieces.includes(piece))
                        return true;

                } else {

                    if (blackPieces.includes(piece))
                        return true;

                }

                break;

            }

        }

        return false;

    }

    static debug(board, square, byWhite) {

        EngineDebug.attackSummary(
            board,
            square,
            byWhite,
            this
        );

    }

}