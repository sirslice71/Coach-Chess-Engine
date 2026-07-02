//======================================
// testpositions.js
//======================================

export default {

    //----------------------------------
    // Starting Positions
    //----------------------------------

    start:
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",

    afterE4:
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",

    afterE4D5:
        "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",

    //----------------------------------
    // Castling
    //----------------------------------

    castleWhiteKing:
        "4k3/8/8/8/8/8/8/R3K2R w K - 0 1",

    castleWhiteQueen:
        "4k3/8/8/8/8/8/8/R3K2R w Q - 0 1",

    castleBlackKing:
        "r3k2r/8/8/8/8/8/8/4K3 b k - 0 1",

    castleBlackQueen:
        "r3k2r/8/8/8/8/8/8/4K3 b q - 0 1",

    castling:
        "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",

    //----------------------------------
    // Promotion
    //----------------------------------

    promotionWhite:
        "k7/4P3/8/8/8/8/8/4K3 w - - 0 1",

    promotionBlack:
        "4k3/8/8/8/8/8/4p3/4K3 b - - 0 1",

    promotedQueen:
        "4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1",

    promotion:
        "8/P7/8/8/8/8/8/k6K w - - 0 1",

    //----------------------------------
    // En Passant
    //----------------------------------

    enPassant:
        "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",

    //----------------------------------
    // Check / Mate
    //----------------------------------

    check:
        "4k3/8/8/8/8/8/4R3/4K3 b - - 0 1",

    checkmate:
        "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1",

    stalemate:
        "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",

    //----------------------------------
    // Pins
    //----------------------------------

    pin:
        "4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1",

    //----------------------------------
    // Endgames
    //----------------------------------

    kingPawn:
        "4k3/8/8/4P3/8/8/8/4K3 w - - 0 1",

    //----------------------------------
    // Search Benchmark
    //----------------------------------

    search:
        "r2q1rk1/ppp2ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 10",

    //----------------------------------
    // Insufficient Material - Draw
    //----------------------------------

    insufficientKings:
    "k7/8/8/8/8/8/8/4K3 w - - 0 1",

    insufficientKnight:
    "k7/8/8/8/8/3N4/8/4K3 w - - 0 1",

    insufficientBishop:
    "k7/8/8/8/8/3B4/8/4K3 w - - 0 1",

    drawTwoKnights:
    "8/8/8/8/8/3NN3/4k3/4K3 w - - 0 1",

    bishopKnightMate:
    "k7/8/8/8/8/3BN3/8/4K3 w - - 0 1",

    rookMate:
    "k7/8/8/8/8/3R4/8/4K3 w - - 0 1"

};