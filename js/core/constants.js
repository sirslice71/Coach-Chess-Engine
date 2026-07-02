//========================================
// constants.js
// Global Engine Constants
//========================================

// Board

export const BOARD_SIZE = 8;
export const BOARD_SQUARES = 64;

// Colors

export const WHITE = 1;
export const BLACK = -1;

// Piece Values (centipawns)

export const VALUE = {

    PAWN:100,
    KNIGHT:300,
    BISHOP:310,
    ROOK:500,
    QUEEN:900,
    KING:30000

};

// Search

export const MAX_DEPTH = 64;

export const CHECKMATE = 30000;

export const DRAW = 0;

// Directions

export const NORTH = -8;
export const SOUTH = 8;
export const EAST = 1;
export const WEST = -1;

// Diagonals

export const NORTH_EAST = -7;
export const NORTH_WEST = -9;
export const SOUTH_EAST = 9;
export const SOUTH_WEST = 7;