#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE_SCORE = 0.525;
const DEFAULT_BASELINE_LABEL = "10 - 9 - 1 [0.525] 20";

function usage() {
    return [
        "Usage:",
        "  node tools/evaluate-candidate-smoke.mjs --run <analysis-runs\\candidate-folder> [--player Coach]",
        "       [--baseline-score 0.525] [--baseline-label <label>] [--out <dir>]",
        "",
        "Writes candidate-smoke-decision.json/md after a CuteChess smoke match and analysis pipeline."
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        run: null,
        player: "Coach",
        baselineScore: DEFAULT_BASELINE_SCORE,
        baselineLabel: DEFAULT_BASELINE_LABEL,
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--run") args.run = argv[++index];
        else if (token === "--player") args.player = argv[++index];
        else if (token === "--baseline-score") args.baselineScore = numberArg(token, argv[++index]);
        else if (token === "--baseline-label") args.baselineLabel = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (!args.help && !args.run) {
        throw new Error("Missing --run");
    }

    return args;
}

function numberArg(name, value) {
    const parsed = Number.parseFloat(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a number`);
    }

    return parsed;
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCutechessScore(stdoutText, player = "Coach") {
    const playerPattern = escapeRegex(player);
    const scorePattern = new RegExp(
        `Score of ${playerPattern} vs ([^:]+):\\s+(\\d+)\\s+-\\s+(\\d+)\\s+-\\s+(\\d+)\\s+\\[([0-9.]+)\\]\\s+(\\d+)`,
        "g"
    );
    const colorPattern = new RegExp(
        `${playerPattern} playing (White|Black):\\s+(\\d+)\\s+-\\s+(\\d+)\\s+-\\s+(\\d+)\\s+\\[([0-9.]+)\\]\\s+(\\d+)`,
        "g"
    );

    let score = null;
    let match;

    while ((match = scorePattern.exec(stdoutText)) !== null) {
        score = {
            opponent: match[1].trim(),
            wins: Number.parseInt(match[2], 10),
            losses: Number.parseInt(match[3], 10),
            draws: Number.parseInt(match[4], 10),
            score: Number.parseFloat(match[5]),
            games: Number.parseInt(match[6], 10)
        };
    }

    const colors = {};

    while ((match = colorPattern.exec(stdoutText)) !== null) {
        colors[match[1].toLowerCase()] = {
            wins: Number.parseInt(match[2], 10),
            losses: Number.parseInt(match[3], 10),
            draws: Number.parseInt(match[4], 10),
            score: Number.parseFloat(match[5]),
            games: Number.parseInt(match[6], 10)
        };
    }

    return { score, colors };
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextSmart(filePath) {
    const buffer = fs.readFileSync(filePath);
    let text;

    if (
        buffer.length >= 2 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xfe
    ) {
        text = buffer.toString("utf16le");
        return text.replace(/^\uFEFF/, "");
    }

    const sampleLength = Math.min(buffer.length, 200);
    let zeroOddBytes = 0;

    for (let index = 1; index < sampleLength; index += 2) {
        if (buffer[index] === 0) {
            zeroOddBytes += 1;
        }
    }

    if (sampleLength > 20 && zeroOddBytes >= Math.floor(sampleLength / 4)) {
        text = buffer.toString("utf16le");
        return text.replace(/^\uFEFF/, "");
    }

    text = buffer.toString("utf8");
    return text.replace(/^\uFEFF/, "");
}

function summarizeSwingReport(runPath) {
    const swingJson =
        readJsonIfExists(path.join(runPath, "swing-mining", "swing-report.json"));

    if (!swingJson) {
        return null;
    }

    return {
        swings: swingJson.swings?.length ?? null,
        scoredCoachMoves: swingJson.scoredCoachMoves ?? null,
        categoryCounts: swingJson.selectedFenCategoryCounts ?? null
    };
}

function summarizeTimeDepth(runPath) {
    const timeJson =
        readJsonIfExists(path.join(runPath, "time-depth", "coach-time-depth-summary.json"));

    if (!timeJson) {
        return null;
    }

    return {
        games: timeJson.games ?? null,
        moves: timeJson.moveCount ?? null,
        averageDepth: timeJson.averageDepth ?? null,
        minimumDepth: timeJson.minimumDepth ?? null,
        averageTimeSeconds: timeJson.averageTimeSeconds ?? null,
        p90TimeSeconds: timeJson.p90TimeSeconds ?? null,
        minimumEstimatedClockRemainingSeconds:
            timeJson.minimumEstimatedClockRemainingSeconds ?? null,
        lowClockLowDepthMoves:
            Array.isArray(timeJson.lowClockLowDepthMoves)
                ? timeJson.lowClockLowDepthMoves.length
                : null
    };
}

function summarizePipeline(runPath) {
    const pipeline =
        readJsonIfExists(path.join(runPath, "analysis-pipeline-summary.json"));

    if (!pipeline) {
        return null;
    }

    return {
        stableCandidateCount: pipeline.stableCandidateCount ?? null,
        outputs: pipeline.outputs ?? {}
    };
}

function classifyDecision({ score, pipeline }, baselineScore) {
    if (!score) {
        return {
            status: "pending-match",
            verdict: "No final CuteChess score was found."
        };
    }

    if (score.score < baselineScore) {
        return {
            status: "reject-smoke-regression",
            verdict:
                `Smoke score ${score.score.toFixed(3)} is below baseline ${baselineScore.toFixed(3)}.`
        };
    }

    if (!pipeline) {
        return {
            status: "needs-analysis-pipeline",
            verdict:
                "Smoke score did not regress, but analysis-pipeline-summary.json is missing."
        };
    }

    if ((pipeline.stableCandidateCount ?? 0) > 0) {
        return {
            status: "needs-stable-candidate-probes",
            verdict:
                `${pipeline.stableCandidateCount} stable candidate(s) survived; probe them before accepting.`
        };
    }

    return {
        status: "smoke-nonregression-ready-for-review",
        verdict:
            "Smoke score did not regress and no stable SF19/root-triage candidates survived."
    };
}

function formatWld(score) {
    if (!score) return "n/a";
    return `${score.wins} - ${score.losses} - ${score.draws} [${score.score.toFixed(3)}] ${score.games}`;
}

function writeDecision(outDir, decision) {
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
        path.join(outDir, "candidate-smoke-decision.json"),
        JSON.stringify(decision, null, 2) + "\n"
    );

    const lines = [
        "# Candidate Smoke Decision",
        "",
        `- Status: ${decision.decision.status}`,
        `- Verdict: ${decision.decision.verdict}`,
        `- Run: \`${decision.run}\``,
        `- Baseline: ${decision.baseline.label}`,
        `- Final score: ${formatWld(decision.score)}`,
        `- White split: ${formatWld(decision.colors.white)}`,
        `- Black split: ${formatWld(decision.colors.black)}`,
        `- Stable candidates: ${decision.pipeline?.stableCandidateCount ?? "n/a"}`,
        "",
        "## Time/Depth",
        "",
        `- Average depth: ${decision.timeDepth?.averageDepth ?? "n/a"}`,
        `- Minimum depth: ${decision.timeDepth?.minimumDepth ?? "n/a"}`,
        `- Average move time: ${decision.timeDepth?.averageTimeSeconds ?? "n/a"}s`,
        `- P90 move time: ${decision.timeDepth?.p90TimeSeconds ?? "n/a"}s`,
        `- Lowest estimated clock: ${decision.timeDepth?.minimumEstimatedClockRemainingSeconds ?? "n/a"}s`,
        `- Low-clock low-depth moves: ${decision.timeDepth?.lowClockLowDepthMoves ?? "n/a"}`,
        "",
        "## Swings",
        "",
        `- Swings: ${decision.swing?.swings ?? "n/a"}`,
        `- Scored Coach moves: ${decision.swing?.scoredCoachMoves ?? "n/a"}`,
        `- Category counts: \`${JSON.stringify(decision.swing?.categoryCounts ?? null)}\``
    ];

    fs.writeFileSync(
        path.join(outDir, "candidate-smoke-decision.md"),
        lines.join("\n") + "\n"
    );
}

function evaluateRun({
    run,
    player = "Coach",
    baselineScore = DEFAULT_BASELINE_SCORE,
    baselineLabel = DEFAULT_BASELINE_LABEL
}) {
    const runPath = path.resolve(run);
    const stdoutPath = path.join(runPath, "cutechess.stdout.txt");

    if (!fs.existsSync(runPath)) {
        throw new Error(`Run folder does not exist: ${runPath}`);
    }

    const parsed =
        fs.existsSync(stdoutPath)
            ? parseCutechessScore(readTextSmart(stdoutPath), player)
            : { score: null, colors: {} };
    const pipeline = summarizePipeline(runPath);

    return {
        run: path.relative(process.cwd(), runPath) || ".",
        generatedAt: new Date().toISOString(),
        player,
        baseline: {
            score: baselineScore,
            label: baselineLabel
        },
        score: parsed.score,
        colors: parsed.colors,
        pipeline,
        timeDepth: summarizeTimeDepth(runPath),
        swing: summarizeSwingReport(runPath),
        decision: classifyDecision(
            {
                score: parsed.score,
                pipeline
            },
            baselineScore
        )
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        console.log(usage());
        return;
    }

    const decision = evaluateRun(args);
    const outDir = path.resolve(args.out ?? args.run);
    writeDecision(outDir, decision);

    console.log(decision.decision.status);
    console.log(decision.decision.verdict);
    console.log(`Decision: ${path.relative(process.cwd(), path.join(outDir, "candidate-smoke-decision.md"))}`);
}

const isMain =
    process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    try {
        main();
    }
    catch (error) {
        console.error(usage());
        console.error(error.message);
        process.exit(1);
    }
}

export {
    classifyDecision,
    evaluateRun,
    parseCutechessScore,
    readTextSmart
};
