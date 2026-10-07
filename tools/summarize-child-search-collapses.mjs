#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/summarize-child-search-collapses.mjs " +
        "--root <analysis-runs> --out <dir>"
    );
}

function parseArgs(argv) {
    const args = {
        root: null,
        out: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--root") args.root = argv[++index];
        else if (token === "--out") args.out = argv[++index];
        else if (token === "--help" || token === "-h") args.help = true;
        else throw new Error(`Unknown argument: ${token}`);
    }

    if (args.help) return args;
    if (!args.root) throw new Error("Missing --root");
    if (!args.out) throw new Error("Missing --out");

    return args;
}

function findVerifierJsons(root) {
    const out = [];
    const stack = [root];

    while (stack.length) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);

            if (entry.isDirectory()) {
                stack.push(fullPath);
            }
            else if (
                entry.name === "reference-child-search.json" ||
                entry.name === "external-child-search.json"
            ) {
                out.push(fullPath);
            }
        }
    }

    return out.sort();
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function increment(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function gapBucket(gap) {
    if (!Number.isFinite(gap)) return "missing";
    if (gap < 0) return "<0";
    if (gap < 25) return "0-24";
    if (gap < 50) return "25-49";
    if (gap < 100) return "50-99";
    return ">=100";
}

function artifactKind(filePath) {
    return path.basename(filePath) === "external-child-search.json"
        ? "external"
        : "coach";
}

function normalizeRow(filePath, row) {
    const gap =
        Number.isFinite(row.confirmation?.gapCp)
            ? row.confirmation.gapCp
            : row.gapCp;
    const requestedGap =
        Number.isFinite(row.gapCp)
            ? row.gapCp
            : null;

    return {
        artifact: filePath,
        kind: artifactKind(filePath),
        label: row.label,
        fen: row.fen,
        diffCp: row.diffCp ?? null,
        gapCp: gap ?? null,
        initialGapCp: requestedGap,
        keep: row.keep === true,
        reasons: row.reasons || [],
        coachMove: row.coachMove,
        referenceMove: row.referenceMove,
        coachRootRank: row.coachRootRank ?? null,
        referenceRootRank: row.referenceRootRank ?? null,
        rootTopTieCount: row.rootTopTieCount ?? null,
        score: row.score ?? null
    };
}

function isActiveGateKeeper(row) {
    return (
        row.keep &&
        row.kind === "coach" &&
        Number.isFinite(row.gapCp) &&
        row.gapCp >= 100 &&
        !/-after(?:$|-)/.test(row.label || "")
    );
}

function formatCounts(counts) {
    return Object.entries(counts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([key, count]) => `${key}=${count}`)
        .join(", ");
}

function buildMarkdown(payload) {
    const lines = [
        "# Child-Search Collapse Summary",
        "",
        `- Root: \`${payload.root}\``,
        `- Artifacts: ${payload.summary.artifacts}`,
        `- Rows: ${payload.summary.rows}`,
        `- Keepers: ${payload.summary.keepers}`,
        `- Active-gate keepers: ${payload.summary.activeGateKeepers}`,
        `- Rejection counts: ${formatCounts(payload.summary.rejectionCounts) || "none"}`,
        `- Gap buckets: ${formatCounts(payload.summary.gapBuckets) || "none"}`,
        "",
        "## Keepers",
        ""
    ];

    if (payload.keepers.length === 0) {
        lines.push("None.");
    }

    for (const row of payload.keepers.slice(0, 20)) {
        lines.push(
            `- ${row.label}: gap ${row.gapCp}cp, diff ${row.diffCp ?? "n/a"}cp, ` +
            `${row.coachMove} -> ${row.referenceMove}, \`${row.artifact}\``
        );
    }

    lines.push("", "## Active-Gate Keepers", "");

    if (payload.activeGateKeepers.length === 0) {
        lines.push("None.");
    }

    for (const row of payload.activeGateKeepers.slice(0, 20)) {
        lines.push(
            `- ${row.label}: gap ${row.gapCp}cp, diff ${row.diffCp ?? "n/a"}cp, ` +
            `${row.coachMove} -> ${row.referenceMove}, \`${row.artifact}\``
        );
    }

    lines.push("", "## Largest Collapses", "");

    for (const row of payload.largestCollapses.slice(0, 25)) {
        lines.push(
            `- ${row.label}: diff ${row.diffCp ?? "n/a"}cp collapsed to gap ` +
            `${row.gapCp ?? "n/a"}cp (${row.reasons.join(", ") || "no reason"}), ` +
            `\`${row.artifact}\``
        );
    }

    lines.push("", "## Near Misses", "");

    if (payload.nearMisses.length === 0) {
        lines.push("None.");
    }

    for (const row of payload.nearMisses.slice(0, 25)) {
        lines.push(
            `- ${row.label}: gap ${row.gapCp}cp, diff ${row.diffCp ?? "n/a"}cp, ` +
            `${row.coachMove} -> ${row.referenceMove}, \`${row.artifact}\``
        );
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }

    const root = path.resolve(args.root);
    const artifacts = findVerifierJsons(root);
    const rows = [];
    const rejectionCounts = {};
    const gapBuckets = {};

    for (const artifact of artifacts) {
        const payload = readJson(artifact);

        for (const row of payload.rows || []) {
            const normalized = normalizeRow(artifact, row);
            rows.push(normalized);
            increment(gapBuckets, gapBucket(normalized.gapCp));

            for (const reason of normalized.reasons) {
                increment(rejectionCounts, reason);
            }
        }
    }

    const keepers =
        rows
            .filter(row => row.keep)
            .sort((left, right) => (right.gapCp ?? -Infinity) - (left.gapCp ?? -Infinity));
    const activeGateKeepers =
        keepers.filter(isActiveGateKeeper);
    const largestCollapses =
        rows
            .filter(row =>
                !row.keep &&
                Number.isFinite(row.diffCp) &&
                row.diffCp >= 300 &&
                (!Number.isFinite(row.gapCp) || row.gapCp < 100)
            )
            .sort((left, right) => right.diffCp - left.diffCp);
    const nearMisses =
        rows
            .filter(row =>
                !row.keep &&
                Number.isFinite(row.gapCp) &&
                row.gapCp >= 50 &&
                row.gapCp < 100
            )
            .sort((left, right) => right.gapCp - left.gapCp);

    const payload = {
        root,
        generatedAt: new Date().toISOString(),
        summary: {
            artifacts: artifacts.length,
            rows: rows.length,
            keepers: keepers.length,
            activeGateKeepers: activeGateKeepers.length,
            rejectionCounts,
            gapBuckets
        },
        keepers,
        activeGateKeepers,
        largestCollapses,
        nearMisses,
        rows
    };

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(
        path.join(args.out, "child-search-collapse-summary.json"),
        `${JSON.stringify(payload, null, 2)}\n`
    );
    fs.writeFileSync(
        path.join(args.out, "child-search-collapse-summary.md"),
        buildMarkdown(payload)
    );

    console.log(
        `Summarized ${rows.length} row(s) from ${artifacts.length} artifact(s); ` +
        `${keepers.length} keeper(s), ${nearMisses.length} near miss(es).`
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
