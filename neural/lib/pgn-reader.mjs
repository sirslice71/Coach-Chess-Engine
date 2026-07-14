//======================================================
// pgn-reader.mjs
// Minimal, dependency-free PGN reader.
// Splits a PGN file into games (headers + mainline SAN).
// Strips comments {...}, variations (...), NAGs $n,
// move numbers and result tokens. Mainline only.
//======================================================

import fs from "node:fs";

const TAG_RE = /^\s*\[(\w+)\s+"(.*)"\]\s*$/;
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*", "½-½"]);

export function splitGames(content) {
    const games = [];
    let cur = null;
    for (const raw of content.split(/\r?\n/)) {
        const m = raw.match(TAG_RE);
        if (m) {
            if (cur === null || cur.state === "moves") {
                if (cur) games.push(cur);
                cur = { headers: {}, moveText: "", state: "headers" };
            }
            cur.headers[m[1]] = m[2];
        } else {
            if (cur === null) continue;
            if (raw.trim() === "" && cur.state === "headers") continue;
            cur.state = "moves";
            cur.moveText += " " + raw;
        }
    }
    if (cur) games.push(cur);
    return games.filter((g) => g && (g.moveText.trim() || Object.keys(g.headers).length));
}

// Reduce raw movetext to an ordered array of SAN move tokens.
export function extractSanMoves(moveText) {
    let t = moveText;
    t = t.replace(/\{[^}]*\}/g, " ");        // comments
    let prev;
    do {                                     // nested variations
        prev = t;
        t = t.replace(/\([^()]*\)/g, " ");
    } while (t !== prev);
    t = t.replace(/\$\d+/g, " ");            // NAGs
    t = t.replace(/\d+\.(\.\.)?/g, " ");     // move numbers "12." / "12..."
    const tokens = t.split(/\s+/).filter(Boolean);
    const moves = [];
    for (const tok of tokens) {
        if (RESULTS.has(tok)) continue;
        if (/^[0O]-[0O]/.test(tok) === false && !/^[a-hKQRBNO0]/.test(tok)) continue;
        moves.push(tok);
    }
    return moves;
}

export function readPgnFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    return splitGames(content).map((g, i) => ({
        index: i,
        headers: g.headers,
        sanMoves: extractSanMoves(g.moveText),
    }));
}

// Strip check/mate/annotation decoration for SAN comparison.
export function normalizeSan(san) {
    return san.replace(/[+#!?]/g, "").replace(/0/g, "O");
}
