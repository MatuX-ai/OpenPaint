#!/usr/bin/env bash
# ============================================================
# OpenPaint 发布脚本（bash）
# ============================================================
# 用法：
#   ./release.sh verify   # 发布前检查：版本一致性 + 关键文件
#   ./release.sh commit   # 按逻辑拆分执行 7 个提交（幂等，无变更自动跳过）
#   ./release.sh publish  # 打 tag 并推送，触发 GitHub Release workflow
#   ./release.sh          # 等价于 verify + commit + publish 全流程
#
# 依赖：git、node、pnpm（bash 环境，Windows 可用 Git Bash）
# 提交规范：见 .commitlintrc.yml（type/scope/长度均受限）
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

VERSION="0.1.0"
REPO="https://github.com/MatuX-ai/OpenPaint"

# ------------------------------------------------------------
# 颜色输出
# ------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ------------------------------------------------------------
# 前置检查
# ------------------------------------------------------------
check_preconditions() {
  echo "==> 前置检查..."
  command -v git >/dev/null || fail "未找到 git"
  command -v node >/dev/null || fail "未找到 node"

  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "当前目录不是 git 仓库"

  # 关键文件必须存在（Cargo.lock / pnpm-lock.yaml 必须提交）
  for f in "pnpm-lock.yaml" "src-tauri/Cargo.lock" "scripts/version.mjs" \
           ".github/workflows/release.yml" ".github/workflows/ci.yml"; do
    [ -f "$f" ] || fail "缺少关键文件: $f"
  done
  info "关键文件齐全"

  # 版本一致性（三处：tauri.conf.json / Cargo.toml / package.json）
  node scripts/version.mjs --check || fail "版本不一致，请先运行: pnpm version:set <version>"
  info "版本一致: $(node scripts/version.mjs --check >/dev/null 2>&1 && echo $VERSION)"

  # remote 检查
  if ! git remote get-url origin >/dev/null 2>&1; then
    warn "未配置 origin remote，请先: git remote add origin $REPO.git"
  fi
}

# ------------------------------------------------------------
# 幂等提交：有变更才提交，无变更跳过
#   stage_commit <message> <file...>
# ------------------------------------------------------------
stage_commit() {
  local msg="$1"; shift
  # 检查这些文件是否有改动（staged 或 unstaged 或 untracked）
  local has_changes=false
  for f in "$@"; do
    if git status --porcelain -- "$f" 2>/dev/null | grep -q .; then
      has_changes=true
      break
    fi
  done
  if [ "$has_changes" = false ]; then
    warn "跳过（无变更）: $msg"
    return 0
  fi
  git add "$@"
  git commit -m "$msg" || warn "提交失败: $msg（可能无内容可提交）"
  info "已提交: $msg"
}

# ------------------------------------------------------------
# 执行 7 个逻辑提交
# ------------------------------------------------------------
do_commit() {
  echo "==> 执行发布提交（7 步）..."

  # 1. 新增单元测试
  stage_commit "test(frontend): add unit tests for stores and format utils" \
    src-web/src/stores/canvasStore.test.ts \
    src-web/src/stores/chatStore.test.ts \
    src-web/src/stores/galleryStore.test.ts \
    src-web/src/utils/format.test.ts

  # 2. 修正测试断言（formatBytes 四舍五入 + 移除未使用 vi）
  stage_commit "fix(frontend): correct formatBytes decimal assertion" \
    src-web/src/utils/format.test.ts

  # 3. 修复 Tauri 打包配置（identifier / category）
  stage_commit "build: fix tauri bundle identifier and category" \
    src-tauri/tauri.conf.json

  # 4. 版本号管理脚本（version.mjs + package.json 命令）
  stage_commit "feat(build): add version sync script and pnpm commands" \
    scripts/version.mjs \
    package.json \
    src-web/package.json

  # 5. CI：release 版本校验 + 修复 commitlint 配置引用
  stage_commit "ci: verify tag version in release, fix commitlint config" \
    .github/workflows/release.yml \
    .github/workflows/ci.yml

  # 6. 文档与仓库元数据统一（含解除 ignore 的 Cargo.lock）
  stage_commit "docs: unify repo links and add versioning plan" \
    README.md \
    RELEASING.md \
    CONTRIBUTING.md \
    DEVELOPMENT.md \
    .github/labels.yml \
    .gitignore \
    src-tauri/Cargo.toml \
    src-tauri/Cargo.lock

  # 7. 清理遗留 npm lockfile
  if git status --porcelain -- package-lock.json 2>/dev/null | grep -q .; then
    git rm -f package-lock.json
    git commit -m "chore: remove legacy npm package-lock.json" || true
    info "已提交: chore: remove legacy npm package-lock.json"
  else
    warn "跳过（无变更）: chore: remove legacy npm package-lock.json"
  fi

  echo "==> 提交完成。剩余未提交:"
  git status --short || true
}

# ------------------------------------------------------------
# 打 tag 并推送（触发 Release workflow）
# ------------------------------------------------------------
do_publish() {
  check_preconditions

  local tag="v$VERSION"
  if git rev-parse "$tag" >/dev/null 2>&1; then
    fail "tag $tag 已存在（git tag -d $tag 可删除后重试）"
  fi
  if [ -z "$(git log --oneline -1)" ]; then
    fail "没有提交，无法发布"
  fi

  # 推送 main
  echo "==> 推送 main 分支..."
  git push origin main || warn "推送 main 失败（请手动检查 remote）"

  # 打 tag 并推送
  echo "==> 打 tag $tag ..."
  git tag "$tag"
  git push origin "$tag" || fail "推送 tag 失败"
  info "已推送 $tag → $REPO/releases/tag/$tag"
  echo "==> GitHub Actions 正在三平台构建，完成后到 Release 页人工 Publish。"
}

# ------------------------------------------------------------
# 入口
# ------------------------------------------------------------
cmd="${1:-all}"
case "$cmd" in
  verify)  check_preconditions ;;
  commit)  do_commit ;;
  publish) do_publish ;;
  all)
    check_preconditions
    do_commit
    do_publish
    ;;
  *) fail "用法: $0 {verify|commit|publish}" ;;
esac

echo -e "${GREEN}==> 完成 ✓${NC}"
