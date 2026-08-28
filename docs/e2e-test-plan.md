# OpenPaint · E2E 测试计划（R-A04 / W9+）

**版本**：v0.1.0（草案）｜**状态**：待 W9+ 落地｜**作者**：前端 + 测试

> 对应 [验收缺陷与建议.md](./验收缺陷与建议.md) §R-A04
> （"E2E（Playwright / WebDriver）：R-A04，W8+ 计划"）。
> 本期仅产出测试场景与最小工具链，不实际接入 devDep（需 W9+ 与 tauri-driver 共评审）。

---

## 0. 目标

把 [ux-onboarding-requirements.md](./ux-onboarding-requirements.md) 中 7 个关键用户故事
（US-1 首次启动引导、US-2 新建画布向导、US-3 打开本地图片、US-6 标题栏已修改标识、
US-8 AI 助理未配置引导、US-10 快捷键补齐、US-11 可访问性）转化为可重复执行的端到端
用例，避免每次发版回归主路径。

## 1. 范围与非目标

### 1.1 本期（计划）范围

- 列出 5 个**最小 E2E 场景**（见 §3）。
- 选定工具栈（见 §2），记录选型理由。
- 约定测试 fixture / 数据隔离方式。
- 给出 spec 文件位置与运行命令（占位 `pnpm e2e`，待 W9+ 实现）。

### 1.2 非目标

- 不实际安装 `@playwright/test` 或 `tauri-driver`（避免锁版本 + 拉 chromium）。
- 不写测试脚本本身（spec 实现推迟到 W9+ 与 `tauri-driver` 评审同步）。
- 不替代现有 `vitest` 单元 / Vue Test Utils 组件级测试（[验收缺陷与建议.md](./验收缺陷与建议.md) R-A01）。

## 2. 工具栈候选

| 候选 | 优点 | 缺点 | 决策 |
| --- | --- | --- | --- |
| **Playwright（推荐）** | 已被 OpenPaint 的 `vitest` 生态间接依赖；与 Vite HMR 兼容；mock 简单；可单独跑 web preview 路径 | 桌面端截图/窗口控制需 `tauri-driver`，需额外接入 | ✅ 主选 |
| WebdriverIO + `tauri-driver` | Tauri 官方推荐，可在真实 webview 中跑 | 需要 Rust 端开 `tauri-driver` 子命令；冷启动 ≈ 4-6s | 🔁 作为后续桌面端覆盖 |
| Cypress | DX 好 | Tauri 支持差；浏览器内嵌 ifrane 与 IPC 难以模拟 | ❌ 不选 |

**W9+ 步骤**：先在 web preview 跑通 5 个最小场景；待 `tauri-driver` 评审通过后，扩展 2 个桌面端专项（系统剪贴板、文件对话框）。

## 3. 5 个最小 E2E 场景

> 用例 ID 前缀 `E2E-*`，命名空间与现有 `TC-*`（[测试用例集.md](./测试用例集.md)）、`ONB-*` 并列。

| ID | 场景 | 关键步骤 | 验收点 |
| --- | --- | --- | --- |
| **E2E-001** | 首次启动显示引导卡 | 删除 `localStorage('openpaint:ui-state')` 后刷新 → 等待 `[data-testid="onboarding-card"]` 可见 | 引导卡三选项按钮均可点击 |
| **E2E-002** | 新建画布向导 | 点 "新建画布" → 选 "Web 横幅 1920×1080" 预设 → 确认 | `canvasApi.getCanvasSummary` 解析返回 `{ width: 1920, height: 1080 }` |
| **E2E-003** | 快捷键 cheatsheet | 全局按 `?` → 出现速查面板 | 面板含 Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Z / Ctrl+C / Ctrl+V 至少 6 行 |
| **E2E-004** | AI 助理未配置引导 + 高亮 | 清空 LLM 配置后打开 AI 浮窗 → 点 "打开设置" CTA | 设置弹窗 `.settings-modal__section.is-llm-highlight` 8 秒内可观察脉冲动画 |
| **E2E-005** | 主工具条五大组可见 | 切到选择工具 → 截屏工具条 | 截图应包含：撤销、重做、新建图层、缩放组（4 按钮 + 100%）、工具名 5 个组；非画笔工具下颜色/粗细不应可见 |

> 备注：E2E-001/002/005 直接对应 UX-A09（信息密度）/ONB-§1（首次引导）/ONB-§2（新建向导）。
> E2E-003 覆盖 US-10；E2E-004 覆盖 UX-A07 与 ONB-§US-8。

## 4. 数据隔离

每个 spec：

1. 启动前调用 `await page.context().clearCookies()`、`evaluate(() => localStorage.clear())`。
2. 构造 1×1 PNG fixture（位于 `e2e/fixtures/sample.png`，50×50 紫底白点）满足"导入本地图片"相关场景。
3. 时间不依赖墙钟；任何"8s 高亮"动画用 `waitForFunction` 监听 CSS 变量。
4. 不联网；网络层全部 stub（`page.route('**/api/**', route => route.abort())`）。

## 5. 运行命令（占位）

```jsonc
// package.json scripts（占位，待 W9+ 实际接入）
{
  "e2e": "playwright test",
  "e2e:headed": "playwright test --headed",
  "e2e:ui": "playwright test --ui",
  "e2e:debug": "PWDEBUG=1 playwright test"
}
```

CI 接入（TBD）：`tauri-driver` 子命令已运行时才触发桌面端用例；其余跑 web preview 用例。

## 6. 关联

- 测试用例集：[测试用例集.md](./测试用例集.md) — 单元 / 组件 / 集成
- 体验需求：[ux-onboarding-requirements.md](./ux-onboarding-requirements.md) — 7 个 US
- 缺陷登记：[验收缺陷与建议.md](./验收缺陷与建议.md) §R-A04
