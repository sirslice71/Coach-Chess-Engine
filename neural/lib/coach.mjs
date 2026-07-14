//======================================================
// coach.mjs
// Thin loader around Coach's production engine core.
// Reuses Coach board / FEN / movegen / evaluation WITHOUT
// modifying any production file. The Coach repo root is
// resolved from COACH_ROOT env or the parent of neural/.
//======================================================

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export function coachRoot() {
    return process.env.COACH_ROOT
        ? path.resolve(process.env.COACH_ROOT)
        : path.resolve(here, "..", "..");
}

let _cache = null;

export async function loadCoach() {
    if (_cache) return _cache;
    const root = coachRoot();
    const url = (p) => pathToFileURL(path.join(root, p)).href;

    const { createEngineCore } = await import(url("js/uci/uciengine.js"));
    const FEN = (await import(url("js/core/fen.js"))).default;
    const { sanForMove } = await import(url("js/game/pgn.js"));
    const { MoveFlags } = await import(url("js/core/move.js"));

    _cache = { root, createEngineCore, FEN, sanForMove, MoveFlags };
    return _cache;
}
