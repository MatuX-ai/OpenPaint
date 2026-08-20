# Hermes Agent 二进制占位目录

> 用于存放 Hermes Agent 可执行文件，详见 `DEVELOPMENT.md` §常见问题 5。

## 一键安装（推荐）

```powershell
# 默认安装到 ~/.openpaint/bin/hermes(.exe)
pwsh -File scripts/install-hermes.ps1

# 安装到 src-tauri/bin/hermes
pwsh -File scripts/install-hermes.ps1 -InstallLocal

# 指定版本
pwsh -File scripts/install-hermes.ps1 -Version v0.3.1

# 从自定义 URL 下载
pwsh -File scripts/install-hermes.ps1 -Url "https://example.com/hermes.exe"

# 强制覆盖现有二进制
pwsh -File scripts/install-hermes.ps1 -Force
```

## 手动下载

```bash
# Linux / macOS
wget https://github.com/your-org/hermes-agent/releases/latest/download/hermes-linux-x64
chmod +x hermes-linux-x64
mv hermes-linux-x64 ~/.openpaint/bin/hermes
```

```powershell
# Windows（PowerShell）
Invoke-WebRequest -Uri "https://github.com/your-org/hermes-agent/releases/latest/download/hermes-windows-x64.exe" -OutFile "$env:USERPROFILE\.openpaint\bin\hermes.exe"
```

## 命名约定

- Linux / macOS：`hermes`
- Windows：`hermes.exe`

> 二进制文件本身已在 `.gitignore` 中忽略，不会进入版本控制。

## 缺失时的行为

应用启动时会检测 `~/.openpaint/bin/hermes` 与 `src-tauri/bin/hermes`，若均缺失则在控制台输出告警，AI 助理相关功能降级为 mock。

AgentManager 检测顺序：

1. `~/.openpaint/bin/hermes`（或 `hermes.exe`）
2. `src-tauri/bin/hermes`（或 `hermes.exe`）

## 进程通信协议

Hermes Agent 启动后通过 stdio JSON-RPC 2.0 与 OpenPaint 通信：

- 帧分隔：`\n`（NDJSON）
- 请求：`{"jsonrpc":"2.0","id":N,"method":"...","params":{...}}\n`
- 响应：`{"jsonrpc":"2.0","id":N,"result":{...}}` 或 `{"error":{...}}`
- 通知（无 id）：OpenPaint 当前仅打印日志

### 已用方法

| 方法              | 参数                                       | 用途         |
| ----------------- | ------------------------------------------ | ------------ |
| `agent.chat`      | `{ "message": "..." }`                     | 自然语言对话 |
| `ai.generate_svg` | `{ "image_data": "...", "prompt": "..." }` | LLM 生成 SVG |

### 启动参数

```
hermes agent
```

`agent` 子命令告诉二进制进入 JSON-RPC 模式（而不是 CLI 交互模式）。
