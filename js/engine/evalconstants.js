//======================================
// evalconstants.js
//======================================

export const Eval = Object.freeze({

    //----------------------------------
    // Opening
    //----------------------------------

    CENTER: 4,

    DEVELOPMENT: 3,

    TEMPO: 2,

    DEVELOP_MINOR: 10,

    REPEAT_MINOR: -8,

    EARLY_ROOK: -10,

    //----------------------------------
    // Opening Principles
    //----------------------------------

    QUEEN_DISCIPLINE: -18,

    EARLY_ROOK: -15,

    CONNECTED_ROOKS: 12,

    DEVELOPED_KNIGHT: 8,

    DEVELOPED_BISHOP: 10,

    CENTER_PAWN: 16,

    //----------------------------------
    // Piece Freedom
    //----------------------------------

    BISHOP_FREEDOM: 12,

    //----------------------------------
    // King
    //----------------------------------

    CASTLING_PARTIAL: -4,

    CASTLING_READY: -8,

    CASTLING_COMPLETE: 18,

    KING_SHIELD_ADVANCED: -3,

    KING_SHIELD_MISSING: -6,

    //----------------------------------
    // Position
    //----------------------------------

    BISHOP_PAIR: 20,

    ROOK_CONNECTION: 10,

    //----------------------------------
    // Mobility
    //----------------------------------

    MOBILITY: 1,

    //----------------------------------
    // Pawn Structure
    //----------------------------------

    PASSED_PAWN: 25,

    CONNECTED_PAWN: 8,

    ISOLATED_PAWN: -12,

    DOUBLED_PAWN: -10,

    //----------------------------------
    // Rooks
    //----------------------------------

    ROOK_OPEN_FILE: 15,

    ROOK_SEMI_OPEN_FILE: 8
    

});
