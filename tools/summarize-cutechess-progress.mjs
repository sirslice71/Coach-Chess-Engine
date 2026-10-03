#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readTextSmart } from "./evaluate-candidate-smoke.mjs";

function usage() {
    return [
        "Usage:",
        "  node tools/summarize-cutechess-progress.mjs --run <analysis-runs\\match-folder>",
        "",
        "Summarizes CuteChess stdout while a match is running or after it completes."
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        run: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--run") args.run = argv[++index];
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (!args.help && !args.run) {
        throw new Error("Missing --run");
    }

    return args;
}

function parseProgress(stdoutText) {
    const started = [];
    const finished = [];
    const scoreLines = [];
    const warnings = [];
    let finishedMatch = false;

    for (const line of stdoutText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const startedMatch =
            trimmed.match(/^Started game (\d+) of (\d+) \((.+)\)$/);
        if (startedMatch) {
            started.push({
                game: Number.parseInt(startedMatch[1], 10),
                total: Number.parseInt(startedMatch[2], 10),
                pairing: startedMatch[3]
            });
            continue;
        }

        const finishedGame =
            trimmed.match(/^Finished game (\d+) \((.+)\):\s+(\S+)\s+\{(.+)\}$/);
        if (finishedGame) {
            finished.push({
                game: Number.parseInt(finishedGame[1], 10),
                pairing: finishedGame[2],
                result: finishedGame[3],
                reason: finishedGame[4]
            });
            continue;
        }

        if (trimmed.startsWith("Score of ")) {
            scoreLines.push(trimmed);
            continue;
        }

        if (trimmed.startsWith("Warning:")) {
            warnings.push(trimmed);
            continue;
        }

        if (trimmed === "Finished match") {
            finishedMatch = true;
        }
    }

    const totalGames =
        started.length > 0
            ? Math.max(...started.map(item => item.total))
            : null;
    const lastScore =
        scoreLines.length > 0
            ? scoreLines[scoreLines.length - 1]
            : null;

    return {
        startedGames: started.length,
        finishedGames: finished.length,
        totalGames,
        inProgressGames: Math.max(0, started.length - finished.length),
        finishedMatch,
        lastScore,
        warnings,
        latestStarted: started.slice(-4),
        latestFinished: finished.slice(-4)
    };
}

function writeReport(reportPath, runLabel, progress) {
    const lines = [
        "# CuteChess Progress",
        "",
        `- Run: \`${runLabel}\``,
        `- Status: ${progress.finishedMatch ? "finished" : "running"}`,
        `- Started games: ${progress.startedGames}${progress.totalGames ? ` / ${progress.totalGames}` : ""}`,
        `- Finished games: ${progress.finishedGames}${progress.totalGames ? ` / ${progress.totalGames}` : ""}`,
        `- In-progress games: ${progress.inProgressGames}`,
        `- Last score: ${progress.lastScore ?? "n/a"}`,
        `- Warnings: ${progress.warnings.length}`,
        ""
    ];

    if (progress.latestFinished.length > 0) {
        lines.push("## Latest Finished");
        lines.push("");
        lines.push("| Game | Pairing | Result | Reason |");
        lines.push("| ---: | --- | --- | --- |");

        for (const item of progress.latestFinished) {
            lines.push(`| ${item.game} | ${item.pairing} | ${item.result} | ${item.reason} |`);
        }

        lines.push("");
    }

    if (progress.latestStarted.length > 0) {
        lines.push("## Latest Started");
        lines.push("");
        lines.push("| Game | Pairing |");
        lines.push("| ---: | --- |");

        for (const item of progress.latestStarted) {
            lines.push(`| ${item.game} | ${item.pairing} |`);
        }

        lines.push("");
    }

    fs.writeFileSync(reportPath, lines.join("\n"));
}

function summarizeRun(run) {
    const runPath = path.resolve(run);
    const stdoutPath = path.join(runPath, "cutechess.stdout.txt");

    if (!fs.existsSync(stdoutPath)) {
        throw new Error(`Missing CuteChess stdout: ${stdoutPath}`);
    }

    const progress = parseProgress(readTextSmart(stdoutPath));
    const reportPath = path.join(runPath, "match-progress.md");

    writeReport(
        reportPath,
        path.relative(process.cwd(), runPath) || ".",
        progress
    );

    return {
        run: path.relative(process.cwd(), runPath) || ".",
        report: path.relative(process.cwd(), reportPath),
        progress
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        console.log(usage());
        return;
    }

    const result = summarizeRun(args.run);
    console.log(`Status: ${result.progress.finishedMatch ? "finished" : "running"}`);
    console.log(`Finished: ${result.progress.finishedGames}${result.progress.totalGames ? ` / ${result.progress.totalGames}` : ""}`);
    console.log(`Last score: ${result.progress.lastScore ?? "n/a"}`);
    console.log(`Report: ${result.report}`);
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
    parseProgress,
    summarizeRun
};
