#!/usr/bin/env node
//======================================================
// validate-dataset.mjs
// Structural + chess-legality validation of a labelled
// (or extracted) dataset. Exit code 1 if any check fails.
//
// Usage: node validate-dataset.mjs --in labelled.jsonl
//
// Validity contract (exactly what is enforced; nothing more):
//   Structural
//     - every non-trailing line parses as JSON (a single torn TRAILING
//       line from a crash is tolerated and reported, not failed);
//     - FEN imports cleanly through Coach's parser;
//     - record.sideToMove matches the FEN side-to-move token;
//     - split is one of train/val/test;
//     - each source game maps to exactly one split (no leakage);
//     - positionKey is unique across the dataset.
//   Board sanity (static, per FEN)
//     - side-to-move token is 'w' or 'b';
//     - placement has 8 ranks;
//     - exactly one white king and one black king;
//     - no pawn on rank 1 or rank 8;
//     - the side NOT to move is not in check (best-effort: an illegal
//       "already in check" position; skipped if Coach rejects the probe).
//   Label sanity (only when a stockfish label is present)
//     - stockfish.bestMove and pv[0] are legal Coach moves;
//     - exactly one of scoreCpWhite / mate is non-null;
//     - labelling.scorePerspective === 'white'.
//   NOTE: this does NOT prove full historical game legality (reachability
//   from the start position), nor castling-rights/king-rook consistency.
//======================================================

import { loadCoach } from "./lib/coach.mjs";
import { readJsonl } from "./lib/jsonl.mjs";
import { legalUciSet } from "./lib/moveutil.mjs";

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

// Pure static FEN sanity checks. Returns an array of problem strings.
export function fenSanity(fen) {
    const problems = [];
    const parts = String(fen).trim().split(/\s+/);
    const placement = parts[0] || "";
    const stm = parts[1];
    if (stm !== "w" && stm !== "b") problems.push("invalid side-to-move token");
    const rows = placement.split("/");
    if (rows.length !== 8) problems.push("placement is not 8 ranks");
    const counts = {};
    for (const ch of placement) if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
    if ((counts.K || 0) !== 1) problems.push("white king count != 1");
    if ((counts.k || 0) !== 1) problems.push("black king count != 1");
    if (/[Pp]/.test(rows[0] || "")) problems.push("pawn on rank 8");
    if (/[Pp]/.test(rows[7] || "")) problems.push("pawn on rank 1");
    return problems;
}

// Best-effort: is the side NOT to move already in check (illegal)?
// Probe by flipping the side-to-move (ep dropped so the probe FEN imports).
function opponentInCheck(coach, fen) {
    const parts = String(fen).trim().split(/\s+/);
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[3] = "-";
    try {
        const c = coach.createEngineCore(parts.join(" "));
        return c.board.isInCheck();
    } catch { return false; }
}

async function main() {
    const inPath = arg("--in");
    if (!inPath) throw new Error("--in required");
    const coach = await loadCoach();
    const { records, malformed, droppedTrailing } = readJsonl(inPath);

    const fail = [];
    const note = (cond, msg, ctx) => { if (!cond) fail.push({ msg, ctx }); };

    // Non-trailing malformed lines are genuine corruption -> fail.
    // (A single torn TRAILING line is reported via droppedTrailing, not failed.)
    for (const m of malformed) fail.push({ msg: "malformed JSONL line (non-trailing)", ctx: m });

    const keys = new Set();
    const gameSplit = new Map(); // file:game -> split
    let labelled = 0, mateCount = 0, wdlMissing = 0;

    for (const r of records) {
        // FEN imports + side to move
        let core;
        try { core = coach.createEngineCore(r.fen); }
        catch (e) { fail.push({ msg: "FEN failed to import", ctx: r.fen }); continue; }
        const stm = r.fen.trim().split(/\s+/)[1];
        note(stm === r.sideToMove, "sideToMove mismatch", r.fen);

        // static board sanity
        for (const p of fenSanity(r.fen)) fail.push({ msg: p, ctx: r.fen });
        if (opponentInCheck(coach, r.fen)) fail.push({ msg: "side-not-to-move is in check (illegal)", ctx: r.fen });

        // duplicate key
        note(!keys.has(r.positionKey), "duplicate positionKey", r.positionKey);
        keys.add(r.positionKey);

        // one game -> one split
        const gk = r.source.file + "#" + r.source.game;
        if (gameSplit.has(gk)) note(gameSplit.get(gk) === r.split, "game spans multiple splits", gk);
        else gameSplit.set(gk, r.split);

        note(["train", "val", "test"].includes(r.split), "invalid split", r.split);

        if (r.stockfish) {
            labelled++;
            const sf = r.stockfish;
            const legal = legalUciSet(core);
            // best move legal (unless terminal/no bestmove)
            if (sf.bestMove) note(legal.has(sf.bestMove), "bestMove illegal", { fen: r.fen, bm: sf.bestMove });
            if (sf.pv && sf.pv.length) note(legal.has(sf.pv[0]), "pv[0] illegal", { fen: r.fen, pv0: sf.pv[0] });
            // score present: cp or mate
            note(sf.scoreCpWhite !== null || sf.mate !== null, "no score/mate", r.fen);
            note(!(sf.scoreCpWhite !== null && sf.mate !== null), "both cp and mate set", r.fen);
            if (sf.mate !== null) mateCount++;
            if (!sf.wdl || sf.wdl.length !== 3) wdlMissing++;
            note(r.labelling && r.labelling.scorePerspective === "white", "score perspective not white", r.fen);
        }
    }

    console.log("== validation ==");
    console.log("records:            ", records.length);
    console.log("labelled:           ", labelled);
    console.log("unique keys:        ", keys.size);
    console.log("distinct games:     ", gameSplit.size);
    console.log("mate-labelled:      ", mateCount);
    console.log("wdl missing:        ", wdlMissing);
    console.log("malformed lines:    ", malformed.length, malformed.length ? JSON.stringify(malformed) : "");
    console.log("dropped torn trailing line:", droppedTrailing);
    console.log("FAILURES:           ", fail.length);
    for (const f of fail.slice(0, 20)) console.log("  -", f.msg, JSON.stringify(f.ctx));
    if (fail.length > 20) console.log("  ...", fail.length - 20, "more");
    process.exit(fail.length ? 1 : 0);
}

// Only run as a CLI, not when imported (e.g. by the test suite).
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
