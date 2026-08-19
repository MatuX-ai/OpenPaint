# ============================================================
# OpenPaint application icon generator.
#
# Generates all Tauri-required icon files into src-tauri/icons/.
# Usage: pwsh -File scripts/gen-icons.ps1
# Uses csc.exe to compile IconRenderer.cs into a DLL, then loads
# it via [Reflection.Assembly] to avoid PowerShell Add-Type issues
# in containerized environments.
# ============================================================

param(
    [string]$OutDir = "I:\OpenPaint\src-tauri\icons"
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Drawing

$csFile = Join-Path $PSScriptRoot 'IconRenderer.cs'
if (-not (Test-Path $csFile)) {
    throw "IconRenderer.cs not found at $csFile. Place it next to this script."
}

# Compile IconRenderer.cs -> IconRenderer.dll via csc.exe
if (-not $env:WINDIR) {
    throw "This script requires Windows (uses System.Drawing)."
}
$csCsc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csCsc)) {
    $csCsc = (Get-ChildItem 'C:\Windows\Microsoft.NET\Framework64' -Recurse -Filter 'csc.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $csCsc) {
    throw "Cannot find csc.exe; install .NET Framework 4.x SDK."
}
$dllPath = Join-Path $PSScriptRoot 'IconRenderer.dll'
$cscOutput = & $csCsc /nologo /target:library /out:$dllPath /reference:System.Drawing.dll $csFile 2>&1
foreach ($line in $cscOutput) { Write-Host "csc: $line" }
if (-not (Test-Path $dllPath)) {
    throw "csc.exe failed to produce $dllPath"
}
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)

Write-Host "Generate icons -> $OutDir"
[IconRenderer]::Generate($OutDir)

Write-Host ""
Write-Host "Files:"
[System.IO.Directory]::GetFiles($OutDir) | Sort-Object Name | ForEach-Object {
    $info = Get-Item $_
    Write-Host ("  {0,-32}  {1,8:N0} bytes" -f $info.Name, $info.Length)
}
Write-Host ""
Write-Host "All icons generated."