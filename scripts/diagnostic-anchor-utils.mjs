import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { createEngineCore, moveToUci } from "../js/uci/uciengine.js";

export const DEFAULT_ANCHORS_PATH =
    new URL("../tests/data/diagnostic_anchors.json", import.meta.url);

export function parseDepths(value) {

    if (!value) {
        return null;
    }

    return value
        .split(",")
        .map(part => Number.parseInt(part.trim(), 10))
        .filter(Number.isInteger);

}

export async function loadAnchorSuite(path = DEFAULT_ANCHORS_PATH) {

    return JSON.parse(
        await readFile(path, "utf8")
    );

}

export function selectAnchors(anchors, filters = {}) {

    const idSet =
        filters.ids && filters.ids.length
            ? new Set(filters.ids)
            : null;

    const tagSet =
        filters.tags && filters.tags.length
            ? new Set(filters.tags)
            : null;

    const selected =
        anchors.filter(anchor => {

            if (idSet && !idSet.has(anchor.id)) {
                return false;
            }

            if (filters.category && anchor.category !== filters.category) {
                return false;
            }

            if (filters.mode && anchor.mode !== filters.mode) {
                return false;
            }

            if (tagSet && !anchor.tags?.some(tag => tagSet.has(tag))) {
                return false;
            }

            return true;

        });

    if (idSet) {
        const foundIds =
            new Set(selected.map(anchor => anchor.id));

        const missingIds =
            [...idSet].filter(id => !foundIds.has(id));

        if (missingIds.length) {
            throw new Error(`Unknown diagnostic anchor id(s): ${missingIds.join(", ")}`);
        }
    }

    return selected;

}

export function normalizeScore(value) {

    if (value === undefined || value === null) {
        return null;
    }

    return String(value);

}

export function stableSearchEntry(anchor, requestedDepth, result) {

    return {
        id: anchor.id,
        category: anchor.category,
        mode: anchor.mode,
        fen: anchor.fen,
        depth: requestedDepth,
        requestedDepth,
        completedDepth: result.completedDepth ?? requestedDepth,
        bestMove: result.bestMove,
        score: normalizeScore(result.score),
        nodes: result.nodes,
        qsearchEntries: result.qsearchEntries,
        pv: result.pv
    };

}

export function checkAnchorExpectation(anchor, depth, bestMove) {

    const expectedMoves =
        anchor.expected?.depth === depth
            ? anchor.expected.moves
            : null;

    const referenceMoves =
        anchor.reference?.moves || null;

    return {
        expected: expectedMoves
            ? {
                strict: anchor.expected.strict === true,
                accepted: expectedMoves.includes(bestMove),
                moves: expectedMoves
            }
            : null,
        reference: referenceMoves
            ? {
                strict: anchor.reference.strict === true,
                accepted: referenceMoves.includes(bestMove),
                moves: referenceMoves
            }
            : null
    };

}

export function runAnchorSearch(anchor, depth, options = {}) {

    const engine =
        createEngineCore(anchor.fen);

    const legalMoves =
        engine.legalMoveGenerator.generateMoves();

    if (legalMoves.length === 0) {
        return {
            stable: stableSearchEntry(anchor, depth, {
                bestMove: null,
                score: null,
                completedDepth: 0,
                nodes: 0,
                qsearchEntries: 0,
                pv: []
            }),
            checks: checkAnchorExpectation(anchor, depth, null),
            elapsedMs: 0,
            legalMoves: 0
        };
    }

    const startedAt =
        performance.now();

    const searchResult =
        engine.search.bestMove(depth, { quiet: true });

    const elapsedMs =
        performance.now() - startedAt;

    const bestMove =
        searchResult.move
            ? moveToUci(searchResult.move)
            : null;

    const stable =
        stableSearchEntry(anchor, depth, {
            bestMove,
            score: searchResult.evaluation,
            completedDepth: searchResult.depth ?? depth,
            nodes: searchResult.nodes ?? 0,
            qsearchEntries: searchResult.leafNodes ?? 0,
            pv: (searchResult.pv || []).map(moveToUci)
        });

    return {
        stable,
        checks: checkAnchorExpectation(anchor, depth, bestMove),
        elapsedMs: options.includeTiming === false
            ? undefined
            : Number(elapsedMs.toFixed(3)),
        legalMoves: legalMoves.length
    };

}

export function runAnchorSuite(suite, filters = {}) {

    const selected =
        selectAnchors(suite.anchors, filters);

    const forcedDepths =
        filters.depths || null;

    const results = [];

    for (const anchor of selected) {
        const depths =
            forcedDepths || anchor.depths || [4];

        for (const depth of depths) {
            const run =
                runAnchorSearch(anchor, depth, filters);

            results.push({
                ...run.stable,
                checks: run.checks,
                legalMoves: run.legalMoves,
                ...(run.elapsedMs === undefined
                    ? {}
                    : { elapsedMs: run.elapsedMs })
            });
        }
    }

    return {
        schemaVersion: 1,
        baselineCommit: suite.baselineCommit,
        filters: {
            ids: filters.ids || null,
            category: filters.category || null,
            mode: filters.mode || null,
            tags: filters.tags || null,
            depths: filters.depths || null
        },
        count: results.length,
        results
    };

}

function scoreNumber(score) {

    if (score === null || score === undefined) {
        return null;
    }

    const parsed =
        Number.parseFloat(score);

    return Number.isFinite(parsed)
        ? parsed
        : null;

}

export function compareStableEntries(expected, actual, options = {}) {

    const level =
        options.level || "exact-tree";

    const scoreTolerance =
        options.scoreTolerance ?? 0;

    const differences = [];

    const check = (field, left, right) => {
        if (JSON.stringify(left) !== JSON.stringify(right)) {
            differences.push({ field, expected: left, actual: right });
        }
    };

    check("bestMove", expected.bestMove, actual.bestMove);
    check("completedDepth", expected.completedDepth, actual.completedDepth);

    if (level === "strength") {
        return differences;
    }

    const leftScore =
        scoreNumber(expected.score);

    const rightScore =
        scoreNumber(actual.score);

    if (
        leftScore !== null &&
        rightScore !== null &&
        scoreTolerance > 0
    ) {
        if (Math.abs(leftScore - rightScore) > scoreTolerance) {
            differences.push({
                field: "score",
                expected: expected.score,
                actual: actual.score
            });
        }
    }
    else {
        check("score", expected.score, actual.score);
    }

    if (level === "functional") {
        return differences;
    }

    check("nodes", expected.nodes, actual.nodes);
    check("qsearchEntries", expected.qsearchEntries, actual.qsearchEntries);
    check("pv", expected.pv, actual.pv);

    return differences;

}

export function compareResultSets(expectedSet, actualSet, options = {}) {

    const keyOf = result =>
        `${result.id}@${result.depth}`;

    const actualByKey =
        new Map(actualSet.results.map(result => [keyOf(result), result]));

    const differences = [];

    for (const expected of expectedSet.results) {
        const key =
            keyOf(expected);

        const actual =
            actualByKey.get(key);

        if (!actual) {
            differences.push({
                key,
                field: "entry",
                expected: "present",
                actual: "missing"
            });
            continue;
        }

        for (const difference of compareStableEntries(expected, actual, options)) {
            differences.push({ key, ...difference });
        }
    }

    return {
        ok: differences.length === 0,
        differences
    };

}
