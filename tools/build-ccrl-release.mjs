import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { COACH_NAME, COACH_VERSION } from "../js/uci/version.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseName = `${COACH_NAME}-${COACH_VERSION}-windows-x64`;
const buildDir = path.join(repoRoot, "build", "ccrl-release");
const releaseDir = path.join(repoRoot, "dist", releaseName);
const bundlePath = path.join(buildDir, "coach-uci.bundle.cjs");
const seaConfigPath = path.join(buildDir, "sea-config.json");
const seaBlobPath = path.join(buildDir, "coach-uci.blob");
const exeName = `${COACH_NAME}-${COACH_VERSION}.exe`;
const exePath = path.join(releaseDir, exeName);
const postjectCliPath = path.join(repoRoot, "node_modules", "postject", "dist", "cli.js");

if (process.platform !== "win32") {
    throw new Error("The CCRL release builder currently targets Windows x64 only.");
}

rmSync(buildDir, { recursive: true, force: true });
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
mkdirSync(releaseDir, { recursive: true });

const run = (command, args) => {
    execFileSync(command, args, {
        cwd: repoRoot,
        stdio: "inherit"
    });
};

await build({
    entryPoints: [path.join(repoRoot, "uci.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    outfile: bundlePath
});

writeFileSync(
    seaConfigPath,
    `${JSON.stringify({
        main: bundlePath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true
    }, null, 2)}\n`
);

run(process.execPath, ["--experimental-sea-config", seaConfigPath]);
cpSync(process.execPath, exePath);
run(process.execPath, [
    postjectCliPath,
    exePath,
    "NODE_SEA_BLOB",
    seaBlobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
]);

writeFileSync(
    path.join(releaseDir, "README.txt"),
    [
        `${COACH_NAME} ${COACH_VERSION}`,
        "",
        "UCI engine for Windows x64.",
        "Default settings: 256 MB hash, single-threaded.",
        "",
        `Configure your chess GUI to run ${exeName}.`
    ].join("\r\n") + "\r\n"
);

const checksum =
    createHash("sha256")
        .update(readFileSync(exePath))
        .digest("hex");

writeFileSync(
    path.join(releaseDir, "SHA256SUMS.txt"),
    `${checksum}  ${exeName}\r\n`
);

console.log(`Built ${path.relative(repoRoot, exePath)}`);
