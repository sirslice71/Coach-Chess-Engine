import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    checkPreflight,
    countPgnGames
} from "../tools/check-candidate-smoke-preflight.mjs";

test("countPgnGames counts PGN Event headers", () => {

    const pgn = [
        '[Event "one"]',
        '[White "A"]',
        "",
        "1. e4 e5 *",
        "",
        '[Event "two"]',
        '[White "C"]',
        "",
        "1. d4 d5 *"
    ].join("\n");

    assert.equal(countPgnGames(pgn), 2);

});

test("checkPreflight verifies required files and absent match outputs", () => {

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coach-preflight-"));
    const runDir = path.join(tempDir, "run");
    const openingsPath = path.join(tempDir, "openings.pgn");
    const cutechessPath = path.join(tempDir, "cutechess-cli.exe");
    const shallowPath = path.join(tempDir, "shallowblue.exe");

    fs.mkdirSync(runDir);
    fs.writeFileSync(path.join(tempDir, "uci.js"), "");
    fs.writeFileSync(cutechessPath, "");
    fs.writeFileSync(shallowPath, "");
    fs.writeFileSync(
        openingsPath,
        ['[Event "one"]', "", "1. e4 e5 *"].join("\n")
    );

    const report =
        checkPreflight(
            {
                run: "run",
                openings: "openings.pgn",
                cutechess: cutechessPath,
                shallowblue: shallowPath,
                expectedOpenings: 1
            },
            tempDir
        );

    assert.equal(report.ok, true);

    fs.writeFileSync(path.join(runDir, "match.pgn"), "");

    const rerunReport =
        checkPreflight(
            {
                run: "run",
                openings: "openings.pgn",
                cutechess: cutechessPath,
                shallowblue: shallowPath,
                expectedOpenings: 1
            },
            tempDir
        );

    assert.equal(rerunReport.ok, false);
    assert.equal(
        rerunReport.checks.find(check => check.name === "match PGN not present").ok,
        false
    );

});
