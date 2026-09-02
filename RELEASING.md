# 发布指南（OpenPaint Desktop）

本指南说明如何通过 GitHub Actions 自动构建并发布 OpenPaint 桌面端。

---

## 一、前置条件

1. 仓库已启用 GitHub Actions（默认启用）。
2. `Cargo.lock` 和（首次构建后生成的）`pnpm-lock.yaml` **必须提交到仓库**。
3. 仓库根目录 `package-lock.json` 是 npm 格式的遗留文件，建议删除：
   ```bash
   # 仅当你确认没人用 npm install 时执行
   rm package-lock.json
   ```
   第一次 CI 跑完会自动生成 `pnpm-lock.yaml`，之后 CI 会走 frozen 模式。

---

## 二、版本号管理计划（Versioning Plan）

OpenPaint 采用 **SemVer**（语义化版本）：`MAJOR.MINOR.PATCH[-prerelease][+build]`。

### 版本号单一来源

`src-tauri/tauri.conf.json` 的 `version` 是**唯一权威版本号**（Tauri 打包时据此生成安装包文件名）。
每次发版需同步三处：

| 文件                        | 作用                         | 权威 |
| --------------------------- | ---------------------------- | ---- |
| `src-tauri/tauri.conf.json` | 打包产物版本（安装包文件名） | ✅   |
| `src-tauri/Cargo.toml`      | Rust crate 版本              | 同步 |
| `src-web/package.json`      | 前端包版本                   | 同步 |

### 使用版本脚本（推荐）

```bash
# 查看当前三处版本是否一致
pnpm version:show

# 设置新版本并同步三处（自动改写 tauri.conf.json / Cargo.toml / package.json）
pnpm version:set 0.2.0

# 校验一致性（CI 用，可带 tag 校验）
pnpm version:check
node scripts/version.mjs --check v0.2.0
```

> ⚠️ 不要手动分别改三个文件——`version.mjs` 保证三处原子同步。
> 版本号示例：`0.2.0`（正式）、`0.3.0-beta.1`（预发布）。

### 版本号与 git tag 对齐

`release.yml` 已内置 `verify-version` job：**推送的 tag 必须与三处版本一致**，否则构建立即失败。

```bash
pnpm version:set 0.2.0        # 1. 同步版本
git add -A && git commit -m "chore: release v0.2.0"
git tag v0.2.0                # 2. 打 tag（v + SemVer）
git push origin v0.2.0        # 3. 推送触发 Release
```

### 安装包文件名（由 Tauri 自动生成）

| 平台    | 文件命名规则                                              |
| ------- | --------------------------------------------------------- |
| Windows | `OpenPaint_<version>_x64_en-US.msi` / `..._x64-setup.exe` |
| Linux   | `openpaint_<version>_amd64.deb` / `..._amd64.AppImage`    |
| macOS   | `OpenPaint_<version>_aarch64.dmg` / `..._x64.dmg`         |

无需手动命名——文件名始终跟随 `tauri.conf.json` 的 version。

### 版本演进规则

- **PATCH**（`0.2.0 → 0.2.1`）：bug 修复、不破坏兼容
- **MINOR**（`0.2.0 → 0.3.0`）：新功能、向后兼容
- **MAJOR**（`0.x → 1.0`）：破坏性变更 / 首个稳定版
- **预发布**（`-beta.1` / `-rc.1`）：正式版前的候选，CI 同样可用

### bundle 配置

`src-tauri/tauri.conf.json` 是发布元数据的来源。发版前请同步更新：

```jsonc
{
  "productName": "OpenPaint",
  "version": "0.2.0", // ← 用 pnpm version:set 改，不要手改
  "identifier": "dev.openpaint.desktop",
  "bundle": {
    "publisher": "OpenPaint Contributors",
    "category": "Graphics and Design",
    "shortDescription": "开源 AI 原生设计工作台",
    "longDescription": "OpenPaint 是一个开源 AI 原生设计工作台，将像素级图像编辑与 AI 大模型的生成能力无缝融合。",
  },
}
```

> ℹ️ `identifier` 不要以 `.app` 结尾（会与 macOS 应用包扩展名冲突），建议 `dev.openpaint.desktop`。

`Cargo.toml` 的 `version` 字段由 `version.mjs` 自动同步，无需手工维护。

---

## 三、触发发布流程

CI 配置在 `.github/workflows/release.yml`，触发方式是 **推送 git tag**：

```bash
# 1. 确认所有改动已提交
git status

# 2. 打 tag（与 tauri.conf.json / Cargo.toml 的 version 一致）
git tag v0.2.0

# 3. 推送 tag，触发 Release workflow
git push origin v0.2.0
```

推送后访问：`https://github.com/<owner>/<repo>/actions/workflows/release.yml`

---

## 四、产物说明

每个平台独立 job 产出：

| 平台    | 产物格式               | 文件示例                        |
| ------- | ---------------------- | ------------------------------- |
| Linux   | `.deb` / `.AppImage`   | `openpaint_0.2.0_amd64.deb`     |
| Windows | `.msi` / `.exe` (NSIS) | `OpenPaint_0.2.0_x64_en-US.msi` |
| macOS   | `.dmg` / `.app`        | `OpenPaint_0.2.0_aarch64.dmg`   |

所有 bundle 会作为 **draft release** 自动挂到同名 GitHub Release 页：

`https://github.com/<owner>/<repo>/releases/tag/v0.2.0`

请人工检查 Release 内容 → 去掉 `draft:` 标记 → 点 **Publish**。

---

## 五、代码签名（强烈推荐，发布给真实用户前必做）

当前 workflow **不签名**——MVP 阶段可行，但用户体验很差：

- **Windows**：用户首次运行会看到 SmartScreen 红屏
- **macOS**：用户根本无法打开 dmg（Gatekeeper）

### Windows 签名（可选）

1. 购买 / 申请 EV 代码签名证书
2. 在 GitHub 仓库 **Settings → Secrets** 添加：
   - `WINDOWS_CERT_FILE`（base64 编码的 .pfx）
   - `WINDOWS_CERT_PASSWORD`
3. 修改 `release.yml` 的 windows job，加上 tauri 的 signconfig（参见 Tauri 文档）
4. 触发签名 + 自动提交到 Windows Defender SmartScreen

### macOS 签名 + 公证（必需）

1. 加入 Apple Developer Program（$99/年）
2. 创建 Developer ID Application 证书 + 安装到 Keychain
3. 在 GitHub Secrets 添加：
   - `APPLE_CERT_P12_BASE64`
   - `APPLE_CERT_PASSWORD`
   - `APPLE_SIGNING_IDENTITY`（如 `Developer ID Application: OpenPaint Contributors (TEAMID)`）
   - `APPLE_ID`（Apple ID 邮箱）
   - `APPLE_PASSWORD`（App-specific password）
   - `APPLE_TEAM_ID`
4. 把 Tauri 的 `tauri-action` 引入到 workflow，配置 `signingIdentity` + `appleId` 等环境变量
5. macOS runner 必须是 `macos-latest`（Apple Silicon 镜像）

详细文档：https://tauri.app/distribute/sign/macos/

---

## 六、本地验证打包

在 push tag 之前，建议先在本地验证打包能成功：

```bash
# Linux
pnpm tauri build --bundles deb,appimage

# Windows（在 Windows 上）
pnpm tauri build --bundles msi --bundles nsis

# macOS（在 macOS 上）
pnpm tauri build --bundles dmg,app
```

产物在 `src-tauri/target/release/bundle/` 下。

---

## 七、常见问题

### Q1: Linux job 报错 `webkit2gtk-4.1 not found`

`tauri-cli` 2.x 必须 `libwebkit2gtk-4.1-dev`（Tauri 1.x 是 4.0）。已经写死在 release.yml 的安装步骤里。
如果你改了 runner 镜像（不是 ubuntu-22.04），需要重新适配系统包列表。

### Q2: macOS job 报错 `No signing identity found`

当前是预期行为——没配签名证书。如需签名见上文「五」。

### Q3: Windows job 一直卡在编译

Cargo 缓存首次冷启动可能 15~~25 分钟。`swatinem/rust-cache` 会让第二次降到 3~~5 分钟。
如果持续卡住，检查 `src-tauri/Cargo.toml` 是否有重型依赖（如 lancedb 特性）。

### Q4: pnpm-lock.yaml 没生成，CI 在 bootstrap 模式

正常。第一次 CI 跑完后请把新生成的 `pnpm-lock.yaml` commit 进去，之后 CI 走 frozen 模式。

---

## 八、回滚 / 重新发布

如果发现 release 有严重问题：

```bash
# 删除远程 tag（GitHub Release 会自动变为 un-published）
git push origin --delete v0.2.0

# 修复代码，重新打 tag 推送
git tag v0.2.1
git push origin v0.2.1
```
