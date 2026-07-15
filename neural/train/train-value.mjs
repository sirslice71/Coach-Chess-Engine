#!/usr/bin/env node
//======================================================
// train/train-value.mjs
// Offline value-network PROOF trainer (pure Node, no deps).
// Deterministic. Uses the stored game-level split as-is.
//
// Usage (PowerShell):
//   node train\train-value.mjs --in "C:\...\labelled.jsonl" `
//        --model mlp --hidden 32 --target tanh --scale 400 `
//        --epochs 60 --lr 0.01 --batch 256 --seed 1 `
//        [--shuffle-labels] [--subset N] `
//        [--out-model "C:\...\model.json"] [--report "C:\...\report.json"]
//
// --shuffle-labels: control that must FAIL to learn (destroys signal).
// Outputs (model/report) are written OUTSIDE the repo; never committed.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulberry32 } from "../lib/prng.mjs";
import { loadDataset, targetToCp, DEFAULT_TARGET } from "./dataset.mjs";
import { initModel, makeAdam, forward, exportModel } from "./model.mjs";
import { mse, mae, pearson, mean, round } from "./metrics.mjs";

function parseArgs(argv) {
    const a = { in: null, model: "mlp", hidden: 32, target: "tanh", scale: 400, clipCp: 1000,
        epochs: 60, lr: 0.01, batch: 256, seed: 1, patience: 8, shuffleLabels: false, subset: null,
        outModel: null, report: null, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        const n = () => argv[++i];
        if (t === "--in") a.in = n();
        else if (t === "--model") a.model = n();
        else if (t === "--hidden") a.hidden = +n();
        else if (t === "--target") a.target = n();
        else if (t === "--scale") a.scale = +n();
        else if (t === "--clip-cp") a.clipCp = +n();
        else if (t === "--epochs") a.epochs = +n();
        else if (t === "--lr") a.lr = +n();
        else if (t === "--batch") a.batch = +n();
        else if (t === "--seed") a.seed = +n();
        else if (t === "--patience") a.patience = +n();
        else if (t === "--shuffle-labels") a.shuffleLabels = true;
        else if (t === "--subset") a.subset = +n();
        else if (t === "--out-model") a.outModel = n();
        else if (t === "--report") a.report = n();
        else if (t === "--quiet") a.quiet = true;
        else throw new Error("unknown flag " + t);
    }
    if (!a.in) throw new Error("--in required");
    return a;
}

function cloneModel(m) {
    return m.kind === "linear"
        ? { ...m, W: Float64Array.from(m.W) }
        : { ...m, W1: Float64Array.from(m.W1), b1: Float64Array.from(m.b1), W2: Float64Array.from(m.W2) };
}
function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
}
function paramCount(m) { return m.kind === "linear" ? m.dim + 1 : m.W1.length + m.b1.length + m.W2.length + 1; }

// target-space + cp-space metrics for a set of items given a predictor
function evalSet(items, predict, cfg) {
    if (!items.length) return null;
    const preds = items.map((it) => predict(it.idx));
    const tgts = items.map((it) => it.target);
    // cp-space: invert prediction, compare to SF cp (mate clipped to ±clipCp)
    const modelCp = preds.map((p) => targetToCp(p, cfg));
    const sfCp = items.map((it) => it.meta.mate != null ? Math.sign(it.meta.mate) * cfg.clipCp
        : Math.max(-cfg.clipCp, Math.min(cfg.clipCp, it.meta.cp)));
    return {
        n: items.length,
        targetMSE: round(mse(preds, tgts), 5), targetMAE: round(mae(preds, tgts), 5),
        targetPearson: round(pearson(preds, tgts)),
        cpMAE: Math.round(mae(modelCp, sfCp)), cpPearson: round(pearson(modelCp, sfCp)),
    };
}

// Apples-to-apples head-to-head on the SAME rows (non-mate, coach available):
// neural model vs Coach classical, both in cp space against the SF cp target.
function headToHead(items, predict, cfg) {
    const rows = items.filter((it) => it.meta.mate == null && typeof it.meta.coach === "number");
    if (!rows.length) return null;
    const sf = rows.map((r) => Math.max(-cfg.clipCp, Math.min(cfg.clipCp, r.meta.cp)));
    const coach = rows.map((r) => r.meta.coach);
    const neural = rows.map((r) => targetToCp(predict(r.idx), cfg));
    return {
        n: rows.length,
        neural: { cpMAE: Math.round(mae(neural, sf)), cpPearson: round(pearson(neural, sf)) },
        coach: { cpMAE: Math.round(mae(coach, sf)), cpPearson: round(pearson(coach, sf)) },
    };
}

function breakdowns(items, predict, cfg) {
    const groups = {
        opening: (m) => m.phase === "opening", middlegame: (m) => m.phase === "middlegame", endgame: (m) => m.phase === "endgame",
        whiteToMove: (m) => m.stm === "w", blackToMove: (m) => m.stm === "b",
        inCheck: (m) => m.inCheck, notInCheck: (m) => !m.inCheck,
        queenless: (m) => m.queenless, queensOn: (m) => !m.queenless,
        lowAbsScore: (m) => m.mate == null && Math.abs(m.cp) < 100, highAbsScore: (m) => m.mate != null || Math.abs(m.cp) >= 300,
    };
    const out = {};
    for (const [name, f] of Object.entries(groups)) out[name] = evalSet(items.filter((it) => f(it.meta)), predict, cfg);
    return out;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cfg = { kind: args.target, scale: args.scale, clipCp: args.clipCp, mateValue: DEFAULT_TARGET.mateValue };
    const t0 = Date.now();
    const { splits, featureDim, skipped } = loadDataset(args.in, cfg);
    let train = splits.train, val = splits.val, test = splits.test;
    if (args.subset) train = train.slice(0, args.subset);

    // shuffled-label control: destroy the feature->target relationship in TRAIN only
    if (args.shuffleLabels) {
        const rng = mulberry32((args.seed ^ 0x9e3779b9) >>> 0);
        const tg = train.map((it) => it.target); shuffleInPlace(tg, rng);
        train = train.map((it, i) => ({ ...it, target: tg[i] }));
    }

    const constant = mean(train.map((it) => it.target));
    const constPredict = () => constant;

    const report = {
        config: { ...args, featureDim }, dataset: { train: train.length, val: val.length, test: test.length, skipped },
        target: cfg, constant: round(constant),
        baselines: { constant: { val: evalSet(val, constPredict, cfg), test: evalSet(test, constPredict, cfg) } },
    };

    let best = null, bestVal = Infinity, bestEpoch = -1, model = null, curve = [];
    if (args.model === "constant") {
        report.model = { kind: "constant", value: round(constant), paramCount: 1 };
    } else {
        const hidden = args.model === "linear" ? 0 : args.hidden;
        model = initModel({ dim: featureDim, hidden, seed: args.seed });
        const adam = makeAdam(model, { lr: args.lr, l2: 1e-6 });
        const rng = mulberry32((args.seed * 2654435761) >>> 0);
        const order = train.map((_, i) => i);
        for (let epoch = 1; epoch <= args.epochs; epoch++) {
            shuffleInPlace(order, rng);
            let trLoss = 0, nb = 0;
            for (let s = 0; s < order.length; s += args.batch) {
                const batch = order.slice(s, s + args.batch).map((i) => train[i]);
                trLoss += adam.step(batch); nb++;
            }
            trLoss /= nb;
            const vPred = val.map((it) => forward(model, it.idx).o);
            const vLoss = mse(vPred, val.map((it) => it.target));
            curve.push({ epoch, trainLoss: round(trLoss, 5), valLoss: round(vLoss, 5) });
            if (!args.quiet) process.stdout.write(`\repoch ${epoch}/${args.epochs}  train ${trLoss.toFixed(5)}  val ${vLoss.toFixed(5)}   `);
            if (vLoss < bestVal - 1e-6) { bestVal = vLoss; best = cloneModel(model); bestEpoch = epoch; }
            else if (epoch - bestEpoch >= args.patience) break;   // early stopping
        }
        if (!args.quiet) process.stdout.write("\n");
        model = best || model;
        const predict = (idx) => forward(model, idx).o;
        report.model = { kind: model.kind, hidden: model.hidden, paramCount: paramCount(model),
            bestEpoch, bestValMSE: round(bestVal, 5), epochsRun: curve.length, curveTail: curve.slice(-5) };
        report.metrics = { train: evalSet(train, predict, cfg), val: evalSet(val, predict, cfg), test: evalSet(test, predict, cfg) };
        report.breakdownTest = breakdowns(test, predict, cfg);
        report.headToHeadTest = headToHead(test, predict, cfg);
        if (args.outModel) {
            const dir = path.dirname(path.resolve(args.outModel));
            if (!fs.existsSync(dir)) throw new Error("out-model dir does not exist: " + dir);
            fs.writeFileSync(args.outModel, JSON.stringify(exportModel(model, { targetTransform: cfg,
                training: { seed: args.seed, bestEpoch, bestValMSE: round(bestVal, 6), lr: args.lr, batch: args.batch } })));
        }
    }
    report.runtimeSec = round((Date.now() - t0) / 1000, 2);

    if (args.report) {
        const dir = path.dirname(path.resolve(args.report));
        if (!fs.existsSync(dir)) throw new Error("report dir does not exist: " + dir);
        fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    }
    if (!args.quiet) {
        console.log(`== ${args.model}${model && model.hidden ? "-" + model.hidden : ""}${args.shuffleLabels ? " [SHUFFLED-LABELS]" : ""} ==`);
        console.log("params:", report.model.paramCount, " runtime:", report.runtimeSec + "s");
        console.log("constant baseline  test:", JSON.stringify(report.baselines.constant.test));
        if (report.metrics) {
            console.log("model  val :", JSON.stringify(report.metrics.val));
            console.log("model  test:", JSON.stringify(report.metrics.test));
            console.log("head-to-head (test, same rows):", JSON.stringify(report.headToHeadTest));
        }
    }
    return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });

export { main };
