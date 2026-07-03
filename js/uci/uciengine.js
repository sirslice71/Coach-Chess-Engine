import Board from "../core/board.js";
import FEN from "../core/fen.js";
import MoveGenerator from "../engine/movegen.js";
import LegalMoveGenerator from "../engine/legalmovegen.js";
import Evaluation from "../engine/evaluation.js";
import Search from "../engine/search.js";
import TranspositionTable from "../engine/transpositiontable.js";
import { Piece } from "../core/piece.js";
import {
    algebraic,
} from "../core/square.js";

const UCI_HASH_DEFAULT_MB = 32;
const UCI_HASH_MIN_MB = 1;
const UCI_HASH_MAX_MB = 512;
const UCI_MOVE_OVERHEAD_DEFAULT_MS = 50;
const UCI_MOVE_OVERHEAD_MIN_MS = 0;
const UCI_MOVE_OVERHEAD_MAX_MS = 1000;
const UCI_DEFAULT_MOVES_TO_GO = 30;
const UCI_MAX_MOVES_TO_GO = 100;

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
    const search =
        new Search(
            board,
            new LegalMoveGenerator(
                board,
                new MoveGenerator(board)
            ),
            new Evaluation(board)
        );

    const moveGenerator =
        search.legalMoveGenerator.moveGenerator;

    const legalMoveGenerator =
        search.legalMoveGenerator;

    const evaluation =
        search.evaluation;

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

export function allocateMoveTime({
    sideToMove,
    wtime = 0,
    btime = 0,
    winc = 0,
    binc = 0,
    moveOverheadMs = UCI_MOVE_OVERHEAD_DEFAULT_MS,
    movestogo = null
}) {

    const remainingTime =
        sideToMove > 0 ? wtime : btime;

    const increment =
        sideToMove > 0 ? winc : binc;

    if (remainingTime <= 0) {
        return 1;
    }

    const overhead =
        Math.max(
            UCI_MOVE_OVERHEAD_MIN_MS,
            Math.min(
                UCI_MOVE_OVERHEAD_MAX_MS,
                Math.floor(moveOverheadMs)
            )
        );

    const safetyBuffer =
        remainingTime > 1000 ? 100 : 50;

    const reservedTime =
        safetyBuffer + overhead;

    const usableTime =
        Math.max(1, remainingTime - reservedTime);

    const movesToGo =
        Number.isInteger(movestogo) &&
        movestogo > 0
            ? Math.min(
                UCI_MAX_MOVES_TO_GO,
                movestogo
            )
            : UCI_DEFAULT_MOVES_TO_GO;

    const base =
        usableTime / movesToGo;

    const incrementPart =
        increment * 0.75;

    let minimumFloor = 50;

    if (remainingTime <= 500) {
        minimumFloor = 10;
    }
    else if (remainingTime <= 2000) {
        minimumFloor = 25;
    }

    const minimumBudget =
        Math.min(
            usableTime,
            minimumFloor
        );

    const maximumBudget =
        Math.max(
            minimumBudget,
            Math.floor(usableTime * 0.10)
        );

    const rawBudget =
        Math.floor(base + incrementPart);

    return Math.max(
        1,
        Math.min(
            maximumBudget,
            Math.max(minimumBudget, rawBudget)
        )
    );

}

function clampHashSize(value) {

    if (!Number.isFinite(value)) {
        return UCI_HASH_DEFAULT_MB;
    }

    return Math.max(
        UCI_HASH_MIN_MB,
        Math.min(
            UCI_HASH_MAX_MB,
            Math.floor(value)
        )
    );

}

function clampMoveOverhead(value, fallback = UCI_MOVE_OVERHEAD_DEFAULT_MS) {

    if (!Number.isFinite(value)) {
        return fallback;
    }

    return Math.max(
        UCI_MOVE_OVERHEAD_MIN_MS,
        Math.min(
            UCI_MOVE_OVERHEAD_MAX_MS,
            Math.floor(value)
        )
    );

}

function parseSetOption(tokens) {

    const nameIndex =
        tokens.indexOf("name");

    if (nameIndex === -1) {
        return null;
    }

    const valueIndex =
        tokens.indexOf("value");

    const nameTokens =
        valueIndex === -1
            ? tokens.slice(nameIndex + 1)
            : tokens.slice(nameIndex + 1, valueIndex);

    const valueTokens =
        valueIndex === -1
            ? []
            : tokens.slice(valueIndex + 1);

    return {
        name: nameTokens.join(" ").trim(),
        value: valueTokens.join(" ").trim()
    };

}

export class UciSession {

    constructor() {

        this.quitRequested = false;
        this.debugEnabled = false;
        this.hashSizeMB = UCI_HASH_DEFAULT_MB;
        this.moveOverheadMs =
            UCI_MOVE_OVERHEAD_DEFAULT_MS;

        this.resetEngine();

    }

    resetEngine(fen = null) {

        this.engine =
            createEngineCore(fen);

        this.engine.search.tt =
            new TranspositionTable(
                this.hashSizeMB
            );

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
                    `option name Hash type spin default ${UCI_HASH_DEFAULT_MB} min ${UCI_HASH_MIN_MB} max ${UCI_HASH_MAX_MB}`,
                    `option name Move Overhead type spin default ${UCI_MOVE_OVERHEAD_DEFAULT_MS} min ${UCI_MOVE_OVERHEAD_MIN_MS} max ${UCI_MOVE_OVERHEAD_MAX_MS}`,
                    "option name Clear Hash type button",
                    "uciok"
                ];

            case "isready":

                return ["readyok"];

            case "ucinewgame":

                this.resetEngine();
                return [];

            case "stop":

                //----------------------------------
                // Search is synchronous today, so a
                // later stdin stop command cannot
                // interrupt an already-running search.
                // When idle, stop is a harmless no-op.
                //----------------------------------

                return [];

            case "ponderhit":

                return [];

            case "setoption":

                return this.handleSetOption(
                    tokens.slice(1)
                );

            case "debug":

                this.debugEnabled =
                    tokens[1] === "on";

                return [];

            case "register":

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

    handleSetOption(tokens) {

        const option =
            parseSetOption(tokens);

        if (!option) {
            return [];
        }

        if (option.name === "Hash") {

            const sizeMB =
                clampHashSize(
                    Number.parseInt(
                        option.value,
                        10
                    )
                );

            this.hashSizeMB = sizeMB;

            this.engine.search.tt =
                new TranspositionTable(sizeMB);

            return [];

        }

        if (option.name === "Move Overhead") {

            this.moveOverheadMs =
                clampMoveOverhead(
                    Number.parseInt(
                        option.value,
                        10
                    ),
                    this.moveOverheadMs
                );

            return [];

        }

        if (option.name === "Clear Hash") {

            withMutedConsole(() =>
                this.engine.search.tt.clear()
            );

            return [];

        }

        return [];

    }

    handleGo(tokens) {

        if (tokens.includes("infinite")) {

            return [
                "info string Infinite search is not supported in the current synchronous UCI mode",
                "bestmove 0000"
            ];

        }

        if (
            tokens.includes("nodes") ||
            tokens.includes("mate") ||
            tokens.includes("searchmoves") ||
            tokens.includes("ponder")
        ) {

            return [
                "info string This go variant is not supported in the current UCI mode",
                "bestmove 0000"
            ];

        }

        const depthIndex =
            tokens.indexOf("depth");

        const movetimeIndex =
            tokens.indexOf("movetime");

        const wtimeIndex =
            tokens.indexOf("wtime");

        const btimeIndex =
            tokens.indexOf("btime");
        const movestogoIndex =
            tokens.indexOf("movestogo");

        let result = null;

        if (
            depthIndex !== -1 &&
            depthIndex < tokens.length - 1
        ) {

            const depth =
                Math.max(
                    1,
                    Number.parseInt(
                        tokens[depthIndex + 1],
                        10
                    ) || 1
                );

            result =
                withMutedConsole(() =>
                    this.engine.search.bestMove(
                        depth,
                        { quiet: true }
                    )
                );

        }

        else if (
            wtimeIndex !== -1 &&
            btimeIndex !== -1 &&
            wtimeIndex < tokens.length - 1 &&
            btimeIndex < tokens.length - 1
        ) {

            const wincIndex =
                tokens.indexOf("winc");

            const bincIndex =
                tokens.indexOf("binc");

            const movetime =
                allocateMoveTime({
                    sideToMove:
                        this.engine.board.sideToMove,
                    wtime:
                        Number.parseInt(
                            tokens[wtimeIndex + 1],
                            10
                        ) || 0,
                    btime:
                        Number.parseInt(
                            tokens[btimeIndex + 1],
                            10
                        ) || 0,
                    winc:
                        (
                            wincIndex !== -1 &&
                            wincIndex < tokens.length - 1
                        )
                            ? Number.parseInt(
                                tokens[wincIndex + 1],
                                10
                            ) || 0
                            : 0,
                    binc:
                        (
                            bincIndex !== -1 &&
                            bincIndex < tokens.length - 1
                        )
                            ? Number.parseInt(
                                tokens[bincIndex + 1],
                                10
                            ) || 0
                            : 0,
                    movestogo:
                        (
                            movestogoIndex !== -1 &&
                            movestogoIndex < tokens.length - 1
                        )
                            ? Number.parseInt(
                                tokens[movestogoIndex + 1],
                                10
                            )
                            : null,
                    moveOverheadMs:
                        this.moveOverheadMs
                });

            const deadlineMs =
                performance.now() +
                Math.max(0, movetime - 5);

            result =
                withMutedConsole(() =>
                    this.engine.search.bestMove(
                        64,
                        {
                            deadlineMs,
                            quiet: true
                        }
                    )
                );

        }

        else if (
            movetimeIndex !== -1 &&
            movetimeIndex < tokens.length - 1
        ) {

            const movetime =
                Math.max(
                    1,
                    Number.parseInt(
                        tokens[movetimeIndex + 1],
                        10
                    ) || 1
                );

            const deadlineMs =
                performance.now() +
                Math.max(0, movetime - 5);

            result =
                withMutedConsole(() =>
                    this.engine.search.bestMove(
                        64,
                        {
                            deadlineMs,
                            quiet: true
                        }
                    )
                );

        }

        else {

            return [
                "info string Phase 4B supports 'go depth N', 'go movetime X', and basic wtime/btime/winc/binc'",
                "bestmove 0000"
            ];

        }

        const rootSideToMove =
            this.engine.board.sideToMove;

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
    withMutedConsole
};
