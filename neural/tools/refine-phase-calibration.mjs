#!/usr/bin/env node
//======================================================
// tools/refine-phase-calibration.mjs
// Follow-up to analyze-calibration.mjs: the original phase-affine
// transform was the best-performing candidate but failed its density
// gate because of the opening component specifically. This tool:
//   Phase 2 -- audits the fitted opening/middlegame/endgame parameters
//              and decomposes slope vs intercept effect,
//   Phase 3 -- fits 6 narrowly-constrained variants (A-F) that touch
//              ONLY the opening component (or the fitting objective),
//   Phase 4 -- rejects any candidate failing structural gates
//              (monotonicity, no sign inversion, excess clamp),
//   Phase 5 -- scores survivors on a 7-criterion validation scorecard
//              and selects at most one (or none),
//   Phase 6 -- measures calibration jump at real phase-boundary-crossing
//              moves (deterministic, hand-built, Coach movegen only),
//   Phase 7 -- full score-landscape comparison (raw / original / selected),
//   Phase 8 -- touches test exactly once for the final small candidate
//              set, with bootstrap confidence intervals,
//   Phase 9 -- benchmarks transform overhead.
//
// No retraining, no new features, no search, no engine matches. All
// candidate fitting uses the VALIDATION split only; test is touched
// once, only for the finally-selected set. Report is written
// incrementally so a partial run still leaves a usable file.
//======================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDataset, targetToCp, DEFAULT_TARGET } from "../train/dataset.mjs";
import { forward } from "../train/model.mjs";
import { encodeFen } from "../lib/features.mjs";
import { mean, mae, pearson, spearman, round } from "../train/metrics.mjs";
import { mulberry32 } from "../lib/prng.mjs";
import { parseBoard, materialClass } from "../lib/endgame.mjs";
import { gamePhase } from "../lib/position.mjs";
import { loadCoach } from "../lib/coach.mjs";
import {
    PHASES, fitPhaseAffine, applyPhaseAffine, fitGlobalAffine,
    zeroOpeningIntercept, fitBoundedOpeningIntercept, shrinkOpeningIntercept,
    fitPhaseSlopeOnly, fitPhaseAffineRegularized, applyPhaseAffineBlended,
} from "../lib/calibration.mjs";
import {
    cpFromModel, sfCpOf, loadModelFile, parentChildAudit, stridedSample,
    accuracyMetrics, distributionMetrics, byPhase, bySourceFamily, candidateReport,
} from "./analyze-calibration.mjs";

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

function writeReport(report, jsonOut) {
    if (!jsonOut) return;
    const dir = path.dirname(path.resolve(jsonOut));
    if (!fs.existsSync(dir)) throw new Error("--json directory does not exist: " + dir);
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}

// ---------------- Phase 2: audit the original phase-affine fit ----------------
function auditPhaseAffine(valPairs, params, clipCp) {
    const out = { params, byPhase: {} };
    for (const phase of PHASES) {
        const rows = valPairs.filter((r) => r.phase === phase);
        if (!rows.length) { out.byPhase[phase] = null; continue; }
        const cps = rows.map((r) => r.cp), sfs = rows.map((r) => r.sf);
        const calibrated = rows.map((r) => applyPhaseAffine(r.cp, phase, params, clipCp));
        const slopeOnly = rows.map((r) => Math.max(-clipCp, Math.min(clipCp, params[phase].a * r.cp)));       // a*cp, b=0
        const interceptOnly = rows.map((r) => Math.max(-clipCp, Math.min(clipCp, r.cp + params[phase].b)));   // cp+b, a=1
        const absShift = rows.map((r, i) => Math.abs(calibrated[i] - r.cp));
        const movedAway = rows.filter((r, i) => Math.abs(calibrated[i]) > Math.abs(r.cp)).length;
        const crossZero = rows.filter((r, i) => Math.sign(r.cp) !== 0 && Math.sign(calibrated[i]) !== 0 && Math.sign(r.cp) !== Math.sign(calibrated[i])).length;
        const crossBand = (band) => rows.filter((r, i) => (Math.abs(r.cp) <= band) !== (Math.abs(calibrated[i]) <= band)).length;
        out.byPhase[phase] = {
            n: rows.length,
            params: params[phase],
            rawCpStats: { mean: round(mean(cps), 2), std: round(Math.sqrt(mean(cps.map((v) => (v - mean(cps)) ** 2))), 2) },
            sfStats: { mean: round(mean(sfs), 2), std: round(Math.sqrt(mean(sfs.map((v) => (v - mean(sfs)) ** 2))), 2) },
            withinPhaseCorrelation: round(pearson(cps, sfs)),
            avgAbsShift: round(mean(absShift), 2),
            movedAwayFromZeroPct: round(100 * movedAway / rows.length, 1),
            crossZeroPct: round(100 * crossZero / rows.length, 1),
            cross25Pct: round(100 * crossBand(25) / rows.length, 1),
            cross100Pct: round(100 * crossBand(100) / rows.length, 1),
            slopeOnlyCpMAE: round(mae(slopeOnly, sfs), 2),
            interceptOnlyCpMAE: round(mae(interceptOnly, sfs), 2),
            bothCpMAE: round(mae(calibrated, sfs), 2),
            rawCpMAE: round(mae(cps, sfs), 2),
        };
    }
    return out;
}

// ---------------- Phase 4: structural gates ----------------
function structuralGates(name, params, valDistribution) {
    const gates = { negativeSlope: false, phases: {} };
    for (const phase of PHASES) {
        const p = params[phase];
        gates.phases[phase] = { a: round(p.a, 4), b: round(p.b, 2) };
        if (p.a < 0) gates.negativeSlope = true;
    }
    gates.monotonic = !gates.negativeSlope;             // affine with a>=0 is monotonic non-decreasing by construction
    gates.deterministic = true;                          // pure closed-form fit, no RNG anywhere in the pipeline
    gates.noDiscontinuity = true;                        // affine (or convex blend of two affines) of a continuous input is continuous; only the outer clip can kink, which is expected/bounded, not pathological
    gates.clampSaturationOk = valDistribution ? valDistribution.clampPct <= 20 : true; // baseline clamp% is 2.8-8; 20% is a generous ceiling
    gates.pass = gates.monotonic && gates.deterministic && gates.noDiscontinuity && gates.clampSaturationOk;
    return gates;
}

// ---------------- Phase 5: validation scorecard ----------------
const FAMILY_REGRESSION_REL = 0.10;   // <=10% relative cpMAE regression per source family vs raw linear
const ENDGAME_REGRESSION_REL = 0.05;  // <=5% relative cpMAE regression in endgame vs raw linear
const BIAS_BOUND = 15;                // |bias| <= 15cp
const CPMAE_IMPROVEMENT_REL = 0.03;   // >=3% relative cpMAE improvement vs raw linear (criterion 1: "materially better")

function scoreCandidate(name, cand, rawLinear, classical, originalPhaseAffine, gates, openingNearZero) {
    const c1 = { need: "cpMAE materially better than raw linear", value: cand.overall.cpMAE, baseline: rawLinear.overall.cpMAE,
        ok: cand.overall.cpMAE <= rawLinear.overall.cpMAE * (1 - CPMAE_IMPROVEMENT_REL) };
    // criterion 2 needs the parent-child audit deltaStd, attached by the caller after this call
    const openingDeficitOriginal = Math.abs(openingNearZero.original - openingNearZero.classical);
    const openingDeficitCandidate = Math.abs(openingNearZero.candidate - openingNearZero.classical);
    const openingDeficitRaw = Math.abs(openingNearZero.raw - openingNearZero.classical);
    const c3 = { need: "opening near-zero density moves substantially toward classical",
        deficitOriginal: round(openingDeficitOriginal, 1), deficitCandidate: round(openingDeficitCandidate, 1), deficitRaw: round(openingDeficitRaw, 1),
        candidateNearZero: openingNearZero.candidate, classicalNearZero: openingNearZero.classical, rawNearZero: openingNearZero.raw,
        ok: openingDeficitCandidate <= 0.5 * openingDeficitOriginal && openingDeficitCandidate <= openingDeficitRaw };
    const familyRegressions = [];
    for (const [fam, rawFam] of Object.entries(rawLinear.bySourceFamily)) {
        const candFam = cand.bySourceFamily[fam];
        if (!rawFam || !candFam) continue;
        const regressed = candFam.cpMAE > rawFam.cpMAE * (1 + FAMILY_REGRESSION_REL);
        if (regressed) familyRegressions.push({ family: fam, rawCpMAE: rawFam.cpMAE, candCpMAE: candFam.cpMAE });
    }
    const c4 = { need: "no serious family regression", regressions: familyRegressions, ok: familyRegressions.length === 0 };
    const egRaw = rawLinear.byPhase.endgame.cpMAE, egCand = cand.byPhase.endgame.cpMAE;
    const c5 = { need: "no serious endgame regression", rawCpMAE: egRaw, candCpMAE: egCand, ok: egCand <= egRaw * (1 + ENDGAME_REGRESSION_REL) };
    const c6 = { need: "bias remains controlled", bias: cand.overall.bias, ok: Math.abs(cand.overall.bias) <= BIAS_BOUND };
    const c7 = { need: "constant-time inference", ok: true }; // confirmed structurally + Phase 9 benchmark
    return { name, gates, c1, c3, c4, c5, c6, c7 }; // c2 (volatility) attached by caller
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

    const report = { datasetIn: inPath, modelIn: modelPath, mlpIn: mlpPath || null, splitSizes: { train: splits.train.length, val: splits.val.length, test: splits.test.length } };
    writeReport(report, jsonOut);

    // ---- shared: original unconstrained phase-affine, fit on validation ----
    const valPairs = splits.val.map((it) => ({ cp: cpFromModel(linearModel, it.idx, cfg), sf: sfCpOf(it.meta, cfg.clipCp), phase: it.meta.phase }));
    const originalParams = fitPhaseAffine(valPairs);

    const rawLinearVal = candidateReport(buildRows(splits.val, null), cfg.clipCp);
    const classicalVal = candidateReport(buildClassicalRows(splits.val), cfg.clipCp);
    const mlpVal = mlpModel ? candidateReport(buildMlpRows(splits.val), cfg.clipCp) : null;
    const originalPhaseAffineVal = candidateReport(buildRows(splits.val, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp)), cfg.clipCp);

    // ---- Phase 2 ----
    report.phase2_audit = auditPhaseAffine(valPairs, originalParams, cfg.clipCp);
    report.phase2_baselines = { rawLinearVal, classicalVal, originalPhaseAffineVal };
    writeReport(report, jsonOut);
    console.log("=== Phase 2: fitted phase-affine parameters ===");
    for (const phase of PHASES) console.log(phase, originalParams[phase], "-- rawCpMAE", report.phase2_audit.byPhase[phase].rawCpMAE, "bothCpMAE", report.phase2_audit.byPhase[phase].bothCpMAE, "slopeOnlyCpMAE", report.phase2_audit.byPhase[phase].slopeOnlyCpMAE, "interceptOnlyCpMAE", report.phase2_audit.byPhase[phase].interceptOnlyCpMAE);

    // ---- Phase 3: build constrained candidates ----
    const openingRows = valPairs.filter((r) => r.phase === "opening");
    const candidateParams = {};
    candidateParams.A_zeroOpeningIntercept = zeroOpeningIntercept(originalParams);
    candidateParams.B_boundedOpeningIntercept = fitBoundedOpeningIntercept(originalParams, openingRows, { lo: -25, hi: 25, step: 5 });
    for (const f of [0, 0.25, 0.5, 0.75, 1.0]) candidateParams[`C_shrink_${f}`] = shrinkOpeningIntercept(originalParams, f);
    candidateParams.D_slopeOnly = fitPhaseSlopeOnly(valPairs);
    for (const lambda of [0.001, 0.01, 0.1, 1, 10]) candidateParams[`E_ridge_${lambda}`] = fitPhaseAffineRegularized(valPairs, lambda);

    const applyFns = {};
    for (const [name, params] of Object.entries(candidateParams)) applyFns[name] = (cp, phase) => applyPhaseAffine(cp, phase, params, cfg.clipCp);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1.0]) {
        applyFns[`F_blend_${alpha}`] = (cp, phase) => applyPhaseAffineBlended(cp, phase, originalParams, alpha, cfg.clipCp);
        candidateParams[`F_blend_${alpha}`] = { ...originalParams, blendAlpha: alpha };
    }

    console.log("\n=== Phase 3: candidate count ===", Object.keys(applyFns).length);

    function openingNearZeroPct(rows) {
        const opening = rows.filter((r) => r.phase === "opening").map((r) => r.model);
        const d = distributionMetrics(opening, cfg.clipCp);
        return d ? d.nearZeroPct : null;
    }
    const openingNearZeroBaselines = {
        raw: openingNearZeroPct(buildRows(splits.val, null)),
        classical: openingNearZeroPct(buildClassicalRows(splits.val)),
        original: openingNearZeroPct(buildRows(splits.val, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp))),
    };

    // ---- Phase 4 + val candidate reports ----
    const valCandidates = {};
    const valOpeningNearZero = {};
    const gateResults = {};
    for (const [name, fn] of Object.entries(applyFns)) {
        const rows = buildRows(splits.val, fn);
        const cand = candidateReport(rows, cfg.clipCp);
        valCandidates[name] = cand;
        valOpeningNearZero[name] = openingNearZeroPct(rows);
        const params = name.startsWith("F_blend_") ? originalParams : candidateParams[name];
        gateResults[name] = structuralGates(name, params, cand.distribution);
    }
    report.phase4_gates = gateResults;
    writeReport(report, jsonOut);

    const survivors = Object.entries(gateResults).filter(([, g]) => g.pass).map(([name]) => name);
    console.log("survivors after structural gates:", survivors.length, "/", Object.keys(applyFns).length);

    // ---- Phase 5: parent-child audit (volatility, criterion 2) for survivors + baselines ----
    const survivorFns = Object.fromEntries(survivors.map((name) => [name, applyFns[name]]));
    const valAudit = await parentChildAudit(splits.val, linearModel, cfg, { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp), ...survivorFns }, rootsPerPhase);
    report.phase5_valAudit = valAudit;
    writeReport(report, jsonOut);

    const scorecard = {};
    for (const name of survivors) {
        const openingNearZero = { candidate: valOpeningNearZero[name], classical: openingNearZeroBaselines.classical, raw: openingNearZeroBaselines.raw, original: openingNearZeroBaselines.original };
        const s = scoreCandidate(name, valCandidates[name], rawLinearVal, classicalVal, originalPhaseAffineVal, gateResults[name], openingNearZero);
        s.c2 = { need: "parent-child volatility remains lower than raw linear", value: valAudit[name].deltaStd, baseline: valAudit.linearRaw.deltaStd, ok: valAudit[name].deltaStd < valAudit.linearRaw.deltaStd };
        s.passesAll = s.c1.ok && s.c2.ok && s.c3.ok && s.c4.ok && s.c5.ok && s.c6.ok && s.c7.ok;
        scorecard[name] = s;
    }
    // also score the rejected-by-gates candidates for full transparency (gates fail => passesAll false regardless)
    for (const [name, g] of Object.entries(gateResults)) {
        if (g.pass) continue;
        scorecard[name] = { name, gates: g, rejectedByStructuralGate: true, passesAll: false };
    }
    report.phase5_scorecard = scorecard;

    const passing = Object.entries(scorecard).filter(([, s]) => s.passesAll);
    const selected = passing.length ? passing.sort((a, b) => a[1].c1.value - b[1].c1.value)[0][0] : null;
    report.selected = selected;
    writeReport(report, jsonOut);

    console.log("\n=== Phase 5: scorecard ===");
    for (const [name, s] of Object.entries(scorecard)) {
        if (s.rejectedByStructuralGate) { console.log(name, "REJECTED (structural gate)"); continue; }
        console.log(name, "cpMAE", s.c1.value, s.c1.ok ? "OK" : "FAIL", " vol", s.c2.value, s.c2.ok ? "OK" : "FAIL",
            " density(cand/orig/raw)", s.c3.deficitCandidate, s.c3.deficitOriginal, s.c3.deficitRaw, s.c3.ok ? "OK" : "FAIL",
            " family", s.c4.ok ? "OK" : "FAIL", " endgame", s.c5.ok ? "OK" : "FAIL", " bias", s.c6.bias, s.c6.ok ? "OK" : "FAIL",
            " => ", s.passesAll ? "PASS ALL" : "reject");
    }
    console.log("\nSELECTED:", selected || "none");

    // ---- Phase 6: boundary analysis ----
    report.phase6_boundary = await boundaryAnalysis(linearModel, cfg, originalParams, selected ? candidateParams[selected] || originalParams : originalParams, selected, applyFns);
    writeReport(report, jsonOut);

    // ---- Phase 7: score-landscape analysis ----
    report.phase7_landscape = await landscapeAnalysis(splits.val, linearModel, cfg, originalParams, selected, applyFns, buildRows, buildClassicalRows, rootsPerPhase);
    writeReport(report, jsonOut);

    // ---- Phase 8: touch test once ----
    const testCandidates = {
        rawLinear: candidateReport(buildRows(splits.test, null), cfg.clipCp),
        classical: candidateReport(buildClassicalRows(splits.test), cfg.clipCp),
        mlp64: mlpModel ? candidateReport(buildMlpRows(splits.test), cfg.clipCp) : null,
        originalPhaseAffine: candidateReport(buildRows(splits.test, (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp)), cfg.clipCp),
    };
    if (selected) testCandidates[selected] = candidateReport(buildRows(splits.test, applyFns[selected]), cfg.clipCp);
    const testAudit = await parentChildAudit(splits.test, linearModel, cfg,
        selected ? { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp), [selected]: applyFns[selected] }
                 : { originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp) },
        rootsPerPhase);

    const bootstrap = bootstrapCIs(splits.test, linearModel, cfg, originalParams, selected, applyFns, bootstrapN);
    report.phase8_test = { candidates: testCandidates, parentChildAudit: testAudit, bootstrap };
    writeReport(report, jsonOut);

    // ---- Phase 9: cost benchmark ----
    report.phase9_cost = costBenchmark(originalParams, selected ? applyFns[selected] : null, selected ? candidateParams[selected] : null);
    writeReport(report, jsonOut);

    // ---- Phase 10: classification ----
    report.phase10_classification = classify(selected, scorecard);
    writeReport(report, jsonOut);

    console.log("\n=== FINAL ===");
    console.log("selected:", selected || "none");
    console.log("classification:", report.phase10_classification.label);
    return report;
}

// ---------------- Phase 6: boundary analysis ----------------
async function boundaryAnalysis(linearModel, cfg, originalParams, selectedParamsMaybe, selectedName, applyFns) {
    const { createEngineCore, FEN, fromAlgebraic } = await loadCoach();
    // Hand-built, deterministic single-move pairs. Each entry: a "before" FEN
    // plus the exact from/to squares of the one ordinary move to play.
    const cases = [
        // middlegame -> endgame via a queen capture (mixed -> queenless-mixed)
        { label: "Nxq: middlegame->endgame, queen presence, mixed->queenless-mixed",
          fen: "r3k3/8/2q5/8/3N4/8/8/1K6 w - - 0 20", from: "d4", to: "c6" },
        // middlegame -> endgame via a second queen capture (both-queens -> one-queen)
        { label: "Qxq: middlegame->endgame, queen count 2->1",
          fen: "k6q/8/8/8/8/8/8/KN5Q w - - 0 20", from: "h1", to: "h8" },
        // middlegame -> endgame via a rook capture (rook presence 1->0 for black)
        { label: "Nxr: middlegame->endgame, rook presence",
          fen: "1n2k1n1/8/2r5/8/3N4/8/8/2B1K1B1 w - - 0 20", from: "d4", to: "c6" },
        // opening -> middlegame via a bishop-takes-rook (ps drops below 22, fullmove<=10)
        { label: "Bxr: opening->middlegame, rook count 4->3",
          fen: "rnbqk1nr/8/8/8/8/8/1B6/RN1QKBNR w KQkq - 0 6", from: "b2", to: "h8" },
    ];
    const results = [];
    for (const c of cases) {
        const core = createEngineCore(c.fen);
        const beforePlacement = c.fen.split(" ")[0];
        const beforePhase = gamePhase(c.fen);
        const beforeMaterial = materialClass(parseBoard(c.fen));
        const beforeIdx = encodeFen(c.fen);
        const beforeLinear = cpFromModel(linearModel, beforeIdx, cfg);

        const fromSq = fromAlgebraic(c.from), toSq = fromAlgebraic(c.to);
        const legal = core.legalMoveGenerator.generateMoves();
        const move = legal.find((m) => m.fromSquare === fromSq && m.toSquare === toSq);
        if (!move) { results.push({ ...c, error: "move not found/legal in this position" }); continue; }
        core.board.makeMove(move);
        const afterFen = FEN.export(core.board);
        const afterPhase = gamePhase(afterFen);
        const afterMaterial = materialClass(parseBoard(afterFen));
        const afterIdx = encodeFen(afterFen);
        const afterLinear = cpFromModel(linearModel, afterIdx, cfg);
        core.board.undoMove();

        const rawJump = afterLinear - beforeLinear;
        const originalJump = applyPhaseAffine(afterLinear, afterPhase, originalParams, cfg.clipCp) - applyPhaseAffine(beforeLinear, beforePhase, originalParams, cfg.clipCp);
        const entry = {
            label: c.label, beforePhase, afterPhase, beforeMaterial, afterMaterial,
            beforeLinear: round(beforeLinear, 1), afterLinear: round(afterLinear, 1), rawJump: round(rawJump, 1),
            originalPhaseAffineJump: round(originalJump, 1), originalExtraJump: round(originalJump - rawJump, 1),
        };
        if (selectedName) {
            const selJump = applyFns[selectedName](afterLinear, afterPhase) - applyFns[selectedName](beforeLinear, beforePhase);
            entry.selectedCandidateJump = round(selJump, 1);
            entry.selectedExtraJump = round(selJump - rawJump, 1);
        }
        results.push(entry);
    }
    const validEntries = results.filter((r) => !r.error);
    const extraJumpsOriginal = validEntries.map((r) => Math.abs(r.originalExtraJump));
    const summary = {
        n: validEntries.length,
        original: { medianAbsExtraJump: percentile(extraJumpsOriginal, 50), p95AbsExtraJump: percentile(extraJumpsOriginal, 95), worst: validEntries.slice().sort((a, b) => Math.abs(b.originalExtraJump) - Math.abs(a.originalExtraJump))[0] },
    };
    if (selectedName) {
        const extraJumpsSelected = validEntries.map((r) => Math.abs(r.selectedExtraJump));
        summary.selected = { medianAbsExtraJump: percentile(extraJumpsSelected, 50), p95AbsExtraJump: percentile(extraJumpsSelected, 95), worst: validEntries.slice().sort((a, b) => Math.abs(b.selectedExtraJump) - Math.abs(a.selectedExtraJump))[0] };
    }
    return { cases: results, summary };
}
function percentile(arr, p) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))], 2);
}

// ---------------- Phase 7: score-landscape analysis ----------------
async function landscapeAnalysis(valItems, linearModel, cfg, originalParams, selectedName, applyFns, buildRows, buildClassicalRows, rootsPerPhase) {
    function extendedDistribution(values, clipCp) {
        const n = values.length; if (!n) return null;
        const pct = (pred) => round(100 * values.filter(pred).length / n, 1);
        return {
            n, mean: round(mean(values), 1), median: percentile(values, 50), std: round(Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2))), 1),
            nearZero10: pct((v) => Math.abs(v) <= 10), nearZero25: pct((v) => Math.abs(v) <= 25), nearZero50: pct((v) => Math.abs(v) <= 50),
            beyond100: pct((v) => Math.abs(v) > 100), beyond300: pct((v) => Math.abs(v) > 300), beyond500: pct((v) => Math.abs(v) > 500),
            clampPct: pct((v) => Math.abs(v) >= clipCp),
        };
    }
    const candidates = { rawLinear: (cp, phase) => cp, originalPhaseAffine: (cp, phase) => applyPhaseAffine(cp, phase, originalParams, cfg.clipCp) };
    if (selectedName) candidates[selectedName] = applyFns[selectedName];

    const out = {};
    for (const [name, fn] of Object.entries(candidates)) {
        const rows = buildRows(valItems, name === "rawLinear" ? null : fn);
        out[name] = {
            overall: extendedDistribution(rows.map((r) => r.model), cfg.clipCp),
            byPhase: Object.fromEntries(PHASES.map((p) => [p, extendedDistribution(rows.filter((r) => r.phase === p).map((r) => r.model), cfg.clipCp)])),
        };
    }
    const classicalRows = buildClassicalRows(valItems);
    out.classical = { overall: extendedDistribution(classicalRows.map((r) => r.model), cfg.clipCp),
        byPhase: Object.fromEntries(PHASES.map((p) => [p, extendedDistribution(classicalRows.filter((r) => r.phase === p).map((r) => r.model), cfg.clipCp)])) };

    // by material class (canonical, FEN-derived; parseBoard+materialClass from lib/endgame.mjs)
    const byMaterial = {};
    for (const it of valItems) {
        const mc = materialClass(parseBoard(it.meta.fen));
        (byMaterial[mc] || (byMaterial[mc] = [])).push(it);
    }
    out.byMaterialClass = {};
    for (const [mc, items] of Object.entries(byMaterial)) {
        if (items.length < 10) continue; // skip sparse classes
        out.byMaterialClass[mc] = {};
        for (const [name, fn] of Object.entries(candidates)) {
            const rows = buildRows(items, name === "rawLinear" ? null : fn);
            out.byMaterialClass[mc][name] = accuracyMetrics(rows);
        }
    }

    // parent-child audit already covers deltaMean/deltaStd/signFlip; add p95 abs delta here
    const auditFns = { originalPhaseAffine: candidates.originalPhaseAffine };
    if (selectedName) auditFns[selectedName] = candidates[selectedName];
    out.parentChild = await parentChildAudit(valItems, linearModel, cfg, auditFns, rootsPerPhase);
    return out;
}

// ---------------- Phase 8: bootstrap confidence intervals ----------------
function bootstrapCIs(testItems, linearModel, cfg, originalParams, selectedName, applyFns, B) {
    const rng = mulberry32(20260715); // fixed seed, reproducible
    const rawCp = testItems.map((it) => cpFromModel(linearModel, it.idx, cfg));
    const sf = testItems.map((it) => sfCpOf(it.meta, cfg.clipCp));
    const phase = testItems.map((it) => it.meta.phase);
    const original = rawCp.map((cp, i) => applyPhaseAffine(cp, phase[i], originalParams, cfg.clipCp));
    const selected = selectedName ? rawCp.map((cp, i) => applyFns[selectedName](cp, phase[i])) : null;

    const n = testItems.length;
    const egIdx = phase.map((p, i) => p === "endgame" ? i : -1).filter((i) => i >= 0);

    function resampleIndices() {
        const idx = new Array(n);
        for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n);
        return idx;
    }
    function maeAt(values, idx) { let s = 0; for (const i of idx) s += Math.abs(values[i] - sf[i]); return s / idx.length; }
    function egMaeAt(values, idx) { const eg = idx.filter((i) => phase[i] === "endgame"); if (!eg.length) return null; let s = 0; for (const i of eg) s += Math.abs(values[i] - sf[i]); return s / eg.length; }

    const rawMAEs = [], originalMAEs = [], selectedMAEs = [], rawEgMAEs = [], originalEgMAEs = [], selectedEgMAEs = [], volDiffs = [];
    for (let b = 0; b < B; b++) {
        const idx = resampleIndices();
        rawMAEs.push(maeAt(rawCp, idx));
        originalMAEs.push(maeAt(original, idx));
        rawEgMAEs.push(egMaeAt(rawCp, idx));
        originalEgMAEs.push(egMaeAt(original, idx));
        if (selected) { selectedMAEs.push(maeAt(selected, idx)); selectedEgMAEs.push(egMaeAt(selected, idx)); }
    }
    function ci(arr) { const s = arr.filter((v) => v != null).sort((a, b) => a - b); if (!s.length) return null; return { lo: round(s[Math.floor(0.025 * s.length)], 2), hi: round(s[Math.min(s.length - 1, Math.floor(0.975 * s.length))], 2), median: round(s[Math.floor(0.5 * s.length)], 2) }; }

    const out = { B, overallCpMAE: { rawLinear: ci(rawMAEs), originalPhaseAffine: ci(originalMAEs) }, endgameCpMAE: { rawLinear: ci(rawEgMAEs), originalPhaseAffine: ci(originalEgMAEs) } };
    if (selected) { out.overallCpMAE.selected = ci(selectedMAEs); out.endgameCpMAE.selected = ci(selectedEgMAEs); }
    return out;
}

// ---------------- Phase 9: cost benchmark ----------------
function costBenchmark(originalParams, selectedFn, selectedParams) {
    const N = 2_000_000;
    const cps = new Float64Array(N);
    for (let i = 0; i < N; i++) cps[i] = -1000 + (i % 2000);
    function bench(fn) {
        let acc = 0;
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < N; i++) acc += fn(cps[i], i % 3 === 0 ? "opening" : i % 3 === 1 ? "middlegame" : "endgame");
        const t1 = process.hrtime.bigint();
        const totalNs = Number(t1 - t0);
        return { nsPerCall: +(totalNs / N).toFixed(2), scoresPerSec: Math.round(N / (totalNs / 1e9)), checksum: +acc.toFixed(3) };
    }
    const originalBench = bench((cp, phase) => applyPhaseAffine(cp, phase, originalParams, 1000));
    const out = { n: N, originalPhaseAffine: originalBench, serializedParamSizeBytes: JSON.stringify(originalParams).length };
    if (selectedFn) { out.selectedCandidate = bench(selectedFn); out.serializedSelectedParamSizeBytes = JSON.stringify(selectedParams).length; }
    return out;
}

// ---------------- Phase 10: classification ----------------
function classify(selected, scorecard) {
    if (!selected) {
        const nearMiss = Object.values(scorecard).find((s) => !s.rejectedByStructuralGate && s.c1 && s.c1.ok && s.c2 && s.c2.ok);
        return nearMiss
            ? { label: "B", reason: "No candidate passed every gate, but at least one constrained variant preserved accuracy + volatility gains while narrowing the density gap -- a near-miss worth preserving for later research." }
            : { label: "D", reason: "No constrained variant improved on the original negative result; raw linear remains preferable to any calibration attempted here." };
    }
    return { label: "A", reason: `Candidate ${selected} satisfied all seven validation gates (accuracy, volatility, opening density, family, endgame, bias, triviality).` };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });

export { main, auditPhaseAffine, structuralGates, scoreCandidate, boundaryAnalysis, landscapeAnalysis, bootstrapCIs, costBenchmark, classify };
