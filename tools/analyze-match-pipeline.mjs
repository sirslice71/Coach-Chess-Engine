#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_STOCKFISH =
    "<USERPROFILE>\\Downloads\\stockfish-windows-x86-64-universal.exe";
const MATCH_MINER =
    "<USERPROFILE>\\.codex\\skills\\coach-match-miner\\scripts\\mine-match.mjs";

function usage() {
    console.error(
        "Usage: node tools/analyze-match-pipeline.mjs --run <analysis-runs\\match-folder> " +
        "[--stockfish <path>] [--player Coach] [--reuse-existing] [--analysis-run <dir>] " +
        "[--sf-depth 8] [--min-move 16] [--max-move 60] [--sample-every 2] " +
        "[--max-per-game 8] [--max-positions 160] [--triage-max-ms-per-depth <ms>]"
    );
}

function parseArgs(argv) {
    const args = {
        run: null,
        stockfish: DEFAULT_STOCKFISH,
        player: "Coach",
        reuseExisting: false,
        analysisRun: null,
        sfDepth: 8,
        minMove: 16,
        maxMove: 60,
        sampleEvery: 2,
        maxPerGame: 8,
        maxPositions: 160,
        timeout: 120000,
        minDiff: 150,
        minBand: 50,
        maxTopTies: 3,
        maxMateRows: 0,
        triageMaxMsPerDepth: 5000
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--run") args.run = argv[++index];
        else if (token === "--stockfish") args.stockfish = argv[++index];
        else if (token === "--player") args.player = argv[++index];
        else if (token === "--reuse-existing") args.reuseExisting = true;
        else if (token === "--analysis-run") args.analysisRun = argv[++index];
        else if (token === "--sf-depth") args.sfDepth = numberArg(token, argv[++index]);
        else if (token === "--min-move") args.minMove = numberArg(token, argv[++index]);
        else if (token === "--max-move") args.maxMove = numberArg(token, argv[++index]);
        else if (token === "--sample-every") args.sampleEvery = numberArg(token, argv[++index]);
        else if (token === "--max-per-game") args.maxPerGame = numberArg(token, argv[++index]);
        else if (token === "--max-positions") args.maxPositions = numberArg(token, argv[++index]);
        else if (token === "--timeout") args.timeout = numberArg(token, argv[++index]);
        else if (token === "--min-diff") args.minDiff = numberArg(token, argv[++index]);
        else if (token === "--min-band") args.minBand = numberArg(token, argv[++index]);
        else if (token === "--max-top-ties") args.maxTopTies = numberArg(token, argv[++index]);
        else if (token === "--max-mate-rows") args.maxMateRows = numberArg(token, argv[++index]);
        else if (token === "--triage-max-ms-per-depth") args.triageMaxMsPerDepth = numberArg(token, argv[++index]);
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (!args.run) {
        throw new Error("Missing --run");
    }

    return args;
}

function numberArg(name, value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }

    return parsed;
}

function shouldRun(args, outputs) {
    return !args.reuseExisting || outputs.some(output => !fs.existsSync(output));
}

function runCommand(commandLog, label, command, commandArgs, options = {}) {
    commandLog.push({
        label,
        command,
        args: commandArgs
    });

    console.log(`\n== ${label} ==`);
    console.log([command, ...commandArgs].join(" "));

    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd,
        encoding: "utf8",
        windowsHide: true,
        stdio: "inherit"
    });

    if (result.error) {
        throw new Error(`${label} failed to start: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`${label} exited with status ${result.status}`);
    }
}

function newestDirectory(parent) {
    const entries =
        fs.readdirSync(parent, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => {
                const fullPath = path.join(parent, entry.name);
                return {
                    fullPath,
                    mtimeMs: fs.statSync(fullPath).mtimeMs
                };
            })
            .sort((left, right) => right.mtimeMs - left.mtimeMs);

    return entries[0]?.fullPath ?? null;
}

function relative(cwd, itemPath) {
    return path.relative(cwd, itemPath) || ".";
}

function writeSummary(summaryPath, payload) {
    const lines = [
        "# Coach Match Analysis Pipeline",
        "",
        `- Run: \`${payload.run}\``,
        `- PGN: \`${payload.pgn}\``,
        `- Reuse existing: ${payload.args.reuseExisting ? "yes" : "no"}`,
        `- SF depth: ${payload.args.sfDepth}`,
        `- Stable candidates: ${payload.stableCandidateCount ?? "n/a"}`,
        "",
        "## Outputs",
        "",
        ...Object.entries(payload.outputs).map(
            ([key, value]) => `- ${key}: ${value ? `\`${value}\`` : "n/a"}`
        ),
        "",
        "## Commands",
        "",
        ...payload.commands.map(item =>
            `- ${item.label}: \`${[item.command, ...item.args].join(" ")}\``
        )
    ];

    fs.writeFileSync(summaryPath, lines.join("\n") + "\n");
}

function readStableCount(stableJsonPath) {
    if (!fs.existsSync(stableJsonPath)) {
        return null;
    }

    const payload = JSON.parse(fs.readFileSync(stableJsonPath, "utf8"));
    return payload.summary?.stableCandidates ?? null;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const cwd = process.cwd();
    const runPath = path.resolve(args.run);
    const pgnPath = path.join(runPath, "match.pgn");
    const commandLog = [];

    if (!fs.existsSync(runPath)) {
        throw new Error(`Run folder does not exist: ${runPath}`);
    }

    if (!fs.existsSync(pgnPath)) {
        throw new Error(`Missing match PGN: ${pgnPath}`);
    }

    const timeDir = path.join(runPath, "time-depth");
    const sfOut = path.join(runPath, `sf19-pipeline-m${args.minMove}-${args.maxMove}-d${args.sfDepth}`);

    if (shouldRun(args, [path.join(runPath, "swing-mining", "swing-report.md")])) {
        runCommand(
            commandLog,
            "mine-match",
            "node",
            [MATCH_MINER, "--run", relative(cwd, runPath), "--player", args.player],
            { cwd }
        );
    }

    if (shouldRun(args, [path.join(timeDir, "coach-time-depth-summary.md")])) {
        runCommand(
            commandLog,
            "time-depth-summary",
            "node",
            [
                "tools\\summarize-coach-pgn-time.mjs",
                "--pgn",
                relative(cwd, pgnPath),
                "--player",
                args.player,
                "--out",
                relative(cwd, timeDir)
            ],
            { cwd }
        );
    }

    let analysisRun = args.analysisRun ? path.resolve(args.analysisRun) : null;

    if (!analysisRun) {
        if (args.reuseExisting && fs.existsSync(sfOut)) {
            analysisRun = newestDirectory(sfOut);
        }

        if (!analysisRun) {
            runCommand(
                commandLog,
                "sf19-analysis",
                "node",
                [
                    "tools\\coach-analysis-lab.mjs",
                    "--pgn-file",
                    relative(cwd, pgnPath),
                    "--target-player",
                    args.player,
                    "--extract",
                    "all",
                    "--min-move",
                    String(args.minMove),
                    "--max-move",
                    String(args.maxMove),
                    "--sample-every",
                    String(args.sampleEvery),
                    "--max-per-game",
                    String(args.maxPerGame),
                    "--max-positions",
                    String(args.maxPositions),
                    "--stockfish",
                    args.stockfish,
                    "--depth",
                    String(args.sfDepth),
                    "--timeout",
                    String(args.timeout),
                    "--out",
                    relative(cwd, sfOut)
                ],
                { cwd }
            );

            analysisRun = newestDirectory(sfOut);
        }
    }

    if (!analysisRun) {
        throw new Error(`Could not locate analysis run under ${sfOut}`);
    }

    const resultsJson = path.join(analysisRun, "results.json");
    const candidatesFen = path.join(analysisRun, "candidate-regressions.fens");
    const triageDir = path.join(analysisRun, "fen-triage-d468");
    const triageJson = path.join(triageDir, "fen-triage.json");
    const rankedDir = path.join(analysisRun, "ranked-triage");
    const stableDir = path.join(analysisRun, "stable-selector");
    const stableJson = path.join(stableDir, "stable-candidates.json");
    const probeCommands = path.join(stableDir, "probe-commands.md");

    if (!fs.existsSync(resultsJson)) {
        throw new Error(`Missing analysis results: ${resultsJson}`);
    }

    if (!fs.existsSync(candidatesFen)) {
        throw new Error(`Missing candidate FEN file: ${candidatesFen}`);
    }

    if (shouldRun(args, [triageJson])) {
        runCommand(
            commandLog,
            "root-triage",
            "node",
            [
                "tools\\triage-coach-fens.mjs",
                "--fen-file",
                relative(cwd, candidatesFen),
                "--depths",
                "4,6,8",
                "--limit",
                "12",
                "--max-ms-per-depth",
                String(args.triageMaxMsPerDepth),
                "--out",
                relative(cwd, triageDir)
            ],
            { cwd }
        );
    }

    if (shouldRun(args, [path.join(rankedDir, "ranked-candidates.json")])) {
        runCommand(
            commandLog,
            "rank-triage",
            "node",
            [
                "tools\\rank-triage-candidates.mjs",
                "--analysis",
                relative(cwd, resultsJson),
                "--triage",
                relative(cwd, triageJson),
                "--min-diff",
                String(args.minDiff),
                "--out",
                relative(cwd, rankedDir)
            ],
            { cwd }
        );
    }

    if (shouldRun(args, [stableJson])) {
        runCommand(
            commandLog,
            "stable-selector",
            "node",
            [
                "tools\\select-stable-candidates.mjs",
                "--analysis",
                relative(cwd, resultsJson),
                "--triage",
                relative(cwd, triageJson),
                "--min-diff",
                String(args.minDiff),
                "--min-band",
                String(args.minBand),
                "--max-top-ties",
                String(args.maxTopTies),
                "--max-mate-rows",
                String(args.maxMateRows),
                "--require-ref-disagree",
                "--out",
                relative(cwd, stableDir)
            ],
            { cwd }
        );
    }

    if (shouldRun(args, [probeCommands])) {
        runCommand(
            commandLog,
            "probe-command-handoff",
            "node",
            [
                "tools\\print-stable-probe-commands.mjs",
                "--stable",
                relative(cwd, stableJson),
                "--top",
                "2",
                "--depths",
                "4-12",
                "--limit",
                "12",
                "--out",
                relative(cwd, probeCommands)
            ],
            { cwd }
        );
    }

    const summary = {
        args,
        run: relative(cwd, runPath),
        pgn: relative(cwd, pgnPath),
        outputs: {
            swingReport: relative(cwd, path.join(runPath, "swing-mining", "swing-report.md")),
            timeDepth: relative(cwd, path.join(timeDir, "coach-time-depth-summary.md")),
            analysisRun: relative(cwd, analysisRun),
            resultsJson: relative(cwd, resultsJson),
            triage: relative(cwd, path.join(triageDir, "fen-triage.md")),
            ranked: relative(cwd, path.join(rankedDir, "ranked-candidates.md")),
            stable: relative(cwd, path.join(stableDir, "stable-candidates.md")),
            probeCommands: relative(cwd, probeCommands)
        },
        stableCandidateCount: readStableCount(stableJson),
        commands: commandLog
    };

    fs.writeFileSync(
        path.join(runPath, "analysis-pipeline-summary.json"),
        JSON.stringify(summary, null, 2) + "\n"
    );
    writeSummary(path.join(runPath, "analysis-pipeline-summary.md"), summary);

    console.log(
        `\nPipeline complete. Stable candidates: ${summary.stableCandidateCount ?? "n/a"}`
    );
    console.log(`Summary: ${relative(cwd, path.join(runPath, "analysis-pipeline-summary.md"))}`);
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
}
