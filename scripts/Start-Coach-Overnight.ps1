param(
    [ValidateSet("Match", "MatchThenBenchmark", "AnalyzeExistingMatch", "Benchmark")]
    [string]$Mode = "Match",

    [string]$CuteChessPath = "<USERPROFILE>\AppData\Local\Programs\Cute Chess\cutechess-cli.exe",
    [string]$OpponentPath = "G:\Program Files (x86)\ChessBase\Engines\stockfish-windows-x86-64-avx2_180.exe",
    [string]$OpponentName = "Stockfish 18",

    [int]$Games = 200,
    [int]$Concurrency = 4,
    [int]$SecondsPerMove = 1,
    [int]$StockfishElo = 2000,
    [int]$Seed = 26071521,
    [ValidateRange(1, 512)]
    [int]$CoachHashMB = 64,
    [ValidateRange(1, 512)]
    [int]$OpponentHashMB = 64,
    [string]$BookPath = "",
    [int]$BookDepth = 8,

    [string]$PgnOutputPath = "",
    [string]$CandidatePath = "",
    [string]$ResultDirectory = "",

    [ValidateSet("full", "stability-short")]
    [string]$BenchmarkProfile = "full",

    [ValidateSet("Exact", "SearchStable")]
    [string]$IdentityMode = "Exact",

    [switch]$RunPgnAnalyzer,
    [switch]$DryRun,
    [switch]$Force,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot =
    (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($ResultDirectory)) {
    $stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $ResultDirectory =
        Join-Path $projectRoot "analysis-runs\overnight-$($Mode.ToLowerInvariant())-$stamp"
}

if (
    [string]::IsNullOrWhiteSpace($CandidatePath) -and
    ($Mode -eq "Benchmark" -or $Mode -eq "MatchThenBenchmark")
) {
    $CandidatePath =
        $projectRoot
}

$runner =
    Join-Path $PSScriptRoot "run-coach-overnight.ps1"

if ($SelfTest) {
    Push-Location -LiteralPath $projectRoot
    try {
        & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $runner `
            -SelfTest

        exit $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}

if ($Mode -eq "Match" -or $Mode -eq "MatchThenBenchmark") {
    if (-not (Test-Path -LiteralPath $CuteChessPath -PathType Leaf)) {
        throw "CuteChess CLI was not found: $CuteChessPath"
    }

    if (-not (Test-Path -LiteralPath $OpponentPath -PathType Leaf)) {
        throw "Opponent engine was not found: $OpponentPath"
    }
}

$arguments =
    @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $runner,
        "-Mode",
        $Mode,
        "-CuteChessPath",
        $CuteChessPath,
        "-OpponentPath",
        $OpponentPath,
        "-OpponentName",
        $OpponentName,
        "-Games",
        "$Games",
        "-Concurrency",
        "$Concurrency",
        "-SecondsPerMove",
        "$SecondsPerMove",
        "-StockfishElo",
        "$StockfishElo",
        "-Seed",
        "$Seed",
        "-CoachHashMB",
        "$CoachHashMB",
        "-OpponentHashMB",
        "$OpponentHashMB",
        "-BookPath",
        $BookPath,
        "-BookDepth",
        "$BookDepth",
        "-ResultDirectory",
        $ResultDirectory,
        "-BenchmarkProfile",
        $BenchmarkProfile,
        "-IdentityMode",
        $IdentityMode
    )

if (-not [string]::IsNullOrWhiteSpace($CandidatePath)) {
    $arguments += @("-CandidatePath", $CandidatePath)
}

if (-not [string]::IsNullOrWhiteSpace($PgnOutputPath)) {
    $arguments += @("-PgnOutputPath", $PgnOutputPath)
}

if ($RunPgnAnalyzer) {
    $arguments += "-RunPgnAnalyzer"
}

if ($DryRun) {
    $arguments += "-DryRun"
}

if ($Force) {
    $arguments += "-Force"
}

Write-Host "Coach overnight wrapper"
Write-Host "Project: $projectRoot"
Write-Host "Mode: $Mode"
Write-Host "Results: $ResultDirectory"
Write-Host "CuteChess: $CuteChessPath"
Write-Host "Opponent: $OpponentPath"
Write-Host ""

Push-Location -LiteralPath $projectRoot
try {
    & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" @arguments
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
