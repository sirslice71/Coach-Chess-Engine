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

## Windows launcher

For Windows GUIs, use:

```text
coach-uci.cmd
```

The launcher:

- runs `node uci.js`
- works from outside the repo root
- prints a clear message if Node.js is not on PATH

If a GUI accepts batch or command launchers directly, point it to:

```text
coach-uci.cmd
```

If a GUI prefers an executable plus arguments, point it to:

- executable: `node.exe`
- argument: `uci.js`

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
- `go wtime <ms> btime <ms> [winc <ms>] [binc <ms>]`
- `quit`

## Unsupported commands

- `stop`
- `ponder`
- `infinite`
- `setoption`

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
