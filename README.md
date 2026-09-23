# Coach Chess Engine

> Strong enough to compete. Smart enough to teach.

Coach is a browser-based JavaScript chess engine built to play strong chess and explain why its moves are good.

Open `index.html` in a modern browser to run the current interface. Engine code and detailed project documentation live under [`js/`](js/README.md).

## UCI engine mode

Coach can also run as a basic Node-based UCI engine.

- Manual entry: `node uci.js`
- Windows launcher: `coach-uci.cmd`

Setup and current limitations are documented in [`js/docs/UCI.md`](js/docs/UCI.md).

## Project structure

- `assets/` — chess-piece artwork
- `config/` — runtime settings
- `js/core/` — board representation and chess primitives
- `js/engine/` — move generation, evaluation, and search
- `js/dev/` — diagnostics and Coach Lab
- `js/docs/` — architecture, roadmap, and development documentation
- `js/ui/` — browser interface
- `tests/` — regression tests

## Development

Read [`js/AGENTS.md`](js/AGENTS.md) before making significant changes. Coach prioritizes correctness, reliability, architecture, measurability, performance, playing strength, and explainability—in that order.

### Tests

Run a single test file with Node's built-in test runner:

```cmd
node --test tests\engine_regressions.test.mjs
```

Run every test file on Windows:

```cmd
run-tests.cmd
```

Deep historical search sentinels in `tests\engine_regressions.test.mjs` are skipped by default. Enable them only for intentional long-running checks:

```cmd
run-slow-tests.cmd
```

To run only matching slow sentinels, pass a Node test-name pattern:

```cmd
run-slow-tests.cmd root-score shape
```
