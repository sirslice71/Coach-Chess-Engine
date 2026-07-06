//======================================
// searchconstants.js
//======================================

export const SearchConstants = {

    MATE: 100000,

    //----------------------------------
    // Any root-relative score at or above this magnitude is
    // treated as mate-class for UCI reporting purposes (see
    // js/uci/uciengine.js formatUciScore()). A real
    // centipawn evaluation -- even a wildly lopsided one --
    // never approaches this range, so the threshold is a safe
    // floor: it only catches genuine "-MATE + ply" / "MATE -
    // ply" scores produced by search.js, never ordinary
    // material/positional swings. Matches the same 90000
    // floor already used by tools/coach-analysis-lab.mjs.
    //----------------------------------

    MATE_THRESHOLD: 90000,

    DRAW: 0,

    INFINITY: 1000000,

    MAX_DEPTH: 64

};