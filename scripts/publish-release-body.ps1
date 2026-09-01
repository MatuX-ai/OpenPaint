#!/usr/bin/env pwsh
# ============================================================
# OpenPaint GitHub Release Body Updater
# ============================================================
# Usage:
#   powershell -File scripts/publish-release-body.ps1                          # from docs/releases/v0.1.4.md, with -Token
#   powershell -File scripts/publish-release-body.ps1 -DryRun                   # print preview only
#   powershell -File scripts/publish-release-body.ps1 -Token ghp_xxx           # inline token
#
# Backgound: release.yml uses softprops/action-gh-release@v2 draft:true, body
# comes from git tag annotation. To upgrade body you must PATCH via REST API.
# Endpoint: PATCH https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}
# Docs:     https://docs.github.com/en/rest/releases/releases#update-a-release
#
# Token resolution: -Token > $env:GITHUB_TOKEN > $env:GH_TOKEN > gh auth token > secure prompt
# Required scope: repo
# Tested on: Windows PowerShell 5.1
# ============================================================

[CmdletBinding()]
param(
    [string]$Tag = 'v0.1.4',
    [string]$Repo = 'MatuX-ai/OpenPaint',
    [string]$File = "docs/releases/$Tag.md",
    [string]$Token,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function LogInfo { param([string]$Message) Write-Host '[OK] ' $Message -ForegroundColor Green }
function LogWarn { param([string]$Message) Write-Host '[!] ' $Message -ForegroundColor Yellow }
function LogFail { param([string]$Message) Write-Host '[X] ' $Message -ForegroundColor Red; exit 1 }

# 0. DryRun short-circuit - no token needed
if ($DryRun) {
    if (-not (Test-Path $File)) {
        LogFail ('Body file not found: ' + $File)
    }
    $bodyMarkdown = Get-Content -Raw -Path $File -Encoding UTF8
    $bodyLen = $bodyMarkdown.Length
    $bodyBytes = [System.Text.Encoding]::UTF8.GetByteCount($bodyMarkdown)
    LogInfo ('[DryRun] Body file: ' + $File)
    LogInfo ('[DryRun] Body chars: ' + $bodyLen + ' / bytes (UTF-8): ' + $bodyBytes)
    Write-Host ('  ' + [Math]::Round($bodyBytes / 1KB, 1) + ' KB')

    if ($bodyLen -gt 60000) {
        LogWarn '[DryRun] Body exceeds 60000 chars - GitHub API may reject. Consider shortening.'
    }

    $apiUri = 'https://api.github.com/repos/' + $Repo + '/releases/tags/' + $Tag
    Write-Host ''
    Write-Host ('[DryRun] Would PATCH ' + $apiUri)
    Write-Host ''
    Write-Host '[DryRun] First 5 lines of body:' -ForegroundColor Magenta
    $lines = $bodyMarkdown -split "`n"
    $preview = $lines | Select-Object -First 5
    foreach ($line in $preview) { Write-Host ('  ' + $line) }
    Write-Host '  ...' -ForegroundColor Magenta
    Write-Host ''
    Write-Host 'Re-run without -DryRun to upload.' -ForegroundColor Magenta
    exit 0
}

# 1. Token resolution
if (-not $Token) {
    if ($env:GITHUB_TOKEN) {
        $Token = $env:GITHUB_TOKEN
        LogInfo 'Using $env:GITHUB_TOKEN'
    }
    elseif ($env:GH_TOKEN) {
        $Token = $env:GH_TOKEN
        LogInfo 'Using $env:GH_TOKEN'
    }
    else {
        $gh = Get-Command gh -ErrorAction SilentlyContinue
        if ($gh) {
            $ghToken = $null
            try {
                $ghToken = (& gh auth token 2>&1) | Where-Object { $_ -notmatch 'oauth|github.com' } | Select-Object -First 1
            }
            catch { $ghToken = $null }
            if ($ghToken) {
                $Token = $ghToken.Trim()
                if ($Token) { LogInfo 'Using token from gh auth token' }
            }
        }
        if (-not $Token) {
            Write-Host 'Need GitHub Personal Access Token (scope: repo)' -ForegroundColor Yellow
            Write-Host 'Get one at: https://github.com/settings/tokens' -ForegroundColor Yellow
            Write-Host ''
            $secure = Read-Host 'Paste token (input hidden)' -AsSecureString
            if (-not $secure) { LogFail 'Token is required' }
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try {
                $Token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            }
            finally {
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            }
            if (-not $Token) { LogFail 'Token is required' }
        }
    }
}

# 2. Build headers and validate token (skip in DryRun)
$headers = @{
    'Accept'               = 'application/vnd.github+json'
    'Authorization'        = "Bearer $Token"
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'openpaint-publish-release-body/1.0'
}

if (-not $DryRun) {
    Write-Host '==> Validating token...'
    try {
        $null = Invoke-RestMethod -Method Get -Uri 'https://api.github.com/user' -Headers $headers -TimeoutSec 15
    }
    catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 401) { LogFail 'Token invalid (401). Please regenerate with `repo` scope.' }
        LogFail ('Token validation failed (HTTP ' + $code + '): ' + $_.Exception.Message)
    }
    LogInfo 'Token is valid'
}

# 3. Validate body file
if (-not (Test-Path $File)) {
    LogFail ('Body file not found: ' + $File)
}
$bodyMarkdown = Get-Content -Raw -Path $File -Encoding UTF8
$bodyLen = $bodyMarkdown.Length
$bodyBytes = [System.Text.Encoding]::UTF8.GetByteCount($bodyMarkdown)
LogInfo ('Body file: ' + $File)
LogInfo ('Body chars: ' + $bodyLen + ' / bytes (UTF-8): ' + $bodyBytes)
Write-Host ('  ' + [Math]::Round($bodyBytes / 1KB, 1) + ' KB')

if ($bodyLen -gt 60000) {
    LogWarn 'Body exceeds 60000 chars - GitHub API may reject. Consider shortening.'
}

# 4. Build request
$apiUri = 'https://api.github.com/repos/' + $Repo + '/releases/tags/' + $Tag
Write-Host ''
Write-Host ('==> PATCH ' + $apiUri)
Write-Host ''

if ($DryRun) {
    Write-Host '[DryRun] Skipping API call. First 5 lines of body:' -ForegroundColor Magenta
    $lines = $bodyMarkdown -split "`n"
    $preview = $lines | Select-Object -First 5
    foreach ($line in $preview) { Write-Host ('  ' + $line) }
    Write-Host '  ...' -ForegroundColor Magenta
    Write-Host ''
    Write-Host 'Re-run without -DryRun to upload.' -ForegroundColor Magenta
    exit 0
}

# 5. PATCH the release body
$payload = @{ body = $bodyMarkdown }
$json = $payload | ConvertTo-Json -Depth 10 -Compress

Write-Host '==> Sending PATCH ...'
try {
    $resp = Invoke-RestMethod -Method Patch -Uri $apiUri -Headers $headers -Body $json -TimeoutSec 60
}
catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.Exception.Message
    if ($code -eq 404) { LogFail ('Release not found (404): ' + $apiUri + '. Confirm tag pushed and workflow done.') }
    elseif ($code -eq 401) { LogFail 'Token unauthorized (401). Regenerate PAT with `repo` scope.' }
    elseif ($code -eq 403) { LogFail 'Token forbidden (403). Needs `repo` scope.' }
    elseif ($code -eq 422) { LogFail 'Body validation failed (422). Check markdown or character count.' }
    else { LogFail ('PATCH failed (HTTP ' + $code + '): ' + $msg) }
}

if ($resp.draft) {
    LogInfo 'Release body updated (still DRAFT). Manual Publish: see RELEASING.md section 3.'
}
else {
    LogInfo 'Release body updated and PUBLISHED.'
}
LogInfo ('View at: https://github.com/' + $Repo + '/releases/tag/' + $Tag)
