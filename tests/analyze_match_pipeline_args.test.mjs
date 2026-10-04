import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("analysis pipeline root triage command includes per-depth timeout", async () => {

    const source =
        await readFile(
            "tools/analyze-match-pipeline.mjs",
            "utf8"
        );

    assert.match(
        source,
        /triageMaxMsPerDepth:\s*5000/
    );

    assert.match(
        source,
        /"--max-ms-per-depth",\s*String\(args\.triageMaxMsPerDepth\)/
    );

});

test("analysis pipeline runs confirmed reference child-search verifier", async () => {

    const source =
        await readFile(
            "tools/analyze-match-pipeline.mjs",
            "utf8"
        );

    assert.match(
        source,
        /childDepth:\s*10/
    );

    assert.match(
        source,
        /confirmChildDepth:\s*"analysis"/
    );

    assert.match(
        source,
        /"tools\\\\verify-reference-child-search\.mjs"/
    );

    assert.match(
        source,
        /"--confirm-child-depth",\s*String\(args\.confirmChildDepth\)/
    );

    assert.match(
        source,
        /reference-child-search-d\$\{args\.childDepth\}-confirmed/
    );

});
