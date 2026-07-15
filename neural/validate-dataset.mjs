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
//     - each game maps to exactly one split (no leakage). Game identity is the
//       content-derived source.gameKey (AUTHORITATIVE). When gameKey is absent
//       (older datasets) a proxy identity is used and leakage is downgraded to
//       a WARNING — the legacy basename proxy over-reports when two inputs
//       share a basename, so basenames alone are NOT a reliable game identity;
//     - no positionKey occurs in more than one split;
//     - positionKey is unique across the dataset;
//     - for new-format datasets, source.id / source.gameKey / source.gameIndex
//       are present.
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

// Pure split-integrity + provenance check (no Coach dependency; unit-testable).
// gameKey is the AUTHORITATIVE game identity; when absent, a proxy is used and
// game-level leakage is downgraded to a WARNING. Also checks duplicate keys,
// positionKey-in-multiple-splits (always a failure), split enum, and — for
// new-format datasets — presence of source.id / gameKey / gameIndex.
export function splitIntegrity(records) {
    const failures = [], warnings = [];
    const hasGameKey = records.length > 0 && records.every(r => r.source && typeof r.source.gameKey === "string" && r.source.gameKey.length > 0);
    const hasSourceId = records.length > 0 && records.every(r => r.source && typeof r.source.id === "string" && r.source.id.length > 0);
    const anyNewProvenance = records.some(r => r.source && (r.source.gameKey != null || r.source.id != null));
    const authoritative = hasGameKey;
    if (!authoritative) warnings.push(hasSourceId
        ? "no source.gameKey: split leakage checked by PROXY identity (source.id + gameIndex); cannot detect content-identical games across files. Regenerate with provenance for authoritative validation."
        : "no source.gameKey/source.id: split leakage checked by LEGACY identity (basename + game index), which OVER-REPORTS when two inputs share a basename. Regenerate with provenance for authoritative validation.");
    const gameIdentity = (r) => authoritative ? "gk:" + r.source.gameKey
        : hasSourceId ? "id:" + r.source.id + "#" + (r.source.gameIndex ?? r.source.game)
        : "legacy:" + (r.source && r.source.file) + "#" + (r.source && (r.source.gameIndex ?? r.source.game));

    const keys = new Set(); let duplicateKeys = 0;
    const identityToSplits = new Map(), keyToSplits = new Map();
    for (const r of records) {
        if (keys.has(r.positionKey)) { duplicateKeys++; failures.push({ msg: "duplicate positionKey", ctx: r.positionKey }); }
        keys.add(r.positionKey);
        if (!["train", "val", "test"].includes(r.split)) failures.push({ msg: "invalid split", ctx: r.split });
        if (anyNewProvenance) {
            if (!(r.source && typeof r.source.id === "string")) failures.push({ msg: "missing source.id", ctx: r.positionKey });
            if (!(r.source && typeof r.source.gameKey === "string")) failures.push({ msg: "missing source.gameKey", ctx: r.positionKey });
            if (!(r.source && r.source.gameIndex !== undefined)) failures.push({ msg: "missing source.gameIndex", ctx: r.positionKey });
        }
        const gid = gameIdentity(r);
        (identityToSplits.get(gid) || identityToSplits.set(gid, new Set()).get(gid)).add(r.split);
        (keyToSplits.get(r.positionKey) || keyToSplits.set(r.positionKey, new Set()).get(r.positionKey)).add(r.split);
    }
    let gameLeak = 0, keyLeak = 0;
    for (const [gid, splits] of identityToSplits) if (splits.size > 1) {
        gameLeak++;
        if (authoritative) failures.push({ msg: "game spans multiple splits (gameKey)", ctx: gid });
        else warnings.push("proxy game identity spans splits: " + gid);
    }
    for (const [k, splits] of keyToSplits) if (splits.size > 1) { keyLeak++; failures.push({ msg: "positionKey occurs in multiple splits", ctx: k }); }
    const idMode = authoritative ? "by gameKey (authoritative)" : hasSourceId ? "by source.id (proxy)" : "by basename (legacy)";
    return { authoritative, hasSourceId, idMode, uniqueKeys: keys.size, duplicateKeys, distinctGames: identityToSplits.size, gameLeak, keyLeak, failures, warnings };
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

    // Structural split + provenance integrity (pure, gameKey-authoritative).
    const si = splitIntegrity(records);
    for (const f of si.failures) fail.push(f);
    const warnings = [...si.warnings];

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

        if (r.stockfish) {
            labelled++;
            const sf = r.stockfish;
            const legal = legalUciSet(core);
            if (sf.bestMove) note(legal.has(sf.bestMove), "bestMove illegal", { fen: r.fen, bm: sf.bestMove });
            if (sf.pv && sf.pv.length) note(legal.has(sf.pv[0]), "pv[0] illegal", { fen: r.fen, pv0: sf.pv[0] });
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
    console.log("unique keys:        ", si.uniqueKeys);
    console.log("distinct games:     ", si.distinctGames, "(" + si.idMode + ")");
    console.log("game-level leakage: ", si.gameLeak, si.authoritative ? "" : "(proxy — see warnings, not counted as failure)");
    console.log("positionKey cross-split:", si.keyLeak);
    console.log("mate-labelled:      ", mateCount);
    console.log("wdl missing:        ", wdlMissing);
    console.log("malformed lines:    ", malformed.length, malformed.length ? JSON.stringify(malformed) : "");
    console.log("dropped torn trailing line:", droppedTrailing);
    if (warnings.length) {
        console.log("WARNINGS:           ", warnings.length);
        for (const w of warnings.slice(0, 10)) console.log("  ! ", w);
        if (warnings.length > 10) console.log("  ...", warnings.length - 10, "more");
    }
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
