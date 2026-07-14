#!/usr/bin/env node
//======================================================
// label-positions.mjs
// Resumable Stockfish labelling of extracted positions.
//
// Stockfish path (never hard-coded in tracked config):
//   --sf <path>  OR  env COACH_STOCKFISH_PATH
//
// Usage:
//   COACH_STOCKFISH_PATH=... node label-positions.mjs \
//     --in positions.jsonl --out labelled.jsonl \
//     [--nodes 25000] [--hash 64] [--threads 1] [--multipv 1] \
//     [--config config.json] [--retry-failed] [--limit N]
//
// Resumability: already-labelled positionKeys are skipped.
// Records are fsync-flushed; a torn final line on crash is
// dropped on the next read, never duplicated.
//======================================================

import fs from "node:fs";
import { readJsonl, labelledKeySet, AppendWriter, writeJson } from "./lib/jsonl.mjs";
import { Stockfish } from "./lib/stockfish.mjs";

function parseArgs(argv) {
    const a = { in: null, out: null, config: null, sf: null, retryFailed: false, limit: null, over: {} };
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === "--in") a.in = argv[++i];
        else if (t === "--out") a.out = argv[++i];
        else if (t === "--config") a.config = argv[++i];
        else if (t === "--sf") a.sf = argv[++i];
        else if (t === "--nodes") a.over.nodes = Number(argv[++i]);
        else if (t === "--depth") a.over.depth = Number(argv[++i]);
        else if (t === "--hash") a.over.hash = Number(argv[++i]);
        else if (t === "--threads") a.over.threads = Number(argv[++i]);
        else if (t === "--multipv") a.over.multipv = Number(argv[++i]);
        else if (t === "--retry-failed") a.retryFailed = true;
        else if (t === "--limit") a.limit = Number(argv[++i]);
        else throw new Error("unknown flag " + t);
    }
    if (!a.in || !a.out) throw new Error("--in and --out required");
    return a;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cfg = args.config ? JSON.parse(fs.readFileSync(args.config, "utf8")) : {};
    const lab = { nodes: 25000, hash: 64, threads: 1, multipv: 1, ...(cfg.labelling || {}), ...args.over };

    const sfPath = args.sf || process.env.COACH_STOCKFISH_PATH;
    if (!sfPath) throw new Error("Stockfish path required via --sf or COACH_STOCKFISH_PATH");
    if (!fs.existsSync(sfPath)) throw new Error("Stockfish not found at " + sfPath);

    const positions = readJsonl(args.in).records;

    // Resume: which keys are already labelled (and which failed)?
    const existing = readJsonl(args.out).records;
    const doneOk = new Set();
    let doneFailed = new Set();
    for (const r of existing) {
        if (r.stockfish) doneOk.add(r.positionKey);
        else doneFailed.add(r.positionKey);
    }

    // When retrying failures, compact the output first: drop the stale
    // stockfish:null records so the re-labelled positions do not end up as
    // duplicate positionKeys (one null, one labelled). Those positions still
    // live in the input file, so they simply become todo again.
    if (args.retryFailed && doneFailed.size) {
        const kept = existing.filter((r) => r.stockfish);
        const tmp = args.out + ".compact.tmp";
        fs.writeFileSync(tmp, kept.length ? kept.map((r) => JSON.stringify(r)).join("\n") + "\n" : "");
        fs.renameSync(tmp, args.out);
        doneFailed = new Set();
    }

    const todo = positions.filter((p) => {
        if (doneOk.has(p.positionKey)) return false;
        if (doneFailed.has(p.positionKey) && !args.retryFailed) return false;
        return true;
    }).slice(0, args.limit || undefined);

    const sf = new Stockfish(sfPath, {
        threads: lab.threads, hash: lab.hash, multipv: lab.multipv, showWDL: true,
    });
    const version = await sf.init();

    const writer = new AppendWriter(args.out);
    const ckptPath = args.out.replace(/\.jsonl$/, "") + ".checkpoint.json";
    const startedAt = Date.now();
    let labelled = 0, failed = 0;
    let stopping = false;

    const limit = args.over.depth ? { depth: lab.depth } : { nodes: lab.nodes };
    const writeCkpt = () => writeJson(ckptPath, {
        engine: "stockfish", version, params: lab,
        labelledThisRun: labelled, failedThisRun: failed,
        alreadyDone: doneOk.size, totalPositions: positions.length,
        remaining: todo.length - (labelled + failed),
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        lastUpdated: new Date().toISOString(),
    });

    process.on("SIGINT", () => {
        stopping = true;
        console.log("\n[SIGINT] flushing checkpoint and exiting cleanly...");
        writer.close(); writeCkpt(); sf.quit();
        process.exit(130);
    });

    for (const p of todo) {
        if (stopping) break;
        let record;
        try {
            const r = await sf.analyse(p.fen, limit);
            record = {
                ...p,
                stockfish: {
                    version, depth: r.depth, seldepth: r.seldepth, nodes: r.nodes,
                    scoreCpWhite: r.scoreCpWhite, mate: r.mate, wdl: r.wdl,
                    bestMove: r.bestMove, pv: r.pv, timeMs: r.timeMs,
                },
                labelling: {
                    engine: "stockfish", version,
                    nodesLimit: limit.nodes ?? null, depthLimit: limit.depth ?? null,
                    hash: lab.hash, threads: lab.threads, multipv: lab.multipv,
                    showWDL: true, hashResetPerPosition: true,
                    scorePerspective: "white", labelledAt: new Date().toISOString(),
                },
                labelError: null,
            };
            labelled++;
        } catch (e) {
            record = { ...p, stockfish: null, labelling: null, labelError: String(e.message || e) };
            failed++;
        }
        writer.append(record, 25);
        if ((labelled + failed) % 25 === 0) { writeCkpt(); process.stdout.write(`\rlabelled ${labelled} failed ${failed} / ${todo.length}`); }
    }

    writer.close();
    writeCkpt();
    await sf.quit();
    const secs = (Date.now() - startedAt) / 1000;
    console.log(`\n== labelling ==`);
    console.log("engine:       ", version);
    console.log("params:       ", JSON.stringify(lab));
    console.log("newly labelled:", labelled, " failed:", failed);
    console.log("already done: ", doneOk.size);
    console.log("elapsed sec:  ", secs.toFixed(1));
    if (labelled > 0) console.log("rate:         ", (labelled / secs).toFixed(1), "pos/sec ~", Math.round(labelled / secs * 3600), "pos/hour");
    console.log("out:", args.out);
}

main().catch((e) => { console.error(e); process.exit(1); });
