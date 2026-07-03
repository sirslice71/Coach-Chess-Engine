//======================================
// evalconstants.js
//======================================

export const Eval = Object.freeze({

    //----------------------------------
    // Opening
    //----------------------------------

    DEVELOP_MINOR: 10,

    PREMATURE_KNIGHT: 8,

    DEVELOPMENT_COMPLETE: 20,

    //----------------------------------
    // Opening Principles
    //----------------------------------

    QUEEN_DISCIPLINE: -18,

    EARLY_ROOK: -15,

    CONNECTED_ROOKS: 15,

    CENTER_PAWN: 16,

    //----------------------------------
    // King
    //----------------------------------

    CASTLING_PARTIAL: -4,

    CASTLING_READY: -8,

    CASTLING_COMPLETE: 18,

    CASTLING_ABORTED: -60,

    KING_SHIELD_ADVANCED: -3,

    KING_SHIELD_MISSING: -6,

    KING_EXPOSED: -70,

    ROOK_OPEN_FILE: 8,

    ROOK_HALF_OPEN_FILE: 4,

    KING_BLOCKS_ROOK: -12,

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
