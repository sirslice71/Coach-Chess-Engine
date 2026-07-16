#!/usr/bin/env node
//======================================================
// tools/analyze-calibration.mjs
// Read-only, deterministic analysis: does a simple, offline, closed-form
// recalibration of the accepted 781-feature linear model's CENTIPAWN
// OUTPUT bring its score distribution closer to Coach's classical
// evaluation landscape, without materially hurting predictive accuracy?
//
// No retraining, no new input features, no search involvement, no
// engine matches. Fits all candidate transforms on VALIDATION only;
// TEST is touched exactly once, only for the transform selected by the
// validation-only acceptance criteria (see selectTransform()).
//
// Usage (PowerShell):
//   node tools\analyze-calibration.mjs --in "C:\...\labelled.jsonl" `
//        --model "C:\...\models\linear-s1.json" `
//        --mlp   "C:\...\models\mlp64-s1.json" `
//        [--json "C:\...\calibration-report.json"] [--roots-per-phase 15]
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDataset, targetToCp, DEFAULT_TARGET } from "../train/dataset.mjs";
import { importModel, forward } from "../train/model.mjs";
import { encodeFen } from "../lib/features.mjs";
import { mean, mae, pearson, spearman, round } from "../train/metrics.mjs";
import { TRANSFORMS } from "../lib/calibration.mjs";
import { loadCoach } from "../lib/coach.mjs";

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

function loadModelFile(p) {
    const obj = JSON.parse(fs.readFileSync(p, "utf8"));
    return { model: importModel(obj), raw: obj };
}

// White-relative cp, clipped to the model's own declared bound -- this is
// exactly the value the hybrid evaluator exposes (see hybridEval.js in the
// isolated search worktree; not imported here, no search dependency).
function cpFromModel(model, idx, cfg) {
    const raw = targetToCp(forward(model, idx).o, cfg);
    return Math.max(-cfg.clipCp, Math.min(cfg.clipCp, raw));
}
function sfCpOf(meta, clipCp) {
    return meta.mate != null ? Math.sign(meta.mate) * clipCp : Math.max(-clipCp, Math.min(clipCp, meta.cp));
}

// ---------------- metric helpers (operate on plain {model, sf} rows) ----------------
function accuracyMetrics(rows) {
    if (!rows.length) return null;
    const model = rows.map((r) => r.model), sf = rows.map((r) => r.sf);
    return {
        n: rows.length,
        cpMAE: round(mae(model, sf), 2),
        bias: round(mean(model.map((v, i) => v - sf[i])), 2),
        pearson: round(pearson(model, sf)),
        spearman: round(spearman(model, sf)),
    };
}
function distributionMetrics(values, clipCp) {
    const n = values.length;
    if (!n) return null;
    const pct = (pred) => round(100 * values.filter(pred).length / n, 1);
    return {
        n,
        nearZeroPct: pct((v) => Math.abs(v) <= 25),
        beyond100Pct: pct((v) => Math.abs(v) > 100),
        beyond300Pct: pct((v) => Math.abs(v) > 300),
        clampPct: pct((v) => Math.abs(v) >= clipCp),
    };
}
function byPhase(rows) {
    const out = {};
    for (const phase of ["opening", "middlegame", "endgame"]) out[phase] = accuracyMetrics(rows.filter((r) => r.phase === phase));
    return out;
}
function bySourceFamily(rows, topN = 8) {
    const groups = new Map();
    for (const r of rows) { const id = r.sourceId; (groups.get(id) || groups.set(id, []).get(id)).push(r); }
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, topN);
    const out = {};
    for (const [id, g] of sorted) out[id] = accuracyMetrics(g);
    return out;
}

// One full report block for a candidate scored against a fixed set of rows
// carrying {model, sf, phase, sourceId} plus the raw model-cp values (for
// distribution stats).
function candidateReport(rows, clipCp) {
    return {
        overall: accuracyMetrics(rows),
        byPhase: byPhase(rows),
        bySourceFamily: bySourceFamily(rows),
        distribution: distributionMetrics(rows.map((r) => r.model), clipCp),
    };
}

// ---------------- deterministic root sample + ply-1 children (no search) ----------------
function stridedSample(items, k) {
    const n = items.length;
    if (n <= k) return items.slice();
    const stride = Math.max(1, Math.floor(n / k));
    const out = [];
    for (let i = 0; i < n && out.length < k; i += stride) out.push(items[i]);
    return out;
}

async function parentChildAudit(valItems, linearModel, cfg, transformFns, rootsPerPhase) {
    const { createEngineCore, FEN } = await loadCoach();
    const byPhase = { opening: [], middlegame: [], endgame: [] };
    for (const it of valItems) if (byPhase[it.meta.phase]) byPhase[it.meta.phase].push(it);
    // Deterministic: sort by FEN string within each phase, then take an
    // even stride across the sorted list (not just the alphabetically
    // first rows).
    const roots = [];
    for (const phase of ["opening", "middlegame", "endgame"]) {
        const sorted = [...byPhase[phase]].sort((a, b) => (a.meta.fen < b.meta.fen ? -1 : 1));
        for (const it of stridedSample(sorted, rootsPerPhase)) roots.push({ phase, fen: it.meta.fen });
    }

    const deltas = { classical: [], linearRaw: [] };
    for (const name of Object.keys(transformFns)) deltas[name] = [];
    let signFlips = { classical: 0, linearRaw: 0 }, pairCount = 0;
    for (const name of Object.keys(transformFns)) signFlips[name] = 0;

    for (const root of roots) {
        const core = createEngineCore(root.fen);
        const parentClassical = core.evaluation.evaluate().total;
        const parentIdx = encodeFen(root.fen);
        const parentLinear = cpFromModel(linearModel, parentIdx, cfg);
        const parentTransformed = {};
        for (const [name, fn] of Object.entries(transformFns)) parentTransformed[name] = fn(parentLinear, root.phase);

        const legal = core.legalMoveGenerator.generateMoves();
        for (const move of legal) {
            core.board.makeMove(move);
            const childFen = FEN.export(core.board);
            const childClassical = core.evaluation.evaluate().total;
            const childIdx = encodeFen(childFen);
            const childLinear = cpFromModel(linearModel, childIdx, cfg);
            core.board.undoMove();

            deltas.classical.push(childClassical - parentClassical);
            deltas.linearRaw.push(childLinear - parentLinear);
            if (Math.sign(childClassical) !== 0 && Math.sign(parentClassical) !== 0 && Math.sign(childClassical) !== Math.sign(parentClassical)) signFlips.classical++;
            if (Math.sign(childLinear) !== 0 && Math.sign(parentLinear) !== 0 && Math.sign(childLinear) !== Math.sign(parentLinear)) signFlips.linearRaw++;

            for (const [name, fn] of Object.entries(transformFns)) {
                const childTransformed = fn(childLinear, root.phase);
                deltas[name].push(childTransformed - parentTransformed[name]);
                if (Math.sign(childTransformed) !== 0 && Math.sign(parentTransformed[name]) !== 0 && Math.sign(childTransformed) !== Math.sign(parentTransformed[name])) signFlips[name]++;
            }
            pairCount++;
        }
    }

    function stdOf(arr) {
        const n = arr.length; if (!n) return null;
        const m = mean(arr);
        return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
    }
    const out = { roots: roots.length, pairs: pairCount };
    for (const key of Object.keys(deltas)) {
        out[key] = {
            deltaMean: round(mean(deltas[key]), 2),
            deltaStd: round(stdOf(deltas[key]), 2),
            signFlipPct: round(100 * signFlips[key] / pairCount, 1),
        };
    }
    return out;
}

// ---------------- selection (validation-only) ----------------
// Explicit, stated thresholds -- the task gives qualitative criteria
// ("does not materially worsen", "reduces ... meaningfully", "moves ...
// toward"); these are the concrete numbers this analysis applies.
const MAX_CPMAE_REGRESSION_REL = 0.03;      // <=3% relative cpMAE regression vs raw linear
const MIN_VOLATILITY_REDUCTION_REL = 0.15;  // >=15% relative reduction in parent-child delta std

function selectTransform(valCandidates, valAudit) {
    const rawMAE = valCandidates.rawLinear.overall.cpMAE;
    const rawVol = valAudit.linearRaw.deltaStd;
    const classicalDist = valCandidates.classical.distribution;
    const rawDist = valCandidates.rawLinear.distribution;

    const distanceToClassical = (d) => ({
        nearZero: Math.abs(d.nearZeroPct - classicalDist.nearZeroPct),
        beyond100: Math.abs(d.beyond100Pct - classicalDist.beyond100Pct),
        beyond300: Math.abs(d.beyond300Pct - classicalDist.beyond300Pct),
    });
    const rawDistance = distanceToClassical(rawDist);

    const results = {};
    for (const name of Object.keys(TRANSFORMS)) {
        const cand = valCandidates[name];
        const audit = valAudit[name];
        const maeOk = cand.overall.cpMAE <= rawMAE * (1 + MAX_CPMAE_REGRESSION_REL);
        const volOk = audit.deltaStd <= rawVol * (1 - MIN_VOLATILITY_REDUCTION_REL);
        const dist = distanceToClassical(cand.distribution);
        const densityOk = dist.nearZero < rawDistance.nearZero
            && dist.beyond100 <= rawDistance.beyond100 + 2
            && dist.beyond300 <= rawDistance.beyond300 + 2;
        results[name] = {
            cpMAE: cand.overall.cpMAE, rawMAE, maeOk,
            deltaStd: audit.deltaStd, rawVol, volOk,
            distanceToClassical: dist, rawDistanceToClassical: rawDistance, densityOk,
            passesAll: maeOk && volOk && densityOk,
        };
    }
    const passing = Object.entries(results).filter(([, r]) => r.passesAll);
    const selected = passing.length
        ? passing.sort((a, b) => a[1].cpMAE - b[1].cpMAE)[0][0]
        : null;
    return { results, selected };
}

async function main() {
    const inPath = arg("--in");
    const modelPath = arg("--model");
    const mlpPath = arg("--mlp");
    const jsonOut = arg("--json");
    const rootsPerPhase = +arg("--roots-per-phase", "15");
    if (!inPath || !modelPath) throw new Error("--in and --model are required");

    const cfg = DEFAULT_TARGET; // { kind: "tanh", scale: 400, clipCp: 1000, mateValue: 0.999 }
    const { splits } = loadDataset(inPath, cfg, []);
    const { model: linearModel } = loadModelFile(modelPath);
    const { model: mlpModel } = mlpPath ? loadModelFile(mlpPath) : { model: null };

    function buildRows(items, transformFn) {
        return items.map((it) => {
            const linearCp = cpFromModel(linearModel, it.idx, cfg);
            const sf = sfCpOf(it.meta, cfg.clipCp);
            return {
                model: transformFn ? transformFn(linearCp, it.meta.phase) : linearCp,
                sf, phase: it.meta.phase, sourceId: it.meta.sourceId,
            };
        });
    }
    function buildMlpRows(items) {
        if (!mlpModel) return [];
        return items.map((it) => ({ model: cpFromModel(mlpModel, it.idx, cfg), sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase, sourceId: it.meta.sourceId }));
    }
    function buildClassicalRows(items) {
        return items.filter((it) => typeof it.meta.coach === "number").map((it) => ({ model: it.meta.coach, sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase, sourceId: it.meta.sourceId }));
    }

    // ---- fit all 4 transforms on VALIDATION linear-cp/sf pairs only ----
    const valLinearPairs = splits.val.map((it) => ({ cp: cpFromModel(linearModel, it.idx, cfg), sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase }));
    const fittedParams = {};
    const transformFns = {};
    for (const [name, { fit, apply }] of Object.entries(TRANSFORMS)) {
        const params = fit(valLinearPairs);
        fittedParams[name] = params;
        transformFns[name] = (cp, phase) => apply(cp, params, cfg.clipCp, phase);
    }

    // ---- validation-side candidate reports ----
    const valCandidates = {
        rawLinear: candidateReport(buildRows(splits.val, null), cfg.clipCp),
        classical: candidateReport(buildClassicalRows(splits.val), cfg.clipCp),
        mlp64: mlpModel ? candidateReport(buildMlpRows(splits.val), cfg.clipCp) : null,
    };
    for (const name of Object.keys(TRANSFORMS)) valCandidates[name] = candidateReport(buildRows(splits.val, transformFns[name]), cfg.clipCp);

    // ---- parent-child volatility audit on validation (deterministic roots) ----
    const valAudit = await parentChildAudit(splits.val, linearModel, cfg, transformFns, rootsPerPhase);

    // ---- selection (validation only) ----
    const selection = selectTransform(valCandidates, valAudit);

    // ---- touch test exactly once, for raw linear + classical + mlp64 + (if any) the selected transform ----
    const testCandidates = {
        rawLinear: candidateReport(buildRows(splits.test, null), cfg.clipCp),
        classical: candidateReport(buildClassicalRows(splits.test), cfg.clipCp),
        mlp64: mlpModel ? candidateReport(buildMlpRows(splits.test), cfg.clipCp) : null,
    };
    let testAudit = null, selectedTestCandidate = null;
    if (selection.selected) {
        const name = selection.selected;
        testCandidates[name] = candidateReport(buildRows(splits.test, transformFns[name]), cfg.clipCp);
        testAudit = await parentChildAudit(splits.test, linearModel, cfg, { [name]: transformFns[name] }, rootsPerPhase);
        selectedTestCandidate = name;
    }

    const report = {
        datasetIn: inPath, modelIn: modelPath, mlpIn: mlpPath || null,
        splitSizes: { train: splits.train.length, val: splits.val.length, test: splits.test.length },
        targetTransform: cfg, rootsPerPhase,
        fittedParams,
        thresholds: { MAX_CPMAE_REGRESSION_REL, MIN_VOLATILITY_REDUCTION_REL },
        validation: { candidates: valCandidates, parentChildAudit: valAudit, selection: selection.results },
        selected: selection.selected,
        test: selection.selected
            ? { candidates: testCandidates, parentChildAudit: testAudit }
            : { note: "no transform selected -- test not touched for any candidate transform (raw linear/classical/mlp64 test numbers reported for reference only)", candidates: testCandidates },
    };

    if (jsonOut) {
        const dir = path.dirname(path.resolve(jsonOut));
        if (!fs.existsSync(dir)) throw new Error("--json directory does not exist: " + dir);
        fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    }

    console.log("=== calibration analysis (validation-only selection) ===");
    console.log("split sizes:", report.splitSizes);
    console.log("raw linear   val cpMAE:", valCandidates.rawLinear.overall.cpMAE, " bias:", valCandidates.rawLinear.overall.bias);
    console.log("classical    val cpMAE:", valCandidates.classical.overall.cpMAE, " bias:", valCandidates.classical.overall.bias);
    if (valCandidates.mlp64) console.log("mlp64        val cpMAE:", valCandidates.mlp64.overall.cpMAE, " bias:", valCandidates.mlp64.overall.bias);
    console.log("raw linear   val parent-child delta std:", valAudit.linearRaw.deltaStd, " sign-flip%:", valAudit.linearRaw.signFlipPct);
    console.log("classical    val parent-child delta std:", valAudit.classical.deltaStd, " sign-flip%:", valAudit.classical.signFlipPct);
    for (const name of Object.keys(TRANSFORMS)) {
        const r = selection.results[name];
        console.log(`transform ${name}: val cpMAE=${r.cpMAE} (maeOk=${r.maeOk})  deltaStd=${r.deltaStd} (volOk=${r.volOk})  densityOk=${r.densityOk}  passesAll=${r.passesAll}`);
    }
    console.log("SELECTED:", selection.selected || "none (negative result)");
    if (selection.selected) {
        console.log("test cpMAE (selected transform, touched once):", testCandidates[selection.selected].overall.cpMAE);
        console.log("test parent-child delta std (selected transform):", testAudit[selection.selected].deltaStd);
    }

    return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });

export {
    main, accuracyMetrics, distributionMetrics, selectTransform, candidateReport,
    byPhase, bySourceFamily, cpFromModel, sfCpOf, loadModelFile, parentChildAudit, stridedSample,
    MAX_CPMAE_REGRESSION_REL, MIN_VOLATILITY_REDUCTION_REL,
};
