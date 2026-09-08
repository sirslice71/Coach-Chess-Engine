param(
    [string]$AnalysisRoot = "",
    [string]$ResultDirectory = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot =
    (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($AnalysisRoot)) {
    $AnalysisRoot =
        Join-Path $projectRoot "analysis-runs"
}

if ([string]::IsNullOrWhiteSpace($ResultDirectory)) {
    if (-not (Test-Path -LiteralPath $AnalysisRoot)) {
        throw "Analysis root does not exist: $AnalysisRoot"
    }

    $latest =
        Get-ChildItem -LiteralPath $AnalysisRoot -Directory -Recurse |
        Where-Object {
            $hasOvernightLog =
                Test-Path -LiteralPath (Join-Path $_.FullName "overnight.log") -PathType Leaf

            $hasMatchSummary =
                Test-Path -LiteralPath (Join-Path $_.FullName "match-summary.json") -PathType Leaf

            $hasBenchmarkSummary =
                Test-Path -LiteralPath (Join-Path $_.FullName "benchmark-summary.stdout.txt") -PathType Leaf

            $hasAnalysisResults =
                Test-Path -LiteralPath (Join-Path $_.FullName "results.json") -PathType Leaf

            $hasOvernightLog -or
                $hasMatchSummary -or
                $hasBenchmarkSummary -or
                $hasAnalysisResults
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $latest) {
        throw "No result directories found under: $AnalysisRoot"
    }

    $ResultDirectory =
        $latest.FullName
}

if (-not (Test-Path -LiteralPath $ResultDirectory)) {
    throw "Result directory does not exist: $ResultDirectory"
}

Write-Host "Coach latest run"
Write-Host "Directory: $ResultDirectory"
Write-Host ""

$overnightLog =
    Join-Path $ResultDirectory "overnight.log"

if (Test-Path -LiteralPath $overnightLog) {
    Write-Host "Log tail:"
    Get-Content -LiteralPath $overnightLog -Tail 20
    Write-Host ""
}

$matchSummary =
    Join-Path $ResultDirectory "match-summary.json"

if (Test-Path -LiteralPath $matchSummary) {
    $summary =
        Get-Content -LiteralPath $matchSummary -Raw |
        ConvertFrom-Json

    $warningCount =
        if ($null -eq $summary.Warnings) {
            0
        }
        elseif ($summary.Warnings -is [array]) {
            $summary.Warnings.Count
        }
        else {
            @($summary.Warnings.PSObject.Properties).Count
        }

    Write-Host "Match summary:"
    Write-Host "  Games: $($summary.Match.Games)"
    Write-Host "  Wins: $($summary.Match.Wins)"
    Write-Host "  Draws: $($summary.Match.Draws)"
    Write-Host "  Losses: $($summary.Match.Losses)"
    Write-Host "  Score: $($summary.Match.ScorePercent)%"
    Write-Host "  Warnings: $warningCount"
    Write-Host ""
}

$benchmarkSummary =
    Join-Path $ResultDirectory "benchmark-summary.stdout.txt"

if (Test-Path -LiteralPath $benchmarkSummary) {
    Write-Host "Benchmark summary:"
    Get-Content -LiteralPath $benchmarkSummary
    Write-Host ""
}

$analysisStdout =
    Join-Path $ResultDirectory "pgn-analysis.stdout.txt"

if (Test-Path -LiteralPath $analysisStdout) {
    Write-Host "PGN analysis tail:"
    Get-Content -LiteralPath $analysisStdout -Tail 40
    Write-Host ""
}

$pgnAnalysisJson =
    Join-Path $ResultDirectory "pgn-analysis.json"

if (Test-Path -LiteralPath $pgnAnalysisJson) {
    $pgnReports =
        Get-Content -LiteralPath $pgnAnalysisJson -Raw |
        ConvertFrom-Json

    foreach ($property in $pgnReports.PSObject.Properties) {
        $report =
            $property.Value

        Write-Host "PGN triage: $($property.Name)"
        Write-Host "  Records: $($report.totalRecords)"
        Write-Host "  Valid games: $($report.valid)"
        Write-Host "  Excluded: $($report.excluded)"
        Write-Host "  Distinct games: $($report.duplicates.distinctGames)"
        Write-Host "  Duplicate groups: $($report.duplicates.duplicateGroups)"
        Write-Host "  Opening lines ply 4/8/12/16: $($report.openings.distinctLines.ply4)/$($report.openings.distinctLines.ply8)/$($report.openings.distinctLines.ply12)/$($report.openings.distinctLines.ply16)"
        Write-Host "  Coach score: $($report.score.scorePct)%"
        Write-Host "  Coach W/L/D: $($report.score.wins)/$($report.score.losses)/$($report.score.draws)"
        Write-Host "  Verdict: $($report.verdict)"
        Write-Host ""
    }
}

$analysisResults =
    Join-Path $ResultDirectory "results.json"

if (Test-Path -LiteralPath $analysisResults) {
    $analysis =
        Get-Content -LiteralPath $analysisResults -Raw |
        ConvertFrom-Json

    if ($null -ne $analysis.summary) {
        Write-Host "Analysis summary:"
        Write-Host "  Positions analyzed: $($analysis.summary.analyzed)"
        Write-Host "  Failed positions: $($analysis.summary.failed)"
        Write-Host "  Best-move agreement: $($analysis.summary.bestMoveAgreements)/$($analysis.summary.comparablePositions)"
        Write-Host "  Average eval difference: $($analysis.summary.averageAbsEvalDiffCp)cp"
        Write-Host "  Largest eval disagreement: $($analysis.summary.largestEvalDiff.diff)cp at $($analysis.summary.largestEvalDiff.label)"
        Write-Host "  Strongly disliked Coach moves: $($analysis.summary.stronglyDislikedMoves)"
        Write-Host ""
    }
}

$reportPath =
    Join-Path $ResultDirectory "report.md"

if (Test-Path -LiteralPath $reportPath) {
    $candidateLines =
        Get-Content -LiteralPath $reportPath |
        Where-Object { $_ -match "^### \d+\. " } |
        Select-Object -First 5

    if (@($candidateLines).Count -gt 0) {
        Write-Host "Top candidates:"
        foreach ($line in $candidateLines) {
            Write-Host "  $($line -replace '^### ', '')"
        }
        Write-Host ""
    }
}

Write-Host "Files:"
Get-ChildItem -LiteralPath $ResultDirectory -File |
    Sort-Object Name |
    Select-Object Name, Length, LastWriteTime |
    Format-Table -AutoSize
