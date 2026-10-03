#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/rank-triage-candidates.mjs " +
        "--analysis <coach-analysis-lab results.json> " +
        "--triage <fen-triage.json> [--out <dir>] [--min-diff <cp>]"
    );
}

function parseArgs(argv) {
    const args = {
        analysis: null,
        triage: null,
        out: null,
        minDiff: 150
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--analysis") {
            args.analysis = argv[++index];
        }
        else if (token === "--triage") {
            args.triage = argv[++index];
        }
        else if (token === "--out") {
            args.out = argv[++index];
        }
        else if (token === "--min-diff") {
            args.minDiff = Number.parseInt(argv[++index], 10);
        }
        else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!args.analysis) {
        throw new Error("Missing --analysis");
    }

    if (!args.triage) {
        throw new Error("Missing --triage");
    }

    if (!Number.isInteger(args.minDiff) || args.minDiff < 0) {
        throw new Error("--min-diff must be a non-negative integer");
    }

    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function keyFor(label, fen) {
    return `${label}\n${fen}`;
}

function absoluteDiff(position) {
    const diff = position.comparison?.evalDiffCp;
    return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function isUsefulClass(classification) {
    return classification === "candidate-review" ||
        classification === "early-spread-then-tie" ||
        classification === "diagnostic-only";
}

function deepestSummary(triageItem) {
    const deepest = triageItem.depths.at(-1);

    if (!deepest) {
        return {
            depth: null,
            best: null,
            band: null,
            ties: null,
            mateRows: null
        };
    }

    return {
        depth: deepest.depth,
        best: deepest.best,
        band: deepest.classification.topBandCp,
        ties: deepest.classification.topTieCount,
        mateRows: deepest.classification.mateCount
    };
}

function candidateScore(item) {
    const diff = item.diffCp ?? 0;
    const band = item.deepest.band ?? 0;
    const classBonus =
        item.triageClass === "candidate-review" ? 500 :
        item.triageClass === "early-spread-then-tie" ? 150 :
        0;
    const disagreementBonus = item.bestMoveAgree === false ? 200 : 0;

    return diff + band + classBonus + disagreementBonus;
}

function buildMerged(analysis, triage, minDiff) {
    const triageByKey = new Map();
    const triageByFen = new Map();

    for (const item of triage.results || []) {
        triageByKey.set(keyFor(item.label, item.fen), item);

        if (!triageByFen.has(item.fen)) {
            triageByFen.set(item.fen, []);
        }

        triageByFen.get(item.fen).push(item);
    }

    const merged = [];

    for (const position of analysis.positions || []) {
        if (position.error || !position.comparison || !position.reference) {
            continue;
        }

        const diffCp = absoluteDiff(position);

        if (diffCp === null || diffCp < minDiff) {
            continue;
        }

        const exact =
            triageByKey.get(keyFor(position.label, position.fen));

        const fallback =
            exact || (triageByFen.get(position.fen) || [])[0] || null;

        if (!fallback) {
            continue;
        }

        const deepest = deepestSummary(fallback);

        merged.push({
            label: position.label,
            fen: position.fen,
            triageLabel: fallback.label,
            triageClass: fallback.classification,
            usefulClass: isUsefulClass(fallback.classification),
            coachBest: position.coach.bestMove,
            referenceBest: position.reference.bestMove,
            bestMoveAgree: position.comparison.bestMoveAgree,
            diffCp,
            coachScore: position.coach.score,
            referenceScore: position.reference.score,
            deepest,
            themes: position.themes || [],
            pgn: position.pgn || null
        });
    }

    return merged
        .map(item => ({
            ...item,
            score: candidateScore(item)
        }))
        .sort((left, right) => right.score - left.score);
}

function countsBy(items, keyFn) {
    return items.reduce((counts, item) => {
        const key = keyFn(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function formatCounts(counts) {
    return Object.entries(counts)
        .map(([key, count]) => `${key}=${count}`)
        .join(", ");
}

function scoreText(score) {
    if (!score) {
        return "n/a";
    }

    if (score.isMate) {
        return score.mateIn === null
            ? `mate-class ${score.cp}`
            : `mate ${score.mateIn}`;
    }

    return `${score.cp}cp`;
}

function escapeMarkdown(text) {
    return String(text).replaceAll("|", "\\|");
}

function buildMarkdown(args, merged) {
    const useful = merged.filter(item => item.usefulClass);
    const lines = [
        "# Ranked Coach Candidates",
        "",
        `- Analysis: \`${args.analysis}\``,
        `- Triage: \`${args.triage}\``,
        `- Minimum eval diff: ${args.minDiff}cp`,
        `- Candidates above threshold: ${merged.length}`,
        `- Useful triage classes: ${useful.length}`,
        `- Class counts: ${formatCounts(countsBy(merged, item => item.triageClass)) || "none"}`,
        "",
        "| Rank | Keep | Label | Class | Diff | Coach | Ref | D | Band | Ties | Mate rows | FEN |",
        "| ---: | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |"
    ];

    for (const [index, item] of merged.entries()) {
        lines.push([
            index + 1,
            item.usefulClass ? "yes" : "no",
            escapeMarkdown(item.label),
            item.triageClass,
            item.diffCp,
            `${item.coachBest} ${scoreText(item.coachScore)}`,
            `${item.referenceBest} ${scoreText(item.referenceScore)}`,
            item.deepest.depth ?? "",
            item.deepest.band ?? "",
            item.deepest.ties ?? "",
            item.deepest.mateRows ?? "",
            `\`${item.fen}\``
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }

    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const analysis = readJson(args.analysis);
    const triage = readJson(args.triage);
    const merged = buildMerged(analysis, triage, args.minDiff);

    const payload = {
        args,
        summary: {
            candidatesAboveThreshold: merged.length,
            usefulTriageClasses: merged.filter(item => item.usefulClass).length,
            classCounts: countsBy(merged, item => item.triageClass)
        },
        candidates: merged
    };

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });

        fs.writeFileSync(
            path.join(args.out, "ranked-candidates.json"),
            JSON.stringify(payload, null, 2) + "\n"
        );

        fs.writeFileSync(
            path.join(args.out, "ranked-candidates.md"),
            buildMarkdown(args, merged)
        );
    }

    console.log(
        `Ranked ${merged.length} candidate(s), ` +
        `${payload.summary.usefulTriageClasses} useful after triage.`
    );

    for (const item of merged.slice(0, 10)) {
        console.log(
            `${item.usefulClass ? "KEEP" : "skip"} ` +
            `${item.label}: ${item.triageClass}, ` +
            `diff=${item.diffCp}cp, band=${item.deepest.band ?? "n/a"}, ` +
            `${item.coachBest} vs ${item.referenceBest}`
        );
    }
}

try {
    main();
}
catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
}
