# 第一次跑 CI 的操作清单（Step-by-Step）

> 这份 runbook 用来"先跑一次"——只触发 `.github/workflows/ci.yml`，不触发 release。
> 目的：在 push tag 之前，先验证工具链能装、依赖能解析、所有 job 能跑通。

---

## 一、本次要 push 的改动

我已经在本地改完了这些文件，但**还没 commit**：

```
 M .github/workflows/ci.yml          （修复 pnpm-lock bootstrap）
 M .github/workflows/release.yml     （Linux 加系统依赖 + rust cache + 三平台独立 job）
?? RELEASING.md                       （发布操作手册）
```

---

## 二、执行步骤（在 PowerShell 里）

打开 PowerShell，**`cd I:\OpenPaint`** 后逐条执行。

### Step 1：暂存并提交

```powershell
git add .github/workflows/ci.yml .github/workflows/release.yml RELEASING.md
git commit -m "ci: bootstrap pnpm install when lockfile missing, add linux system deps and rust cache to release"
```

> ⚠️ commit message **必须** 是 conventional commit 格式（`ci: ...` / `feat: ...` / `chore: ...` / `fix: ...`）。
> 仓库根有 `.commitlintrc.yml`，CI 里的 `commit-lint` job 会强校验。
> 不规范 → commitlint job 直接红。

### Step 2：推送到 main（只触发 ci.yml）

```powershell
git push origin main
```

推完打开：
`https://github.com/MatuX-ai/OpenPaint/actions/workflows/ci.yml`

应该看到 4 个 job 在跑：

- `frontend`（ubuntu/windows/macos × 3 矩阵）
- `backend`（ubuntu/windows/macos × 3 矩阵）
- `commit-lint`

每个 job 跑完大约 5~15 分钟（前端要装 pnpm 依赖；后端要装 Rust 工具链 + 缓存首次冷启动可能要 20 分钟）。

### Step 3：观察结果

**全部绿 → 跳到 Step 4**。
**有红 → 看下方「三、CI 失败排查」**。

### Step 4：触发 release（ci 跑通后再做）

```powershell
# 确认 src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml 的 version 都是 0.1.0
# 打 tag
git tag v0.1.0

# 推送 tag → 触发 release.yml
git push origin v0.1.0
```

打开：`https://github.com/MatuX-ai/OpenPaint/actions/workflows/release.yml`

三个 job 会并行跑：

- `Linux (.deb / .AppImage)` — ubuntu-22.04
- `Windows (.msi / .exe)` — windows-latest
- `macOS (.dmg / .app)` — macos-latest

每个 job 跑完产物会以 **draft release** 挂到：
`https://github.com/MatuX-ai/OpenPaint/releases/tag/v0.1.0`

人工 review 后点 **Publish**。

---

## 三、CI 失败排查

### Job: `frontend`

**症状**：`pnpm install` 报错
**原因**：bootstrap 模式应该能兜住，但你手动 `pnpm install` 之前可能本地 lockfile 不一致
**排查**：去 Actions 日志看具体错误。最常见的是 `ERR_PNPM_PEER_DEP_ISSUES`（pinia/vue 版本不匹配）——这是 workspace 内 `src-web/package.json` 的依赖问题，跟 workflow 无关

**症状**：`Lint failed` / `Type Check failed`
**原因**：本地没跑过 lint 就提交了
**解决**：本地 `pnpm lint` 和 `pnpm type-check` 修一遍再提交

### Job: `backend`

**症状**：`Rust fmt` 步骤报 `Diff in ...rs:N` 多处
**原因**：Rust 代码不符合 rustfmt 规范
**解决**：✅ **已自动化**——独立的 `backend-fmt-fix` job 会自动跑 `cargo fmt --all`，commit + push 回 main。

- 第一次 push 后，bot 会创建 commit `style: apply cargo fmt (auto-fix from CI)`
- 下次 CI 跑时 bot 检测到上一次 commit 是自己 → 跳过
- 因此**不会再出现 fmt 失败**——除非 bot 自己 push 失败

**症状**：`cargo clippy` 报错
**原因**：`RUSTFLAGS: "-D warnings"` 把 warning 当 error
**解决**：本地跑 `cd src-tauri && cargo clippy --all-targets -- -D warnings` 看具体警告，修代码

**症状**：`cargo build` 报错缺依赖
**原因**：Tauri 2 在 Linux runner 上需要 `libwebkit2gtk-4.1-dev` 等
**说明**：✅ **已在 ci.yml 的 backend job 加了 `if: matrix.os == 'ubuntu-latest'` 的 apt install 步骤**，理论上不会出这个问题。如果还报缺包，把 `apt-get install` 那段贴回来。

### Job: `commit-lint`

**症状**：`subject may not be empty` / `type may not be empty` / `type must be one of ...`
**原因**：commit message 不符合 conventional commits
**解决**：用 `git commit --amend` 改 message 重新 push

### 任何 job 报 `pnpm-lock.yaml not found`

**正常**：第一次 CI 会跑 bootstrap 模式生成 `pnpm-lock.yaml`
**后续步骤**：CI 跑完后，**手动把生成的 `pnpm-lock.yaml` 提交回仓库**：

```powershell
git add pnpm-lock.yaml
git commit -m "chore: add pnpm-lock.yaml"
git push origin main
```

然后**删除** `package-lock.json`：

```powershell
git rm package-lock.json
git commit -m "chore: remove npm lockfile, switch to pnpm"
git push origin main
```

之后 CI 都走 frozen 模式。

---

## 四、时间预估

| Step                  | 耗时              |
| --------------------- | ----------------- |
| 提交 + push           | < 1 分钟          |
| ci.yml 首次跑（前端） | 5~10 分钟 × 3 OS  |
| ci.yml 首次跑（后端） | 10~25 分钟 × 3 OS |
| commit-lint           | < 1 分钟          |
| release.yml 首次跑    | 20~40 分钟 × 3 OS |
| **合计**              | **45~120 分钟**   |

---

## 五、需要你手动做的后续动作

1. 看 CI 结果，把失败的 job 报错贴回来，我帮你改
2. CI 全绿后打 tag 触发 release
3. release 跑完后**人工 review draft release**，点 Publish
4. macOS 用户怎么装未签名的 dmg（要右键打开）
5. Windows 用户怎么绕过 SmartScreen 红屏（点"更多信息"→"仍要运行"）
