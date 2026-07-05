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

    DOUBLED_PAWN: -10,

    //----------------------------------
    // Passed Pawn Advancement (v1)
    //
    // Indexed by own-perspective advancement:
    // 2 = starting rank, 7 = one step from
    // promotion. Indices 0-1 are unused (a real
    // pawn is never on rank 1 or on its own
    // back rank as a pawn). MG values are kept
    // modest on purpose so Coach does not shove
    // random pawns in the middlegame; EG values
    // scale up sharply so advanced passed pawns
    // create real promotion urgency once material
    // thins out. Tapered between the two by the
    // same phase blend already used for the King
    // piece-square tables.
    //----------------------------------

    PASSED_PAWN_BY_RANK_MG: [0, 0, 4, 6, 10, 16, 26, 40],

    PASSED_PAWN_BY_RANK_EG: [0, 0, 10, 18, 30, 50, 90, 140],

    CONNECTED_PASSED_PAWN: 12,

    PROTECTED_PASSED_PAWN: 10,

    KING_SUPPORTS_PASSED_PAWN: 18,

    PASSED_PAWN_BLOCKED: -10,

    PASSED_PAWN_BLOCKED_BY_KING: -18,

    //----------------------------------
    // Lone Runner Damping (v1 rook-ending guard)
    //
    // A far-advanced passed pawn is only as good as its
    // escort. When such a pawn has run deep (own-perspective
    // advancement >= LONE_RUNNER_MIN_ADVANCEMENT) but its own
    // king is not near it, no friendly pawn defends it, and it
    // has no connected passer -- while the enemy still has a
    // rook in a low-piece (rook) ending -- it is frequently
    // rounded up before it can promote. Damp the raw
    // advancement bonus a little, scaled by how far it has run
    // (advancement - 5) and by how deep into the endgame we
    // are, so Coach stops over-valuing shoving such a pawn onto
    // squares where it simply gets caught.
    //
    // Deliberately small: it must NOT stop Coach from escorting
    // or promoting genuinely supported/winning passers -- those
    // are excluded by the king-support, connected, and
    // pawn-defence conditions above.
    //----------------------------------

    LONE_RUNNER_ENDGAME: -12,

    LONE_RUNNER_MIN_ADVANCEMENT: 6,

    LONE_RUNNER_PHASE_MAX: 10

});
