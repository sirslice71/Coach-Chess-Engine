# UCI.md

Coach can now run as a basic Node-based UCI engine.

## Manual test

From the repository root:

```text
node uci.js
```

Then type:

```text
uci
isready
position startpos moves e2e4 e7e5
go depth 1
quit
```

## Windows launchers

For a distributable, self-contained engine executable, build the CCRL release:

```text
npm install
npm run build:ccrl
```

This produces:

```text
dist\Coach-1.0.0-windows-x64\Coach-1.0.0.exe
```

The packaged executable includes the Node runtime and bundled Coach sources. It does
not require Node.js to be installed on the tester's machine. It reports a 256 MB
default hash size and is single-threaded by design.

## Development launchers

For Windows GUIs, use:

```text
coach-uci.cmd
```

For development GUIs that require an `.exe` file, use:

```text
coach-uci.exe
```

`coach-uci.cmd`:

- runs `node uci.js`
- works from outside the repo root
- prints a clear message if Node.js is not on PATH

`coach-uci.exe`:

- locates its own directory
- runs `node uci.js` from that directory
- passes stdin/stdout/stderr through for UCI communication
- prints no extra text during normal successful operation
- prints a clear stderr error if Node.js is not on PATH

If a GUI accepts batch or command launchers directly, point it to:

```text
coach-uci.cmd
```

If a GUI requires an executable path only, point it to:

```text
coach-uci.exe
```

If a GUI prefers an executable plus arguments, point it to:

- executable: `node.exe`
- argument: `uci.js`

## Building the Windows .exe launcher

From the repository root:

```text
build-coach-uci-exe.cmd
```

This builds:

```text
coach-uci.exe
```

next to `uci.js`.

For this development launcher version, Node.js must still be installed and available on PATH at runtime.

If Fritz or PowerShell cannot find Node.js:

- install Node.js LTS
- reopen Fritz and any terminal windows
- run `coach-uci.exe` again

## Supported UCI commands

- `uci`
- `isready`
- `ucinewgame`
- `position startpos`
- `position startpos moves ...`
- `position fen <fen>`
- `position fen <fen> moves ...`
- `go depth N`
- `go movetime X`
- `go wtime <ms> btime <ms> [winc <ms>] [binc <ms>] [movestogo <n>]`
- `setoption name Hash value N`
- `setoption name Clear Hash`
- `setoption name Move Overhead value N`
- `quit`

## Unsupported commands

- `stop`
- `ponder`
- `infinite`
- unsupported `setoption` names

Unsupported forms should remain UCI-safe and return protocol-safe output.

## Current limitations

- Search is synchronous.
- There is no true async `stop` yet.
- Underpromotions may be limited by current move generation.
- UCI `score cp` is root-side-relative.
- Browser diagnostics remain White-relative.

## GUI setup notes

Common Windows GUIs that should work with this launcher style include:

- Arena
- Banksia
- Cute Chess
- Fritz

In those GUIs, add Coach as a UCI engine and point the engine path at `coach-uci.cmd` if batch launchers are supported.

For Fritz, point the engine path at:

```text
coach-uci.exe
```

If Coach lives at:

```text
<path-to-Coach>
```

then the Fritz engine path should be:

```text
<path-to-Coach>\coach-uci.exe
```
