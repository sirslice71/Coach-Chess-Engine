//====================================================
// COACH CHESS ENGINE v0.5 ALPHA
// Developer Console Commands
//====================================================

//----------------------------------
// Board / Position
//----------------------------------

chess.turn()
chess.fen()
chess.load("FEN_STRING")
chess.positions()
chess.position("start")
chess.position("promotion")
chess.position("promotionWhite")
chess.position("promotionBlack")
chess.position("castling")
chess.position("enPassant")
chess.savePosition("MyPosition")

//----------------------------------
// Move Generation
//----------------------------------

chess.moves()
chess.printMoves()

//----------------------------------
// Search
//----------------------------------

chess.analyze()
chess.analyze(4)
chess.analyze(6)

chess.bench()
chess.bench(6)
chess.benchAll()

//----------------------------------
// Perft
//----------------------------------

chess.perft(1)
chess.perft(2)
chess.perft(3)
chess.perft(4)
chess.perft(5)
chess.perft(6)

chess.divide(1)
chess.divide(2)
chess.divide(3)
chess.divide(4)
chess.divide(5)

chess.divideAfter("e2-e4",4)
chess.divideAfter("d2-d4",5)

//----------------------------------
// Evaluation
//----------------------------------

chess.eval()
chess.material()

//----------------------------------
// Attack Detection
//----------------------------------

chess.attacked("e4", true)
chess.attacked("e4", false)

chess.attack("e4", true)
chess.attack("e4", false)

//----------------------------------
// Engine State
//----------------------------------

chess.castling()
chess.enPassant()

//----------------------------------
// Hashing
//----------------------------------

chess.hash()
chess.verifyHash()

//----------------------------------
// Coordinate Helpers
//----------------------------------

chess.fromAlgebraic("e4")
chess.algebraic(36)

//----------------------------------
// Internal Objects
//----------------------------------

chess.board
chess.ui
chess.search
chess.moveGenerator
chess.legalMoveGenerator
chess.perft
chess.evaluation
chess.tt
chess.zobrist
chess.gameController
chess.gameState
chess.dev
chess.debug
chess.logger
chess.Attack

//----------------------------------
// Useful Object Methods
//----------------------------------

chess.tt.stats()
chess.tt.clear()

//----------------------------------
// Quick Regression Tests
//----------------------------------

chess.perft(5)
chess.bench(6)
chess.verifyHash()
chess.eval()
chess.material()
chess.printMoves()
chess.positions()