#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
    console.error(
        "Usage: node tools/summarize-external-child-disagreements.mjs " +
        "--root <analysis-runs-dir> --out <dir> [--min-external-gap 100] " +
        "[--max-coach-child-gap 99] [--limit 30]"
    );
}

export function parseArgs(argv) {
    const args = {
        root: null,
        out: null,
        minExternalGap: 100,
        maxCoachChildGap: 99,
        limit: 30
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--root") args.root = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--min-external-gap") args.minExternalGap = Number.parseInt(argv[++index], 10);
        else if (token === "--max-coach-child-gap") args.maxCoachChildGap = Number.parseInt(argv[++index], 10);
        else if (token === "--limit") args.limit = Number.parseInt(argv[++index], 10);
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.root) throw new Error("Missing --root");
    if (!args.out) throw new Error("Missing --out");

    for (const [name, value] of [
        ["--min-external-gap", args.minExternalGap],
        ["--max-coach-child-gap", args.maxCoachChildGap],
        ["--limit", args.limit]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer`);
        }
    }

    return args;
}

function walkFiles(rootDir) {
    const files = [];

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const fullPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            files.push(...walkFiles(fullPath));
        }
        else if (entry.isFile() && entry.name === "root-bound-pairs.json") {
            files.push(fullPath);
        }
    }

    return files.sort();
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function abs(value) {
    return Math.abs(Number.isFinite(value) ? value : 0);
}

export function classifyRow(args, row) {
    const reasons = [];
    const externalGap = abs(row.externalGapCp);
    const coachChildGap = abs(row.childGapCp);

    if (externalGap < args.minExternalGap) {
        reasons.push(`externalGap<${args.minExternalGap}`);
    }
    if (coachChildGap > args.maxCoachChildGap) {
        reasons.push(`coachChildGap>${args.maxCoachChildGap}`);
    }
    if (!row.reasons?.includes("coach-child-disagrees-with-external")) {
        reasons.push("missingExternalDisagreementTag");
    }

    return {
        keep: reasons.length === 0,
        reasons
    };
}

function collectRows(args) {
    const files = walkFiles(args.root);
    const rows = [];
    const rejections = [];
    const reasonCounts = {};

    for (const file of files) {
        const payload = readJson(file);
        const source = path.relative(args.root, file);

        for (const row of payload.rows || []) {
            const classified = classifyRow(args, row);
            const item = {
                source,
                label: row.label,
                fen: row.fen,
                coachMove: row.coachMove,
                referenceMove: row.referenceMove,
                rootGapCp: row.rootGapCp,
                coachChildGapCp: row.childGapCp,
                coachChildBandCp: row.childBandCp,
                externalGapCp: row.externalGapCp,
                pairReasons: row.reasons || [],
                rejectReasons: classified.reasons
            };

            if (classified.keep) {
                rows.push(item);
            }
            else {
                rejections.push(item);
                for (const reason of classified.reasons) {
                    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                }
            }
        }
    }

    rows.sort((left, right) =>
        abs(right.externalGapCp) - abs(left.externalGapCp)
    );

    return {
        files,
        rows,
        limitedRows: rows.slice(0, args.limit),
        rejections,
        reasonCounts
    };
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function renderMarkdown(payload) {
    const lines = [
        "# External-vs-Coach Child Disagreement Audit",
        "",
        `- Root: \`${payload.args.root}\``,
        `- Min external gap: ${payload.args.minExternalGap}cp`,
        `- Max Coach child gap: ${payload.args.maxCoachChildGap}cp`,
        `- Files scanned: ${payload.summary.filesScanned}`,
        `- Rows audited: ${payload.summary.rowsAudited}`,
        `- External-only disagreements: ${payload.summary.externalOnlyDisagreements}`,
        `- Rejection counts: ${Object.entries(payload.summary.rejectionCounts)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(", ") || "none"}`,
        "",
        "## External-Only Disagreements",
        "",
        "| Label | External gap | Coach child gap | Root gap | Coach | Reference | Source | FEN |",
        "| --- | ---: | ---: | ---: | --- | --- | --- | --- |"
    ];

    for (const row of payload.rows) {
        lines.push(
            `| ${escapeMarkdown(row.label)} | ${row.externalGapCp ?? ""} | ` +
            `${row.coachChildGapCp ?? ""} | ${row.rootGapCp ?? ""} | ` +
            `${row.coachMove ?? ""} | ${row.referenceMove ?? ""} | ` +
            `${escapeMarkdown(row.source)} | \`${row.fen}\` |`
        );
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const collected = collectRows(args);
    const payload = {
        args,
        generatedAt: new Date().toISOString(),
        summary: {
            filesScanned: collected.files.length,
            rowsAudited: collected.rows.length + collected.rejections.length,
            externalOnlyDisagreements: collected.rows.length,
            emittedRows: collected.limitedRows.length,
            rejectionCounts: collected.reasonCounts
        },
        rows: collected.limitedRows,
        allRows: collected.rows,
        rejections: collected.rejections
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "external-child-disagreements.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "external-child-disagreements.md"),
        renderMarkdown(payload)
    );

    console.log(
        `Audited ${payload.summary.rowsAudited} pair row(s), found ` +
        `${payload.summary.externalOnlyDisagreements} external-only disagreement(s).`
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        main();
    }
    catch (error) {
        console.error(error.message);
        usage();
        process.exit(1);
    }
}
