# 依赖升级：resvg / usvg → 0.48.1

> 状态：已合入 `main`（提交 `b8beca0`），未发布。
> 范围：`src-tauri` 后端（Rust）。
> 风险：低。源码兼容，无需业务代码改动。

## 1. 背景

`src-tauri/Cargo.toml` 中 `resvg` 与 `usvg` 之前固定在 `0.43` 系列。
后续 `tiny-skia` 已经迭代到 `0.12`，但 `resvg 0.43` / `usvg 0.43` 间接依赖的
`tiny-skia` 版本与新版不兼容，会出现传递依赖解析冲突。

为了：

- 与上游生态对齐（更多 SVG 特性、错误信息改进、安全修复）；
- 解开传递依赖中的版本冲突；
- 为后续接入新版 `image` 与 `tauri` 铺路；

决定把 `resvg` 与 `usvg` 同步升级到 `0.48.1` 并精确锁定版本。

## 2. 改动清单

### 2.1 `src-tauri/Cargo.toml`

```diff
-resvg = "0.43"
-usvg = "0.43"
+# SVG 渲染：resvg / usvg 必须同版本对齐（tiny-skia 由 usvg/resvg 间接拉取，
+# 当前 0.48 系列对应 tiny-skia 0.12）。升级前已确认 call site
+# （ai_commands.rs::render_svg_to_png_internal）保持 0.43 → 0.48 的源码兼容，
+# 唯一变化是 tiny_skia::Pixmap::encode_png 返回的 Err 类型不同
+# （仍实现 std::error::Error，可被 anyhow::Result 自动接管）。
+resvg = "=0.48.1"
+usvg = "=0.48.1"
```

### 2.2 业务代码

**未改动。** 唯一调用点 `src-tauri/src/ai_commands.rs` 中的
`render_svg_to_png_internal` 经验证保持源码兼容。

## 3. 兼容性验证

| 维度             | 结果 | 说明                                                                                                     |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| API 签名         | ✅   | `resvg::render`、`usvg::Parser` 入口未破坏性变更                                                         |
| 错误类型         | ✅   | `tiny_skia::Pixmap::encode_png` 的 `Err` 类型变化，但实现 `std::error::Error`，`anyhow::Result` 直接接管 |
| 渲染输出像素一致 | ⚠️   | 0.43 → 0.48 内部使用新版 `tiny-skia`，**边缘像素可能存在亚像素级差异**（不影响 SVG 语义）                |
| 字体解析         | ✅   | 字体路径加载 API 未变化                                                                                  |
| `Cargo.lock`     | ✅   | 已自动重新生成，`resvg` / `usvg` / `tiny-skia` 三者版本一致                                              |

> 渲染输出的亚像素级差异通常肉眼不可见，但若后续需要做像素级回归（例如 PNG
> diff 自动化测试），需要重新生成 baseline。

## 4. 升级后如何验证

```bash
cd src-tauri
cargo update -p resvg -p usvg      # 应为 noop，因已用 = 锁定
cargo clippy --all-targets -- -D warnings
cargo test --all
cargo build --release
```

CI 上对应的是 `.github/workflows/ci.yml` 的 `backend` job，会在
`ubuntu-latest` / `windows-latest` / `macos-latest` 三个矩阵上跑 clippy + test + release build。

## 5. 回滚方案

如需回滚，把 `src-tauri/Cargo.toml` 改回：

```toml
resvg = "0.43"
usvg  = "0.43"
```

然后 `cargo update` 重生 `Cargo.lock`，无需修改任何 `.rs` 文件。

## 6. 关联

- 提交：`b8beca0` `build(deps): bump resvg/usvg to 0.48.1 in src-tauri`
- 计划随首个 release tag（`v0.1.0`）发布
- PR 模板：本项目升级直接走 `main` 提交，未单独建 PR；本文档即为对应的"升级说明"
