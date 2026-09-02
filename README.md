# 🎨 OpenPaint

> **你的画布，你的 AI，你的规则。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D.svg)](https://vuejs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB.svg)](https://tauri.app/)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](<>)

OpenPaint 是一个**开源、AI 原生、轻量级的设计工作台**。它将像素级图像编辑的精确性与 AI 大模型的生成能力无缝融合，让设计师和开发者通过自然语言驱动创作流程，告别在多个工具间反复切换的低效。

---

## ⚡ 30 秒上手

按"上手成本"从低到高挑一条路径，5 分钟内即可进入创作状态：

| 路径 | 适合谁 | 体验内容 | 上手成本 |
| --- | --- | --- | --- |
| 🟢 **先用模拟模式体验** | 想先看效果、还没配 Key 的普通用户 | 内置本地规则模板，能演示快捷键 / 画布 / 图标资产库；点首启引导卡第 4 个按钮"先用模拟模式"即可 | 0 分钟 |
| 🟡 **下载桌面端** | 想完整使用画布 + 本地文件系统的用户 | Windows / macOS / Linux 全平台原生安装包，本地优先 | 2 分钟 |
| 🔵 **自配 DeepSeek / 通义千问** | 想用真实 AI 生成图标的国内用户 | 注册免费 API Key → 在偏好 → AI 模型粘贴即可 | 3 分钟 |
| 🟣 **在线试用 Web 版** | 仅想快速看一眼界面的访客 | 直接进入 `/app`，但大部分画布/AI 命令为桩 | 0 分钟 |

> 不知道选哪条？**先选🟢**：模拟模式 0 配置、0 费用、0 外发，确认喜欢再决定要不要切到真实大模型。

---

## ✨ 核心特性

- 🖌️ **中央画布**：图层系统、蒙版、混合模式，流畅处理 4K+ 画布
- 🤖 **AI 副驾驶**：右下角常驻 AI 助理，通过对话自主调用工具完成设计任务
- 🎯 **AI 视觉引擎**：右窗无缝集成 OpenPencil，支持矢量编辑与 AI 图像生成
- 📚 **智能图库**：自动归档生成资产，支持标签索引与语义搜索
- 📐 **多尺寸批量导出**：一次设计，一键生成 Web/iOS/Android 全套图标
- 🔓 **模型自由**：用户自配 API Key，支持 10 家 LLM Provider（含模拟模式 + Ollama 离线）
- 💻 **开源 & 可扩展**：基于 MCP 协议的插件体系，任何人都可以扩展新工具

## 🖥️ 系统要求

| 平台        | 最低版本                                 |
| :---------- | :--------------------------------------- |
| **Windows** | Windows 10 / 11                          |
| **macOS**   | macOS 10.15 (Catalina) +                 |
| **Linux**   | Ubuntu 20.04 / Fedora 36 + (Wayland/X11) |

## 🚀 快速开始

### 方式一：下载安装包（推荐）

前往 [Releases](https://github.com/MatuX-ai/OpenPaint/releases) 下载对应平台的安装包：

- Windows: `.exe` / `.msi`
- macOS: `.dmg`
- Linux: `.AppImage` / `.deb`

### 方式二：从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/MatuX-ai/OpenPaint.git
cd openpaint

# 2. 安装依赖
pnpm install

# 3. 启动开发模式
pnpm tauri dev

# 4. 构建生产版本
pnpm tauri build
```

详细构建指南请参考 [DEVELOPMENT.md](DEVELOPMENT.md)。

---

<details>
<summary><b>⚙️ 高级：配置大模型</b></summary>

首次启动后，在 `~/.openpaint/config.yaml` 中配置你的 LLM：

```yaml
llm:
  provider: "openai"  # 可选: openai | anthropic | deepseek | ollama | qwen | zhipu | moonshot | doubao | minimax | mock
  api_key: "sk-xxx"
  base_url: "https://api.openai.com/v1"  # 可选，不填则用 provider 默认值
  model: "gpt-4o"
```

OpenPaint 不收集、不上传任何用户数据，所有 AI 调用直接由你的 API Key 发起。

**Provider 速查**（按推荐顺序）：

- **模拟模式**（mock）— 零配置、零费用、零外发，本地规则模板演示
- **DeepSeek / 通义千问 / 智谱 GLM / 月之暗面 Kimi / 豆包 / MiniMax** — 国内大模型，按 token 计费
- **OpenAI / Anthropic Claude** — 海外主流，需可访问外网
- **Ollama** — 完全离线，所有推理在本机完成

> 大多数国内用户推荐从 DeepSeek 起步：注册送额度，中文理解力强，Chat Completions 协议稳定。

</details>

---

## 🎯 典型使用场景

- **AI Logo 设计**：草绘 → 框选 → 对话指令 → AI 生成 → 微调落地
- **一键导出多尺寸图标**：一句指令，自动生成全部平台图标并归档
- **智能召回历史资产**："找一下上周那组蓝色 Logo" → 秒级检索复用
- **完全离线工作**：切到 Ollama，所有推理在本机完成

## 🧭 项目路线图

| 阶段 | 内容 | 时间 |
| --- | --- | --- |
| 🥇 MVP | 画布 + AI 闭环 + 基础图库 | 第 1-3 周 |
| 🥈 强化 | Hermes Agent 集成 + 批量导出 | 第 4-6 周 |
| 🥉 智能 | 语义搜索 + 插件系统 | 第 7-8 周 |

详见 [kanban.md](docs/kanban.md)。

## 🤝 如何贡献

我们欢迎所有形式的贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

- 🐛 **报告 Bug**：[Issues](https://github.com/MatuX-ai/OpenPaint/issues)
- 💡 **功能建议**：[Discussions](https://github.com/MatuX-ai/OpenPaint/discussions)
- 🔧 **提交代码**：Fork → PR → Review

## 📚 文档

- [项目说明书](OpenPaint%20项目说明书.md)
- [技术设计文档](OpenPaint%20技术设计文档.md)
- [前端设计说明书](OpenPaint%20前端设计说明书.md)
- [开发指南](DEVELOPMENT.md)
- [API 参考](DEVELOPMENT.md)

## 📝 开源协议

本项目采用 MIT License，允许自由使用、修改、分发，包括商业用途。

## 🙏 致谢

- [Tauri](https://tauri.app/) — 跨平台桌面框架
- [Hermes Agent](https://github.com/) — 自主 AI 智能体
- [OpenPencil](https://github.com/) — AI 原生矢量设计引擎
- [Vue 3](https://vuejs.org/) — 渐进式前端框架

⭐ 如果这个项目对你有帮助，请给一个 Star 支持我们！