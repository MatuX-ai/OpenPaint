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

## 风险登记

| 编号 | 风险                        | 影响阶段 | 缓解措施                        | 状态   |
| ---- | --------------------------- | -------- | ------------------------------- | ------ |
| R-01 | Hermes Agent 二进制获取困难 | 阶段二   | W1 提前下载至 src-tauri/bin/    | 待跟进 |
| R-02 | OpenPencil Vue SDK 未提供   | 阶段一   | 评估后降级 iframe + postMessage | 待评估 |
| R-03 | 4K 画布 60fps 难达成        | 阶段一   | W2 做性能基线，必要时升级 Skia  | 待观察 |

## 会议节奏

- 周会：每周一 10:00（线上）
- Code Review：每个 PR 必走，至少 1 名维护者通过
- 阶段 Demo：阶段结束前一周五（录屏 + 文档）

## 变更日志

- v0.1.0 — 2026-08-18 — 初始化看板（W1 进行中）
