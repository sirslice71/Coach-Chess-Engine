import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function score(cp, isMate = false) {
    return {
        cp,
        isMate,
        mateIn: isMate ? 5 : null
    };
}

function row(label, fen, coachBest, referenceBest, diffCp, extra = {}) {
    return {
        label,
        fen,
        coach: {
            bestMove: coachBest,
            score: extra.coachScore || score(-50)
        },
        reference: {
            bestMove: referenceBest,
            score: extra.referenceScore || score(100)
        },
        comparison: {
            evalDiffCp: diffCp,
            bestMoveAgree: coachBest === referenceBest
        }
    };
}

test("first disagreement extractor keeps earliest valid disagreement per game", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-first-disagreement-test-"));
    const analysisPath = join(tmp, "analysis.json");
    const outDir = join(tmp, "out");

    await writeFile(
        analysisPath,
        JSON.stringify({
            positions: [
                row(
                    "game1-before-12.Nf3",
                    "8/8/8/8/8/8/8/8 w - - 0 1",
                    "g1f3",
                    "g1f3",
                    200
                ),
                row(
                    "game1-before-14.Bc4",
                    "8/8/8/8/8/8/8/8 w - - 0 2",
                    "f1c4",
                    "f1b5",
                    180
                ),
                row(
                    "game1-before-16.O-O",
                    "8/8/8/8/8/8/8/8 w - - 0 3",
                    "e1g1",
                    "d2d4",
                    500
                ),
                row(
                    "game2-before-20.Kg8",
                    "8/8/8/8/8/8/8/8 b - - 0 4",
                    "g8f8",
                    "g8h8",
                    900,
                    {
                        coachScore: score(-99995, true)
                    }
                ),
                row(
                    "game2-before-24.Rd1",
                    "8/8/8/8/8/8/8/8 w - - 0 5",
                    "a1d1",
                    "a1e1",
                    250
                )
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/extract-first-disagreements.mjs",
            "--analysis", analysisPath,
            "--require-label-regex", "before",
            "--max-per-game", "1",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "first-disagreements.json"),
                "utf8"
            )
        );
    const fens =
        await readFile(join(outDir, "first-disagreements.fens"), "utf8");

    assert.equal(payload.summary.selected, 2);
    assert.deepEqual(
        payload.selected.map(item => item.label),
        ["game1-before-14.Bc4", "game2-before-24.Rd1"]
    );
    assert.equal(payload.summary.rejectionCounts.refMoveAgrees, 1);
    assert.equal(payload.summary.rejectionCounts["gameLimit>1"], 1);
    assert.equal(payload.summary.rejectionCounts.mateAnalysisScore, 1);
    assert.match(fens, /game1-before-14\.Bc4 \| /);
    assert.match(fens, /game2-before-24\.Rd1 \| /);
});

test("first disagreement extractor can require material-rich move ranges", async () => {
    const tmp =
        await mkdtemp(join(tmpdir(), "coach-first-disagreement-filter-test-"));
    const analysisPath = join(tmp, "analysis.json");
    const outDir = join(tmp, "out");

    await writeFile(
        analysisPath,
        JSON.stringify({
            positions: [
                row(
                    "game1-before-9.Nf3",
                    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
                    "f3g5",
                    "f3e5",
                    220
                ),
                row(
                    "game2-ply140-Kc5-before",
                    "8/8/4k3/8/1K5p/7r/8/8 w - - 6 82",
                    "b4c5",
                    "b4c4",
                    724
                ),
                row(
                    "game3-ply62-Re1-before",
                    "8/5pRp/8/1p5k/2p4p/3p4/6K1/1r6 b - - 3 86",
                    "d3d2",
                    "h5h6",
                    1176
                )
            ]
        })
    );

    await execFileAsync(
        process.execPath,
        [
            "tools/extract-first-disagreements.mjs",
            "--analysis", analysisPath,
            "--min-fullmove", "5",
            "--max-fullmove", "30",
            "--min-piece-count", "20",
            "--min-non-pawn-material", "3000",
            "--out", outDir
        ]
    );

    const payload =
        JSON.parse(
            await readFile(
                join(outDir, "first-disagreements.json"),
                "utf8"
            )
        );
    const report =
        await readFile(join(outDir, "first-disagreements.md"), "utf8");

    assert.deepEqual(
        payload.selected.map(item => item.label),
        ["game1-before-9.Nf3"]
    );
    assert.equal(payload.summary.rejectionCounts["fullmove>30"], 2);
    assert.equal(payload.summary.rejectionCounts["pieceCount<20"], 2);
    assert.equal(payload.summary.rejectionCounts["nonPawnMaterial<3000"], 2);
    assert.match(report, /Minimum non-pawn material: 3000cp/);
    assert.match(report, /\| Game \| Label \| Move \| Diff \| Pieces \| Non-pawn \|/);
});
