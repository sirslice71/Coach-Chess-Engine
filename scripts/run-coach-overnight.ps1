param(
    [ValidateSet("Match", "Benchmark", "MatchThenBenchmark", "AnalyzeExistingMatch")]
    [string]$Mode = "Benchmark",

    [string]$CuteChessPath = "cutechess-cli.exe",
    [string]$CoachPath = (Resolve-Path ".").Path,
    [string]$OpponentPath = "stockfish.exe",
    [string]$OpponentName = "Stockfish",
    [int]$StockfishElo = 2000,
    [int]$Games = 200,
    [int]$Concurrency = 4,
    [int]$SecondsPerMove = 1,
    [string]$BookPath = "",
    [int]$BookDepth = 8,
    [int]$Seed = 26071521,
    [string]$PgnOutputPath = "",
    [string]$LogOutputPath = "",
    [string]$EventName = "Coach overnight",
    [string]$BaselinePath = (Resolve-Path ".").Path,
    [string]$CandidatePath = "",
    [string]$ResultDirectory = "",
    [int]$ControlSeed = 26071521,
    [int[]]$CandidateSeeds = @(26071522, 26071523),
    [int]$CandidateRuns = 2,
    [double]$QuietCpuThreshold = 20.0,
    [int]$QuietSamples = 3,
    [int]$CooldownSeconds = 60,
    [switch]$Resume,
    [switch]$Force,
    [switch]$DryRun,
    [switch]$RunPgnAnalyzer,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:DryRunMode = $DryRun.IsPresent

function New-CoachResultDirectory {
    param([string]$Requested)

    if ([string]::IsNullOrWhiteSpace($Requested)) {
        $Requested = Join-Path $env:TEMP ("Coach Overnight Results\run-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    }

    if ((Test-Path -LiteralPath $Requested) -and -not $Force -and -not $Resume) {
        throw "Result directory already exists: $Requested. Use -Force or -Resume."
    }

    New-Item -ItemType Directory -Force -Path $Requested | Out-Null
    return (Resolve-Path -LiteralPath $Requested).Path
}

function Write-CoachLog {
    param(
        [string]$ResultDirectory,
        [string]$Message
    )

    $line = "$(Get-Date -Format o) $Message"
    $line | Tee-Object -FilePath (Join-Path $ResultDirectory "overnight.log") -Append
}

function Read-CoachTextFile {
    param([string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        return [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        return [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Get-CoachLogWarnings {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }

    $text = Read-CoachTextFile -Path $Path
    $patterns = @("illegal", "disconnect", "timeout", "time forfeit", "crash", "error", "warning", "stalled")
    return $patterns | Where-Object { $text -match [regex]::Escape($_) }
}

function Get-CoachPgnSummary {
    param(
        [string]$Path,
        [string]$CoachName = "Coach"
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "PGN does not exist: $Path"
    }

    $text = Read-CoachTextFile -Path $Path
    $games = [regex]::Matches($text, '(?m)^\[Event\s+"').Count
    $results = [regex]::Matches($text, '(?m)^\[Result\s+"([^"]+)"\]').ForEach({ $_.Groups[1].Value })
    $whiteNames = [regex]::Matches($text, '(?m)^\[White\s+"([^"]+)"\]').ForEach({ $_.Groups[1].Value })
    $blackNames = [regex]::Matches($text, '(?m)^\[Black\s+"([^"]+)"\]').ForEach({ $_.Groups[1].Value })

    $wins = 0
    $draws = 0
    $losses = 0

    for ($index = 0; $index -lt $results.Count; $index++) {
        $coachWhite = $whiteNames[$index] -match [regex]::Escape($CoachName)
        $coachBlack = $blackNames[$index] -match [regex]::Escape($CoachName)
        $result = $results[$index]

        if ($result -eq "1/2-1/2") {
            $draws++
        }
        elseif (($result -eq "1-0" -and $coachWhite) -or ($result -eq "0-1" -and $coachBlack)) {
            $wins++
        }
        else {
            $losses++
        }
    }

    $scorePoints = $wins + ($draws * 0.5)
    $scorePercent = if ($games -gt 0) { 100.0 * $scorePoints / $games } else { 0.0 }
    $winPercent = if ($games -gt 0) { 100.0 * $wins / $games } else { 0.0 }

    return [pscustomobject]@{
        Games = $games
        Wins = $wins
        Draws = $draws
        Losses = $losses
        ScorePoints = $scorePoints
        ScorePercent = $scorePercent
        WinPercent = $winPercent
        Complete = $results.Count -eq $games
    }
}

function New-CoachCuteChessCommand {
    param(
        [string]$CuteChessPath,
        [string]$CoachPath,
        [string]$OpponentPath,
        [string]$OpponentName,
        [int]$StockfishElo,
        [int]$Games,
        [int]$Concurrency,
        [int]$SecondsPerMove,
        [string]$BookPath,
        [int]$BookDepth,
        [int]$Seed,
        [string]$PgnOutputPath,
        [string]$LogOutputPath,
        [string]$EventName
    )

    $args = @(
        "-engine", "name=Coach", "cmd=node", "arg=js/uci/uci.js", "dir=$CoachPath", "option.Hash=64", "option.Move Overhead=150", "restart=on",
        "-engine", "name=$OpponentName", "cmd=$OpponentPath", "option.Threads=1", "option.Hash=64", "option.UCI_LimitStrength=true", "option.UCI_Elo=$StockfishElo", "restart=on",
        "-each", "tc=inf/$($SecondsPerMove)", "proto=uci",
        "-games", "$Games",
        "-concurrency", "$Concurrency",
        "-repeat",
        "-recover",
        "-seed", "$Seed",
        "-event", $EventName,
        "-pgnout", $PgnOutputPath,
        "-debug", "-srand", "$Seed"
    )

    if (-not [string]::IsNullOrWhiteSpace($BookPath)) {
        $args += @("-openings", "file=$BookPath", "format=bin", "order=random", "plies=$BookDepth")
    }

    if (-not [string]::IsNullOrWhiteSpace($LogOutputPath)) {
        $args += @("-log", $LogOutputPath)
    }

    return [pscustomobject]@{
        FilePath = $CuteChessPath
        Arguments = $args
    }
}

function Test-CoachQuietMachine {
    param(
        [double]$Threshold,
        [int]$CpuSampleCount
    )

    $busyNames = Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessName -match 'cutechess|stockfish' -or
            ($_.ProcessName -eq 'node' -and $_.Path -and $_.Path -notmatch 'mcp[\\/]server\.mjs')
        }

    if ($busyNames | Where-Object { $_.ProcessName -match 'cutechess|stockfish' }) {
        return [pscustomobject]@{ Quiet = $false; Reason = "CuteChess or Stockfish is still running."; Samples = @() }
    }

    $cpuReadings = @()
    for ($i = 0; $i -lt $CpuSampleCount; $i++) {
        $cpuReading = (Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue
        $cpuReadings += [math]::Round($cpuReading, 2)
        Start-Sleep -Seconds 1
    }

    return [pscustomobject]@{
        Quiet = (($cpuReadings | Measure-Object -Maximum).Maximum -le $Threshold)
        Reason = "CPU samples: $($cpuReadings -join ', ')"
        Samples = $cpuReadings
    }
}

function ConvertTo-CoachProcessArgument {
    param([string]$Argument)

    if ($null -eq $Argument) {
        return '""'
    }

    if ($Argument -notmatch '[\s"]') {
        return $Argument
    }

    $result = '"'
    $backslashes = 0

    foreach ($char in $Argument.ToCharArray()) {
        if ($char -eq '\') {
            $backslashes++
        }
        elseif ($char -eq '"') {
            $result += ('\' * (($backslashes * 2) + 1))
            $result += '"'
            $backslashes = 0
        }
        else {
            if ($backslashes -gt 0) {
                $result += ('\' * $backslashes)
                $backslashes = 0
            }
            $result += $char
        }
    }

    if ($backslashes -gt 0) {
        $result += ('\' * ($backslashes * 2))
    }

    $result += '"'
    return $result
}

function Join-CoachProcessArguments {
    param([string[]]$Arguments)

    return ($Arguments | ForEach-Object { ConvertTo-CoachProcessArgument -Argument $_ }) -join " "
}

function New-CoachNormalizedEnvironment {
    param(
        [System.Collections.IDictionary]$BaseEnvironment = [System.Environment]::GetEnvironmentVariables(),
        [hashtable]$Overrides = @{}
    )

    $canonicalByLower = @{}
    $valuesByLower = @{}

    foreach ($keyObject in $BaseEnvironment.Keys) {
        $key = [string]$keyObject
        $lower = $key.ToLowerInvariant()
        $value = [string]$BaseEnvironment[$keyObject]

        if (-not $canonicalByLower.ContainsKey($lower)) {
            $canonicalByLower[$lower] = $key
            $valuesByLower[$lower] = $value
        }
        elseif ($lower -eq "path" -and $key -eq "Path") {
            $canonicalByLower[$lower] = "Path"
            $valuesByLower[$lower] = $value
        }
    }

    foreach ($keyObject in $Overrides.Keys) {
        $key = [string]$keyObject
        $lower = $key.ToLowerInvariant()
        if (-not $canonicalByLower.ContainsKey($lower)) {
            $canonicalByLower[$lower] = $key
        }
        $valuesByLower[$lower] = [string]$Overrides[$keyObject]
    }

    $normalized = @{}
    foreach ($lower in $canonicalByLower.Keys) {
        $normalized[$canonicalByLower[$lower]] = $valuesByLower[$lower]
    }

    return $normalized
}

function Copy-CoachEnvironmentToProcess {
    param([System.Diagnostics.ProcessStartInfo]$StartInfo)

    $environment =
        New-CoachNormalizedEnvironment

    $targetEnvironment = $StartInfo.EnvironmentVariables
    if ($null -eq $targetEnvironment) {
        $targetEnvironment = $StartInfo.Environment
    }
    if ($null -eq $targetEnvironment) {
        throw "Process environment collection is unavailable."
    }

    $targetEnvironment.Clear()

    foreach ($key in $environment.Keys) {
        $targetEnvironment[$key] = $environment[$key]
    }
}

function Invoke-CoachProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$StandardOutputPath,
        [string]$StandardErrorPath
    )

    $startInfo =
        New-Object System.Diagnostics.ProcessStartInfo

    $startInfo.FileName = $FilePath
    $startInfo.Arguments = Join-CoachProcessArguments -Arguments $Arguments
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    Copy-CoachEnvironmentToProcess -StartInfo $startInfo

    $process =
        New-Object System.Diagnostics.Process

    $process.StartInfo = $startInfo

    [void]$process.Start()

    $stdoutTask =
        $process.StandardOutput.ReadToEndAsync()

    $stderrTask =
        $process.StandardError.ReadToEndAsync()

    $process.WaitForExit()

    [System.IO.File]::WriteAllText($StandardOutputPath, $stdoutTask.Result, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($StandardErrorPath, $stderrTask.Result, [System.Text.Encoding]::UTF8)

    return $process.ExitCode
}

function Invoke-CoachCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$ResultDirectory,
        [string]$Name
    )

    Write-CoachLog -ResultDirectory $ResultDirectory -Message "RUN ${Name}: $FilePath $($Arguments -join ' ')"
    $stdout = Join-Path $ResultDirectory "$Name.stdout.txt"
    $stderr = Join-Path $ResultDirectory "$Name.stderr.txt"
    if ($script:DryRunMode) {
        "DRYRUN ${Name}: $FilePath $($Arguments -join ' ')"
        return
    }
    $exitCode =
        Invoke-CoachProcess -FilePath $FilePath -Arguments $Arguments -StandardOutputPath $stdout -StandardErrorPath $stderr

    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode."
    }
}

function Test-CoachCompletedJson {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    try {
        $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return ($null -ne $content.summary)
    }
    catch {
        return $false
    }
}

function Invoke-CoachBenchmarkPipeline {
    param([string]$ResultDirectory)

    if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
        throw "-CandidatePath is required for Benchmark mode."
    }

    $controlJson = Join-Path $ResultDirectory "control.json"
    $controlCsv = Join-Path $ResultDirectory "control.csv"
    $controlArgs = @(
        (Join-Path $BaselinePath "scripts/benchmark-search-ab.mjs"),
        "--baseline", $BaselinePath,
        "--candidate", $BaselinePath,
        "--control",
        "--seed", "$ControlSeed",
        "--json", $controlJson,
        "--csv", $controlCsv
    )
    if ($Resume -and (Test-CoachCompletedJson -Path $controlJson)) {
        Write-CoachLog -ResultDirectory $ResultDirectory -Message "RESUME benchmark-control: reusing $controlJson"
    }
    else {
        Invoke-CoachCommand -FilePath "node" -ResultDirectory $ResultDirectory -Name "benchmark-control" -Arguments $controlArgs
    }

    $candidateJsons = @()
    for ($i = 0; $i -lt $CandidateRuns; $i++) {
        $seedValue = if ($i -lt $CandidateSeeds.Count) { $CandidateSeeds[$i] } else { $CandidateSeeds[-1] + $i + 1 }
        $json = Join-Path $ResultDirectory "candidate-$($i + 1).json"
        $csv = Join-Path $ResultDirectory "candidate-$($i + 1).csv"
        $candidateJsons += $json
        $candidateArgs = @(
            (Join-Path $BaselinePath "scripts/benchmark-search-ab.mjs"),
            "--baseline", $BaselinePath,
            "--candidate", $CandidatePath,
            "--seed", "$seedValue",
            "--json", $json,
            "--csv", $csv
        )
        if ($Resume -and (Test-CoachCompletedJson -Path $json)) {
            Write-CoachLog -ResultDirectory $ResultDirectory -Message "RESUME benchmark-candidate-$($i + 1): reusing $json"
        }
        else {
            Invoke-CoachCommand -FilePath "node" -ResultDirectory $ResultDirectory -Name "benchmark-candidate-$($i + 1)" -Arguments $candidateArgs
        }
    }

    $summaryArgs = @((Join-Path $BaselinePath "scripts/benchmark-search-summary.mjs"), "--control", $controlJson)
    foreach ($json in $candidateJsons) {
        $summaryArgs += @("--candidate", $json)
    }
    Invoke-CoachCommand -FilePath "node" -ResultDirectory $ResultDirectory -Name "benchmark-summary" -Arguments $summaryArgs
}

function Invoke-CoachSelfTest {
    $tmp = Join-Path $env:TEMP ("coach-overnight-selftest-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        $pgn = Join-Path $tmp "match.pgn"
        @'
[Event "x"]
[White "Coach"]
[Black "Opponent"]
[Result "1-0"]

1. e4 1-0

[Event "x"]
[White "Opponent"]
[Black "Coach"]
[Result "1/2-1/2"]

1. e4 1/2-1/2
'@ | Set-Content -LiteralPath $pgn -Encoding UTF8

        $summary = Get-CoachPgnSummary -Path $pgn -CoachName "Coach"
        if ($summary.Games -ne 2 -or $summary.Wins -ne 1 -or $summary.Draws -ne 1 -or $summary.Losses -ne 0) {
            throw "PGN summary self-test failed."
        }

        $log = Join-Path $tmp "utf16.log"
        [System.IO.File]::WriteAllText($log, "warning: timeout", [System.Text.Encoding]::Unicode)
        $warnings = Get-CoachLogWarnings -Path $log
        if (-not ($warnings -contains "warning") -or -not ($warnings -contains "timeout")) {
            throw "Log warning self-test failed."
        }

        $cmd = New-CoachCuteChessCommand -CuteChessPath "cutechess-cli.exe" -CoachPath "C:\Coach" -OpponentPath "stockfish.exe" -OpponentName "Stockfish" -StockfishElo 2000 -Games 2 -Concurrency 1 -SecondsPerMove 1 -BookPath "book.bin" -BookDepth 8 -Seed 1 -PgnOutputPath "out.pgn" -LogOutputPath "out.log" -EventName "selftest"
        if (-not ($cmd.Arguments -contains "option.UCI_LimitStrength=true") -or -not ($cmd.Arguments -contains "-recover")) {
            throw "Command construction self-test failed."
        }

        $baseEnvironment =
            New-Object System.Collections.Specialized.OrderedDictionary
        $baseEnvironment.Add("Path", "C:\Windows\System32")
        $baseEnvironment.Add("PATH", "C:\Wrong")
        $baseEnvironment.Add("CoachFlag", "kept")
        $normalizedEnvironment =
            New-CoachNormalizedEnvironment -BaseEnvironment $baseEnvironment -Overrides @{ PATH = "C:\Tools" }
        $pathKeys =
            @($normalizedEnvironment.Keys | Where-Object { $_.ToLowerInvariant() -eq "path" })
        if ($pathKeys.Count -ne 1 -or $normalizedEnvironment[$pathKeys[0]] -ne "C:\Tools") {
            throw "Environment normalization self-test failed."
        }
        if ($normalizedEnvironment["CoachFlag"] -ne "kept") {
            throw "Environment preservation self-test failed."
        }

        $environmentLaunchStdout =
            Join-Path $tmp "environment-launch.stdout.txt"
        $environmentLaunchStderr =
            Join-Path $tmp "environment-launch.stderr.txt"
        $environmentLaunchExitCode = Invoke-CoachProcess -FilePath "powershell" -Arguments @(
            "-NoProfile",
            "-Command",
            "Write-Output coach-env-ok"
        ) -StandardOutputPath $environmentLaunchStdout -StandardErrorPath $environmentLaunchStderr
        if ($environmentLaunchExitCode -ne 0) {
            throw "Environment launch self-test exited with $environmentLaunchExitCode."
        }
        $environmentLaunchOutput =
            Get-Content -LiteralPath $environmentLaunchStdout -Raw -Encoding UTF8
        if ($environmentLaunchOutput.Trim() -ne "coach-env-ok") {
            throw "Environment launch self-test failed."
        }

        $quiet = Test-CoachQuietMachine -Threshold 100.0 -CpuSampleCount 3
        if ($quiet.Samples.Count -ne 3 -or -not $quiet.Quiet) {
            throw "Quiet-machine self-test failed."
        }

        [pscustomobject]@{
            Ok = $true
            PgnGames = $summary.Games
            ScorePercent = $summary.ScorePercent
            Warnings = $warnings
            CommandArgumentCount = $cmd.Arguments.Count
            EnvironmentPathKeyCount = $pathKeys.Count
            EnvironmentPathValue = $normalizedEnvironment[$pathKeys[0]]
            EnvironmentCoachFlag = $normalizedEnvironment["CoachFlag"]
            EnvironmentLaunch = $environmentLaunchOutput.Trim()
            QuietSampleCount = $quiet.Samples.Count
            QuietReason = $quiet.Reason
        } | ConvertTo-Json -Depth 4
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($SelfTest) {
    Invoke-CoachSelfTest
    exit 0
}

$Results = New-CoachResultDirectory -Requested $ResultDirectory

if ([string]::IsNullOrWhiteSpace($PgnOutputPath)) {
    $PgnOutputPath = Join-Path $Results "match.pgn"
}

if ([string]::IsNullOrWhiteSpace($LogOutputPath)) {
    $LogOutputPath = Join-Path $Results "cutechess.log"
}

Write-CoachLog -ResultDirectory $Results -Message "Mode=$Mode"
Write-CoachLog -ResultDirectory $Results -Message "DryRun=$($DryRun.IsPresent)"

if ($Mode -eq "Match" -or $Mode -eq "MatchThenBenchmark") {
    $command = New-CoachCuteChessCommand -CuteChessPath $CuteChessPath -CoachPath $CoachPath -OpponentPath $OpponentPath -OpponentName $OpponentName -StockfishElo $StockfishElo -Games $Games -Concurrency $Concurrency -SecondsPerMove $SecondsPerMove -BookPath $BookPath -BookDepth $BookDepth -Seed $Seed -PgnOutputPath $PgnOutputPath -LogOutputPath $LogOutputPath -EventName $EventName
    Invoke-CoachCommand -FilePath $command.FilePath -Arguments $command.Arguments -ResultDirectory $Results -Name "cutechess"

    if (-not $DryRun) {
        $match = Get-CoachPgnSummary -Path $PgnOutputPath -CoachName "Coach"
        $warnings = Get-CoachLogWarnings -Path $LogOutputPath
        [pscustomobject]@{ Match = $match; Warnings = $warnings } |
            ConvertTo-Json -Depth 6 |
            Set-Content -LiteralPath (Join-Path $Results "match-summary.json") -Encoding UTF8

        if ($match.Games -ne $Games -or $warnings.Count -gt 0) {
            throw "Match validation failed; not proceeding automatically."
        }

        if ($RunPgnAnalyzer) {
            $analyzer = "<USERPROFILE>\OneDrive\Desktop\Coach Neural\neural\tools\analyze-pgn.mjs"
            if (Test-Path -LiteralPath $analyzer) {
                Invoke-CoachCommand -FilePath "node" -Arguments @($analyzer, $PgnOutputPath) -ResultDirectory $Results -Name "pgn-analysis"
            }
        }
    }
}

if ($Mode -eq "AnalyzeExistingMatch") {
    $match = Get-CoachPgnSummary -Path $PgnOutputPath -CoachName "Coach"
    $warnings = Get-CoachLogWarnings -Path $LogOutputPath
    [pscustomobject]@{ Match = $match; Warnings = $warnings } |
        ConvertTo-Json -Depth 6 |
        Set-Content -LiteralPath (Join-Path $Results "match-summary.json") -Encoding UTF8
}

if ($Mode -eq "Benchmark" -or $Mode -eq "MatchThenBenchmark") {
    if ($Mode -eq "MatchThenBenchmark" -and -not $DryRun) {
        Start-Sleep -Seconds $CooldownSeconds
    }

    if ($DryRun) {
        "DRYRUN quiet-machine: threshold=$QuietCpuThreshold samples=$QuietSamples cooldownSeconds=$CooldownSeconds"
    }
    else {
        $quiet = Test-CoachQuietMachine -Threshold $QuietCpuThreshold -CpuSampleCount $QuietSamples
        $quiet | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Results "quiet-machine.json") -Encoding UTF8
        if (-not $quiet.Quiet) {
            throw "Machine is not quiet enough for benchmarking: $($quiet.Reason)"
        }
    }

    Invoke-CoachBenchmarkPipeline -ResultDirectory $Results
}

Write-CoachLog -ResultDirectory $Results -Message "Completed"
