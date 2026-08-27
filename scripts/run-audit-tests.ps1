# ============================================================
# OpenPaint audit acceptance: one-click runner for all test suites.
# Compatible with Windows PowerShell 5.1 (which does not support
# UTF-8 input by default and rejects && in shell pipelines).
# ============================================================

[CmdletBinding()]
param(
    [switch]$SkipRust,
    [switch]$SkipWeb,
    [string]$LogDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# ----- Paths and log directory -----
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
if ([string]::IsNullOrEmpty($LogDir)) {
    $LogDir = Join-Path $RepoRoot '.audit-logs'
}
if (-not [System.IO.Path]::IsPathRooted($LogDir)) {
    $LogDir = Join-Path $RepoRoot $LogDir
}
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$SummaryFile = Join-Path $LogDir ('audit-summary-' + $Timestamp + '.txt')

Write-Host ('Audit RepoRoot    = ' + $RepoRoot) -ForegroundColor Cyan
Write-Host ('Audit LogDir      = ' + $LogDir) -ForegroundColor Cyan
Write-Host ('Audit SummaryFile = ' + $SummaryFile) -ForegroundColor Cyan

# ----- Result collection -----
$script:Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param(
        [string]$Stage,
        [string]$Status,
        [int]$DurationSec = 0,
        [string]$Note = ''
    )
    $entry = [pscustomobject]@{
        Stage   = $Stage
        Status  = $Status
        Seconds = $DurationSec
        Note    = $Note
    }
    [void]$script:Results.Add($entry)
    $color = switch ($Status) {
        'PASS'  { 'Green' }
        'WARN'  { 'Yellow' }
        'FAIL'  { 'Red' }
        'SKIP'  { 'DarkGray' }
        default { 'White' }
    }
    Write-Host -NoNewline ('[' + $Status + '] ') -ForegroundColor $color
    Write-Host -NoNewline ($Stage + ' (' + $DurationSec + 's) ') -ForegroundColor $color
    Write-Host $Note
}

# ----- Tool checks -----
function Assert-Tool {
    param([string]$Name, [string]$Cmd, [string[]]$ToolArgs = @('--version'))
    $found = $null
    try {
        $found = & $Cmd @ToolArgs 2>$null
    } catch {
        $found = $null
    }
    if ($null -eq $found) {
        Write-Host ('WARN: ' + $Name + ' not detected, please install it.') -ForegroundColor Yellow
        return $false
    }
    Write-Host -NoNewline 'OK   ' -ForegroundColor DarkGreen
    Write-Host ($Name + ' -> ' + ($found | Select-Object -First 1)) -ForegroundColor DarkGreen
    return $true
}

Write-Host ''
Write-Host '====== 1. Tool checks ======' -ForegroundColor Cyan
$toolsOk = $true
$tools = @(
    @{ Name = 'rustc'; Cmd = 'rustc' },
    @{ Name = 'cargo'; Cmd = 'cargo' },
    @{ Name = 'node';  Cmd = 'node' },
    @{ Name = 'pnpm';  Cmd = 'pnpm' }
)
foreach ($t in $tools) {
    if (-not (Assert-Tool -Name $t.Name -Cmd $t.Cmd)) {
        $toolsOk = $false
    }
}
if (-not $toolsOk) {
    Write-Host 'ERROR: missing tools, please install Rust/Node/pnpm per DEVELOPMENT.md.' -ForegroundColor Red
    Add-Result -Stage 'Tool checks' -Status 'FAIL' -Note 'missing tools'
    exit 1
}

# ----- Shared helper: run an external command with logs and exit code -----
function Invoke-AuditStep {
    param(
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$LogFile,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string]$StatusOnPass = 'PASS',
        [string]$StatusOnFail = 'FAIL'
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Push-Location $WorkingDirectory
    try {
        $proc = Start-Process -FilePath $FilePath `
            -ArgumentList $ArgumentList `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $LogFile `
            -RedirectStandardError ($LogFile + '.err')
    } finally {
        Pop-Location
    }
    $sw.Stop()
    if (Test-Path ($LogFile + '.err')) {
        Get-Content ($LogFile + '.err') | Add-Content $LogFile
        Remove-Item ($LogFile + '.err') -Force
    }
    $pass = $proc.ExitCode -eq 0
    $status = if ($pass) { $StatusOnPass } else { $StatusOnFail }
    Add-Result -Stage $Stage -Status $status -DurationSec ([int]$sw.Elapsed.TotalSeconds) -Note ('log: ' + $LogFile)
}

# Note: pnpm on Windows is shimmed via .cmd/.ps1 wrappers. Start-Process cannot
# launch the .ps1 form directly, so we route pnpm calls through cmd.exe so the
# shell resolves the shim and forwards the exit code.
$PnpmArgs = @('/d', '/s', '/c', 'pnpm')

# ----- Rust backend tests -----
if (-not $SkipRust) {
    Write-Host ''
    Write-Host '====== 2. Rust backend unit tests ======' -ForegroundColor Cyan
    $rustLog = Join-Path $LogDir ('rust-test-' + $Timestamp + '.log')
    Invoke-AuditStep -Stage 'Rust unit tests' `
        -FilePath 'cargo' `
        -ArgumentList @('test', '--color', 'never') `
        -LogFile $rustLog `
        -WorkingDirectory (Join-Path $RepoRoot 'src-tauri')
} else {
    Add-Result -Stage 'Rust unit tests' -Status 'SKIP' -Note '-SkipRust'
}

# ----- Frontend Vitest -----
if (-not $SkipWeb) {
    Write-Host ''
    Write-Host '====== 3. Frontend Vitest unit tests ======' -ForegroundColor Cyan
    $webLog = Join-Path $LogDir ('vitest-' + $Timestamp + '.log')
    Invoke-AuditStep -Stage 'Frontend Vitest' `
        -FilePath 'cmd.exe' `
        -ArgumentList ($PnpmArgs + @('test:unit', '--reporter=verbose')) `
        -LogFile $webLog `
        -WorkingDirectory $RepoRoot
} else {
    Add-Result -Stage 'Frontend Vitest' -Status 'SKIP' -Note '-SkipWeb'
}

# ----- Frontend type-check -----
if (-not $SkipWeb) {
    Write-Host ''
    Write-Host '====== 4. Frontend type check ======' -ForegroundColor Cyan
    $tcLog = Join-Path $LogDir ('typecheck-' + $Timestamp + '.log')
    Invoke-AuditStep -Stage 'Frontend type-check' `
        -FilePath 'cmd.exe' `
        -ArgumentList ($PnpmArgs + @('type-check')) `
        -LogFile $tcLog `
        -WorkingDirectory $RepoRoot `
        -StatusOnPass 'PASS' `
        -StatusOnFail 'WARN'
} else {
    Add-Result -Stage 'Frontend type-check' -Status 'SKIP' -Note '-SkipWeb'
}

# ----- Frontend ESLint -----
if (-not $SkipWeb) {
    Write-Host ''
    Write-Host '====== 5. Frontend ESLint ======' -ForegroundColor Cyan
    $lintLog = Join-Path $LogDir ('eslint-' + $Timestamp + '.log')
    Invoke-AuditStep -Stage 'Frontend ESLint' `
        -FilePath 'cmd.exe' `
        -ArgumentList ($PnpmArgs + @('lint')) `
        -LogFile $lintLog `
        -WorkingDirectory $RepoRoot `
        -StatusOnPass 'PASS' `
        -StatusOnFail 'WARN'
} else {
    Add-Result -Stage 'Frontend ESLint' -Status 'SKIP' -Note '-SkipWeb'
}

# ----- Summary output -----
Write-Host ''
Write-Host '====== Audit acceptance summary ======' -ForegroundColor Cyan
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('OpenPaint Audit Acceptance Report')
[void]$sb.AppendLine(('Timestamp: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
[void]$sb.AppendLine(('Repo:      ' + $RepoRoot))
[void]$sb.AppendLine('')
[void]$sb.AppendLine(('Stage'.PadRight(28, ' ') + 'Status'.PadRight(10, ' ') + 'Seconds'.PadLeft(8, ' ') + '  Note'))
[void]$sb.AppendLine(([string]::new([char]'-', 80)))
foreach ($r in $script:Results) {
    [void]$sb.AppendLine(($r.Stage.PadRight(28, ' ') + $r.Status.PadRight(10, ' ') + ($r.Seconds.ToString()).PadLeft(8, ' ') + '  ' + $r.Note))
}
$summaryText = $sb.ToString()
$summaryText | Tee-Object -FilePath $SummaryFile | Write-Host

Write-Host ''
Write-Host ('Audit summary saved to: ' + $SummaryFile) -ForegroundColor Green
Write-Host ('Audit logs directory:   ' + $LogDir) -ForegroundColor Green

$anyFail = $script:Results | Where-Object { $_.Status -eq 'FAIL' }
if ($anyFail) {
    Write-Host 'Audit has failed stages, please review the logs.' -ForegroundColor Red
    exit 1
}
exit 0