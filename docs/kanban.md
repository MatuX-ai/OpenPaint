# OpenPaint 项目进度看板

> 维护人：维护者 + 各模块 Owner
> 更新节奏：每周一次（同步会议后）

## 当前阶段

**阶段一：MVP 核心闭环（W1-W3 / 第 1-3 周）**

## 阶段一 — 模块进度

| 编号 | 模块                                 | 状态   | 负责人 | 当前分支        | 阻塞项 |
| ---- | ------------------------------------ | ------ | ------ | --------------- | ------ |
| M-01 | Tauri v2 + Vue 3 工程脚手架          | 进行中 | A + F  | `feat/scaffold` | —      |
| M-02 | 跨进程 IPC 契约                      | 待启动 | A      | —               | —      |
| M-07 | 配置管理（~/.openpaint/config.yaml） | 进行中 | A      | `feat/config`   | —      |

## 周计划

### W1 — 工程脚手架与 IPC 契约

**本周目标**

- 完成 src-tauri/ Rust 工程初始化（Cargo.toml、tauri.conf.json、main.rs 命令注册占位）。
- 完成 src-web/ Vue 3 + Vite + TypeScript 工程（vite.config.ts、main.ts、App.vue 三栏骨架）。
- ESLint + Prettier + Stylelint + cargo clippy + cargo fmt 在 CI 跑通。
- `pnpm tauri dev` 可启动空白窗口，三栏（LeftSidebar + Canvas + RightSidebar）布局可见。

**任务清单**

- [x] 顶层 .gitignore、package.json、pnpm-workspace.yaml
- [x] .github CI workflow + Issue/PR 模板
- [x] docs/kanban.md
- [x] LICENSE（MIT）
- [ ] src-tauri/ Cargo.toml、tauri.conf.json、main.rs 骨架
- [ ] src-web/ Vue 3 工程骨架（vite.config.ts、tsconfig.json、main.ts、App.vue）
- [ ] 三栏布局组件（MainLayout、LeftSidebar、RightSidebar、TopBar、StatusBar）
- [ ] 共享类型与 Pinia store 占位
- [ ] CI 跑通

**验收标准**

- `pnpm tauri dev` 启动后窗口显示三栏布局。
- `pnpm lint && cargo clippy` 全绿。

### W2 — 中央画布与 OpenPencil 嵌入（计划）

**本周目标**

- 画布引擎 M-03：`Layer` / `CanvasState` / `Selection` 数据结构 + 基础渲染。
- 工具：画笔、橡皮、矩形选区、移动（MVP 子集）。
- Undo/Redo 50 步。
- OpenPencil 嵌入占位（M-04）。

**任务清单**

- [ ] Rust 画布引擎实现（image-rs 像素缓冲）
- [ ] 前端 CanvasView.vue + CanvasToolbar.vue + LayerPanel.vue
- [ ] Undo/Redo 状态机
- [ ] OpenPencil 嵌入 iframe + postMessage 通信

**验收标准**

- 画布上绘制矩形 + 选区 + Undo 全部生效。
- OpenPencil 右窗可加载并显示 UI。

### W3 — 闭环 + 基础图库（计划）

**本周目标**

- 截图→传图→AI 引擎→预览→落回闭环（M-05）。
- 4 个画布原子工具（M-08）。
- SQLite 图库 M-06。
- 配置模块 M-07。

**任务清单**

- [ ] 闭环链路打通（先用 mock AI 服务）
- [ ] 原子工具实现 + 注册
- [ ] SQLite 图库 CRUD + 缩略图
- [ ] 配置加载与首次启动初始化

**验收标准**

- 项目说明书 §6 阶段一验证标准达成（"选图→AI→落回 < 30s"）。
- SQLite 列表可显示历史记录。

### W7 — UX & 入门体验（来自 `docs/ux-onboarding-requirements.md`）

**本周目标**

- 把"首次启动到画一笔并保存"的路径压到 ≤60s。
- 补齐文件 / 编辑 / 视图 / 帮助菜单 + 快捷键 N/O/S/E/0/F11/?。
- 解决 [验收缺陷与建议.md §1 R-A01（组件测试）](./验收缺陷与建议.md) 与 R-T04（可访问性）。

**任务清单**

- [ ] ONB-CORE-01：`useDocumentState` / `useOnboarding` / `useToast` 三个 composable + Vitest
- [ ] ONB-CORE-02：Toast 组件 + AppMenuBar 组件骨架
- [ ] ONB-CORE-03：File / Edit / View / Help 四个菜单下拉（含键盘快捷）
- [ ] ONB-CORE-04：TopBar 新增 💾 按钮 + 标题栏未保存指示器
- [ ] ONB-UX-01：OnboardingCard + NewCanvasDialog
- [ ] ONB-A11Y-01：aria-label 批量补齐 + focus-visible 样式

**验收标准**

- ONB-101 ~ ONB-105、ONB-401 ~ ONB-405、ONB-501 ~ ONB-505 测试通过。
- 首次启动录屏：从 0 到画一笔并 Ctrl+S 成功 ≤60s。
- ESLint 警告从 211 条降至 ≤120 条（去掉菜单相关硬编码）。

### W8 — 文件 IO 与导出（来自 `docs/ux-onboarding-requirements.md`）

**本周目标**

- 打通 US-3 打开本地图片 / US-5 另存为 / US-9 批量导出 / US-6 未保存拦截。
- 补完 README 主打的"一键多尺寸导出"用户路径。

**任务清单**

- [x] ONB-IO-01：Tauri `dialog.open` + `paste_image_to_layer`
- [x] ONB-IO-02：`Ctrl+S` 保存到图库按钮 + galleryApi.save
- [x] ONB-IO-03：`Ctrl+Shift+S` 另存为本地 PNG / JPG / WebP（Rust `render_canvas_image` 真转码）
- [x] ONB-IO-04：批量导出 iOS / Android / Web 预设尺寸（长边缩放）
- [x] ONB-IO-05：CanvasView 拖拽导入（PNG/JPG/WebP/SVG，>50MB 拒绝）
- [x] ONB-IO-06：edit.copy / edit.paste 接 OS 剪贴板（clipboard-manager）
- [x] ONB-CLOSE-01：`getCurrentWindow().onCloseRequested` 拦截 + UnsavedConfirmDialog
- [x] ONB-ONB-01：AI 助理空状态引导 + "打开设置" 高亮
- [x] ONB-HELP-01：KeyboardCheatsheet Modal（? 触发）
- [x] ONB-TEST-01：引入 @vue/test-utils + happy-dom + 组件级 ONB-2xx/3xx/4xx/5xx 测试

**验收标准**

- ONB-201 ~ ONB-308 测试通过。✅（前端 178/178 + Rust 38/38）
- 一段录屏覆盖：批量导出 iOS 全套尺寸并自动存入图库。✅（手动验证路径接通）

### W8 后端补充（Rust）

- 新增 IPC `render_canvas_image({ format, quality, targetLongEdge })` → 返回 `{ format, mime, bytesBase64, width, height, byteSize }`
- 引擎 `render_image` 支持 png / jpg / webp；JPG 自动 flatten alpha 到白底；quality 1-100 clamp；webp 当前 lossless（lossy 等 image-webp feature 后续）
- 引擎 `resize_to_long_edge` 等比缩放
- 7 个新增单元测试（png / jpg / webp 签名 / 不支持格式 / quality clamp / resize no-op / resize 缩放）

### W8 前端补充

- `useFileActions.importFromDataUrl / importFromFiles` 公共 composable
- `useFileActions.exportImage / batchExport` 真实接 `renderCanvasImage`
- `AppView.edit.copy/paste` 接 `@tauri-apps/plugin-clipboard-manager` 真实 OS 剪贴板
- `@utils/imageConvert.rgbaToPngBase64` 把 RGBA → PNG base64
- 新增 9 个组件测试文件：AppButton / AppModal / ToastContainer / MenuDropdown / AppMenuBar / OnboardingCard / NewCanvasDialog / ExportDialog / BatchExportDialog / UnsavedConfirmDialog / KeyboardCheatsheet
- 新增 useFileActions 行为测试（9 用例：mock canvasApi / galleryApi / isTauri 验证编排）
- 新增 imageConvert 工具函数（`rgbaToPngBase64`）
- vitest 配置 `include` 扩展到 `.vue`

## 风险登记

| 编号 | 风险                        | 影响阶段 | 缓解措施                        | 状态   |
| ---- | --------------------------- | -------- | ------------------------------- | ------ |
| R-01 | Hermes Agent 二进制获取困难 | 阶段二   | W1 提前下载至 src-tauri/bin/    | 待跟进 |
| R-02 | OpenPencil Vue SDK 未提供   | 阶段一   | 评估后降级 iframe + postMessage | 待评估 |
| R-03 | 4K 画布 60fps 难达成        | 阶段一   | W2 做性能基线，必要时升级 Skia  | 待观察 |
| R-04 | UX 入门体验缺失导致弃用     | W7-W8    | 落地 [`docs/ux-onboarding-requirements.md`](./ux-onboarding-requirements.md) | 已规划 |

## 会议节奏

- 周会：每周一 10:00（线上）
- Code Review：每个 PR 必走，至少 1 名维护者通过
- 阶段 Demo：阶段结束前一周五（录屏 + 文档）

## 变更日志

- v0.1.0 — 2026-08-18 — 初始化看板（W1 进行中）
- v0.2.0 — 2026-08-28 — 新增 W7 / W8 计划（UX 与入门体验需求文档落地）
