#!/usr/bin/env pwsh
# ============================================================
# OpenPaint GitHub Release Body Updater
# ============================================================
# Usage:
#   powershell -File scripts/publish-release-body.ps1                            # from docs/releases/v0.1.4.md, prompt for token
#   powershell -File scripts/publish-release-body.ps1 -DryRun                     # print preview only
#   powershell -File scripts/publish-release-body.ps1 -Token ghp_xxx             # inline token
#   powershell -File scripts/publish-release-body.ps1 -Tag v0.1.4 -File <md>     # custom inputs
#   powershell -File scripts/publish-release-body.ps1 -Publish                   # also flip draft -> published
#
# Background: release.yml uses softprops/action-gh-release@v2 draft:true, body
# comes from git tag annotation. To upgrade body you must PATCH via REST API.
# IMPORTANT: GitHub's GET /repos/{o}/{r}/releases/tags/{tag} returns 404 for
# DRAFT releases. So we must:
#   1. GET /repos/{o}/{r}/releases?per_page=20  (lists all releases incl. drafts)
#   2. find the entry whose tag_name == $Tag
#   3. PATCH /repos/{o}/{r}/releases/{id}
# Docs: https://docs.github.com/en/rest/releases/releases#update-a-release
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
    [switch]$DryRun,
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'

function LogInfo { param([string]$Message) Write-Host '[OK] ' $Message -ForegroundColor Green }
function LogWarn { param([string]$Message) Write-Host '[!] ' $Message -ForegroundColor Yellow }
function LogFail { param([string]$Message) Write-Host '[X] ' $Message -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------
# 0. Body file validation (always)
# ------------------------------------------------------------
if (-not (Test-Path $File)) {
    LogFail ('Body file not found: ' + $File)
}
$bodyMarkdown = Get-Content -Raw -Path $File -Encoding UTF8
$bodyLen = $bodyMarkdown.Length
$bodyBytes = [System.Text.Encoding]::UTF8.GetByteCount($bodyMarkdown)
$bodyKb = [Math]::Round($bodyBytes / 1KB, 1)
LogInfo ('Body file: ' + $File)
LogInfo ('Body chars: ' + $bodyLen + ' / bytes (UTF-8): ' + $bodyBytes + ' (' + $bodyKb + ' KB)')
if ($bodyLen -gt 60000) {
    LogWarn 'Body exceeds 60000 chars - GitHub API may reject. Consider shortening.'
}

$apiRoot = 'https://api.github.com/repos/' + $Repo
$tagsEndpoint = $apiRoot + '/releases/tags/' + $Tag
$listEndpoint = $apiRoot + '/releases?per_page=20'

# ------------------------------------------------------------
# 1. DryRun short-circuit (no token needed)
# ------------------------------------------------------------
if ($DryRun) {
    Write-Host ''
    Write-Host ('[DryRun] Plan:') -ForegroundColor Magenta
    Write-Host ('  1. GET ' + $listEndpoint + '  (locate draft by tag_name)')
    Write-Host ('  2. PATCH /releases/{id}  (body field)')
    Write-Host ('  3. (optional) PATCH /releases/{id}  (draft:false) if -Publish')
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

# ------------------------------------------------------------
# 2. Token resolution: -Token > env > gh > prompt
# ------------------------------------------------------------
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

# ------------------------------------------------------------
# 3. Build headers and validate token
# ------------------------------------------------------------
$headers = @{
    'Accept'               = 'application/vnd.github+json'
    'Authorization'        = "Bearer $Token"
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'openpaint-publish-release-body/1.0'
}

Write-Host ''
Write-Host '==> Validating token (GET /user) ...'
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

# ------------------------------------------------------------
# 4. Locate release by tag (DRAFT releases are excluded from /releases/tags/{tag})
# ------------------------------------------------------------
Write-Host ''
Write-Host ('==> Locating release for tag ' + $Tag + ' (listing all releases incl. drafts)')
try {
    $releases = Invoke-RestMethod -Method Get -Uri $listEndpoint -Headers $headers -TimeoutSec 30
}
catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    LogFail ('GET /releases failed (HTTP ' + $code + '): ' + $_.Exception.Message)
}

$release = $releases | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1
if (-not $release) {
    LogFail ('No release found with tag_name=' + $Tag + ' in latest ' + $releases.Count + ' releases')
}

$releaseId = $release.id
LogInfo ('Found release id=' + $releaseId + ' | tag_name=' + $release.tag_name + ' | draft=' + $release.draft + ' | body chars=' + ($release.body.Length))
$patchEndpoint = $apiRoot + '/releases/' + $releaseId
Write-Host ('==> Target: PATCH ' + $patchEndpoint)

# ------------------------------------------------------------
# 5. PATCH the release body
# ------------------------------------------------------------
Write-Host ''
Write-Host '==> Sending PATCH (body field) ...'
$payload = @{ body = $bodyMarkdown }
$json = $payload | ConvertTo-Json -Depth 10 -Compress
try {
    $resp = Invoke-RestMethod -Method Patch -Uri $patchEndpoint -Headers $headers -Body $json -TimeoutSec 60
}
catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.Exception.Message
    if ($code -eq 404) { LogFail 'Release not found (404). It may have been deleted.' }
    elseif ($code -eq 401) { LogFail 'Token unauthorized (401). Regenerate PAT with `repo` scope.' }
    elseif ($code -eq 403) { LogFail 'Token forbidden (403). Needs `repo` scope.' }
    elseif ($code -eq 422) { LogFail 'Body validation failed (422). Check markdown or character count.' }
    else { LogFail ('PATCH failed (HTTP ' + $code + '): ' + $msg) }
}

LogInfo ('Body updated. draft=' + $resp.draft + ' | body chars (after)=' + $resp.body.Length)

# ------------------------------------------------------------
# 6. Optionally publish (flip draft:false)
# ------------------------------------------------------------
if ($Publish) {
    if (-not $resp.draft) {
        LogInfo 'Release already published - skipping -Publish step.'
    }
    else {
        Write-Host ''
        Write-Host '==> Sending PATCH (draft:false) ...'
        $payload2 = @{ draft = $false }
        $json2 = $payload2 | ConvertTo-Json -Depth 10 -Compress
        try {
            $resp2 = Invoke-RestMethod -Method Patch -Uri $patchEndpoint -Headers $headers -Body $json2 -TimeoutSec 60
        }
        catch {
            $code = 0
            if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
            LogFail ('Publish PATCH failed (HTTP ' + $code + '): ' + $_.Exception.Message)
        }
        LogInfo ('Published. published_at=' + $resp2.published_at)
        $resp = $resp2
    }
}
else {
    if ($resp.draft) {
        LogWarn 'Release is still DRAFT. Re-run with -Publish to flip, OR click Publish in GitHub web UI (see RELEASING.md section 3).'
    }
}

# ------------------------------------------------------------
# 7. Final report
# ------------------------------------------------------------
Write-Host ''
LogInfo ('Final state:')
Write-Host ('    tag_name        = ' + $resp.tag_name)
Write-Host ('    name            = ' + $resp.name)
Write-Host ('    draft           = ' + $resp.draft)
Write-Host ('    prerelease      = ' + $resp.prerelease)
Write-Host ('    target_commitish= ' + $resp.target_commitish)
Write-Host ('    published_at    = ' + $resp.published_at)
Write-Host ('    body chars      = ' + $resp.body.Length)
Write-Host ('    html_url        = ' + $resp.html_url)
Write-Host ('    assets          = ' + $resp.assets.Count)
foreach ($asset in $resp.assets) {
    Write-Host ('      - ' + $asset.name + ' (' + [Math]::Round($asset.size / 1MB, 2) + ' MB)')
}
Write-Host ''
LogInfo ('View at: https://github.com/' + $Repo + '/releases/tag/' + $Tag)