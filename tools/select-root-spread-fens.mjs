#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/select-root-spread-fens.mjs " +
        "--triage <fen-triage.json> [--out <dir>] " +
        "[--min-band <cp>] [--max-top-ties <n>] [--max-mate-rows <n>] " +
        "[--require-class <class>] [--exclude-label-regex <pattern>] " +
        "[--limit <n>]"
    );
}

function parseArgs(argv) {
    const args = {
        triage: null,
        out: null,
        minBand: 100,
        maxTopTies: 3,
        maxMateRows: 0,
        requireClass: null,
        excludeLabelRegex: null,
        limit: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--triage") {
            args.triage = argv[++index];
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--min-band") {
            args.minBand = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-top-ties") {
            args.maxTopTies = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--max-mate-rows") {
            args.maxMateRows = Number.parseInt(argv[++index], 10);
        }
        else if (token === "--require-class") {
            args.requireClass = argv[++index];
        }
        else if (token === "--exclude-label-regex") {
            args.excludeLabelRegex = argv[++index];
        }
        else if (token === "--limit") {
            args.limit = Number.parseInt(argv[++index], 10);
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.triage) {
        throw new Error("Missing --triage");
    }

    for (const [name, value] of [
        ["--min-band", args.minBand],
        ["--max-top-ties", args.maxTopTies],
        ["--max-mate-rows", args.maxMateRows]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    if (
        args.limit !== null &&
        (!Number.isInteger(args.limit) || args.limit <= 0)
    ) {
        throw new Error("--limit must be a positive integer");
    }

    args.excludeLabelPattern =
        args.excludeLabelRegex === null ? null : compileRegex(args.excludeLabelRegex);

    return args;
}

function compileRegex(pattern) {
    try {
        return new RegExp(pattern);
    }
    catch (error) {
        throw new Error(`Invalid regex ${pattern}: ${error.message}`);
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deepestDepth(result) {
    return result.depths?.at(-1) || null;
}

function rejectionReasons(args, result) {
    const reasons = [];
    const deepest = deepestDepth(result);
    const classification = deepest?.classification || {};
    const band = classification.topBandCp;
    const topTies = classification.topTieCount;
    const mateRows = classification.mateCount;

    if (args.requireClass && result.classification !== args.requireClass) {
        reasons.push(`class!=${args.requireClass}`);
    }

    if (
        args.excludeLabelPattern &&
        args.excludeLabelPattern.test(result.label)
    ) {
        reasons.push("labelExcluded");
    }

    if (!deepest) {
        reasons.push("missingDepth");
    }

    if (deepest?.classification?.kind !== "spread") {
        reasons.push("deepestNotSpread");
    }

    if (!Number.isFinite(band) || band < args.minBand) {
        reasons.push(`band<${args.minBand}`);
    }

    if (!Number.isFinite(topTies) || topTies > args.maxTopTies) {
        reasons.push(`topTies>${args.maxTopTies}`);
    }

    if (!Number.isFinite(mateRows) || mateRows > args.maxMateRows) {
        reasons.push(`mateRows>${args.maxMateRows}`);
    }

    return reasons;
}

function reasonCounts(rejections) {
    const counts = {};

    for (const rejection of rejections) {
        for (const reason of rejection.reasons) {
            counts[reason] = (counts[reason] || 0) + 1;
        }
    }

    return counts;
}

function outputDir(args) {
    if (args.out) {
        return args.out;
    }

    return path.join(path.dirname(args.triage), "root-spread-fens");
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function selectRows(args, triage) {
    const candidates = [];
    const rejections = [];

    for (const result of triage.results || []) {
        const deepest = deepestDepth(result);
        const reasons = rejectionReasons(args, result);
        const row = {
            label: result.label,
            fen: result.fen,
            triageClass: result.classification,
            depth: deepest?.depth ?? null,
            best: deepest?.best ?? null,
            kind: deepest?.classification?.kind ?? null,
            band: deepest?.classification?.topBandCp ?? null,
            topTies: deepest?.classification?.topTieCount ?? null,
            mateRows: deepest?.classification?.mateCount ?? null
        };

        if (reasons.length === 0) {
            candidates.push(row);
        }
        else {
            rejections.push({
                ...row,
                reasons
            });
        }
    }

    candidates.sort((left, right) =>
        (right.band ?? -Infinity) - (left.band ?? -Infinity)
    );

    return {
        candidates: args.limit === null
            ? candidates
            : candidates.slice(0, args.limit),
        rawCandidates: candidates,
        rejections
    };
}

function writeOutputs(args, triage, selection, outDir) {
    fs.mkdirSync(outDir, { recursive: true });

    const summary = {
        inputPositions: triage.results?.length || 0,
        rawCandidates: selection.rawCandidates.length,
        candidates: selection.candidates.length,
        rejectionCounts: reasonCounts(selection.rejections)
    };

    const payload = {
        args,
        summary,
        candidates: selection.candidates,
        rejections: selection.rejections
    };

    fs.writeFileSync(
        path.join(outDir, "root-spread-fens.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );

    fs.writeFileSync(
        path.join(outDir, "root-spread.fens"),
        selection.candidates
            .map(row => `${row.label} | ${row.fen}`)
            .join("\n") + (selection.candidates.length > 0 ? "\n" : "")
    );

    fs.writeFileSync(
        path.join(outDir, "root-spread-fens.md"),
        renderMarkdown(args, summary, selection)
    );
}

function renderMarkdown(args, summary, selection) {
    const lines = [
        "# Coach Root-Spread FEN Selector",
        "",
        `- Triage: \`${args.triage}\``,
        `- Minimum band: ${args.minBand}cp`,
        `- Maximum top ties: ${args.maxTopTies}`,
        `- Maximum mate rows: ${args.maxMateRows}`,
        `- Required class: ${args.requireClass || "none"}`,
        `- Excluded labels: ${args.excludeLabelRegex || "none"}`,
        `- Candidates: ${summary.candidates}`,
        `- Rejected: ${selection.rejections.length}`,
        `- Rejection counts: ${Object.entries(summary.rejectionCounts)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ") || "none"}`,
        "",
        "## Candidates",
        "",
        "| Label | Class | Depth | Best | Band | Top ties | Mate rows | FEN |",
        "| --- | --- | ---: | --- | ---: | ---: | ---: | --- |"
    ];

    for (const row of selection.candidates) {
        lines.push(
            `| ${escapeMarkdown(row.label)} | ${row.triageClass} | ` +
            `${row.depth ?? ""} | ${row.best ?? ""} | ` +
            `${row.band ?? ""} | ${row.topTies ?? ""} | ` +
            `${row.mateRows ?? ""} | \`${row.fen}\` |`
        );
    }

    lines.push(
        "",
        "## Top Rejections",
        "",
        "| Label | Class | Kind | Band | Top ties | Mate rows | Reasons | FEN |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | --- |"
    );

    for (const row of selection.rejections.slice(0, 20)) {
        lines.push(
            `| ${escapeMarkdown(row.label)} | ${row.triageClass} | ` +
            `${row.kind ?? ""} | ${row.band ?? ""} | ` +
            `${row.topTies ?? ""} | ${row.mateRows ?? ""} | ` +
            `${row.reasons.join(", ")} | \`${row.fen}\` |`
        );
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        const triage = readJson(args.triage);
        const selection = selectRows(args, triage);
        const outDir = outputDir(args);

        writeOutputs(args, triage, selection, outDir);

        console.log(
            `Selected ${selection.candidates.length} root-spread FEN(s) ` +
            `from ${triage.results?.length || 0} triaged position(s).`
        );
    }
    catch (error) {
        usage();
        console.error(error.message);
        process.exitCode = 1;
    }
}

main();
