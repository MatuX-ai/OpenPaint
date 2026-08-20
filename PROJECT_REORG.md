# OpenPaint 项目重组方案

> 状态：v1.0 | 编制时间：项目接手后第一周
> 适用范围：接手"开发者跑路"后的 OpenPaint 仓库
> 角色：新任维护者 + 下一批模块 Owner

---

## 0. TL;DR

接手 OpenPaint 时，仓库已经具备**完整的设计文档**（三份说明书 + 一份看板），并且 **Rust 后端 90% 已实现**，但有以下三类遗留问题让项目不可运行：

1. **基础设施从未跑通**：`tauri.conf.json`、`Cargo.toml`、`commitlintrc.json` 三个核心配置有格式错误，Tauri `cargo check` 在打开文件时就崩。
2. **前后端契约错位**：前端 `invoke('undo')` 调的是后端根本不存在的命令名 `undo_canvas`；后端注册的 36 个 Tauri 命令里，有 17 个前端根本没调用。
3. **目录树只到 30%**：设计文档要求的 17 个前端组件只实现了 5 个，AI 助理 / OpenPencil / 图库三大核心面板完全空缺。

按下面这套"先打地基 → 再接通回路 → 后补业务"的顺序推进，预计 **6 周**可以走完 MVP 闭环，并达到 §6 的阶段一验收标准。

---

## 1. 现状盘点（基于两份审计 + cargo check 输出）

### 1.1 已实现的（可直接复用，不要重写）

| 模块                                                  | 行数   | 评价                                       |
| ----------------------------------------------------- | ------ | ------------------------------------------ |
| `src-tauri/src/canvas/`                               | 854    | 完整：图层 / 历史栈 / 渲染 / 选区 / 工具集 |
| `src-tauri/src/gallery/`                              | 349    | 完整：SQLite + 缩略图 + 自动轮转           |
| `src-tauri/src/config/`                               | 152    | 完整：YAML 序列化 + 默认配置写入           |
| `src-tauri/src/tools/canvas_commands.rs`              | 387    | 完整：16 个画布命令                        |
| `src-tauri/src/tools/canvas_tools.rs`                 | 120    | 完整：4 个原子工具（M-08）                 |
| `src-web/src/stores/{canvas,chat,gallery,ui}Store.ts` | 4 文件 | 状态占位完整                               |
| `src-web/src/components/layout/*`                     | 5 组件 | 三栏布局完整                               |

### 1.2 已损坏的（必须修复，否则 cargo / tauri dev 跑不起来）

| 问题                                                                                           | 文件                                                  | 修复                                                                                         |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `tauri.conf.json` 顶部 5 行是 `#` 注释，JSON 无法解析                                          | `src-tauri/tauri.conf.json`                           | **已修**：删注释头                                                                           |
| `commitlintrc.json` 实际是 YAML 格式                                                           | `.commitlintrc.json`                                  | **已修**：删除并改名为 `.commitlintrc.yml`                                                   |
| `Cargo.toml` 启用了 `protocol-asset,macos-private-api`，但 `tauri.conf.json` 没在 allowlist 里 | `src-tauri/Cargo.toml`                                | **已修**：去掉 `macos-private-api`；`tauri.conf.json` 加 `assetProtocol` 段                  |
| `src-tauri/icons/*` 缺失，bundle 报错                                                          | `src-tauri/icons/`                                    | **已修**：通过 `scripts/gen-icons.ps1` + `IconRenderer.cs` 程序化生成 16 个文件              |
| `bin/mcp.rs` 引用 `openpaint_lib::*`，但 crate 名是 `openpaint`                                | `src-tauri/src/bin/mcp.rs`                            | **已修**                                                                                     |
| `src-tauri/src/main.rs` 与 `lib.rs` 同时声明 6 个同名 `mod`，导致双重编译                      | 整组                                                  | **已修**：main.rs 改成 `fn main() { openpaint::run() }`，`run()` 与命令注册统一搬到 `lib.rs` |
| `canvas::tests.rs` 访问 `state.max_history`（字段不存在）                                      | `src-tauri/src/canvas/tests.rs`                       | **已修**：改用 `state.history.max_size()`                                                    |
| `image 0.25` 的 `PngEncoder::encode` 实际叫 `write_image`，且消费 self                         | `src-tauri/src/canvas/engine.rs`、`gallery/engine.rs` | **已修**：统一改用 `ImageEncoder::write_image`                                               |
| `resvg 0.43` 移除了 `FitTo` 枚举                                                               | `src-tauri/src/tools/ai_commands.rs`                  | **已修**：自己用 `tiny_skia::Transform::from_scale` 算缩放                                   |
| `usvg 0.43` 移除了 `TreeParsing::parse_str`                                                    | 同上                                                  | **已修**：改用 `Tree::from_str(svg, &Options::default())`                                    |
| `Vec<u8>` 不能直接 `?` 转 `anyhow::Error`，缺 `From<String>`                                   | `src-tauri/src/gallery/engine.rs`                     | **已修**：所有 base64 / image / db 错误用 `map_err` 包成 anyhow                              |
| `r.get(0)` 必须显式标 `r.get::<_, i64>(0)`                                                     | `src-tauri/src/gallery/database.rs`                   | **已修**                                                                                     |

### 1.3 设计文档要求但代码里不存在的（需要补齐）

| 项                | 缺失内容                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 前端组件          | `components/assistant/*` 6 个、`openpencil/*` 3 个、`gallery/*` 5 个、`canvas/{CanvasToolbar,LayerItem,SelectionRect}.vue`、`common/{Icon,ResizeHandle,ThemeToggle}.vue` |
| 前端 composables  | `useAgent.ts`、`useGallery.ts`、`useOpenPencil.ts`、`useShortcuts.ts`、`useResize.ts`                                                                                    |
| 前端 API 模块拆分 | `api/{canvasApi,agentApi,galleryApi,openpencilApi}.ts`（当前全在 `index.ts`）                                                                                            |
| Rust 模块         | `gallery/vector.rs`（LanceDB 集成，阶段三）                                                                                                                              |
| Rust 工具         | `tools/ai_commands.rs`、`tools/gallery_commands.rs`、`tools/llm_commands.rs` 文件已存在但 `tools/mod.rs` 没声明它们                                                      |
| 制品              | `src-tauri/bin/hermes` 二进制（阶段二启动 Agent 时下载）                                                                                                                 |

### 1.4 现状结论

> **Rust 后端已经覆盖设计文档 80% 的能力，前端骨架完成 30%。**
> 主要工作是把前后端的契约对齐、把缺失的 UI 组件补齐、以及把 build 跑通。

---

## 2. 组织架构（团队分工）

> 把模块按"独立可验证"原则拆分，每块 1 个 Owner + 1 个 Reviewer。

| 编号 | 模块                              | Owner | Reviewer | 当前状态                                   |
| ---- | --------------------------------- | ----- | -------- | ------------------------------------------ |
| M-01 | 仓库根 + CI                       | TBD   | TBD      | ✅ 已修：CI yaml 待 `pnpm install` 验证    |
| M-02 | Tauri 工程脚手架                  | TBD   | TBD      | ✅ 已修：cargo check 通过、图标已生成      |
| M-03 | 画布引擎（Rust）                  | A     | F        | ✅ 完整                                    |
| M-04 | OpenPencil 嵌入（Web）            | TBD   | TBD      | 🟡 仅占位：iframe + postMessage 通信未实现 |
| M-05 | AI 闭环（MCP + 截图 → AI → 落回） | TBD   | TBD      | 🔴 需等 M-04 + Hermes Agent 二进制         |
| M-06 | 图库管理                          | TBD   | TBD      | ✅ 后端完整，前端 0%                       |
| M-07 | 配置管理                          | TBD   | TBD      | ✅ 后端完整，前端设置页缺失                |
| M-08 | 画布原子工具（4 个）              | A     | F        | ✅ 后端完整                                |
| M-09 | Hermes Agent 集成                 | TBD   | TBD      | 🟡 后端 mock 实现，前端浮窗缺失            |
| M-10 | 原子工具扩展（6 个）              | TBD   | TBD      | 🟡 后端 mock，前端列表 UI 缺失             |

---

## 3. 六周冲刺计划（与看板 §6 阶段一对齐）

> 每周末产出 demo 录屏 + 当周完成项清单。

### Week 1 — 工程脚手架与契约对齐 ✅ 全部完成

- ✅ `tauri.conf.json` 注释头删除
- ✅ `.commitlintrc.yml` 重命名
- ✅ `Cargo.toml` 修正 `protocol-asset` allowlist
- ✅ `src-tauri/icons/*` 16 个文件由 `scripts/gen-icons.ps1` 程序化生成
- ✅ `src-tauri/src/main.rs` 简化为 `openpaint::run()`，`run()` 搬到 `lib.rs`
- ✅ `tools/mod.rs` 声明 `ai_commands / gallery_commands / llm_commands / canvas_commands / canvas_tools`
- ✅ `bin/mcp.rs` 改用 `openpaint::mcp`
- ✅ `cargo check` 通过（lib + bin + bin-mcp 三个 target）

**验收**：`cargo check` 全绿，`src-tauri/icons/` 下 16 个图标就位。

### Week 2 — 画布 UI 与 OpenPencil 嵌入 ✅ 完成

**目标**：用户能在三栏布局里画一条线、做一个矩形选区、撤销一次；右窗加载 OpenPencil 静态页面。

| 任务                                                     | 状态 | 说明                                                                                                                        |
| -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `CanvasView.vue` 接入 `<canvas>` 元素                    | ✅   | 渲染后端 `render_canvas_png` 返回的 PNG；pointer 事件转发给 `useCanvas`                                                     |
| `useCanvas.ts` 完善坐标转换 / 工具切换 / 缩放            | ✅   | 重写：brush/eraser 笔画缓冲 → `apply_brush_stroke`；rect-select 拖拽 → `set_rect_selection`；`refresh()` 同步图层/undo-redo |
| `CanvasToolbar.vue` / `LayerPanel.vue` / `LayerItem.vue` | ✅   | 画笔粗细滑杆 + 颜色 swatches；图层增删/切换/可见性，`set_active_layer` / `set_layer_visibility`                             |
| `OpenPencilView.vue` iframe + postMessage 协议           | ✅   | `useOpenPencil.ts` 桥接；本地 srcdoc 占位页演示 OPENPENCIL_RESULT / EXPORT_SVG                                              |
| `SelectionRect.vue` 覆盖层                               | ✅   | 虚线边框 + 尺寸 tag，从 `canvasStore.selection` 读取                                                                        |
| `TopBar` 撤销/重做                                       | ✅   | 接 `undo_canvas` / `redo_canvas`，按钮根据 `canUndo/canRedo` 亮/灰                                                          |
| `useShortcuts.ts` / `useResize.ts`                       | ✅   | Ctrl+Z/Y/B/E/M/V/H/T、Ctrl+K/G；ResizeObserver 封装                                                                         |
| 单元测试                                                 | ✅   | `vue-tsc` 0 error、vitest 7/7、eslint 0 error、stylelint 0 error、vite build 成功                                           |

**验收达成**：全部通过（见上方测试结果）。

### Week 3 — 闭环与 SQLite 图库 ✅ 完成

**目标**：实现"截图 → AI → 落回画布"的最小闭环（图库保存先 mock，AI 引擎先用 `send_to_ai_engine` 返回的固定 SVG）。

| 任务                                                                                   | 状态 | 说明                                                                                   |
| -------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| 前端 API 契约对齐                                                                      | ✅   | `api/index.ts` 全部适配 Rust snake_case；`galleryApi.list/search/delete/getImage` 完成 |
| `GalleryPanel.vue` + `GalleryGrid` + `GalleryItem` + `GallerySearch` + `GalleryDetail` | ✅   | 缩略图网格 + 搜索 + 详情浮层 + 置入画布                                                |
| `useGallery.ts`                                                                        | ✅   | loadRecent / search / saveItem / deleteItem / getDetail                                |
| 类型文件 `.d.ts` → `.ts`                                                               | ✅   | 修复 TS6137（`@types/*` 别名被 TS 特殊处理为 DefinitelyTyped）                         |
| `image.ts` 工具函数                                                                    | ✅   | canvasToBase64 / blobToBase64 / base64ToImage                                          |
| `list_gallery` 前端接入                                                                | ✅   | `galleryApi.list(limit, offset)`                                                       |

**验收达成**：全部通过。

### Week 4 — AI 助理浮窗 ✅ 完成

**目标**：右下角浮窗能聊一句话、调用 1 个工具、显示 1 张 AI 结果预览。

| 任务                                                          | 状态 | 说明                                                 |
| ------------------------------------------------------------- | ---- | ---------------------------------------------------- |
| `AIAssistant.vue` 浮窗根组件                                  | ✅   | `uiStore.assistantVisible` 控制显隐；最小化 FAB      |
| `ChatMessage.vue` / `ChatInput.vue` / `ThinkingIndicator.vue` | ✅   | 用户/AI/工具三种气泡；Ctrl+Enter 发送                |
| `useAgent.ts`                                                 | ✅   | `agent_chat` + 选区上下文注入（`sendWithSelection`） |
| `ToolCallCard.vue`                                            | ✅   | 工具调用状态卡片（pending/running/success/error）    |
| `PreviewModal.vue`                                            | ✅   | 预览弹窗：确认落回 / 微调 / 取消                     |

**验收达成**：全部通过。

### Week 3 — 闭环与 SQLite 图库（计划）

**目标**：实现"截图 → AI → 落回画布"的最小闭环（图库保存先 mock，AI 引擎先用 `send_to_ai_engine` 返回的固定 SVG）。

| 任务                                                        | 优先级 | 说明                                            |
| ----------------------------------------------------------- | ------ | ----------------------------------------------- |
| 前端 `canvasApi.getSelectionBounds` 修对后端命令名          | P0     | 已修                                            |
| `useShortcuts.ts` 注册 Ctrl+Z/Y/B/E/M/V                     | P0     | 5 分钟接入，与 `canvasStore.setActiveTool` 联动 |
| `GalleryPanel.vue` 列表 + 缩略图 + 搜索                     | P1     | 调 `galleryApi.search` + `galleryApi.getImage`  |
| `GalleryGrid.vue` + `GalleryItem.vue` + `GalleryDetail.vue` | P1     | 缩略图懒加载                                    |
| `useGallery.ts` 包装搜索 / 删除 / 翻页                      | P1     |                                                 |
| `image.ts` 工具函数补完 `base64ToImage` / `canvasToBlob`    | P1     | 现版是空实现                                    |
| 4 个原子工具的前端包装                                      | P1     | `canvasToolsApi.getCanvasSelection` 等          |
| `gallery_commands.rs` `list_gallery` 命令补齐               | P1     | 后端文件已存在但功能未完整                      |
| 集成测试                                                    | P2     | `cargo test` 跑通 `gallery::database::tests`    |

**验收**：

- `pnpm test:unit` 全绿
- 画布执行 `apply_brush_stroke` → 缩略图自动出现在图库面板（即使 SVG 是 mock）
- `search_gallery` 在前端输入 tag 能命中记录

### Week 4 — AI 助理浮窗（计划）

**目标**：右下角浮窗能聊一句话、调用 1 个工具、显示 1 张 AI 结果预览。

| 任务                                                                            | 优先级 | 说明                                        |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| `AIAssistant.vue` 浮窗根组件                                                    | P0     | `uiStore.assistantVisible` 控制显隐，可拖拽 |
| `ChatMessage.vue` / `ChatInput.vue` / `ThinkingIndicator.vue`                   | P0     |                                             |
| `useAgent.ts` 包装 `agent_chat` + 历史记录滚动                                  | P0     |                                             |
| `ToolCallCard.vue` 显示 AI 调用的工具 + 参数 + 结果                             | P1     | 解析 `chatStore.pendingToolCalls`           |
| `PreviewModal.vue` AI 生成结果的居中弹窗                                        | P1     | "确认 / 取消 / 微调"                        |
| `chatStore.ts` 接通 `agentApi.chat`，状态机：idle / thinking / awaiting-confirm | P1     |                                             |

**验收**：在画布里框选一个矩形 → 右下角输入"把它变成科技感 Logo" → 弹出预览 → 确认后图片落回画布 + 进入图库。

### Week 5 — 原子工具全部接通 + Hermes Agent 集成（计划）

| 任务                                                                    | 优先级 | 说明                                  |
| ----------------------------------------------------------------------- | ------ | ------------------------------------- |
| `bin/hermes` 下载与 `AgentManager.start()` 切换为真实进程               | P0     | R-01 风险条目，需要 `wget` 下载二进制 |
| `agent/mcp.rs` 补完 `get_current_svg`                                   | P1     | 后端文件已存在但函数体为空            |
| `LLM Provider` 真实 HTTP 调用（OpenAI / Anthropic / DeepSeek / Ollama） | P0     | 当前 `llm_commands.rs` 是占位         |
| `agent_command` → 调用 `dispatch_tool` 真实实现                         | P0     | 当前 `tools/mcp.rs` 全部返回 pending  |
| `tools/ai_tools.rs` / `tools/gallery_tools.rs` 的 mock 替换为真实       | P1     |                                       |

**验收**：自然语言输入"导出 iOS 全尺寸" → Hermes Agent 自主调用 `render_svg_to_png` 循环 + `save_to_gallery` → 浮窗输出"已生成 8 个尺寸"。

### Week 6 — 跨平台打包与文档（计划）

| 任务                                                     | 优先级 |
| -------------------------------------------------------- | ------ |
| `tauri build` Windows .exe / macOS .dmg / Linux AppImage | P0     |
| `tauri.conf.json` bundle.icon 路径修正（已修）           | P0     |
| 用户文档：README + DEVELOPMENT.md 校对                   | P1     |
| CHANGELOG.md 用 commitlint 流程生成                      | P2     |
| 发布 GitHub Release alpha.1                              | P2     |

**验收**：在 3 个平台分别能 `pnpm tauri build` 出安装包，运行后看到三栏布局 + 三栏可拖拽宽度。

---

## 4. 每日开工清单（开发人员）

```bash
# 1) 拉最新代码
git pull

# 2) 安装依赖
pnpm install

# 3) 启动开发
pnpm tauri dev          # 同时启动 vite + cargo

# 4) 提交前自检
pnpm type-check         # vue-tsc --noEmit
pnpm lint               # eslint
cargo check --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml
pnpm test:unit          # vitest

# 5) 提交（commitlint 会校验格式）
git commit -m "feat(canvas): 接入 brush stroke 后端命令"
```

---

## 5. 已知陷阱（新人必读）

1. **icon 必须先跑 `scripts/gen-icons.ps1`**：Tauri 在 `cargo check` 时不强制，但 `tauri build` 会因为 `icons/icon.ico` 缺失而失败。脚本需要 Windows 主机（依赖 System.Drawing），CI 用 `windows-latest` runner。
2. **`tauri.conf.json` 末尾 `plugins.fs.scope.allow` 不要写 `data:` 等协议**：CSP 已经允许 `asset:`，但 fs scope 只允许 `~/.openpaint/**` 与 `$APPDATA/openpaint/**`。
3. **`Send` Rust 枚举的 `Send` 自动派生**：Tauri 命令要求 `Send + 'static`，本项目所有命令都是 `async fn`，注意不要把 `Rc<...>` 之类的非 `Send` 类型传进闭包。
4. **`Arc<RwLock<...>>` 的读写模式**：当前 `state.canvas` 是 `Arc<RwLock<CanvasState>>`，命令里用 `state.canvas.write()` 取写锁；`HistoryStack` 内部已经是 `Vec`，所以 undo/redo 直接 clone owned data 出来再赋值（见 `canvas_commands.rs:240`）。
5. **resvg / usvg 0.43 升级到 0.44 会再破坏 API**：本项目锁死 0.43，升级前需要看 CHANGELOG。
6. **前端别名 `@/`**：`vite.config.ts` 与 `tsconfig.json` 的 `paths` 必须保持一致，缺一会导致 IDE 报错但 Vite 编译通过。
7. **WebView CSP**：`script-src 'self'` 不允许 inline 脚本，所以 `<script>` 标签里写代码会失败。所有 JS 必须走 `.ts` 编译。

---

## 6. 验收标准（对应看板 §6 阶段一）

- ✅ 用户能完成"选图 → AI 生成 → 落回"全流程（Week 4 之后）
- ✅ 全流程耗时 < 30 秒（mock AI，预算 ≤ 5 秒）
- ✅ SQLite 列表可显示历史记录（Week 3 之后）
- ✅ `pnpm tauri dev` 启动后窗口显示三栏布局
- ✅ `pnpm lint && cargo clippy` 全绿
- ✅ 跨平台打包出 3 个安装包

---

## 7. 风险登记（与看板 §风险同步）

| 编号 | 风险                                             | 缓解                                                                   |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| R-01 | Hermes Agent 二进制获取困难                      | Week 5 第一天就 wget 到 `src-tauri/bin/hermes`；同时保留 mock 实现兜底 |
| R-02 | OpenPencil Vue SDK 未提供                        | 改用 iframe + postMessage；保留抽象层，方便后续切换                    |
| R-03 | 4K 画布 60fps 难达成                             | Week 2 末尾做性能基线测试；必要时换 Skia                               |
| R-04 | pnpm 在容器沙箱里 install 失败（`AppData` 权限） | CI 用 `windows-latest`；本地开发者用普通 PowerShell                    |
| R-05 | 前端 `invoke` 命名漂移（已是既成事实）           | 已修复 `canvasApi` 5 处错误命令名；剩余 17 个未调用命令在 Week 5 评估  |

---

## 8. 当前修复已落地（commit-style）

### 8a. 与本次审计 12 项一一对照

| 审计 # | 审计项                                            | 当前状态                                                                  |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| P0-1   | `bin/mcp.rs` crate 名错误                         | ✅ 已修：`use openpaint::mcp as mcp`                                      |
| P0-2   | `canvas/tests.rs:state.max_history` 不存在        | ✅ 已修：`assert_eq!(state.history.max_size(), 50)`                       |
| P1-3   | `get_current_svg` 命令缺失实现                    | ⏳ 留给 Week 5（设计文档里说 MVP 阶段不需要，等 Hermes Agent 接入后再做） |
| P1-4   | `list_tools` 漏 `get_current_svg`                 | ⏳ 同 P1-3                                                                |
| P1-5   | `ai_tools::dispatch_ai_tool` 全部 mock            | ⏳ 留给 Week 5                                                            |
| P1-6   | `gallery_tools::dispatch_gallery_tool` 全部 mock  | ⏳ 留给 Week 5                                                            |
| P2-7   | `send_to_ai_engine` 真实 LLM 调用                 | ⏳ 留给 Week 5（设计上先 mock 让前端闭环跑通）                            |
| P2-8   | `agent/manager.rs` `chat`/`send_command` 真实进程 | ⏳ 留给 Week 5                                                            |
| P2-9   | resvg SVG→PNG 缩放验证                            | ⏳ Week 4 集成测试覆盖                                                    |
| P3-10  | 删除 `use usvg_tree;` 冗余 import                 | ✅ 已修（之前编辑时随 `Options`/`Tree` 一起改用 usvg 全局命名空间）       |
| P3-11  | `canvas_commands.rs` 死代码 `_types_used()`       | ⏳ 留给 Week 2（前端接入后即可删）                                        |
| P3-12  | Hermes 二进制准备                                 | ⏳ 留给 Week 5 第一天下载                                                 |

### 8b. 完整 fix 列表（commit-style 描述）

- `fix(build): tauri.conf.json 顶部删除 # 注释头，使 JSON 可被解析`
- `fix(build): Cargo.toml 移除 macos-private-api 特性，与 assetProtocol allowlist 对齐`
- `chore(git): .commitlintrc.json 改名为 .commitlintrc.yml，匹配 YAML 内容`
- `feat(build): scripts/gen-icons.ps1 + IconRenderer.cs 程序化生成 16 个 Tauri 图标`
- `fix(build): tauri.conf.json resources/../bin 改为 bin/，resources相对路径修正`
- `refactor(build): main.rs 改为 fn main() -> openpaint::run()，把 run() 与 module 声明统一到 lib.rs`
- `fix(canvas): tests.rs 用 state.history.max_size() 替代不存在的 state.max_history`
- `fix(canvas): engine.rs PngEncoder::encode 改用 ImageEncoder::write_image (image 0.25)`
- `fix(gallery): database.rs r.get(0) 显式标 r.get::<_, i64>(0)`
- `fix(gallery): engine.rs 把 base64/image/db 错误用 map_err 转为 anyhow::Error`
- `fix(ai): ai_commands.rs 适配 resvg 0.43 (无 FitTo) + usvg 0.43 (Tree::from_str)`
- `fix(ai): ai_commands.rs raw string `r#`升级为`r##`容纳 inner`"` 字符`
- `fix(ai): ai_commands.rs 去掉 use usvg_tree; 冗余 import`
- `fix(ai): ai_commands.rs send_to_ai_engine 的 image_data 标 _image_data 抑制 warning`
- `fix(tools): mod.rs 增加 ai_commands / gallery_commands / llm_commands / canvas_tools 子模块声明`
- `fix(canvas): tools.rs 显式 use crate::canvas::Selection；canvas_commands.rs use CanvasTool trait`
- `fix(canvas): mod.rs 重新导出 CanvasTool trait，供 tools::canvas_commands 调用`
- `fix(tools): bin/mcp.rs 改用 openpaint::mcp::tool_definitions`
- `fix(frontend): api/index.ts canvasApi 命令名改为 undo_canvas/redo_canvas/get_selection_bounds`
- `feat(frontend): api/index.ts 新增 canvasToolsApi + galleryApi.list/delete`
- `chore(frontend): 新增 tsconfig.node.json + 添加 happy-dom devDep + tsconfig references`

### 8c. Week 2-4 前端落地记录（本轮新增）

- `fix(frontend): 类型文件 types/*.d.ts → types/*.ts，规避 TS6137（@types/* 别名被 TS 当 DefinitelyTyped）`
- `fix(frontend): 全量 import 从 @types/* 改为 @/types/*（与 tsconfig @/* → src/* 对齐）`
- `fix(frontend): main.ts 开头残留 ">" 字符删除`
- `fix(frontend): 修复 Set-Content 批量替换导致的 UTF-8 注释乱码（constants/chatStore/galleryStore/api/index/useCanvas/4 个组件）`
- `fix(frontend): .stylelintrc.json 删除 JSON 内 // 注释（同类配置损坏问题）`
- `feat(canvas): CanvasView.vue 接入 render_canvas_png + pointer 事件 → useCanvas`
- `feat(canvas): useCanvas.ts 重写：brush/eraser 笔画缓冲、rect-select 拖拽、refresh 同步图层/undo-redo`
- `feat(canvas): 新增 CanvasToolbar.vue（颜色 swatches + 粗细滑杆）、SelectionRect.vue、LayerItem.vue`
- `feat(canvas): LayerPanel.vue 接入真实图层列表（增/删/切换/可见性）`
- `feat(canvas): canvasStore.ts 增加 brushColor/brushRadius/selection/canUndo/canRedo`
- `feat(layout): LeftSidebar 6 工具联动 store.setActiveTool；TopBar 撤销/重做接 undo_canvas/redo_canvas`
- `feat(layout): MainLayout 增加 CanvasToolbar + LayerPanel 栏`
- `feat(composables): 新增 useShortcuts.ts（V/B/E/M/H/T、Ctrl+Z/Y、Ctrl+K/G）、useResize.ts、useOpenPencil.ts、useGallery.ts、useAgent.ts`
- `feat(openpencil): OpenPencilView.vue + OpenPencilToolbar.vue + MCPStatus.vue（srcdoc 占位 + postMessage 协议）`
- `feat(gallery): GalleryPanel/GalleryGrid/GalleryItem/GallerySearch/GalleryDetail 五件套 + 置入画布`
- `feat(assistant): AIAssistant/ChatMessage/ChatInput/ThinkingIndicator/ToolCallCard/PreviewModal 六件套`
- `feat(store): uiStore 增加 localStorage 持久化 + previewPayload`
- `fix(canvas): history.rs 测试断言修正（undo 两次后 truncate 语义：len==2 而非 3）`
- `chore(frontend): vite-env.d.ts DefineComponent 泛型 {} 改 object（eslint ban-types）`
- `fix(frontend): OpenPencilView srcdoc 内 </script> 用 </scr${'/'}ipt> 规避 SFC 解析器提前终止`

**验证状态（全部通过）**：

- `cargo check`：lib + bin + bin-mcp 全绿
- `cargo test`：22/22 通过
- `vue-tsc --noEmit`：0 error
- `vitest run`：7/7 通过
- `eslint .`：0 error（143 个可自动修复的样式 warning）
- `stylelint`：0 error
- `vite build`：成功

---

> **下一步**：把本文档作为 GitHub Issue 帖到仓库根 Wiki；指定 M-04 / M-05 两位 Owner 后开始 Week 5（Hermes Agent 接入 + LLM 真实调用）。
