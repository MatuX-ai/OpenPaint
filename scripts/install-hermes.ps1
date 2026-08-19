# ============================================================
# OpenPaint Hermes Agent 二进制安装脚本
#
# 默认从 GitHub Releases 下载 hermes-agent 二进制到
#   ~/.openpaint/bin/hermes(.exe)
# 可通过 -InstallLocal 改为安装到 src-tauri/bin/。
#
# 用法：
#   pwsh -File scripts/install-hermes.ps1
#   pwsh -File scripts/install-hermes.ps1 -Version v0.3.1
#   pwsh -File scripts/install-hermes.ps1 -InstallLocal
#   pwsh -File scripts/install-hermes.ps1 -Url "https://example.com/hermes.exe"
# ============================================================

param(
    [string]$Version = "latest",
    [switch]$InstallLocal,
    [string]$Url = "",
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# 解析安装位置
if ($InstallLocal) {
    $TargetDir = Join-Path $PSScriptRoot "..\src-tauri\bin"
    $TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
} else {
    $home = if ($env:USERPROFILE) { $env:USERPROFILE } else { $env:HOME }
    if (-not $home) { throw "Cannot resolve home directory from USERPROFILE/HOME." }
    $TargetDir = Join-Path $home ".openpaint\bin"
}

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}
Write-Host "Install target: $TargetDir"

# 决定二进制名
$IsWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.RuntimeInformation+OSPlatform]::Windows)
if ($IsWindows) {
    $BinaryName = "hermes.exe"
    $ArchiveName = "hermes-windows-x64.exe"
} else {
    $BinaryName = "hermes"
    $ArchiveName = "hermes-linux-x64"
}
$TargetPath = Join-Path $TargetDir $BinaryName

if ((Test-Path $TargetPath) -and -not $Force) {
    Write-Host "[OK] $BinaryName already exists at $TargetPath (use -Force to overwrite)."
    exit 0
}

# 解析下载 URL
if (-not $Url) {
    if ($Version -eq "latest") {
        $Url = "https://github.com/your-org/hermes-agent/releases/latest/download/$ArchiveName"
    } else {
        $Url = "https://github.com/your-org/hermes-agent/releases/download/$Version/$ArchiveName"
    }
}
Write-Host "Download URL: $Url"

# 下载
$TempFile = Join-Path $env:TEMP ("hermes-download-" + [guid]::NewGuid().ToString("N"))
try {
    Write-Host "Downloading..."
    Invoke-WebRequest -Uri $Url -OutFile $TempFile -UseBasicParsing
    if (-not (Test-Path $TempFile)) {
        throw "Download failed: $TempFile not found."
    }
    Move-Item -Force $TempFile $TargetPath
    Write-Host "[OK] Downloaded to $TargetPath"
}
catch {
    if (Test-Path $TempFile) { Remove-Item -Force $TempFile }
    Write-Warning "Failed to download from $Url"
    Write-Warning "If the GitHub release is not yet published, you can:"
    Write-Warning "  1. Build hermes-agent locally and copy the binary to $TargetPath"
    Write-Warning "  2. Use -Url <custom-url> to point at an internal artifact"
    Write-Warning "  3. Continue without hermes (the OpenPaint AI Assistant will run in mock mode)"
    exit 1
}

# Unix 需要 chmod +x
if (-not $IsWindows) {
    & chmod +x $TargetPath
}

# 验证：--version 应正常输出
try {
    & $TargetPath --version 2>&1 | Out-Null
    Write-Host "[OK] hermes --version executed without error"
} catch {
    Write-Warning "hermes --version failed; binary may be incomplete."
}

Write-Host ""
Write-Host "Hermes Agent installed. Restart OpenPaint to enable AI Assistant."
Write-Host "Verify with: & '$TargetPath' --version"