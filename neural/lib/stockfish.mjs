//======================================================
// stockfish.mjs
// Persistent UCI driver for one Stockfish process.
// Scores are normalized to WHITE's perspective:
//   positive => White better, negative => Black better,
//   independent of side to move. Mate is kept separate
//   from centipawns. WDL is stored White-relative too.
//======================================================

import { spawn } from "node:child_process";
import readline from "node:readline";

export class Stockfish {
    constructor(path, opts = {}) {
        this.path = path;
        this.opts = {
            threads: 1, hash: 64, multipv: 1, showWDL: true,
            ...opts,
        };
        this.proc = null;
        this.rl = null;
        this.version = null;
        this._pending = null;
    }

    async init() {
        this.proc = spawn(this.path, [], { stdio: ["pipe", "pipe", "ignore"] });
        this.rl = readline.createInterface({ input: this.proc.stdout });
        this.rl.on("line", (line) => this._onLine(line));

        await this._send("uci", (l) => l === "uciok", (l) => {
            const m = l.match(/^id name (.+)$/);
            if (m) this.version = m[1].trim();
        });
        this._write(`setoption name Threads value ${this.opts.threads}`);
        this._write(`setoption name Hash value ${this.opts.hash}`);
        this._write(`setoption name MultiPV value ${this.opts.multipv}`);
        this._write(`setoption name UCI_ShowWDL value ${this.opts.showWDL}`);
        await this._send("isready", (l) => l === "readyok");
        return this.version;
    }

    _write(cmd) { this.proc.stdin.write(cmd + "\n"); }

    // Reset search state (clears the transposition table) so each position
    // is analysed independently. Without this, a persistent TT would carry
    // over between positions, making fixed-node labels depend on evaluation
    // order and on where a resumed run happened to restart.
    newGame() {
        this._write("ucinewgame");
        return this._send("isready", (l) => l === "readyok");
    }

    _onLine(line) {
        if (!this._pending) return;
        this._pending.onLine(line);
    }

    _send(cmd, isDone, onEach) {
        return new Promise((resolve) => {
            this._pending = {
                onLine: (line) => {
                    if (onEach) onEach(line);
                    if (isDone(line)) { this._pending = null; resolve(); }
                },
            };
            this._write(cmd);
        });
    }

    // Analyse one FEN. limit = { nodes } or { depth }.
    // A per-position hash reset (ucinewgame) is issued first so labels are
    // reproducible and independent of order/resume boundaries.
    async analyse(fen, limit) {
        await this.newGame();
        const stm = fen.trim().split(/\s+/)[1] || "w";
        const goCmd = limit.nodes
            ? `go nodes ${limit.nodes}`
            : `go depth ${limit.depth}`;

        return new Promise((resolve) => {
            let lastInfo = null;
            this._pending = {
                onLine: (line) => {
                    if (line.startsWith("info ") && line.includes(" score ")) {
                        lastInfo = line;
                    } else if (line.startsWith("bestmove")) {
                        const bm = line.split(/\s+/)[1] || null;
                        this._pending = null;
                        resolve(this._parse(lastInfo, bm, stm));
                    }
                },
            };
            this._write(`position fen ${fen}`);
            this._write(goCmd);
        });
    }

    _parse(info, bestMove, stm) {
        const out = {
            depth: null, seldepth: null, nodes: null, timeMs: null,
            scoreCpWhite: null, mate: null, wdl: null,
            bestMove: bestMove === "(none)" ? null : bestMove, pv: [],
        };
        if (!info) return out;
        const t = info.split(/\s+/);
        for (let i = 0; i < t.length; i++) {
            switch (t[i]) {
                case "depth": out.depth = Number(t[++i]); break;
                case "seldepth": out.seldepth = Number(t[++i]); break;
                case "nodes": out.nodes = Number(t[++i]); break;
                case "time": out.timeMs = Number(t[++i]); break;
                case "score":
                    if (t[i + 1] === "cp") { out.scoreCpWhite = Number(t[i + 2]); i += 2; }
                    else if (t[i + 1] === "mate") { out.mate = Number(t[i + 2]); i += 2; }
                    break;
                case "wdl":
                    out.wdl = [Number(t[i + 1]), Number(t[i + 2]), Number(t[i + 3])];
                    i += 3; break;
                case "pv": out.pv = t.slice(i + 1); i = t.length; break;
            }
        }
        // Normalize side-to-move-relative values to White perspective.
        if (stm === "b") {
            if (out.scoreCpWhite !== null) out.scoreCpWhite = -out.scoreCpWhite;
            if (out.mate !== null) out.mate = -out.mate;
            if (out.wdl) out.wdl = [out.wdl[2], out.wdl[1], out.wdl[0]];
        }
        return out;
    }

    async quit() {
        try { this._write("quit"); } catch (_) {}
        try { this.proc.kill(); } catch (_) {}
    }
}
