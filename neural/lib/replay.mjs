//======================================================
// replay.mjs
// Replays a parsed PGN game through Coach's own board and
// legal move generator so produced FENs are exactly what
// Coach would produce. SAN tokens are matched against
// Coach's sanForMove() output (decoration-insensitive).
//======================================================

import { normalizeSan } from "./pgn-reader.mjs";
import { moveToUci } from "./moveutil.mjs";

export const START_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Returns { frames, error }.
// frames[i] = { ply, fen, sideToMove, inCheck, isTerminal, lastMoveUci }
export function replayGame(coach, game) {
    const { createEngineCore, FEN } = coach;
    const startFen =
        game.headers.FEN && game.headers.SetUp === "1"
            ? game.headers.FEN
            : START_FEN;

    const core = createEngineCore(startFen);
    const frames = [];
    let error = null;

    const snapshot = (ply, lastMoveUci) => {
        const legal = core.legalMoveGenerator.generateMoves();
        frames.push({
            ply,
            fen: FEN.export(core.board),
            sideToMove: core.board.sideToMove > 0 ? "w" : "b",
            inCheck: core.board.isInCheck(),
            isTerminal: legal.length === 0,
            lastMoveUci: lastMoveUci || null,
        });
        return legal;
    };

    let legal = snapshot(0, null);

    for (let i = 0; i < game.sanMoves.length; i++) {
        const want = normalizeSan(game.sanMoves[i]);
        let chosen = null;
        for (const m of legal) {
            if (normalizeSan(coach.sanForMove(m, legal)) === want) {
                chosen = m;
                break;
            }
        }
        if (!chosen) {
            error = {
                ply: i + 1,
                san: game.sanMoves[i],
                reason: "no legal move matched SAN",
            };
            break;
        }
        const uci = moveToUci(chosen);
        core.board.makeMove(chosen);
        legal = snapshot(i + 1, uci);
        if (legal.length === 0) break; // terminal
    }

    return { frames, error, result: game.headers.Result || "*" };
}
