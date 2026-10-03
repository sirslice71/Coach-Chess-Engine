#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROBER =
    "<USERPROFILE>\\.codex\\skills\\coach-search-prober\\scripts\\probe-root-depths.mjs";

function usage() {
    console.error(
        "Usage: node tools/print-stable-probe-commands.mjs " +
        "--stable <stable-candidates.json> [--top 2] [--depths 4-12] [--limit 12] [--out <file>]"
    );
}

function parseArgs(argv) {
    const args = {
        stable: null,
        top: 2,
        depths: "4-12",
        limit: 12,
        out: null,
        prober: DEFAULT_PROBER
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--stable") args.stable = argv[++index];
        else if (token === "--top") args.top = numberArg(token, argv[++index]);
        else if (token === "--depths") args.depths = argv[++index];
        else if (token === "--limit") args.limit = numberArg(token, argv[++index]);
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--prober") args.prober = argv[++index];
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (!args.stable) {
        throw new Error("Missing --stable");
    }

    return args;
}

function numberArg(name, value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }

    return parsed;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function quotePowerShell(text) {
    return `"${String(text).replaceAll("`", "``").replaceAll("\"", "`\"")}"`;
}

function commandFor(args, candidate) {
    return [
        "node",
        quotePowerShell(args.prober),
        "--depths",
        args.depths,
        "--limit",
        String(args.limit),
        "--fen",
        candidate.fen
    ].join(" ");
}

function buildMarkdown(args, candidates) {
    const lines = [
        "# Stable Candidate Probe Commands",
        "",
        `- Source: \`${args.stable}\``,
        `- Top candidates: ${Math.min(args.top, candidates.length)}`,
        `- Depths: ${args.depths}`,
        `- Root rows: ${args.limit}`,
        "",
        "Run these from the Coach repo root.",
        ""
    ];

    if (candidates.length === 0) {
        lines.push("No stable candidates found.");
        return lines.join("\n") + "\n";
    }

    for (const [index, candidate] of candidates.entries()) {
        lines.push(
            `## ${index + 1}. ${candidate.label}`,
            "",
            `- Diff: ${candidate.diffCp ?? "n/a"}cp`,
            `- Coach: ${candidate.coachBest ?? "n/a"}`,
            `- Reference: ${candidate.referenceBest ?? "n/a"}`,
            `- Deepest band: ${candidate.deepest?.band ?? "n/a"}`,
            `- Top ties: ${candidate.deepest?.topTies ?? "n/a"}`,
            "",
            "```powershell",
            commandFor(args, candidate),
            "```",
            ""
        );
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const payload = readJson(args.stable);
    const candidates =
        (payload.stableCandidates || []).slice(0, args.top);
    const markdown = buildMarkdown(args, candidates);

    if (args.out) {
        fs.mkdirSync(path.dirname(args.out), { recursive: true });
        fs.writeFileSync(args.out, markdown);
    }

    console.log(markdown.trimEnd());
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
}
