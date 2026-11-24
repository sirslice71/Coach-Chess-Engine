import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
    COACH_NAME,
    COACH_VERSION
} from "../js/uci/version.js";

const repoRoot =
    path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        ".."
    );
const releaseName = `${COACH_NAME}-${COACH_VERSION}-node`;
const distDir = path.join(repoRoot, "dist");
const releaseDir = path.join(distDir, releaseName);
const zipPath = path.join(distDir, `${releaseName}.zip`);
const uciPath = path.join(releaseDir, "uci.js");

rmSync(releaseDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(releaseDir, { recursive: true });

await build({
    entryPoints: [path.join(repoRoot, "uci.js")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile: uciPath,
    legalComments: "none"
});

writeFileSync(
    path.join(releaseDir, "package.json"),
    `${JSON.stringify({
        name: "coach-uci-release",
        version: COACH_VERSION,
        private: true,
        type: "module"
    }, null, 2)}\n`
);

writeFileSync(
    path.join(releaseDir, "README.txt"),
    [
        `${COACH_NAME} ${COACH_VERSION} - Node.js UCI release`,
        "",
        "Requirements: Node.js 18 or newer.",
        "Default settings: 256 MB hash, single-threaded.",
        "",
        "Run from this folder:",
        "    node uci.js",
        "",
        "For a chess GUI, select node.exe as the engine executable and pass",
        "the full path to uci.js as its command-line argument. Set this folder",
        "as the working directory when the GUI provides that option.",
        "",
        "uci.js is self-contained. No source tree or npm install is required."
    ].join("\r\n") + "\r\n"
);

const checksum =
    createHash("sha256")
        .update(readFileSync(uciPath))
        .digest("hex");

writeFileSync(
    path.join(releaseDir, "SHA256SUMS.txt"),
    `${checksum}  uci.js\r\n`
);

execFileSync(
    "tar.exe",
    [
        "-a",
        "-c",
        "-f",
        zipPath,
        "-C",
        distDir,
        releaseName
    ],
    { cwd: repoRoot, stdio: "inherit" }
);

console.log(`Built ${path.relative(repoRoot, zipPath)}`);
