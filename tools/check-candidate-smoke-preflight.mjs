#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUTECHESS =
    "<USERPROFILE>\\AppData\\Local\\Programs\\Cute Chess\\cutechess-cli.exe";
const DEFAULT_SHALLOWBLUE =
    "<USERPROFILE>\\Downloads\\shallowblue_x86-64.exe";

function usage() {
    return [
        "Usage:",
        "  node tools/check-candidate-smoke-preflight.mjs --run <folder> --openings <pgn>",
        "       [--cutechess <path>] [--shallowblue <path>] [--expected-openings 10]",
        "",
        "Checks local files needed before starting a candidate CuteChess smoke match."
    ].join("\n");
}

function parseArgs(argv) {
    const args = {
        run: null,
        openings: null,
        cutechess: DEFAULT_CUTECHESS,
        shallowblue: DEFAULT_SHALLOWBLUE,
        expectedOpenings: 10
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--run") args.run = argv[++index];
        else if (token === "--openings") args.openings = argv[++index];
        else if (token === "--cutechess") args.cutechess = argv[++index];
        else if (token === "--shallowblue") args.shallowblue = argv[++index];
        else if (token === "--expected-openings") args.expectedOpenings = numberArg(token, argv[++index]);
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (!args.help && !args.run) {
        throw new Error("Missing --run");
    }

    if (!args.help && !args.openings) {
        throw new Error("Missing --openings");
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

function existsFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}

function countPgnGames(text) {
    const matches = text.match(/^\s*\[Event\s+"/gm);
    return matches ? matches.length : 0;
}

function checkPreflight(args, cwd = process.cwd()) {
    const runPath = path.resolve(cwd, args.run);
    const openingsPath = path.resolve(cwd, args.openings);
    const matchPgnPath = path.join(runPath, "match.pgn");
    const stdoutPath = path.join(runPath, "cutechess.stdout.txt");
    const checks = [];

    function add(name, ok, detail) {
        checks.push({ name, ok, detail });
    }

    add("run folder", fs.existsSync(runPath), runPath);
    add("CuteChess", existsFile(args.cutechess), args.cutechess);
    add("ShallowBlue 1618", existsFile(args.shallowblue), args.shallowblue);
    add("Coach UCI entry", existsFile(path.resolve(cwd, "uci.js")), path.resolve(cwd, "uci.js"));
    add("opening suite", existsFile(openingsPath), openingsPath);

    let openingCount = null;

    if (existsFile(openingsPath)) {
        openingCount = countPgnGames(fs.readFileSync(openingsPath, "utf8"));
        add(
            "opening count",
            openingCount === args.expectedOpenings,
            `${openingCount} PGN game(s), expected ${args.expectedOpenings}`
        );
    }

    add("match PGN not present", !fs.existsSync(matchPgnPath), matchPgnPath);
    add("stdout not present", !fs.existsSync(stdoutPath), stdoutPath);

    return {
        run: path.relative(cwd, runPath) || ".",
        openings: path.relative(cwd, openingsPath) || ".",
        openingCount,
        checks,
        ok: checks.every(check => check.ok)
    };
}

function writeReport(report, outPath) {
    const lines = [
        "# Candidate Smoke Preflight",
        "",
        `- Run: \`${report.run}\``,
        `- Openings: \`${report.openings}\``,
        `- Status: ${report.ok ? "ok" : "failed"}`,
        "",
        "| Check | OK | Detail |",
        "| --- | ---: | --- |"
    ];

    for (const check of report.checks) {
        lines.push(
            `| ${check.name} | ${check.ok ? "yes" : "no"} | \`${check.detail}\` |`
        );
    }

    fs.writeFileSync(outPath, lines.join("\n") + "\n");
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        console.log(usage());
        return;
    }

    const report = checkPreflight(args);
    const reportPath = path.join(path.resolve(args.run), "preflight.md");
    fs.mkdirSync(path.resolve(args.run), { recursive: true });
    writeReport(report, reportPath);

    for (const check of report.checks) {
        console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
    }

    console.log(`Preflight: ${path.relative(process.cwd(), reportPath)}`);

    if (!report.ok) {
        process.exitCode = 1;
    }
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
    checkPreflight,
    countPgnGames
};
