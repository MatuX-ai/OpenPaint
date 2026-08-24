# 📄 DEVELOPMENT.md

````markdown
# 🔧 开发环境搭建指南

本文档帮助开发者从零搭建 OpenPaint 的开发环境。

## 📋 前置条件

### 通用要求

| 工具                               | 版本要求         | 说明             |
| :--------------------------------- | :--------------- | :--------------- |
| [Rust](https://www.rust-lang.org/) | 1.70+            | 后端核心语言     |
| [Node.js](https://nodejs.org/)     | 18.x 或 20.x LTS | 前端构建环境     |
| [pnpm](https://pnpm.io/)           | 8.x+             | 包管理器（必须） |
| [Git](https://git-scm.com/)        | 2.x+             | 版本控制         |

### 平台特定依赖

#### Windows

```bash
# 安装 Microsoft Visual Studio C++ 生成工具
# 下载地址：https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 确保勾选 "Windows 10/11 SDK" 和 "C++ CMake 工具"
macOS
bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 安装 Homebrew（如未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装依赖
brew install cmake
Linux (Ubuntu / Debian)
bash
# 安装系统依赖
sudo apt update
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    cmake
Linux (Fedora)
bash
sudo dnf groupinstall "C Development Tools and Libraries"
sudo dnf install -y \
    webkit2gtk4.1-devel \
    openssl-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    cmake
🚀 快速开始
1. 克隆仓库
bash
git clone https://github.com/MatuX-ai/OpenPaint.git
cd openpaint
2. 安装前端依赖
bash
pnpm install
3. 安装 Tauri CLI（全局）
bash
cargo install tauri-cli --version "^2.0.0"
4. 启动开发模式
bash
# 方式一：同时启动前端 HMR + Tauri 后端
pnpm tauri dev

# 方式二：分别启动（高级调试用）
pnpm dev:web   # 仅 Vite 开发服务器（http://localhost:5173）
pnpm tauri dev # 仅 Tauri 后端（连接已有前端）
开发模式具有：

✅ 前端热重载（HMR）

✅ 后端代码变更自动重编译

✅ 开发者工具快捷键：Ctrl+Shift+I (Windows/Linux) / Cmd+Option+I (macOS)

5. 构建生产版本
bash
pnpm tauri build
构建产物位于 src-tauri/target/release/bundle/ 目录下。

📁 目录速览
text
openpaint/
├── src-tauri/          # Rust 后端（核心逻辑、工具、图库、Agent）
├── src-web/            # Vue 3 前端（UI、画布、AI 助理、面板）
├── assets/             # 静态资源（默认配置、图标）
├── docs/               # 文档
├── package.json        # 前端依赖配置
├── pnpm-lock.yaml      # 锁定依赖版本
├── Cargo.toml          # Rust 后端依赖配置
└── tauri.conf.json     # Tauri 打包配置
🧪 运行测试
bash
# 后端单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 前端类型检查
pnpm type-check

# 前端代码检查
pnpm lint
🔍 调试技巧
调试 Rust 后端
在 VS Code 中安装 rust-analyzer 和 CodeLLDB 插件，然后在 src-tauri/src/main.rs 中设置断点。

调试 Vue 前端
使用 Vue Devtools 浏览器扩展（开发模式下自动启用）

在 DevTools 的 Console 中执行 $store 查看 Pinia 状态

日志查看
bash
# 应用日志位置
~/.openpaint/logs/app.log

# 实时查看日志（开发模式）
tail -f ~/.openpaint/logs/app.log
常见问题排查
1. tauri 命令找不到
bash
cargo install tauri-cli --version "^2.0.0"
2. WebView 加载空白
检查 https://localhost:5173 是否可访问

尝试清空浏览器缓存：pnpm tauri dev -- --clear-cache

3. 编译报错 linker not found (Windows)
确保安装了 Visual Studio C++ 生成工具，并勾选“Windows SDK”。

4. Linux 报错 libwebkit2gtk-4.0.so
安装 WebKitGTK 开发包（见上方 Linux 依赖）。

5. Hermes Agent 启动失败
Hermes Agent 需要单独下载二进制文件放入 src-tauri/bin/ 目录，或通过 cargo install hermes-agent 安装。

bash
# 临时方案：使用 CLI 二进制
wget https://github.com/your-org/hermes-agent/releases/latest/download/hermes-linux-x64
chmod +x hermes-linux-x64
mv hermes-linux-x64 src-tauri/bin/hermes
📝 环境变量
变量	说明	默认值
OPENPAINT_CONFIG	配置文件路径	~/.openpaint/config.yaml
OPENPAINT_GALLERY	图库存储路径	~/.openpaint/gallery
RUST_BACKTRACE	启用详细错误堆栈	0
🔄 更新依赖
bash
# 更新前端依赖
pnpm update

# 更新 Rust 依赖
cargo update --manifest-path src-tauri/Cargo.toml
📖 相关资源
Tauri 官方文档

Vue 3 官方文档

Rust 官方书籍

Hermes Agent 文档

遇到问题？请在 Issues 中提问，或加入 Discord 社区讨论！

text

---

## ✅ 使用建议

1. 如果有官方文档地址，一并更新 `DEVELOPMENT.md` 中的相关资源链接。

2. **调整细节**：
   - 根据需要调整 `README.md` 中的状态徽章（如 `status-alpha`）
   - 根据实际测试环境补充 `DEVELOPMENT.md` 中的常见问题

3. **后续补全**：
   - `CODE_OF_CONDUCT.md`：可直接复制 [Contributor Covenant 官方模板](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
   - `LICENSE`：从 [MIT License 官网](https://opensource.org/licenses/MIT) 复制全文
```
````
