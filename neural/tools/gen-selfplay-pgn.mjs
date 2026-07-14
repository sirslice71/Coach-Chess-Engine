#!/usr/bin/env node
//======================================================
// tools/gen-selfplay-pgn.mjs  (DEV/TEST HELPER — NOT the pipeline)
// Generates deterministic seeded random-legal self-play games
// and writes them as a PGN. Purpose: exercise the extraction /
// labelling / split pipeline when real match PGNs are not present.
// The resulting positions are legal but NOT representative of
// real play. Do NOT use this as training data.
//
// Usage: node tools/gen-selfplay-pgn.mjs --games 40 --max-plies 80 \
//        --seed 12345 --out games.pgn
//======================================================

import fs from "node:fs";
import { loadCoach } from "../lib/coach.mjs";
import { replayGame } from "../lib/replay.mjs"; // for START_FEN
import { mulberry32, deriveSeed } from "../lib/prng.mjs";
import { START_FEN } from "../lib/replay.mjs";

function arg(name, def) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : def;
}

const nGames = Number(arg("--games", 40));
const maxPlies = Number(arg("--max-plies", 80));
const seed = Number(arg("--seed", 12345));
const out = arg("--out", "selfplay.pgn");

const coach = await loadCoach();

function playGame(g) {
    const core = coach.createEngineCore(START_FEN);
    const rng = mulberry32(deriveSeed(seed, "game::" + g));
    const sans = [];
    let result = "1/2-1/2";
    for (let ply = 0; ply < maxPlies; ply++) {
        const legal = core.legalMoveGenerator.generateMoves();
        if (legal.length === 0) {
            result = core.board.isInCheck()
                ? (core.board.sideToMove > 0 ? "0-1" : "1-0")
                : "1/2-1/2";
            break;
        }
        // bias slightly toward captures for more varied material
        const caps = legal.filter((m) => m.capturedPiece);
        const pool = caps.length && rng() < 0.5 ? caps : legal;
        const m = pool[Math.floor(rng() * pool.length)];
        sans.push(coach.sanForMove(m, legal));
        core.board.makeMove(m);
    }
    return { sans, result };
}

let pgn = "";
for (let g = 0; g < nGames; g++) {
    const { sans, result } = playGame(g);
    pgn += `[Event "Synthetic-SelfPlay-Pipeline-Test"]\n`;
    pgn += `[Site "sandbox"]\n[Date "2026.07.14"]\n[Round "${g + 1}"]\n`;
    pgn += `[White "Synthetic"]\n[Black "Synthetic"]\n[Result "${result}"]\n\n`;
    let line = "";
    for (let i = 0; i < sans.length; i++) {
        if (i % 2 === 0) line += `${i / 2 + 1}. `;
        line += sans[i] + " ";
        if (line.length > 70) { pgn += line.trimEnd() + "\n"; line = ""; }
    }
    pgn += (line + result).trim() + "\n\n";
}
fs.writeFileSync(out, pgn);
console.log(`wrote ${nGames} synthetic games -> ${out}`);
