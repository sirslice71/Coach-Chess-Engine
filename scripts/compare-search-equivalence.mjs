#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
    compareResultSets,
    loadAnchorSuite,
    parseDepths,
    runAnchorSuite
} from "./diagnostic-anchor-utils.mjs";

function parseArgs(argv) {

    const args = {
        ids: [],
        tags: [],
        level: "exact-tree",
        scoreTolerance: 0
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => argv[++index];

        switch (arg) {
            case "--baseline":
                args.baseline = value();
                break;
            case "--candidate":
                args.candidate = value();
                break;
            case "--capture":
                args.capture = true;
                break;
            case "--anchors":
                args.anchorsPath = value();
                break;
            case "--output":
                args.output = value();
                break;
            case "--level":
                args.level = value();
                break;
            case "--score-tolerance":
                args.scoreTolerance = Number.parseFloat(value());
                break;
            case "--id":
                args.ids.push(value());
                break;
            case "--category":
                args.category = value();
                break;
            case "--mode":
                args.mode = value();
                break;
            case "--tag":
                args.tags.push(value());
                break;
            case "--depths":
                args.depths = parseDepths(value());
                break;
            case "--help":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;

}

async function readJson(path) {

    return JSON.parse(
        await readFile(path, "utf8")
    );

}

function printHelp() {

    console.log(`Usage:
  node scripts/compare-search-equivalence.mjs --capture --output <file>
  node scripts/compare-search-equivalence.mjs --baseline <file> --candidate <file>

Options:
  --level exact-tree|functional|strength
  --score-tolerance <number>
  --id/--category/--mode/--tag/--depths filters match run-diagnostic-anchors.
`);

}

const args =
    parseArgs(process.argv.slice(2));

if (args.help) {
    printHelp();
    process.exit(0);
}

try {
    if (args.capture) {
        if (!args.output) {
            throw new Error("--capture requires --output");
        }

        const suite =
            await loadAnchorSuite(args.anchorsPath);

        const result =
            runAnchorSuite(suite, {
                ids: args.ids,
                category: args.category,
                mode: args.mode,
                tags: args.tags,
                depths: args.depths,
                includeTiming: false
            });

        await mkdir(dirname(args.output), { recursive: true });
        await writeFile(
            args.output,
            `${JSON.stringify(result, null, 2)}\n`
        );

        console.log(`Captured ${result.count} anchor result(s) to ${args.output}.`);
        process.exit(0);
    }

    if (!args.baseline || !args.candidate) {
        throw new Error("Provide --baseline and --candidate, or use --capture --output.");
    }

    const baseline =
        await readJson(args.baseline);

    const candidate =
        await readJson(args.candidate);

    const comparison =
        compareResultSets(baseline, candidate, {
            level: args.level,
            scoreTolerance: args.scoreTolerance
        });

    if (comparison.ok) {
        console.log(`Search equivalence passed at ${args.level} level.`);
        process.exit(0);
    }

    console.error(`Search equivalence failed at ${args.level} level.`);

    for (const difference of comparison.differences.slice(0, 50)) {
        console.error(
            `${difference.key} ${difference.field}: expected ${JSON.stringify(difference.expected)}, actual ${JSON.stringify(difference.actual)}`
        );
    }

    if (comparison.differences.length > 50) {
        console.error(`... ${comparison.differences.length - 50} more difference(s).`);
    }

    process.exit(1);
}
catch (error) {
    console.error(error.message);
    process.exit(1);
}
