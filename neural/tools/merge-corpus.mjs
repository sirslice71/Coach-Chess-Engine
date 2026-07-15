#!/usr/bin/env node
//======================================================
// tools/merge-corpus.mjs
// Safe incremental corpus merging. Read-only on inputs.
//
// Combines labelled datasets in priority order: the FIRST --in that owns a
// positionKey wins, so an already-accepted corpus keeps its exact labels,
// provenance and split; later corpora contribute only genuinely new keys.
// Splits are never recomputed here — each record keeps the split it was
// extracted with (assignSplit is a pure function of gameKey, so adding new
// games cannot change an existing game's split).
//
// Usage (PowerShell):
//   node .\tools\merge-corpus.mjs --in "old.jsonl" --in "new.jsonl" `
//        --out "combined.jsonl" [--json "merge-report.json"]
//
// Verifies on the merged result: unique positionKeys, no positionKey in more
// than one split, no gameKey spanning splits. Exits non-zero on violation.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJsonl } from "../lib/jsonl.mjs";

// Pure merge: datasets = [{ name, records }] in priority order (first wins).
export function mergeRecords(datasets) {
    const byKey = new Map();
    const contributed = {}, dropped = {};
    for (const ds of datasets) {
        contributed[ds.name] = 0; dropped[ds.name] = 0;
        for (const r of ds.records) {
            if (byKey.has(r.positionKey)) { dropped[ds.name]++; continue; }
            byKey.set(r.positionKey, { rec: r, from: ds.name });
            contributed[ds.name]++;
        }
    }
    const merged = [...byKey.values()].map((v) => v.rec);
    const origin = {}; for (const [k, v] of byKey) origin[k] = v.from;

    // integrity of the merged result
    const failures = [];
    const keySplits = new Map(), gkSplits = new Map();
    for (const r of merged) {
        (keySplits.get(r.positionKey) || keySplits.set(r.positionKey, new Set()).get(r.positionKey)).add(r.split);
        const gk = r.source && r.source.gameKey;
        if (gk) (gkSplits.get(gk) || gkSplits.set(gk, new Set()).get(gk)).add(r.split);
        if (!r.stockfish) failures.push({ msg: "null label in merged output", ctx: r.positionKey });
    }
    for (const [k, s] of keySplits) if (s.size > 1) failures.push({ msg: "positionKey in multiple splits", ctx: k });
    let gkLeak = 0;
    for (const [gk, s] of gkSplits) if (s.size > 1) { gkLeak++; failures.push({ msg: "gameKey spans multiple splits", ctx: gk }); }

    const splitCounts = { train: 0, val: 0, test: 0 };
    for (const r of merged) if (splitCounts[r.split] !== undefined) splitCounts[r.split]++;
    return { merged, contributed, dropped, failures, gameKeyLeak: gkLeak,
        uniqueKeys: byKey.size, distinctGameKeys: gkSplits.size, splitCounts, origin };
}

// Confirm a prior dataset's split assignments survive the merge unchanged.
export function verifySplitsPreserved(priorRecords, merged) {
    const bySplit = new Map(merged.map((r) => [r.positionKey, r.split]));
    let checked = 0, changed = 0;
    for (const r of priorRecords) {
        const now = bySplit.get(r.positionKey);
        if (now === undefined) continue;
        checked++;
        if (now !== r.split) changed++;
    }
    return { checked, changed };
}

function main() {
    const argv = process.argv.slice(2);
    const ins = [], out = { path: null, json: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--in") ins.push(argv[++i]);
        else if (argv[i] === "--out") out.path = argv[++i];
        else if (argv[i] === "--json") out.json = argv[++i];
        else { console.error("unknown flag " + argv[i]); process.exit(2); }
    }
    if (ins.length < 2) { console.error("need at least two --in datasets (priority order: first wins)"); process.exit(2); }
    if (!out.path) { console.error("--out required"); process.exit(2); }
    for (const p of ins) if (!fs.existsSync(p)) { console.error("input not found: " + p); process.exit(2); }
    const outDir = path.dirname(path.resolve(out.path));
    if (!fs.existsSync(outDir)) { console.error("output directory does not exist: " + outDir); process.exit(2); }

    const datasets = ins.map((p) => {
        const { records, malformed } = readJsonl(p);
        if (malformed.length) console.error(`warning: ${malformed.length} malformed line(s) in ${p}`);
        return { name: path.basename(p) + " (" + path.basename(path.dirname(p)) + ")", records };
    });
    const res = mergeRecords(datasets);
    const preserved = verifySplitsPreserved(datasets[0].records, res.merged);

    fs.writeFileSync(out.path, res.merged.map((r) => JSON.stringify(r)).join("\n") + "\n");

    console.log("== merge ==");
    for (const ds of datasets) console.log(`  ${ds.name}: ${ds.records.length} records -> contributed ${res.contributed[ds.name]}, dropped(dup key) ${res.dropped[ds.name]}`);
    console.log("merged records:      ", res.merged.length);
    console.log("unique positionKeys: ", res.uniqueKeys);
    console.log("distinct gameKeys:   ", res.distinctGameKeys);
    console.log("splits:              ", JSON.stringify(res.splitCounts));
    console.log("gameKey split leakage:", res.gameKeyLeak);
    console.log(`prior splits preserved: ${preserved.checked - preserved.changed}/${preserved.checked} unchanged (changed: ${preserved.changed})`);
    console.log("FAILURES:            ", res.failures.length);
    for (const f of res.failures.slice(0, 10)) console.log("  -", f.msg, JSON.stringify(f.ctx));
    if (out.json) fs.writeFileSync(out.json, JSON.stringify({
        inputs: ins.map((p, i) => ({ path: path.basename(p), records: datasets[i].records.length, contributed: res.contributed[datasets[i].name], dropped: res.dropped[datasets[i].name] })),
        merged: res.merged.length, uniqueKeys: res.uniqueKeys, distinctGameKeys: res.distinctGameKeys,
        splitCounts: res.splitCounts, gameKeyLeak: res.gameKeyLeak, priorSplitsPreserved: preserved, failures: res.failures.length,
    }, null, 2));
    process.exit(res.failures.length || preserved.changed ? 1 : 0);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
