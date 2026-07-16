#!/usr/bin/env node
//======================================================
// tools/constrain-opening-calibration.mjs
// Focused re-test of the opening-intercept fix with a small, fully
// predetermined candidate menu (no grid search over an unbounded range):
//   A  zero opening intercept (keep the fitted slope)
//   B  shrink the fitted opening intercept by {0, .25, .5, .75, 1.00}
//   C  clamp the fitted opening intercept to a fixed +/-bound {10,15,20,25}
//   D  opening-only slope fit, intercept forced to 0, mid/endgame untouched
//   E  blend raw and calibrated opening output, alpha in {.25,.5,.75}
// 14 candidates total. Fitting uses VALIDATION only; test is touched once
// for the single selected candidate. Reuses lib/calibration.mjs primitives
// and the already-committed analyze-calibration.mjs / refine-phase-
// calibration.mjs helpers rather than re-deriving them.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDataset, DEFAULT_TARGET } from "../train/dataset.mjs";
import { encodeFen } from "../lib/features.mjs";
import { mean, round } from "../train/metrics.mjs";
import { mulberry32 } from "../lib/prng.mjs";
import { gamePhase } from "../lib/position.mjs";
import { loadCoach } from "../lib/coach.mjs";
import {
    PHASES, fitPhaseAffine, applyPhaseAffine,
    zeroOpeningIntercept, shrinkOpeningIntercept, clampOpeningIntercept, fitOpeningSlopeOnlyKeepOthers,
    applyPhaseAffineBlended,
} from "../lib/calibration.mjs";
import { cpFromModel, sfCpOf, loadModelFile, candidateReport } from "./analyze-calibration.mjs";
import { auditPhaseAffine, structuralGates, costBenchmark } from "./refine-phase-calibration.mjs";

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
function writeReport(report, jsonOut) {
    if (!jsonOut) return;
    const dir = path.dirname(path.resolve(jsonOut));
    if (!fs.existsSync(dir)) throw new Error("--json directory does not exist: " + dir);
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}
function percentile(arr, p) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))], 2);
}
function stdOf(arr) {
    if (!arr.length) return null;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
}

// ---------------- extended distribution: +/-10/25/50, beyond 100/300, clamp ----------------
function extendedDistribution(values, clipCp) {
    const n = values.length; if (!n) return null;
    const pct = (pred) => round(100 * values.filter(pred).length / n, 1);
    return {
        n,
        nearZero10: pct((v) => Math.abs(v) <= 10), nearZero25: pct((v) => Math.abs(v) <= 25), nearZero50: pct((v) => Math.abs(v) <= 50),
        beyond100: pct((v) => Math.abs(v) > 100), beyond300: pct((v) => Math.abs(v) > 300),
        clampPct: pct((v) => Math.abs(v) >= clipCp),
    };
}

// ---------------- parent-child audit with real phase labels (for the boundary
// audit) + p95 abs delta (for the scorecard) in one pass, per candidate ----------------
async function fullParentChildAudit(items, linearModel, cfg, transformFns, rootsPerPhase) {
    const { createEngineCore, FEN } = await loadCoach();
    function stridedSample(arr, k) {
        if (arr.length <= k) return arr.slice();
        const stride = Math.max(1, Math.floor(arr.length / k));
        const out = []; for (let i = 0; i < arr.length && out.length < k; i += stride) out.push(arr[i]);
        return out;
    }
    const byPhaseItems = { opening: [], middlegame: [], endgame: [] };
    for (const it of items) if (byPhaseItems[it.meta.phase]) byPhaseItems[it.meta.phase].push(it);
    const roots = [];
    for (const phase of PHASES) {
        const sorted = [...byPhaseItems[phase]].sort((a, b) => (a.meta.fen < b.meta.fen ? -1 : 1));
        for (const it of stridedSample(sorted, rootsPerPhase)) roots.push({ phase, fen: it.meta.fen });
    }

    const keys = ["classical", "linearRaw", ...Object.keys(transformFns)];
    const deltas = Object.fromEntries(keys.map((k) => [k, []]));
    const signFlips = Object.fromEntries(keys.map((k) => [k, 0]));
    const crossingDeltas = Object.fromEntries(keys.map((k) => [k, []])); // subset where parentPhase != childPhase
    let pairCount = 0, crossingCount = 0;
    const crossingExamples = [];

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
            const childPhase = gamePhase(childFen);
            const childClassical = core.evaluation.evaluate().total;
            const childIdx = encodeFen(childFen);
            const childLinear = cpFromModel(linearModel, childIdx, cfg);
            core.board.undoMove();

            const crossing = childPhase !== root.phase;
            const record = (key, parentVal, childVal) => {
                const d = childVal - parentVal;
                deltas[key].push(d);
                if (Math.sign(childVal) !== 0 && Math.sign(parentVal) !== 0 && Math.sign(childVal) !== Math.sign(parentVal)) signFlips[key]++;
                if (crossing) crossingDeltas[key].push(d);
                return d;
            };
            record("classical", parentClassical, childClassical);
            record("linearRaw", parentLinear, childLinear);
            const childTransformedJumps = {};
            for (const [name, fn] of Object.entries(transformFns)) {
                const childTransformed = fn(childLinear, childPhase);
                childTransformedJumps[name] = record(name, parentTransformed[name], childTransformed);
            }
            if (crossing) {
                crossingCount++;
                crossingExamples.push({ parentPhase: root.phase, childPhase, parentFen: root.fen, childFen,
                    rawJump: round(childLinear - parentLinear, 1),
                    jumps: Object.fromEntries(Object.entries(childTransformedJumps).map(([k, v]) => [k, round(v, 1)])) });
            }
            pairCount++;
        }
    }

    const out = { roots: roots.length, pairs: pairCount, crossingPairs: crossingCount, rawDeltas: deltas };
    for (const key of keys) {
        out[key] = {
            deltaMean: round(mean(deltas[key]), 2), deltaStd: round(stdOf(deltas[key]), 2),
            deltaP95Abs: percentile(deltas[key].map(Math.abs), 95),
            signFlipPct: round(100 * signFlips[key] / pairCount, 1),
        };
    }
    out.crossing = { n: crossingCount };
    for (const key of keys) {
        const abs = crossingDeltas[key].map(Math.abs);
        out.crossing[key] = { medianAbsJump: percentile(abs, 50), p95AbsJump: percentile(abs, 95), maxAbsJump: abs.length ? round(Math.max(...abs), 1) : null };
    }
    // worst examples: rank by |selected candidate jump - raw jump| if a single non-baseline key exists, else by raw jump magnitude
    const nonBaseline = Object.keys(transformFns);
    if (nonBaseline.length) {
        const key = nonBaseline[nonBaseline.length - 1];
        out.crossing.worstExamples = crossingExamples
            .slice().sort((a, b) => Math.abs(b.jumps[key] - b.rawJump) - Math.abs(a.jumps[key] - a.rawJump)).slice(0, 3);
    }
    return out;
}

// ---------------- Step 4 scorecard (6 stated criteria) ----------------
const CPMAE_IMPROVEMENT_REL = 0.03;       // criterion 1: "materially more accurate" than raw linear
const VOLATILITY_REDUCTION_REL = 0.15;    // criterion 2: "meaningful volatility reduction" (same bar as the original study's gate)
const DENSITY_REPAIR_FRACTION = 0.5;      // criterion 3: "repairs MOST of" the original deficit
const FAMILY_REGRESSION_REL = 0.10;       // criterion 4
const ENDGAME_REGRESSION_REL = 0.05;      // criterion 5

function scoreCandidate(name, cand, rawLinear, classical, originalPhaseAffine, gates, openingNearZero, volatility) {
    const c1 = { need: "materially more accurate than raw linear", value: cand.overall.cpMAE, baseline: rawLinear.overall.cpMAE,
        ok: cand.overall.cpMAE <= rawLinear.overall.cpMAE * (1 - CPMAE_IMPROVEMENT_REL) };
    const c2 = { need: "meaningful volatility reduction", value: volatility.candidate, baseline: volatility.raw,
        ok: volatility.candidate <= volatility.raw * (1 - VOLATILITY_REDUCTION_REL) };
    const deficitOriginal = Math.abs(openingNearZero.original - openingNearZero.classical);
    const deficitCandidate = Math.abs(openingNearZero.candidate - openingNearZero.classical);
    const deficitRaw = Math.abs(openingNearZero.raw - openingNearZero.classical);
    const c3 = { need: "repairs most of the opening near-zero-density loss", deficitOriginal: round(deficitOriginal, 1),
        deficitCandidate: round(deficitCandidate, 1), deficitRaw: round(deficitRaw, 1),
        ok: deficitCandidate <= (1 - DENSITY_REPAIR_FRACTION) * deficitOriginal && deficitCandidate <= deficitRaw };
    const familyRegressions = [];
    for (const [fam, rawFam] of Object.entries(rawLinear.bySourceFamily)) {
        const candFam = cand.bySourceFamily[fam];
        if (!rawFam || !candFam) continue;
        if (candFam.cpMAE > rawFam.cpMAE * (1 + FAMILY_REGRESSION_REL)) familyRegressions.push({ family: fam, rawCpMAE: rawFam.cpMAE, candCpMAE: candFam.cpMAE });
    }
    const c4 = { need: "no serious source-family regression", regressions: familyRegressions, ok: familyRegressions.length === 0 };
    const egRaw = rawLinear.byPhase.endgame.cpMAE, egCand = cand.byPhase.endgame.cpMAE;
    const c5 = { need: "does not damage endgames", rawCpMAE: egRaw, candCpMAE: egCand, ok: egCand <= egRaw * (1 + ENDGAME_REGRESSION_REL) };
    const c6 = { need: "monotonic and computationally trivial", ok: gates.pass };
    return { name, c1, c2, c3, c4, c5, c6, passesAll: c1.ok && c2.ok && c3.ok && c4.ok && c5.ok && c6.ok };
}

// ---------------- paired bootstrap: CI on the volatility DIFFERENCE ----------------
function pairedVolatilityBootstrap(rawDeltas, candDeltas, B, seed) {
    const rng = mulberry32(seed);
    const n = rawDeltas.length;
    const diffs = [];
    for (let b = 0; b < B; b++) {
        const idx = new Array(n);
        for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n);
        const rawSample = idx.map((i) => rawDeltas[i]), candSample = idx.map((i) => candDeltas[i]);
        diffs.push(stdOf(candSample) - stdOf(rawSample)); // negative = candidate less volatile
    }
    const s = diffs.slice().sort((a, b) => a - b);
    return { B, lo: round(s[Math.floor(0.025 * s.length)], 2), hi: round(s[Math.min(s.length - 1, Math.floor(0.975 * s.length))], 2), median: round(s[Math.floor(0.5 * s.length)], 2) };
}

// ---------------- Step 12 classification (this task's exact 5-option menu) ----------------
function classifyResult(selected, scorecard) {
    if (selected) return { label: "A", reason: `Candidate ${selected} satisfied all six offline gates (accuracy, volatility, opening density, family, endgame, monotonic/trivial).` };
    const nearMisses = Object.values(scorecard).filter((s) => s.c1 && s.c2 && s.c1.ok && s.c2.ok);
    if (nearMisses.length) {
        const failedGates = new Set();
        for (const s of nearMisses) for (const c of ["c3", "c4", "c5", "c6"]) if (!s[c].ok) failedGates.add(c);
        if (failedGates.size === 1) return { label: "B", reason: `Every candidate that kept the accuracy/volatility gains failed exactly one remaining gate (${[...failedGates][0]}) -- a strong near-miss.` };
        return { label: "C", reason: "Accuracy improves and some candidates cut volatility, but no single candidate makes the score landscape compatible with classical evaluation across all remaining gates." };
    }
    return { label: "D", reason: "No constrained variant preserved both the accuracy and volatility gains simultaneously; raw linear remains preferable to any calibration attempted here." };
}

async function main() {
    const inPath = arg("--in");
    const modelPath = arg("--model");
    const mlpPath = arg("--mlp");
    const jsonOut = arg("--json");
    const rootsPerPhase = +arg("--roots-per-phase", "15");
    const bootstrapN = +arg("--bootstrap-n", "1000");
    if (!inPath || !modelPath) throw new Error("--in and --model are required");

    const cfg = DEFAULT_TARGET;
    const { splits } = loadDataset(inPath, cfg, []);
    const { model: linearModel } = loadModelFile(modelPath);
    const { model: mlpModel } = mlpPath ? loadModelFile(mlpPath) : { model: null };

    function buildRows(items, transformFn) {
        return items.map((it) => ({
            model: transformFn ? transformFn(cpFromModel(linearModel, it.idx, cfg), it.meta.phase) : cpFromModel(linearModel, it.idx, cfg),
            sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase, sourceId: it.meta.sourceId,
        }));
    }
    function buildMlpRows(items) {
        if (!mlpModel) return [];
        return items.map((it) => ({ model: cpFromModel(mlpModel, it.idx, cfg), sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase, sourceId: it.meta.sourceId }));
    }
    function buildClassicalRows(items) {
        return items.filter((it) => typeof it.meta.coach === "number").map((it) => ({ model: it.meta.coach, sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase, sourceId: it.meta.sourceId }));
    }
    function fullCandidateReport(rows) {
        const c = candidateReport(rows, cfg.clipCp);
        c.extendedDistribution = extendedDistribution(rows.map((r) => r.model), cfg.clipCp);
        c.extendedDistributionOpening = extendedDistribution(rows.filter((r) => r.phase === "opening").map((r) => r.model), cfg.clipCp);
        return c;
    }

    const report = { datasetIn: inPath, modelIn: modelPath, splitSizes: { train: splits.train.length, val: splits.val.length, test: splits.test.length } };
    writeReport(report, jsonOut);

    // ---- Step 2: original phase-affine + audit ----
    const valPairs = splits.val.map((it) => ({ cp: cpFromModel(linearModel, it.idx, cfg), sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase }));
    const originalParams = fitPhaseAffine(valPairs);
    report.step2_originalParams = originalParams;
    report.step2_audit = auditPhaseAffine(valPairs, originalParams, cfg.clipCp);
    console.log("=== Step 2: original phase-affine parameters ===");
    for (const phase of PHASES) console.log(` ${phase}: output = ${originalParams[phase].a.toFixed(4)} * raw + ${originalParams[phase].b.toFixed(2)}`);
    console.log("opening breakdown:", JSON.stringify(report.step2_audit.byPhase.opening));
    writeReport(report, jsonOut);

    const rawLinearVal = fullCandidateReport(buildRows(splits.val, null));
    const classicalVal = fullCandidateReport(buildClassicalRows(splits.val));
    const mlpVal = mlpModel ? fullCandidateReport(buildMlpRows(splits.val)) : null;
    const originalPhaseAffineVal = fullCandidateReport(buildRows(splits.val, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp)));

    // ---- Step 3: exact predetermined candidate menu (14 total) ----
    const openingRows = valPairs.filter((r) => r.phase === "opening");
    const candidateParams = {};
    candidateParams.A_zeroIntercept = zeroOpeningIntercept(originalParams);
    for (const f of [0, 0.25, 0.5, 0.75, 1.0]) candidateParams[`B_shrink_${f}`] = shrinkOpeningIntercept(originalParams, f);
    for (const bound of [10, 15, 20, 25]) candidateParams[`C_clamp_${bound}`] = clampOpeningIntercept(originalParams, bound);
    candidateParams.D_slopeOnly = fitOpeningSlopeOnlyKeepOthers(originalParams, openingRows);
    const applyFns = {};
    for (const [name, params] of Object.entries(candidateParams)) applyFns[name] = (cp, phase) => applyPhaseAffine(cp, phase, params, cfg.clipCp);
    for (const alpha of [0.25, 0.5, 0.75]) {
        applyFns[`E_blend_${alpha}`] = (cp, phase) => applyPhaseAffineBlended(cp, phase, originalParams, alpha, cfg.clipCp);
        candidateParams[`E_blend_${alpha}`] = { ...originalParams, blendAlpha: alpha };
    }
    console.log("\n=== Step 3: candidate count ===", Object.keys(applyFns).length);

    function openingNearZeroPct(rows) {
        const d = extendedDistribution(rows.filter((r) => r.phase === "opening").map((r) => r.model), cfg.clipCp);
        return d ? d.nearZero25 : null;
    }
    const nearZeroBaselines = {
        raw: openingNearZeroPct(buildRows(splits.val, null)),
        classical: openingNearZeroPct(buildClassicalRows(splits.val)),
        original: openingNearZeroPct(buildRows(splits.val, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp))),
    };

    const valCandidates = {}, gateResults = {};
    for (const [name, fn] of Object.entries(applyFns)) {
        const rows = buildRows(splits.val, fn);
        valCandidates[name] = fullCandidateReport(rows);
        gateResults[name] = structuralGates(name, candidateParams[name], valCandidates[name].distribution);
    }
    report.step3_candidateParams = candidateParams;
    report.step4_gates = gateResults;
    writeReport(report, jsonOut);

    const survivors = Object.entries(gateResults).filter(([, g]) => g.pass).map(([name]) => name);
    console.log("survivors after structural gates:", survivors.length, "/", Object.keys(applyFns).length);

    // ---- parent-child audit (volatility + p95 delta) for all survivors ----
    const survivorFns = Object.fromEntries(survivors.map((name) => [name, applyFns[name]]));
    const valAudit = await fullParentChildAudit(splits.val, linearModel, cfg,
        { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp), ...survivorFns }, rootsPerPhase);
    report.step4_valAudit = valAudit;
    writeReport(report, jsonOut);

    const scorecard = {};
    for (const name of survivors) {
        const openingNearZero = { candidate: openingNearZeroPct(buildRows(splits.val, applyFns[name])), classical: nearZeroBaselines.classical, raw: nearZeroBaselines.raw, original: nearZeroBaselines.original };
        const volatility = { candidate: valAudit[name].deltaStd, raw: valAudit.linearRaw.deltaStd };
        scorecard[name] = scoreCandidate(name, valCandidates[name], rawLinearVal, classicalVal, originalPhaseAffineVal, gateResults[name], openingNearZero, volatility);
    }
    for (const [name, g] of Object.entries(gateResults)) if (!g.pass) scorecard[name] = { name, rejectedByStructuralGate: true, passesAll: false };
    report.step4_scorecard = scorecard;

    const passing = Object.entries(scorecard).filter(([, s]) => s.passesAll);
    const selected = passing.length ? passing.sort((a, b) => a[1].c1.value - b[1].c1.value)[0][0] : null;
    report.selected = selected;
    writeReport(report, jsonOut);

    console.log("\n=== Step 4: scorecard ===");
    for (const [name, s] of Object.entries(scorecard)) {
        if (s.rejectedByStructuralGate) { console.log(name, "REJECTED (structural gate)"); continue; }
        console.log(name, "cpMAE", s.c1.value, s.c1.ok ? "OK" : "FAIL",
            " vol", s.c2.value, s.c2.ok ? "OK" : "FAIL",
            " density(cand/orig/raw)", s.c3.deficitCandidate, s.c3.deficitOriginal, s.c3.deficitRaw, s.c3.ok ? "OK" : "FAIL",
            " family", s.c4.ok ? "OK" : "FAIL", " endgame", s.c5.ok ? "OK" : "FAIL",
            " => ", s.passesAll ? "PASS ALL" : "reject");
    }
    console.log("\nSELECTED:", selected || "none");

    // ---- Step 5: boundary audit already computed inside valAudit.crossing; surface it ----
    report.step5_boundary = valAudit.crossing;
    writeReport(report, jsonOut);

    // ---- Step 6: touch test once ----
    const testCandidates = {
        rawLinear: fullCandidateReport(buildRows(splits.test, null)),
        classical: fullCandidateReport(buildClassicalRows(splits.test)),
        mlp64: mlpModel ? fullCandidateReport(buildMlpRows(splits.test)) : null,
        originalPhaseAffine: fullCandidateReport(buildRows(splits.test, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp))),
    };
    if (selected) testCandidates[selected] = fullCandidateReport(buildRows(splits.test, applyFns[selected]));
    const testAuditFns = selected
        ? { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp), [selected]: applyFns[selected] }
        : { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp) };
    const testAudit = await fullParentChildAudit(splits.test, linearModel, cfg, testAuditFns, rootsPerPhase);
    report.step6_test = { candidates: testCandidates, audit: { ...testAudit, rawDeltas: undefined } }; // rawDeltas kept out of the written report body (used only for the bootstrap below)
    writeReport(report, jsonOut);

    // ---- Step 6 bootstrap CIs (overall/opening/endgame cpMAE + paired volatility difference) ----
    const bootstrap = testBootstrap(splits.test, linearModel, cfg, originalParams, selected, applyFns, bootstrapN);
    if (selected) {
        bootstrap.volatilityDifference = pairedVolatilityBootstrap(testAudit.rawDeltas.linearRaw, testAudit.rawDeltas[selected], bootstrapN, 20260715);
    }
    report.step6_bootstrap = bootstrap;
    writeReport(report, jsonOut);

    // ---- Step 7: cost ----
    report.step7_cost = costBenchmark(originalParams, selected ? applyFns[selected] : null, selected ? candidateParams[selected] : null);
    writeReport(report, jsonOut);

    // ---- classification ----
    report.classification = classifyResult(selected, scorecard);
    writeReport(report, jsonOut);

    console.log("\n=== FINAL ===");
    console.log("selected:", selected || "none");
    console.log("classification:", report.classification.label, "-", report.classification.reason);
    return report;
}

function testBootstrap(testItems, linearModel, cfg, originalParams, selectedName, applyFns, B) {
    const rng = mulberry32(20260715);
    const rawCp = testItems.map((it) => cpFromModel(linearModel, it.idx, cfg));
    const sf = testItems.map((it) => sfCpOf(it.meta, cfg.clipCp));
    const phase = testItems.map((it) => it.meta.phase);
    const original = rawCp.map((cp, i) => applyPhaseAffine(cp, phase[i], originalParams, cfg.clipCp));
    const selected = selectedName ? rawCp.map((cp, i) => applyFns[selectedName](cp, phase[i])) : null;
    const n = testItems.length;

    function resampleIdx() { const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n); return idx; }
    function maeAt(values, idx, filterPhase) {
        const use = filterPhase ? idx.filter((i) => phase[i] === filterPhase) : idx;
        if (!use.length) return null;
        let s = 0; for (const i of use) s += Math.abs(values[i] - sf[i]); return s / use.length;
    }
    function ci(arr) { const s = arr.filter((v) => v != null).sort((a, b) => a - b); if (!s.length) return null; return { lo: round(s[Math.floor(0.025 * s.length)], 2), hi: round(s[Math.min(s.length - 1, Math.floor(0.975 * s.length))], 2), median: round(s[Math.floor(0.5 * s.length)], 2) }; }

    const buckets = { rawOverall: [], rawOpening: [], rawEndgame: [], origOverall: [], origOpening: [], origEndgame: [], selOverall: [], selOpening: [], selEndgame: [] };
    for (let b = 0; b < B; b++) {
        const idx = resampleIdx();
        buckets.rawOverall.push(maeAt(rawCp, idx)); buckets.rawOpening.push(maeAt(rawCp, idx, "opening")); buckets.rawEndgame.push(maeAt(rawCp, idx, "endgame"));
        buckets.origOverall.push(maeAt(original, idx)); buckets.origOpening.push(maeAt(original, idx, "opening")); buckets.origEndgame.push(maeAt(original, idx, "endgame"));
        if (selected) { buckets.selOverall.push(maeAt(selected, idx)); buckets.selOpening.push(maeAt(selected, idx, "opening")); buckets.selEndgame.push(maeAt(selected, idx, "endgame")); }
    }
    const out = {
        B,
        overallCpMAE: { rawLinear: ci(buckets.rawOverall), originalPhaseAffine: ci(buckets.origOverall) },
        openingCpMAE: { rawLinear: ci(buckets.rawOpening), originalPhaseAffine: ci(buckets.origOpening) },
        endgameCpMAE: { rawLinear: ci(buckets.rawEndgame), originalPhaseAffine: ci(buckets.origEndgame) },
    };
    if (selected) { out.overallCpMAE.selected = ci(buckets.selOverall); out.openingCpMAE.selected = ci(buckets.selOpening); out.endgameCpMAE.selected = ci(buckets.selEndgame); }
    // Note: the paired volatility-difference bootstrap is computed by the caller
    // (main()) directly from fullParentChildAudit's rawDeltas, since it needs
    // index-aligned per-pair deltas rather than the flat cp arrays used here.
    return out;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });

export { main, extendedDistribution, fullParentChildAudit, scoreCandidate, pairedVolatilityBootstrap, classifyResult };
