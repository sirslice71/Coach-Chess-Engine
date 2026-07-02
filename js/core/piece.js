//======================================
// piece.js
//======================================

export const Piece = {

    EMPTY : 0,

    WP : 1,
    WN : 2,
    WB : 3,
    WR : 4,
    WQ : 5,
    WK : 6,

    BP : -1,
    BN : -2,
    BB : -3,
    BR : -4,
    BQ : -5,
    BK : -6

};

// Piece Values (centipawns)

export const PieceValue = {

    1 : 100,
    2 : 300,
    3 : 310,
    4 : 500,
    5 : 900,
    6 : 30000

};

// Piece Names

export const PieceName = {

     1 : "Pawn",
     2 : "Knight",
     3 : "Bishop",
     4 : "Rook",
     5 : "Queen",
     6 : "King",

    "-1" : "Pawn",
    "-2" : "Knight",
    "-3" : "Bishop",
    "-4" : "Rook",
    "-5" : "Queen",
    "-6" : "King"

};

export function isWhite(piece){

    return piece > 0;

}

export function isBlack(piece){

    return piece < 0;

}

export function isEmpty(piece){

    return piece === Piece.EMPTY;

}

export function value(piece){

    return PieceValue[Math.abs(piece)] || 0;

}

export function name(piece){

    return PieceName[piece] || "";

}