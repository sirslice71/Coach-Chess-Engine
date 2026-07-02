//======================================
// evalconstants.js
//======================================

export const Eval = Object.freeze({

    //----------------------------------
    // Opening
    //----------------------------------

    DEVELOP_MINOR: 10,

    DEVELOPMENT_COMPLETE: 20,

    //----------------------------------
    // Opening Principles
    //----------------------------------

    QUEEN_DISCIPLINE: -18,

    EARLY_ROOK: -15,

    CENTER_PAWN: 16,

    //----------------------------------
    // King
    //----------------------------------

    CASTLING_PARTIAL: -4,

    CASTLING_READY: -8,

    CASTLING_COMPLETE: 18,

    KING_SHIELD_ADVANCED: -3,

    KING_SHIELD_MISSING: -6,

    //----------------------------------
    // Mobility
    //----------------------------------

    KNIGHT_MOBILITY: 1,

    BISHOP_MOBILITY: 1,

    //----------------------------------
    // Threats
    //----------------------------------

    HANGING_KNIGHT: -10,

    HANGING_BISHOP: -10,

    HANGING_ROOK: -16,

    HANGING_QUEEN: -24,

    //----------------------------------
    // Pawn Structure
    //----------------------------------

    PASSED_PAWN: 25,

    CONNECTED_PAWN: 8,

    ISOLATED_PAWN: -12,

    DOUBLED_PAWN: -10
    

});
