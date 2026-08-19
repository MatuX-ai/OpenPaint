# 🤝 贡献指南

感谢你对 OpenPaint 的关注！我们欢迎所有形式的贡献——无论是提交 Bug 报告、提出新功能建议，还是提交代码。

## 📋 行为准则

本项目遵循 [Contributor Covenant 行为准则](./CODE_OF_CONDUCT.md)。参与即代表你同意遵守该准则。

## 🐛 报告 Bug

使用 GitHub Issue 提交 Bug 时，请确保：

1. 使用 **Bug Report 模板**（如无模板，请自行包含以下信息）
2. 提供清晰的**复现步骤**
3. 说明**预期行为** vs **实际行为**
4. 附上**日志文件**（位于 `~/.openpaint/logs/`）
5. 注明**操作系统版本**和 **OpenPaint 版本**

## 💡 功能建议

1. 先在 [Issues](https://github.com/your-org/openpaint/issues) 中搜索，避免重复
2. 使用 **Feature Request 模板**，清晰描述：
   - 这个功能解决什么问题
   - 你期望的交互方式
   - 是否愿意参与实现

## 🔧 代码贡献流程

### 1. 环境准备

请参考 [DEVELOPMENT.md](./DEVELOPMENT.md) 搭建开发环境。

### 2. 寻找任务

- 查看 **Good First Issue** 标签适合新手
- 查看 **Help Wanted** 标签适合有经验的开发者
- 在 Issue 下留言表明你想认领

### 3. 分支策略

```bash
# 从 main 分支切出新分支
git checkout -b feat/your-feature-name   # 新功能
git checkout -b fix/your-bug-name        # Bug 修复
分支命名规范：

feat/* — 新功能

fix/* — Bug 修复

docs/* — 文档更新

refactor/* — 代码重构

perf/* — 性能优化

4. 开发规范
前端 (Vue 3 + TypeScript)
组件文件使用 PascalCase，如 CanvasView.vue

组合式函数使用 camelCase，以 use 开头，如 useCanvas

样式使用 SCSS + CSS 变量，禁止硬编码颜色

运行 pnpm lint 检查代码风格

后端 (Rust)
遵循 Rust 官方风格，运行 cargo fmt 自动格式化

所有 unsafe 代码必须有详细的 // SAFETY: 注释

新增命令必须在 main.rs 中注册

运行 cargo clippy 检查常见错误

提交信息规范
采用 Conventional Commits：

text
<type>(<scope>): <subject>

<body>

<footer>
示例：

text
feat(canvas): 添加魔棒选区工具

实现了基于颜色相似度的选区算法，支持容差调节。

Closes #123
Type 类型：feat | fix | docs | style | refactor | perf | test | chore

5. 测试要求
核心模块（画布引擎、图库 CRUD）需附带单元测试

AI 场景流程需附带人工测试用例（在 PR 中描述测试结果）

6. 提交 PR
推送分支到远程仓库

创建 Pull Request，使用 PR 模板

在 PR 中：

描述变更内容

关联相关的 Issue（如 Closes #123）

附上测试截图或录屏（如涉及 UI 变更）

至少一名维护者 Review 通过后合并

🧩 扩展开发指南
新增原子工具
在 src-tauri/src/tools/ 下实现工具函数

在 main.rs 中使用 #[command] 宏注册

在 src-web/api/ 中添加对应的前端调用封装

在 MCP 配置中注册工具描述（供 Hermes Agent 发现）

新增 AI 场景 Prompt
不需要写代码！只需在 assets/scenarios/ 目录下添加 YAML 文件：

yaml
name: "导出 iOS 图标"
description: "将当前选中的 Logo 导出为 iOS 全部尺寸"
tools: ["render_svg_to_png", "save_to_gallery"]
sizes: [20, 29, 40, 60, 76, 83.5, 1024]
AI 助理会自动加载并理解这些场景。

📢 社区交流
GitHub Discussions：技术交流与创意碰撞

Discord 频道：实时沟通（邀请链接）

🙏 贡献者致谢
所有贡献者将出现在 CONTRIBUTORS 列表中。重大贡献者将被邀请加入核心团队。

再次感谢你的贡献！🎨
