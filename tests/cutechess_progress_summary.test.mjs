import test from "node:test";
import assert from "node:assert/strict";

import {
    parseProgress
} from "../tools/summarize-cutechess-progress.mjs";

test("parseProgress summarizes running CuteChess output", () => {

    const progress =
        parseProgress(
            [
                "Started game 1 of 20 (Coach vs ShallowBlue 1618)",
                "Started game 2 of 20 (ShallowBlue 1618 vs Coach)",
                "Finished game 1 (Coach vs ShallowBlue 1618): 1-0 {White mates}",
                "Score of Coach vs ShallowBlue 1618: 1 - 0 - 0  [1.000] 1"
            ].join("\n")
        );

    assert.equal(progress.startedGames, 2);
    assert.equal(progress.finishedGames, 1);
    assert.equal(progress.totalGames, 20);
    assert.equal(progress.inProgressGames, 1);
    assert.equal(progress.finishedMatch, false);
    assert.equal(
        progress.lastScore,
        "Score of Coach vs ShallowBlue 1618: 1 - 0 - 0  [1.000] 1"
    );

});

test("parseProgress detects completed match", () => {

    const progress =
        parseProgress(
            [
                "Started game 1 of 1 (Coach vs ShallowBlue 1618)",
                "Finished game 1 (Coach vs ShallowBlue 1618): 0-1 {Black mates}",
                "Score of Coach vs ShallowBlue 1618: 0 - 1 - 0  [0.000] 1",
                "Finished match"
            ].join("\n")
        );

    assert.equal(progress.finishedGames, 1);
    assert.equal(progress.finishedMatch, true);

});
