# Coach Overnight Workflow

## Start a Match Analysis Run

From PowerShell:

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Current"

.\scripts\Start-Coach-Overnight.ps1 -RunPgnAnalyzer -Force
```

The wrapper uses the local CuteChess and Stockfish paths, creates a timestamped
directory under `analysis-runs`, runs the match, and runs the PGN analyzer when
available.

## Check the Latest Run

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Current"

.\scripts\Show-Coach-LatestRun.ps1
```

This prints the latest run directory, match summary, benchmark summary, analyzer
summary, top candidate labels, and generated files when those outputs exist.

## Safe Preflight

```powershell
cd "<USERPROFILE>\OneDrive\Desktop\Coach Current"

.\scripts\Start-Coach-Overnight.ps1 -SelfTest
.\scripts\Start-Coach-Overnight.ps1 -Mode Benchmark -BenchmarkProfile stability-short -DryRun -Force
```

The dry run prints the commands that would run without launching the engines.
