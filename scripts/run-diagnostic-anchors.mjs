#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
    loadAnchorSuite,
    parseDepths,
    runAnchorSuite
} from "./diagnostic-anchor-utils.mjs";

function parseArgs(argv) {

    const args = {
        ids: [],
        tags: [],
        stableOnly: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => argv[++index];

        switch (arg) {
            case "--anchors":
                args.anchorsPath = value();
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
            case "--output":
                args.output = value();
                break;
            case "--stable-only":
                args.stableOnly = true;
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

function printHelp() {

    console.log(`Usage: node scripts/run-diagnostic-anchors.mjs [options]

Options:
  --anchors <path>     Anchor JSON path.
  --id <anchor-id>     Include one anchor; may be repeated.
  --category <name>    Include one category.
  --mode <name>        Include one mode.
  --tag <tag>          Include anchors with a tag; may be repeated.
  --depths <list>      Override anchor depths, e.g. 4,6,8.
  --stable-only        Omit timestamps and timing from output.
  --output <path>      Write JSON output to a file.
`);

}

const args =
    parseArgs(process.argv.slice(2));

if (args.help) {
    printHelp();
    process.exit(0);
}

try {
    const suite =
        await loadAnchorSuite(args.anchorsPath);

    const result =
        runAnchorSuite(suite, {
            ids: args.ids,
            category: args.category,
            mode: args.mode,
            tags: args.tags,
            depths: args.depths,
            includeTiming: !args.stableOnly
        });

    const output =
        args.stableOnly
            ? result
            : {
                ...result,
                generatedAt: new Date().toISOString(),
                node: process.version,
                platform: process.platform
            };

    const json =
        `${JSON.stringify(output, null, 2)}\n`;

    if (args.output) {
        await mkdir(dirname(args.output), { recursive: true });
        await writeFile(args.output, json);
        console.log(`Wrote ${output.count} diagnostic anchor result(s) to ${args.output}.`);
    }
    else {
        process.stdout.write(json);
    }
}
catch (error) {
    console.error(error.message);
    process.exit(1);
}
