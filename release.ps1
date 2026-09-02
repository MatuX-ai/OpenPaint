# ============================================================
# OpenPaint 发布脚本（Windows PowerShell）
# ============================================================
# 用法：
#   .\release.ps1 build     # 本地构建 Windows MSI 与 NSIS 安装包
#   .\release.ps1 verify   # 发布前检查：版本一致性 + 关键文件
#   .\release.ps1 commit   # 按逻辑拆分执行 7 个提交（幂等，无变更自动跳过）
#   .\release.ps1 publish  # 打 tag 并推送，触发 GitHub Release workflow
#   .\release.ps1          # 等价于 verify + commit + publish 全流程
#
# 依赖：git、node、pnpm（Windows 原生 PowerShell）
# 提交规范：见 .commitlintrc.yml（type/scope/长度均受限）
# ============================================================

[CmdletBinding()]
param(
    [string]$Command = 'all'   # verify | build | commit | publish | all
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$VERSION = '0.1.0'
$REPO = 'https://github.com/MatuX-ai/OpenPaint'

function Write-Info  { Write-Host "[✓] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[!] $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[✗] $args" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------
# 前置检查
# ------------------------------------------------------------
function Check-Preconditions {
    Write-Host "==> 前置检查..."

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Fail "未找到 git" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Fail "未找到 node" }

    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) { Write-Fail "当前目录不是 git 仓库" }

    # 关键文件必须存在（Cargo.lock / pnpm-lock.yaml 必须提交）
    $required = @(
        'pnpm-lock.yaml',
        'src-tauri/Cargo.lock',
        'scripts/version.mjs',
        '.github/workflows/release.yml',
        '.github/workflows/ci.yml'
    )
    foreach ($f in $required) {
        if (-not (Test-Path $f)) { Write-Fail "缺少关键文件: $f" }
    }
    Write-Info "关键文件齐全"

    # 版本一致性（三处：tauri.conf.json / Cargo.toml / package.json）
    node scripts/version.mjs --check
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "版本不一致，请先运行: pnpm version:set <version>"
    }
    Write-Info "版本一致: $VERSION"

    # remote 检查
    git remote get-url origin *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "未配置 origin remote，请先: git remote add origin $REPO.git"
    }
}

# ------------------------------------------------------------
# 构建 Windows 安装包
# ------------------------------------------------------------
function Invoke-WindowsBuild {
    Write-Host "==> 构建 Windows MSI 与 NSIS 安装包..."

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Fail "未找到 pnpm"
    }

    pnpm build:web
    if ($LASTEXITCODE -ne 0) { Write-Fail "前端构建失败" }

    # pnpm 在 Windows 上会把逗号分隔的参数合并为一个参数；使用独立选项保留两个值。
    pnpm tauri build --bundles msi --bundles nsis
    if ($LASTEXITCODE -ne 0) { Write-Fail "Windows 安装包构建失败" }

    Write-Info "安装包已生成于 src-tauri/target/release/bundle/"
}

# ------------------------------------------------------------
# 幂等提交：有变更才提交，无变更跳过
# ------------------------------------------------------------
function Invoke-StageCommit {
    param(
        [string]$Message,
        [string[]]$Files
    )
    # 检查这些文件是否有改动（staged / unstaged / untracked）
    $hasChanges = $false
    foreach ($f in $Files) {
        $out = git status --porcelain -- $f 2>$null
        if ($out) { $hasChanges = $true; break }
    }
    if (-not $hasChanges) {
        Write-Warn "跳过（无变更）: $Message"
        return
    }
    git add $Files
    git commit -m $Message
    if ($LASTEXITCODE -eq 0) { Write-Info "已提交: $Message" }
    else { Write-Warn "提交失败: $Message（可能无内容可提交）" }
}

# ------------------------------------------------------------
# 执行 7 个逻辑提交
# ------------------------------------------------------------
function Invoke-CommitSteps {
    Write-Host "==> 执行发布提交（7 步）..."

    # 1. 新增单元测试
    Invoke-StageCommit "test(frontend): add unit tests for stores and format utils" @(
        'src-web/src/stores/canvasStore.test.ts',
        'src-web/src/stores/chatStore.test.ts',
        'src-web/src/stores/galleryStore.test.ts',
        'src-web/src/utils/format.test.ts'
    )

    # 2. 修正测试断言（formatBytes 四舍五入 + 移除未使用 vi）
    Invoke-StageCommit "fix(frontend): correct formatBytes decimal assertion" @(
        'src-web/src/utils/format.test.ts'
    )

    # 3. 修复 Tauri 打包配置（identifier / category）
    Invoke-StageCommit "build: fix tauri bundle identifier and category" @(
        'src-tauri/tauri.conf.json'
    )

    # 4. 版本号管理脚本（version.mjs + package.json 命令）
    Invoke-StageCommit "feat(build): add version sync script and pnpm commands" @(
        'scripts/version.mjs',
        'package.json',
        'src-web/package.json'
    )

    # 5. CI：release 版本校验 + 修复 commitlint 配置引用
    Invoke-StageCommit "ci: verify tag version in release, fix commitlint config" @(
        '.github/workflows/release.yml',
        '.github/workflows/ci.yml'
    )

    # 6. 文档与仓库元数据统一（含解除 ignore 的 Cargo.lock）
    Invoke-StageCommit "docs: unify repo links and add versioning plan" @(
        'README.md',
        'RELEASING.md',
        'CONTRIBUTING.md',
        'DEVELOPMENT.md',
        '.github/labels.yml',
        '.gitignore',
        'src-tauri/Cargo.toml',
        'src-tauri/Cargo.lock'
    )

    # 7. 清理遗留 npm lockfile
    if (git status --porcelain -- package-lock.json 2>$null) {
        git rm -f package-lock.json
        git commit -m "chore: remove legacy npm package-lock.json" 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Info "已提交: chore: remove legacy npm package-lock.json" }
    } else {
        Write-Warn "跳过（无变更）: chore: remove legacy npm package-lock.json"
    }

    Write-Host "==> 提交完成。剩余未提交:"
    git status --short
}

# ------------------------------------------------------------
# 打 tag 并推送（触发 Release workflow）
# ------------------------------------------------------------
function Invoke-Publish {
    Check-Preconditions

    $tag = "v$VERSION"
    if (git rev-parse $tag *> $null) {
        Write-Fail "tag $tag 已存在（git tag -d $tag 可删除后重试）"
    }
    if (-not (git log --oneline -1)) {
        Write-Fail "没有提交，无法发布"
    }

    # 推送 main
    Write-Host "==> 推送 main 分支..."
    git push origin main
    if ($LASTEXITCODE -ne 0) { Write-Warn "推送 main 失败（请手动检查 remote）" }

    # 打 tag 并推送
    Write-Host "==> 打 tag $tag ..."
    git tag $tag
    git push origin $tag
    if ($LASTEXITCODE -ne 0) { Write-Fail "推送 tag 失败" }
    Write-Info "已推送 $tag → $REPO/releases/tag/$tag"
    Write-Host "==> GitHub Actions 正在三平台构建，完成后到 Release 页人工 Publish。"
}

# ------------------------------------------------------------
# 入口
# ------------------------------------------------------------
switch ($Command) {
    'verify'  { Check-Preconditions }
    'build'   { Invoke-WindowsBuild }
    'commit'  { Invoke-CommitSteps }
    'publish' { Invoke-Publish }
    'all' {
        Check-Preconditions
        Invoke-CommitSteps
        Invoke-Publish
    }
    default { Write-Fail "用法: .\release.ps1 {verify|build|commit|publish}" }
}

Write-Host "[✓] 完成" -ForegroundColor Green
