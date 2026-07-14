//======================================================
// jsonl.mjs
// Append-safe JSONL I/O + resume support.
// A partially written final line (from a crash / Ctrl-C)
// is tolerated on read: it is dropped, never parsed as data.
//======================================================

import fs from "node:fs";

// Read records; return { records, malformed, droppedTrailing }.
export function readJsonl(path) {
    if (!fs.existsSync(path)) return { records: [], malformed: [], droppedTrailing: false };
    const text = fs.readFileSync(path, "utf8");
    const lines = text.split("\n");
    const records = [];
    const malformed = [];
    let droppedTrailing = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;
        try {
            records.push(JSON.parse(line));
        } catch (e) {
            // Only the very last non-empty line may legitimately be a
            // torn write; anything earlier is genuine corruption.
            const isLast = lines.slice(i + 1).every((l) => l.trim() === "");
            if (isLast) droppedTrailing = true;
            else malformed.push({ line: i + 1 });
        }
    }
    return { records, malformed, droppedTrailing };
}

// Set of already-labelled positionKeys for resume.
export function labelledKeySet(path) {
    const { records } = readJsonl(path);
    const set = new Set();
    for (const r of records) if (r.positionKey) set.add(r.positionKey);
    return set;
}

export class AppendWriter {
    constructor(path) {
        this.path = path;
        // Heal a torn trailing line left by a previous crash: if the file
        // does not end in a newline, truncate back to the last complete
        // line so the incomplete record is discarded rather than having the
        // next append merged onto it (which would corrupt both). The torn
        // record's position was never recorded as done, so a resuming run
        // re-labels it cleanly.
        if (fs.existsSync(path)) {
            const buf = fs.readFileSync(path);
            if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) {
                let end = buf.length;
                while (end > 0 && buf[end - 1] !== 0x0a) end--;
                fs.truncateSync(path, end);
            }
        }
        this.fd = fs.openSync(path, "a");
        this.sinceFlush = 0;
    }
    append(obj, flushEvery = 1) {
        fs.writeSync(this.fd, JSON.stringify(obj) + "\n");
        if (++this.sinceFlush >= flushEvery) {
            fs.fsyncSync(this.fd);
            this.sinceFlush = 0;
        }
    }
    flush() {
        try { fs.fsyncSync(this.fd); } catch (_) {}
    }
    close() {
        this.flush();
        try { fs.closeSync(this.fd); } catch (_) {}
    }
}

export function writeJson(path, obj) {
    fs.writeFileSync(path, JSON.stringify(obj, null, 2));
}
