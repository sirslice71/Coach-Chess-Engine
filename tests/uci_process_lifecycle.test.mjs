import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot =
    path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        ".."
    );

function runUci(input) {

    return new Promise((resolve, reject) => {

        const child = spawn(
            process.execPath,
            ["uci.js"],
            {
                cwd: repoRoot,
                stdio: ["pipe", "pipe", "pipe"]
            }
        );
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error("Coach did not exit after its input closed"));
        }, 5000);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.on("data", chunk => {
            stderr += chunk;
        });
        child.on("error", error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("close", code => {
            clearTimeout(timeout);
            resolve({ code, stdout, stderr });
        });

        child.stdin.end(input);

    });

}

test("direct Node UCI process exits cleanly on quit", async () => {

    const result =
        await runUci("uci\nisready\nquit\n");

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /uciok/);
    assert.match(result.stdout, /readyok/);

});

test("direct Node UCI process exits cleanly when stdin closes", async () => {

    const result =
        await runUci("uci\nisready\n");

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /uciok/);
    assert.match(result.stdout, /readyok/);

});

test("repeated direct Node UCI games leave no running engine processes", async () => {

    const runs = [];

    for (let index = 0; index < 12; index++) {
        runs.push(runUci("uci\nisready\nquit\n"));
    }

    const results = await Promise.all(runs);

    assert.equal(results.length, 12);

    for (const result of results) {
        assert.equal(result.code, 0);
        assert.equal(result.stderr, "");
        assert.match(result.stdout, /uciok/);
        assert.match(result.stdout, /readyok/);
    }

});
