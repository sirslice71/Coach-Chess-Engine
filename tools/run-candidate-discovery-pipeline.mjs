#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function usage() {
    console.error(
        "Usage: node tools/run-candidate-discovery-pipeline.mjs " +
        "--root <evidence-dir> --out <dir> " +
        "[--worklist-depth 7] [--child-depth 7] [--confirm-depth 9] " +
        "[--nonmate-depth 12] [--root-limit 8] [--worklist-limit 40] " +
        "[--max-input 160] [--min-band 50] [--max-top-ties 4] " +
        "[--min-gap 100] [--max-ms-per-root 12000] [--max-ms-per-child 1500] " +
        "[--exclude-file-regex <pattern>] [--exclude-label-regex <pattern>] " +
        "[--progress]"
    );
}

function parseArgs(argv) {
    const args = {
        root: null,
        out: null,
        worklistDepth: 7,
        childDepth: 7,
        confirmDepth: 9,
        nonmateDepth: 12,
        rootLimit: 8,
        worklistLimit: 40,
        maxInput: 160,
        minBand: 50,
        maxTopTies: 4,
        minGap: 100,
        maxMsPerRoot: 12000,
        maxMsPerChild: 1500,
        excludeFileRegex: "candidate-regressions",
        excludeLabelRegex: "-after",
        progress: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--root") args.root = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--worklist-depth") args.worklistDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--child-depth") args.childDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--confirm-depth") args.confirmDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--nonmate-depth") args.nonmateDepth = Number.parseInt(argv[++index], 10);
        else if (token === "--root-limit") args.rootLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--worklist-limit") args.worklistLimit = Number.parseInt(argv[++index], 10);
        else if (token === "--max-input") args.maxInput = Number.parseInt(argv[++index], 10);
        else if (token === "--min-band") args.minBand = Number.parseInt(argv[++index], 10);
        else if (token === "--max-top-ties") args.maxTopTies = Number.parseInt(argv[++index], 10);
        else if (token === "--min-gap") args.minGap = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-root") args.maxMsPerRoot = Number.parseInt(argv[++index], 10);
        else if (token === "--max-ms-per-child") args.maxMsPerChild = Number.parseInt(argv[++index], 10);
        else if (token === "--exclude-file-regex") args.excludeFileRegex = argv[++index];
        else if (token === "--exclude-label-regex") args.excludeLabelRegex = argv[++index];
        else if (token === "--progress") args.progress = true;
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.root) throw new Error("Missing --root");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--worklist-depth", args.worklistDepth],
        ["--child-depth", args.childDepth],
        ["--confirm-depth", args.confirmDepth],
        ["--nonmate-depth", args.nonmateDepth],
        ["--root-limit", args.rootLimit],
        ["--worklist-limit", args.worklistLimit],
        ["--max-input", args.maxInput],
        ["--min-band", args.minBand],
        ["--max-top-ties", args.maxTopTies],
        ["--min-gap", args.minGap],
        ["--max-ms-per-root", args.maxMsPerRoot],
        ["--max-ms-per-child", args.maxMsPerChild]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    return args;
}

function runNode(script, scriptArgs) {
    const command = [
        script,
        ...scriptArgs.filter(value => value !== null)
    ];

    execFileSync(
        process.execPath,
        command,
        {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: "inherit"
        }
    );
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function renderMarkdown(payload) {
    const lines = [
        "# Coach Candidate Discovery Pipeline",
        "",
        `- Evidence root: \`${payload.args.root}\``,
        `- Worklist depth: ${payload.args.worklistDepth}`,
        `- Child depth: ${payload.args.childDepth}`,
        `- Confirm depth: ${payload.args.confirmDepth}`,
        `- Non-mate depth: ${payload.args.nonmateDepth}`,
        `- Worklist rows: ${payload.summary.worklistRows}`,
        `- Child-gap candidates: ${payload.summary.childGapCandidates}`,
        `- Worklist artifact: \`${payload.artifacts.worklistMarkdown}\``,
        `- Child-gap artifact: \`${payload.artifacts.childGapMarkdown}\``,
        "",
        "## Candidate Labels",
        ""
    ];

    if (payload.candidates.length === 0) {
        lines.push("None.");
    }
    else {
        for (const row of payload.candidates) {
            lines.push(`- ${row.label}: ${row.bestAlternative.move}, gap ${row.bestAlternative.gapCp}cp`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const worklistOut = path.join(args.out, "root-worklist");
    const childGapOut = path.join(args.out, "child-gap-strict");
    fs.mkdirSync(args.out, { recursive: true });

    runNode(
        "tools/build-coach-root-worklist.mjs",
        [
            "--root", args.root,
            "--out", worklistOut,
            "--depth", String(args.worklistDepth),
            "--root-limit", String(args.rootLimit),
            "--min-band", String(args.minBand),
            "--max-top-ties", String(args.maxTopTies),
            "--max-mate-rows", "0",
            "--max-input", String(args.maxInput),
            "--limit", String(args.worklistLimit),
            "--max-ms-per-root", String(args.maxMsPerRoot),
            args.excludeFileRegex ? "--exclude-file-regex" : null,
            args.excludeFileRegex,
            args.excludeLabelRegex ? "--exclude-label-regex" : null,
            args.excludeLabelRegex,
            args.progress ? "--progress" : null
        ]
    );

    const worklistFenFile = path.join(worklistOut, "coach-root-worklist.fens");

    runNode(
        "tools/select-coach-child-gap-fens.mjs",
        [
            "--fen-file", worklistFenFile,
            "--out", childGapOut,
            "--root-depth", String(args.worklistDepth),
            "--child-depth", String(args.childDepth),
            "--confirm-root-depth", String(args.confirmDepth),
            "--nonmate-check-depth", String(args.nonmateDepth),
            "--require-confirm-root-different",
            "--min-gap", String(args.minGap),
            "--min-root-band", String(args.minBand),
            "--max-root-top-ties", String(args.maxTopTies),
            "--max-root-mate-rows", "0",
            "--min-confirm-root-band", String(args.minBand),
            "--max-confirm-root-top-ties", String(args.maxTopTies),
            "--root-limit", String(args.rootLimit),
            "--limit", String(args.worklistLimit),
            "--max-ms-per-child", String(args.maxMsPerChild),
            "--max-ms-per-root", String(args.maxMsPerRoot),
            args.progress ? "--progress" : null
        ]
    );

    const worklistPayload =
        readJson(path.join(worklistOut, "coach-root-worklist.json"));
    const childGapPayload =
        readJson(path.join(childGapOut, "coach-child-gap-candidates.json"));
    const payload = {
        args,
        generatedAt: new Date().toISOString(),
        summary: {
            auditedPositions: worklistPayload.summary.audited,
            worklistRows: worklistPayload.summary.worklist,
            childGapAudited: childGapPayload.summary.audited,
            childGapCandidates: childGapPayload.summary.candidates
        },
        artifacts: {
            worklistMarkdown: path.join(worklistOut, "coach-root-worklist.md"),
            childGapMarkdown: path.join(childGapOut, "coach-child-gap-candidates.md")
        },
        candidates: childGapPayload.candidates
    };

    fs.writeFileSync(
        path.join(args.out, "candidate-discovery-pipeline.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "candidate-discovery-pipeline.md"),
        renderMarkdown(payload)
    );

    console.log(
        `Pipeline complete: ${payload.summary.worklistRows} worklist row(s), ` +
        `${payload.summary.childGapCandidates} candidate(s).`
    );
}

try {
    main();
}
catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
}
