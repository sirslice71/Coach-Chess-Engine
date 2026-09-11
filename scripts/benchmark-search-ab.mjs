#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
    mkdir,
    readFile,
    rename,
    writeFile
} from "node:fs/promises";
import os from "node:os";
import {
    dirname,
    resolve
} from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
    checkResumeCompatibility,
    classifyCandidate,
    classifyControl,
    DEFAULT_PROFILE,
    generateAbbaOrder,
    generatePairedOrder,
    hasSample,
    loadCorpus,
    makeRunConfig,
    mapToSamples,
    IDENTITY_MODE_EXACT,
    normalizeIdentityMode,
    resolveBenchmarkProfile,
    samplesToMap,
    selectProfilePositions,
    selectCorpus,
    serializeSummaryCsv,
    summarizeRun
} from "./benchmark-search-ab-utils.mjs";

const DEFAULT_CORPUS_PATH =
    new URL("../tests/data/search_benchmark_corpus.json", import.meta.url);

function parseArgs(argv) {

    const args = {
        profile: DEFAULT_PROFILE,
        warmups: null,
        pairs: null,
        groups: null,
        corpus: "primary",
        seed: 0x51ab2026,
        timeoutMs: 0,
        maxRunMs: 45 * 60 * 1000,
        exact: true,
        identityMode: IDENTITY_MODE_EXACT,
        scoreToleranceCp: 0,
        control: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => argv[++index];

        switch (arg) {
            case "--baseline":
                args.baseline = resolve(value());
                break;
            case "--candidate":
                args.candidate = resolve(value());
                break;
            case "--corpus-file":
                args.corpusFile = resolve(value());
                break;
            case "--corpus":
                args.corpus = value();
                break;
            case "--profile":
                args.profile = value();
                break;
            case "--warmups":
                args.warmups = parseInteger(value(), "--warmups");
                break;
            case "--pairs":
                args.pairs = parseInteger(value(), "--pairs");
                break;
            case "--groups":
                args.groups = parseInteger(value(), "--groups");
                break;
            case "--seed":
                args.seed = parseSeed(value());
                break;
            case "--timeout":
            case "--timeout-ms":
                args.timeoutMs = parseInteger(value(), "--timeout");
                break;
            case "--max-run-ms":
                args.maxRunMs = parseInteger(value(), "--max-run-ms");
                break;
            case "--json":
                args.json = resolve(value());
                break;
            case "--csv":
                args.csv = resolve(value());
                break;
            case "--checkpoint":
                args.checkpoint = resolve(value());
                break;
            case "--resume":
                args.resume = true;
                args.checkpoint = resolve(value());
                break;
            case "--control":
                args.control = true;
                break;
            case "--identity-mode":
            case "--identity":
                args.identityMode = value();
                break;
            case "--score-tolerance-cp":
                args.scoreToleranceCp = parseInteger(value(), "--score-tolerance-cp");
                break;
            case "--baseline-hash-mb":
                args.baselineHashMB = parsePositiveInteger(value(), "--baseline-hash-mb");
                break;
            case "--candidate-hash-mb":
                args.candidateHashMB = parsePositiveInteger(value(), "--candidate-hash-mb");
                break;
            case "--non-exact":
                args.exact = false;
                break;
            case "--priority":
                args.priority = value();
                break;
            case "--affinity":
                args.affinity = value();
                break;
            case "--trace-gc":
                args.traceGc = true;
                break;
            case "--help":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;

}

function parseInteger(text, name) {

    const value =
        Number.parseInt(text, 10);

    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer.`);
    }

    return value;

}

function parsePositiveInteger(text, name) {

    const value =
        parseInteger(text, name);

    if (value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return value;

}

function parseSeed(text) {

    if (/^0x/i.test(text)) {
        return Number.parseInt(text, 16) >>> 0;
    }

    return Number.parseInt(text, 10) >>> 0;

}

function printHelp() {

    console.log(`Usage:
  node scripts/benchmark-search-ab.mjs --baseline <repo> --candidate <repo> [options]

Options:
  --control                  Mark this as an identical-build control.
  --identity-mode Exact|SearchStable
  --score-tolerance-cp <n>   SearchStable score tolerance, default 0.
  --profile full|stability-short
  --corpus primary|diagnostic|all
  --warmups <n>              Position-specific warmups per label (default 5).
  --pairs <n>                Measured AB/BA pairs per position (default 10).
  --groups <n>               ABBA groups for stability-short (default 16).
  --seed <n|0x...>           Deterministic pairing seed.
  --baseline-hash-mb <n>     Override baseline TT size for benchmark samples.
  --candidate-hash-mb <n>    Override candidate TT size for benchmark samples.
  --json <path>              Write full JSON report.
  --csv <path>               Write per-position CSV summary.
  --checkpoint <path>        Save resume checkpoint.
  --resume <path>            Resume a compatible checkpoint.
  --non-exact                Report identity mismatches but exit zero for them.
  --priority above-normal|normal
  --affinity <hex mask>      Best-effort temporary affinity for this Node process.
  --max-run-ms <n>           Stop after this wall-clock budget and preserve partial JSON.
`);

}

async function loadEngine(repoPath) {

    const moduleUrl =
        pathToFileURL(`${repoPath.replaceAll("\\", "/")}/js/uci/uciengine.js`);

    const module =
        await import(moduleUrl.href);

    const ttModuleUrl =
        pathToFileURL(`${repoPath.replaceAll("\\", "/")}/js/engine/transpositiontable.js`);

    const ttModule =
        await import(ttModuleUrl.href);

    return {
        repoPath,
        TranspositionTable: ttModule.default,
        createEngineCore: module.createEngineCore,
        moveToUci: module.moveToUci
    };

}

function runSearch(engine, position, hashSizeMB = null) {

    const core =
        engine.createEngineCore(position.fen);

    if (hashSizeMB !== null) {
        core.search.tt =
            new engine.TranspositionTable(hashSizeMB);
    }

    const startedAt =
        performance.now();

    const result =
        core.search.bestMove(position.depth, { quiet: true });

    const elapsedMs =
        performance.now() - startedAt;

    return {
        elapsedMs,
        bestMove: result.move
            ? engine.moveToUci(result.move)
            : null,
        score: result.evaluation,
        nodes: result.nodes ?? null,
        leafNodes: result.leafNodes ?? null,
        completedDepth: result.depth ?? position.depth,
        qsearchEntries: result.leafNodes ?? null,
        pv: (result.pv || []).map(engine.moveToUci)
    };

}

async function gitMetadata(repoPath) {

    const run = args => {
        try {
            return execFileSync("git", args, {
                cwd: repoPath,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            }).trim();
        }
        catch {
            return "unavailable";
        }
    };

    return {
        branch: run(["branch", "--show-current"]),
        head: run(["rev-parse", "--short", "HEAD"]),
        status: run(["status", "--short"])
    };

}

function powershell(command) {

    try {
        return execFileSync(
            "powershell",
            ["-NoProfile", "-Command", command],
            {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            }
        ).trim();
    }
    catch {
        return "unavailable";
    }

}

async function environmentMetadata(args) {

    const cpuModel =
        powershell("(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').ProcessorNameString");

    const powerPlan =
        powershell("powercfg /getactivescheme");

    const availableMemoryMb =
        powershell("(Get-Counter '\\Memory\\Available MBytes').CounterSamples.CookedValue");

    return {
        timestamp: new Date().toISOString(),
        node: process.version,
        windows: os.version?.() || process.platform,
        cpuModel,
        logicalProcessors: os.cpus().length,
        availableMemoryMb,
        powerPlan,
        cwd: process.cwd(),
        processPriority: args.priority || "default",
        processAffinity: args.affinity || "default",
        seed: args.seed,
        warmups: args.warmups,
        pairs: args.pairs,
        baselineHashMB: args.baselineHashMB ?? null,
        candidateHashMB: args.candidateHashMB ?? null,
        traceGc: args.traceGc === true
    };

}

function applyProcessTuning(args) {

    const applied = [];

    if (args.priority) {
        const allowed =
            new Set(["normal", "above-normal"]);

        if (!allowed.has(args.priority)) {
            throw new Error("--priority supports normal or above-normal.");
        }

        const priority =
            args.priority === "above-normal"
                ? "AboveNormal"
                : "Normal";

        const result =
            powershell(`$p = Get-Process -Id ${process.pid}; $p.PriorityClass = '${priority}'; $p.PriorityClass`);

        applied.push({
            option: "priority",
            requested: priority,
            result
        });
    }

    if (args.affinity) {
        const mask =
            Number.parseInt(args.affinity, 16);

        if (!Number.isFinite(mask) || mask <= 0) {
            throw new Error("--affinity must be a positive hexadecimal mask.");
        }

        const result =
            powershell(`$p = Get-Process -Id ${process.pid}; $p.ProcessorAffinity = ${mask}; $p.ProcessorAffinity`);

        applied.push({
            option: "affinity",
            requested: args.affinity,
            result
        });
    }

    return applied;

}

async function writeJson(path, value) {

    await mkdir(dirname(path), { recursive: true });

    const temporaryPath =
        `${path}.${process.pid}.tmp`;

    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryPath, path);

}

async function writeCsv(path, value) {

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);

}

async function readCheckpoint(path) {

    if (!path || !existsSync(path)) {
        return null;
    }

    return JSON.parse(await readFile(path, "utf8"));

}

async function main() {

    const args =
        parseArgs(process.argv.slice(2));

    if (args.help) {
        printHelp();
        return 0;
    }

    if (!args.baseline || !args.candidate) {
        throw new Error("Provide --baseline and --candidate repository paths.");
    }

    args.identityMode =
        normalizeIdentityMode(args.identityMode);

    if (args.control && args.baseline !== args.candidate) {
        console.warn("Control mode normally uses the same path for both labels.");
    }

    const tuning =
        applyProcessTuning(args);

    const corpus =
        await loadCorpus(args.corpusFile || DEFAULT_CORPUS_PATH);

    const positions =
        selectCorpus(corpus, args.corpus);

    const profile =
        resolveBenchmarkProfile(args);

    args.profile = profile.name;
    args.warmups = profile.warmups;
    args.pairs = profile.pairs;
    args.groups = profile.groups;

    const buildIdentity = {
        baseline: await gitMetadata(args.baseline),
        candidate: await gitMetadata(args.candidate)
    };

    args.buildIdentity = buildIdentity;

    const config =
        makeRunConfig(args, selectProfilePositions(positions, profile));

    const checkpoint =
        await readCheckpoint(args.checkpoint);

    let samplesByPosition =
        new Map();

    if (checkpoint) {
        const compatibility =
            checkResumeCompatibility(checkpoint, config);

        if (!compatibility.ok) {
            throw new Error(compatibility.reason);
        }

        samplesByPosition =
            samplesToMap(checkpoint.samples);
    }

    const baseline =
        await loadEngine(args.baseline);

    const candidate =
        await loadEngine(args.candidate);

    const engines = {
        baseline,
        candidate
    };

    const benchmarkPositions =
        selectProfilePositions(positions, profile);

    const startedAt =
        performance.now();

    let timedOut =
        false;

    console.log("Coach search A/B benchmark");
    console.log(`baseline:  ${args.baseline}`);
    console.log(`candidate: ${args.candidate}`);
    console.log(`corpus:    ${args.corpus} (${benchmarkPositions.length} position(s))`);
    console.log(`profile:   ${profile.name}`);
    console.log(`warmups:   ${args.warmups}`);
    if (profile.groups) {
        console.log(`groups:    ${profile.groups}`);
    }
    else {
        console.log(`pairs:     ${args.pairs}`);
    }
    console.log(`seed:      ${args.seed}`);
    console.log(`identity:  ${args.identityMode}`);
    if (args.baselineHashMB || args.candidateHashMB) {
        console.log(
            `hash MB:   baseline=${args.baselineHashMB ?? "default"} ` +
            `candidate=${args.candidateHashMB ?? "default"}`
        );
    }
    if (args.identityMode.toLowerCase() !== "exact") {
        console.log(`score tolerance: ${args.scoreToleranceCp} cp`);
    }

    if (args.control) {
        console.log("mode:      identical-build control");
    }

    if (!args.exact) {
        console.log("exit mode: non-exact (mismatches do not set exit code)");
    }

    for (const item of tuning) {
        console.log(`${item.option}: ${item.requested} -> ${item.result}`);
    }

    for (let positionIndex = 0; positionIndex < benchmarkPositions.length; positionIndex += 1) {
        const position =
            benchmarkPositions[positionIndex];

        if (!samplesByPosition.has(position.id)) {
            samplesByPosition.set(position.id, []);
        }

        const bucket =
            samplesByPosition.get(position.id);

        if (bucket.length === 0) {
            for (let index = 0; index < args.warmups; index += 1) {
                runSearch(baseline, position, args.baselineHashMB ?? null);
                runSearch(candidate, position, args.candidateHashMB ?? null);
            }
        }

        const order =
            profile.order === "abba-groups"
                ? generateAbbaOrder(profile.groups, args.seed, positionIndex)
                : generatePairedOrder(args.pairs, args.seed);

        for (let index = 0; index < order.length; index += 1) {
            if (hasSample(samplesByPosition, position.id, index)) {
                continue;
            }

            if (args.maxRunMs > 0 && performance.now() - startedAt > args.maxRunMs) {
                timedOut = true;
                break;
            }

            const label =
                order[index];

            const heapBefore =
                process.memoryUsage().heapUsed;

            const result =
                runSearch(
                    engines[label],
                    position,
                    label === "baseline"
                        ? args.baselineHashMB ?? null
                        : args.candidateHashMB ?? null
                );

            const heapAfter =
                process.memoryUsage().heapUsed;

            if (args.timeoutMs > 0 && result.elapsedMs > args.timeoutMs) {
                result.timeoutExceeded = true;
            }

            const sample = {
                positionId: position.id,
                sampleIndex: index,
                pairIndex: Math.floor(index / 2),
                groupIndex: profile.order === "abba-groups"
                    ? Math.floor(index / 4)
                    : Math.floor(index / 2),
                orderWithinGroup: profile.order === "abba-groups"
                    ? index % 4
                    : index % 2,
                profile: profile.name,
                label,
                heapBefore,
                heapAfter,
                ...result
            };

            bucket.push(sample);

            if (args.checkpoint) {
                await writeJson(args.checkpoint, {
                    schemaVersion: 1,
                    config,
                    samples: mapToSamples(samplesByPosition)
                });
            }
        }

        const partial =
            summarizeRun([position], samplesByPosition, {
                exact: args.exact,
                identityMode: args.identityMode,
                scoreToleranceCp: args.scoreToleranceCp,
                profile
            });

        const row =
            partial.positions[0];

        console.log(
            `${position.id.padEnd(20)} ` +
            `${args.control ? "control" : "candidate"} ` +
            `${formatTimingDifference(row.percentChange)} ` +
            `identity=${row.identityOk ? "ok" : "mismatch"}` +
            (row.identityMode === "SearchStable"
                ? ` tree=${row.treeShape.changed ? "changed" : "same"}`
                : "")
        );

        if (timedOut) {
            break;
        }
    }

    const summary =
        summarizeRun(benchmarkPositions, samplesByPosition, {
            exact: args.exact,
            identityMode: args.identityMode,
            scoreToleranceCp: args.scoreToleranceCp,
            profile
        });

    const environment =
        await environmentMetadata(args);

    const report = {
        schemaVersion: 1,
        control: args.control,
        config,
        paths: {
            baseline: args.baseline,
            candidate: args.candidate
        },
        git: {
            baseline: buildIdentity.baseline,
            candidate: buildIdentity.candidate
        },
        environment,
        tuning,
        profile,
        timeout: {
            maxRunMs: args.maxRunMs,
            timedOut,
            elapsedMs: performance.now() - startedAt
        },
        summary,
        samples: mapToSamples(samplesByPosition)
    };

    report.assessment =
        args.control
            ? { control: classifyControl(summary.aggregates.primary) }
            : { candidate: classifyCandidate(summary.aggregates.primary) };

    console.log("");
    const label =
        args.control ? "control" : "candidate";

    console.log(
        `${label} timing difference: ${formatTimingDifference(summary.aggregates.primary.geomeanPercent)}`
    );
    console.log(
        `${label} median timing difference: ${formatTimingDifference(summary.aggregates.primary.medianPercent)}`
    );
    console.log(
        `${label} speed gain: ${formatSpeedGain(summary.aggregates.primary.geomeanPercent)}`
    );

    if (args.control) {
        console.log(`control: ${report.assessment.control.status}`);
    }
    else {
        console.log(`candidate: ${report.assessment.candidate.status}`);
    }

    if (args.identityMode === "SearchStable") {
        console.log("");
        console.log(`Search stability: ${summary.identityOk ? "OK" : "MISMATCH"}`);
        console.log(
            `Tree shape changed: ${summary.treeShape.changed ? "expected" : "no"}`
        );
        console.log(
            `Nodes: ${formatTreeDelta(summary.treeShape.metrics.nodes)}`
        );
        console.log(
            `Leaf nodes: ${formatTreeDelta(summary.treeShape.metrics.leafNodes)}`
        );
        console.log(
            `Qsearch: ${formatTreeDelta(summary.treeShape.metrics.qsearchEntries)}`
        );
        console.log(`PV changes: ${summary.treeShape.pvChanges}`);
        console.log(`Root-order changes: ${summary.treeShape.rootOrderChanges}`);
    }

    if (args.json) {
        await writeJson(args.json, report);
    }

    if (args.csv) {
        await writeCsv(args.csv, serializeSummaryCsv(summary));
    }

    if (timedOut) {
        return 4;
    }

    if (args.exact && !summary.identityOk) {
        return 2;
    }

    if (args.control && !report.assessment.control.ok) {
        return 3;
    }

    return 0;

}

function formatPercent(value) {

    return Number.isFinite(value)
        ? `${value.toFixed(3)}%`
        : "unavailable";

}

function formatTimingDifference(value) {

    if (!Number.isFinite(value)) {
        return "unavailable";
    }

    if (value < 0) {
        return `${Math.abs(value).toFixed(3)}% faster`;
    }

    if (value > 0) {
        return `${value.toFixed(3)}% slower`;
    }

    return "0.000% neutral";

}

function formatSpeedGain(timingDifferencePercent) {

    if (!Number.isFinite(timingDifferencePercent)) {
        return "unavailable";
    }

    const speedGain =
        -timingDifferencePercent;

    return `${speedGain >= 0 ? "+" : ""}${speedGain.toFixed(3)}%`;

}

function formatTreeDelta(metric) {

    if (!metric || !Number.isFinite(metric.deltaPercent)) {
        return "n/a";
    }

    return `${metric.delta >= 0 ? "+" : ""}${metric.delta} (${metric.deltaPercent >= 0 ? "+" : ""}${metric.deltaPercent.toFixed(2)}%)`;

}

main()
    .then(code => {
        process.exitCode = code;
    })
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
