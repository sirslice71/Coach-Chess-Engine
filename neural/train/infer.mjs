#!/usr/bin/env node
//======================================================
// train/infer.mjs
// Standalone JavaScript inference for a proof value-model.
// NOT wired into Coach search/evaluation — this is offline only.
// Consumes the shared 781-dim sparse feature encoding and the
// exported model JSON; produces a White-relative value.
//
// Usage:
//   node train\infer.mjs --model model.json --fen "<FEN>"
//   node train\infer.mjs --model model.json --bench --in labelled.jsonl --n 5000
//======================================================

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { encodeFen } from "../lib/features.mjs";
import { importModel, forward } from "./model.mjs";

export function loadModel(pathOrObj) {
    const obj = typeof pathOrObj === "string" ? JSON.parse(fs.readFileSync(pathOrObj, "utf8")) : pathOrObj;
    return { model: importModel(obj), meta: obj };
}
// White-relative value in the model's target space.
export function evalFen(loaded, fen) { return forward(loaded.model, encodeFen(fen)).o; }

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

function bench() {
    const modelPath = arg("--model");
    const inPath = arg("--in");
    const n = +(arg("--n") || 5000);
    const tLoad0 = process.hrtime.bigint();
    const loaded = loadModel(modelPath);
    const loadMs = Number(process.hrtime.bigint() - tLoad0) / 1e6;

    const recs = fs.readFileSync(inPath, "utf8").split("\n").filter(Boolean).slice(0, n).map((l) => JSON.parse(l).fen);
    // warmup
    for (let i = 0; i < Math.min(1000, recs.length); i++) forward(loaded.model, encodeFen(recs[i]));

    // encoding only
    let tmp = 0;
    const e0 = process.hrtime.bigint();
    const encoded = recs.map((f) => encodeFen(f));
    const encMs = Number(process.hrtime.bigint() - e0) / 1e6;

    // inference only (pre-encoded)
    const i0 = process.hrtime.bigint();
    for (const idx of encoded) tmp += forward(loaded.model, idx).o;
    const infMs = Number(process.hrtime.bigint() - i0) / 1e6;

    // combined encode+infer
    const c0 = process.hrtime.bigint();
    for (const f of recs) tmp += forward(loaded.model, encodeFen(f)).o;
    const combMs = Number(process.hrtime.bigint() - c0) / 1e6;

    const mem = process.memoryUsage();
    const per = (ms) => (ms * 1e3 / recs.length); // microseconds per position
    const report = {
        model: { kind: loaded.model.kind, hidden: loaded.model.hidden, params: loaded.model.kind === "linear" ? loaded.model.dim + 1 : loaded.model.W1.length + loaded.model.hidden * 2 + 1 },
        positions: recs.length, modelLoadMs: +loadMs.toFixed(2),
        encodeUsPerPos: +per(encMs).toFixed(3), inferUsPerPos: +per(infMs).toFixed(3), combinedUsPerPos: +per(combMs).toFixed(3),
        positionsPerSec: Math.round(recs.length / (combMs / 1000)),
        inferOnlyPerSec: Math.round(recs.length / (infMs / 1000)),
        rssMB: +(mem.rss / 1048576).toFixed(1), heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
        checksum: +tmp.toFixed(6),
    };
    console.log(JSON.stringify(report, null, 2));
    const cost = (calls) => `${calls.toLocaleString()} calls ≈ ${(report.combinedUsPerPos * calls / 1e6).toFixed(2)} s (encode+infer), ${(report.inferUsPerPos * calls / 1e6).toFixed(2)} s (infer-only)`;
    console.log("cost @ once/eval :", report.combinedUsPerPos, "us");
    console.log("cost @ 100k      :", cost(100000));
    console.log("cost @ 1,000,000 :", cost(1000000));
}

function main() {
    if (process.argv.includes("--bench")) return bench();
    const loaded = loadModel(arg("--model"));
    const fen = arg("--fen");
    if (!fen) { console.error("--fen required (or use --bench)"); process.exit(2); }
    console.log(evalFen(loaded, fen));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
