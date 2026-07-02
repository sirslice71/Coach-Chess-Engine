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

    static isSquareAttacked(board, square, byWhite) {

        if (this.pawn(board, square, byWhite))
            return true;

        if (this.knight(board, square, byWhite))
            return true;

        if (this.bishop(board, square, byWhite))
            return true;

        if (this.rook(board, square, byWhite))
            return true;

        if (this.queen(board, square, byWhite))
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

        const offsets = byWhite ? [7,9] : [-7,-9];

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

            [Piece.WB, Piece.WQ],

            [Piece.BB, Piece.BQ],

            byWhite

        );

    }

    static rook(board, square, byWhite) {

        return this.rayAttack(

            board,

            square,

            this.ROOK,

            [Piece.WR, Piece.WQ],

            [Piece.BR, Piece.BQ],

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