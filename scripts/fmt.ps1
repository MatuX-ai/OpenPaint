# ============================================================
# OpenPaint Rust code formatter.
#
# 在本地跑一次，让 src-tauri/ 下所有 Rust 代码符合 rustfmt 规范，
# 这样 ci.yml 的 `cargo fmt --all -- --check` 才能通过。
#
# 用法：
#   pwsh -File scripts/fmt.ps1
#
# 依赖：
#   - Rust 工具链（含 rustfmt 组件）
#   - 如果只装了 rustup + stable 没装 rustfmt，先：
#       rustup component add rustfmt
# ============================================================

$ErrorActionPreference = 'Stop'

# 仓库根（脚本相对路径）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..')
$TauriDir = Join-Path $RepoRoot 'src-tauri'

if (-not (Test-Path (Join-Path $TauriDir 'Cargo.toml'))) {
    Write-Error "找不到 src-tauri/Cargo.toml，请在仓库根目录运行此脚本。"
}

Push-Location $TauriDir
try {
    Write-Host '==> 运行: cargo fmt --all' -ForegroundColor Cyan
    cargo fmt --all

    Write-Host ''
    Write-Host '==> 检查是否还有未格式化的代码（应输出空）' -ForegroundColor Cyan
    $diff = cargo fmt --all -- --check 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning '仍有 diff 输出（说明 rustfmt 内部异常，请贴给开发者）。'
        Write-Host $diff
        exit 1
    }

    Pop-Location

    Write-Host ''
    Write-Host '==> 检查 git diff' -ForegroundColor Cyan
    Push-Location $RepoRoot
    $status = git status --short
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host '没有改动——Rust 代码已经是 rustfmt 兼容格式。' -ForegroundColor Green
        exit 0
    }

    Write-Host ''
    Write-Host '以下文件被 rustfmt 修改：' -ForegroundColor Yellow
    git diff --stat
    Write-Host ''
    Write-Host '下一步：' -ForegroundColor Cyan
    Write-Host '  git add src-tauri/'
    Write-Host '  git commit -m "style: apply cargo fmt"'
}
finally {
    Pop-Location
}