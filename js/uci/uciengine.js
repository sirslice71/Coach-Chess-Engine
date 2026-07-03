import Board from "../core/board.js";
import FEN from "../core/fen.js";
import MoveGenerator from "../engine/movegen.js";
import LegalMoveGenerator from "../engine/legalmovegen.js";
import Evaluation from "../engine/evaluation.js";
import Search from "../engine/search.js";
import { Piece } from "../core/piece.js";
import {
    algebraic,
    fromAlgebraic
} from "../core/square.js";

function installZobristShim(zobrist) {

    if (!globalThis.window) {
        globalThis.window = {};
    }

    if (!globalThis.window.chess) {
        globalThis.window.chess = {};
    }

    globalThis.window.chess.zobrist = zobrist;

}

function withMutedConsole(fn) {

    const original = {
        clear: console.clear,
        error: console.error,
        log: console.log,
        table: console.table,
        trace: console.trace,
        warn: console.warn
    };

    console.clear = () => {};
    console.error = () => {};
    console.log = () => {};
    console.table = () => {};
    console.trace = () => {};
    console.warn = () => {};

    try {

        return fn();

    }

    finally {

        console.clear = original.clear;
        console.error = original.error;
        console.log = original.log;
        console.table = original.table;
        console.trace = original.trace;
        console.warn = original.warn;

    }

}

export function createEngineCore(fen = null) {

    const board = new Board();

    const moveGenerator =
        new MoveGenerator(board);

    const legalMoveGenerator =
        new LegalMoveGenerator(
            board,
            moveGenerator
        );

    const evaluation =
        new Evaluation(board);

    const search =
        new Search(
            board,
            legalMoveGenerator,
            evaluation
        );

    installZobristShim(search.zobrist);

    if (fen && fen !== "startpos") {
        FEN.import(board, fen);
    }
    else {
        board.hashKey =
            search.zobrist.generate(board);
    }

    return {
        board,
        evaluation,
        legalMoveGenerator,
        moveGenerator,
        search
    };

}

function promotionSuffix(piece) {

    switch (Math.abs(piece)) {

        case Math.abs(Piece.WQ):
            return "q";

        case Math.abs(Piece.WR):
            return "r";

        case Math.abs(Piece.WB):
            return "b";

        case Math.abs(Piece.WN):
            return "n";

        default:
            return "";

    }

}

export function moveToUci(move) {

    let uci =
        algebraic(move.fromSquare) +
        algebraic(move.toSquare);

    if (move.isPromotion()) {
        uci += promotionSuffix(move.promotedPiece);
    }

    return uci;

}

export function uciToMove(uciString, legalMoves) {

    const normalized =
        uciString.trim().toLowerCase();

    return legalMoves.find(move =>
        moveToUci(move) === normalized
    ) || null;

}

export function applyUciMove(engine, uciString) {

    const legalMoves =
        engine.legalMoveGenerator.generateMoves();

    const move =
        uciToMove(
            uciString,
            legalMoves
        );

    if (!move) {

        throw new Error(
            `Illegal UCI move: ${uciString}`
        );

    }

    engine.board.makeMove(move);

    return move;

}

export class UciSession {

    constructor() {

        this.quitRequested = false;

        this.resetEngine();

    }

    resetEngine(fen = null) {

        this.engine =
            createEngineCore(fen);

    }

    handleCommand(line) {

        const trimmed = line.trim();

        if (!trimmed) {
            return [];
        }

        const tokens =
            trimmed.split(/\s+/);

        const command = tokens[0];

        switch (command) {

            case "uci":

                return [
                    "id name Coach Chess Engine",
                    "id author Sir Slice / Sir Slice",
                    "uciok"
                ];

            case "isready":

                return ["readyok"];

            case "ucinewgame":

                this.resetEngine();
                return [];

            case "position":

                this.handlePosition(tokens.slice(1));
                return [];

            case "go":

                return this.handleGo(tokens.slice(1));

            case "quit":

                this.quitRequested = true;
                return [];

            default:

                return [];

        }

    }

    handlePosition(tokens) {

        const movesIndex =
            tokens.indexOf("moves");

        const moveTokens =
            movesIndex === -1
                ? []
                : tokens.slice(movesIndex + 1);

        if (tokens[0] === "startpos") {

            this.resetEngine();

        }

        else if (tokens[0] === "fen") {

            const fenTokens =
                movesIndex === -1
                    ? tokens.slice(1)
                    : tokens.slice(1, movesIndex);

            this.resetEngine(
                fenTokens.join(" ")
            );

        }

        else {

            throw new Error(
                `Unsupported position command: ${tokens.join(" ")}`
            );

        }

        for (const moveText of moveTokens) {
            applyUciMove(this.engine, moveText);
        }

    }

    handleGo(tokens) {

        const depthIndex =
            tokens.indexOf("depth");

        if (
            depthIndex === -1 ||
            depthIndex === tokens.length - 1
        ) {

            return [
                "info string Phase 1 supports only 'go depth N'",
                "bestmove 0000"
            ];

        }

        const depth =
            Math.max(
                1,
                Number.parseInt(
                    tokens[depthIndex + 1],
                    10
                ) || 1
            );

        const rootSideToMove =
            this.engine.board.sideToMove;

        const result =
            withMutedConsole(() =>
                this.engine.search.bestMove(depth)
            );

        const whiteRelativeScore =
            this.engine.search.lastSearchScore;

        //----------------------------------
        // UCI info score uses root-side-relative
        // centipawns, while browser diagnostics
        // remain White-relative.
        //----------------------------------

        const sideRelativeScore =
            this.engine.search.toSideToMoveScore(
                whiteRelativeScore,
                rootSideToMove
            );

        const pv =
            (result.pv || [])
                .map(moveToUci)
                .join(" ");

        const bestMove =
            result.move
                ? moveToUci(result.move)
                : "0000";

        const info =
            [
                "info",
                "depth", result.depth,
                "score", "cp", sideRelativeScore,
                "nodes", result.nodes
            ];

        if (pv) {
            info.push("pv", pv);
        }

        return [
            info.join(" "),
            `bestmove ${bestMove}`
        ];

    }

}

export {
    withMutedConsole,
    installZobristShim
};
