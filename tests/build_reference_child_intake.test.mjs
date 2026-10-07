import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("reference child intake writes a verifier-ready analysis packet", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-reference-intake-test-"));
    const sourceDir = join(tmp, "source");
    const nestedDir = join(sourceDir, "run");
    const outDir = join(tmp, "out");

    await mkdir(nestedDir, { recursive: true });
    await writeFile(
        join(nestedDir, "results.json"),
        JSON.stringify({
            positions: [
                {
                    label: "kings-only-before",
                    fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
                    coach: {
                        bestMove: "a2a3",
                        score: {
                            isMate: false,
                            cp: 0
                        }
                    },
                    reference: {
                        bestMove: "a2b2",
                        score: {
                            isMate: false,
                            cp: 200
                        }
                    },
                    comparison: {
                        bestMoveAgree: false,
                        evalDiffCp: 200
                    }
                },
                {
                    label: "ignored-after",
                    fen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
                    coach: {
                        bestMove: "e2e3"
                    },
                    reference: {
                        bestMove: "e2f2"
                    },
                    comparison: {
                        bestMoveAgree: false,
                        evalDiffCp: 200
                    }
                },
                {
                    label: "mate-disagreement-before",
                    fen: "8/8/8/8/8/8/3K4/7k w - - 0 1",
                    coach: {
                        bestMove: "d2d3",
                        score: {
                            isMate: false,
                            cp: 0
                        }
                    },
                    reference: {
                        bestMove: "d2e2",
                        score: {
                            isMate: true,
                            cp: 99999,
                            mateIn: 1
                        }
                    },
                    comparison: {
                        bestMoveAgree: false,
                        evalDiffCp: 99999,
                        mateDisagreement: true
                    }
                }
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/build-reference-child-intake.mjs",
            "--root", sourceDir,
            "--out", outDir,
            "--depth", "1",
            "--root-limit", "8",
            "--min-diff", "100",
            "--max-input", "5",
            "--limit", "5",
            "--max-ms-per-root", "1000",
            "--exclude-mate-comparisons"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "reference-child-intake.json"),
                "utf8"
            )
        );
    const analysis =
        JSON.parse(
            await readFile(
                join(outDir, "reference-child-intake.analysis.json"),
                "utf8"
            )
        );
    const fens =
        await readFile(
            join(outDir, "reference-child-intake.fens"),
            "utf8"
        );

    assert.equal(payload.summary.filesScanned, 1);
    assert.equal(payload.summary.rawPositions, 3);
    assert.equal(payload.summary.excludedLabels, 1);
    assert.equal(payload.summary.excludedMateComparisons, 1);
    assert.equal(payload.summary.audited, 1);
    assert.equal(payload.summary.selected, 1);
    assert.equal(analysis.positions.length, 1);
    assert.match(analysis.positions[0].label, /run[\\/]results\.json/);
    assert.match(fens, /kings-only-before/);
});

test("reference child intake can prefer newer result files", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-reference-intake-order-test-"));
    const sourceDir = join(tmp, "source");
    const oldDir = join(sourceDir, "old");
    const newDir = join(sourceDir, "new");
    const outDir = join(tmp, "out");

    await mkdir(oldDir, { recursive: true });
    await mkdir(newDir, { recursive: true });

    const makePayload = label => JSON.stringify({
        positions: [
            {
                label,
                fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
                coach: {
                    bestMove: "a2a3",
                    score: {
                        isMate: false,
                        cp: 0
                    }
                },
                reference: {
                    bestMove: "a2b2",
                    score: {
                        isMate: false,
                        cp: 200
                    }
                },
                comparison: {
                    bestMoveAgree: false,
                    evalDiffCp: 200
                }
            }
        ]
    });

    const oldFile = join(oldDir, "results.json");
    const newFile = join(newDir, "results.json");

    await writeFile(oldFile, makePayload("old-row"));
    await writeFile(newFile, makePayload("new-row"));

    const oldDate = new Date("2020-01-01T00:00:00Z");
    const newDate = new Date("2021-01-01T00:00:00Z");
    await import("node:fs/promises").then(fsPromises =>
        Promise.all([
            fsPromises.utimes(oldFile, oldDate, oldDate),
            fsPromises.utimes(newFile, newDate, newDate)
        ])
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/build-reference-child-intake.mjs",
            "--root", sourceDir,
            "--out", outDir,
            "--depth", "1",
            "--root-limit", "8",
            "--min-diff", "100",
            "--max-input", "1",
            "--limit", "1",
            "--max-ms-per-root", "1000",
            "--file-order", "mtime-desc"
        ],
        { cwd: resolve(".") }
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "reference-child-intake.json"),
                "utf8"
            )
        );

    assert.equal(payload.selected[0].position.label, "new-row");
});
