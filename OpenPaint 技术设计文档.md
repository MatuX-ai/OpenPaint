# OpenPaint 技术设计文档

**版本**：v1.0.0 | **状态**：规划中 | **最后更新**：2026-08-18

---

## 1. 文档概述

本文档为 OpenPaint 项目的详细技术设计，涵盖系统架构、模块划分、接口定义、数据模型及部署方案。阅读对象为项目核心开发者与贡献者。

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OpenPaint 桌面应用                               │
│                       (Tauri v2 — Rust 后端 + WebView 前端)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   中央画布模块   │  │   AI 助理模块   │  │   OpenPencil 嵌入模块       │ │
│  │  (Canvas Engine) │  │ (Hermes Agent)  │  │  (WebView Container)        │ │
│  │                  │  │                 │  │                             │ │
│  │ · 图层系统       │  │ · 对话交互      │  │ · 矢量编辑                  │ │
│  │ · 选区/工具      │  │ · 自主决策      │  │ · AI 生成                   │ │
│  │ · 历史记录       │  │ · 工具调度      │  │ · SVG 导出                  │ │
│  └────────┬────────┘  └───────┬─────────┘  └──────────────┬──────────────┘ │
│           │                   │                            │                │
│           └───────────────────┼────────────────────────────┘                │
│                               │                                             │
│                    ┌──────────▼──────────┐                                  │
│                    │   MCP 协议总线       │                                  │
│                    │  (工具注册与调用)    │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                         │
│           │                   │                   │                         │
│  ┌────────▼────────┐ ┌───────▼───────┐ ┌─────────▼─────────┐               │
│  │   图库管理模块   │ │  原子工具集    │ │   配置管理模块     │               │
│  │  (Gallery)      │ │  (Tools)       │ │  (Config)         │               │
│  │                 │ │               │ │                   │               │
│  │ · SQLite 索引   │ │ · 画布交互     │ │ · 大模型配置      │               │
│  │ · 缩略图生成    │ │ · AI 生成      │ │ · 预设尺寸模板    │               │
│  │ · 向量搜索(未来)│ │ · 图库管理     │ │ · 用户偏好        │               │
│  └─────────────────┘ └───────────────┘ └───────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈明细

| 层级            | 技术选型                  | 版本   | 用途                             |
| :-------------- | :------------------------ | :----- | :------------------------------- |
| **桌面框架**    | Tauri                     | v2     | 跨平台打包、系统调用、进程管理   |
| **前端框架**    | Vue 3 + TypeScript        | 3.x    | UI 渲染、状态管理、组件化开发    |
| **画布渲染**    | OpenPencil (统一中央画布)    | 0.14+  | 唯一主画布，矢量 / 位图混合编辑、AI 直入         |
| **AI 智能体**   | Hermes Agent              | v0.6+  | 意图理解、自主决策、MCP 工具调度 |
| **AI 生成引擎** | OpenPencil 编辑器内置       | 0.14+  | 矢量节点 / AI 图像生成（不再独立右窗）  |
| **本地数据库**  | SQLite (rusqlite)         | 0.31+  | 图库元数据、历史记录持久化       |
| **向量数据库**  | LanceDB                   | 0.23+  | 语义搜索（渐进式集成）           |
| **SVG 渲染**    | resvg                     | 0.48+  | SVG 到 PNG 的无损缩放渲染（资产库渐变 / 图标预览）        |
| **位图栅格层**  | Canvas 2D (兼容层)        | -      | 画笔 / 橡皮 / 旋转 / 混合模式（与 OpenPencil 位图层并存）  |
| **图像处理**    | image-rs                  | 0.25+  | 缩略图生成、格式转换             |
| **通信协议**    | MCP (JSON-RPC over stdio) | -      | 工具注册与调用                   |

---

## 3. 模块详细设计

### 3.1 中央画布模块 (Canvas Engine)

#### 3.1.1 职责

- 管理图层栈（创建、删除、排序、合并）
- 提供基础绘图工具（画笔、橡皮、选区、变形）
- 维护 Undo/Redo 历史记录
- 响应原子工具的调用（截图选区、粘贴图片）

#### 3.1.2 核心数据结构

```rust
// src-tauri/src/canvas/mod.rs

pub struct Layer {
    pub id: Uuid,
    pub name: String,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub visible: bool,
    pub locked: bool,
    pub image_data: Vec<u8>,  // RGBA 像素数据
    pub width: u32,
    pub height: u32,
    pub offset_x: i32,
    pub offset_y: i32,
}

pub struct CanvasState {
    pub layers: Vec<Layer>,
    pub active_layer_id: Uuid,
    pub width: u32,
    pub height: u32,
    pub history: Vec<HistorySnapshot>,
    pub history_index: usize,
    pub max_history: usize,  // 默认 50
}

pub struct Selection {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub data: Option<Vec<u8>>,  // 选区像素数据
}
```

#### 3.1.3 前端接口 (Vue Composables)

```typescript
// src-web/composables/useCanvas.ts

export function useCanvas() {
  const layers = ref<Layer[]>([]);
  const activeLayer = computed(() => layers.value.find((l) => l.id === activeLayerId.value));

  // 获取选区为 Base64
  const getSelectionAsBase64 = async (): Promise<string> => {
    return await invoke('get_canvas_selection');
  };

  // 粘贴图片到当前图层
  const pasteImage = async (imageData: string): Promise<void> => {
    return await invoke('paste_image_to_layer', { imageData });
  };

  // Undo / Redo
  const undo = async () => await invoke('undo');
  const redo = async () => await invoke('redo');

  return { layers, activeLayer, getSelectionAsBase64, pasteImage, undo, redo };
}
```

---

### 3.2 AI 助理模块 (Hermes Agent Integration)

#### 3.2.1 集成策略

采用 **CLI 二进制调用** 方式集成 Hermes Agent，原因如下：

- Hermes Agent 以单文件二进制形式发布，无需编译依赖
- 通过 stdio 进行 JSON-RPC 通信，协议稳定
- 支持热插拔 MCP 服务器，无需重启 Agent

#### 3.2.2 进程管理

```rust
// src-tauri/src/agent/manager.rs

use std::process::{Command, Child, Stdio};
use tokio::io::{AsyncBufReadExt, BufReader};

pub struct AgentManager {
    process: Option<Child>,
    mcp_servers: Vec<McpServerConfig>,
}

impl AgentManager {
    /// 启动 Hermes Agent 子进程
    pub async fn start(&mut self) -> Result<(), String> {
        let mut cmd = Command::new("hermes")
            .arg("agent")
            .arg("--mcp-config")
            .arg(self.mcp_config_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start Hermes Agent: {}", e))?;

        self.process = Some(cmd);
        self.start_event_loop().await?;
        Ok(())
    }

    /// 发送指令给 Agent (JSON-RPC)
    pub async fn send_command(&mut self, command: AgentCommand) -> Result<AgentResponse, String> {
        // 通过 stdin 写入 JSON-RPC 请求
        // 通过 stdout 读取响应
    }
}
```

#### 3.2.3 MCP 服务器配置

Hermes Agent 通过 MCP 协议连接外部工具服务器。OpenPaint 将自身暴露为一个 MCP 服务器：

```yaml
# ~/.openpaint/mcp_config.yaml
mcp_servers:
  - name: openpaint-tools
    command: openpaint
    args: ['mcp', 'serve']
    env:
      OPENPAINT_CONFIG: '~/.openpaint/config.yaml'
```

MCP 服务器启动后，Hermes Agent 自动发现可用工具，支持 `tools/list` 请求进行工具发现。

---

### 3.3 OpenPencil 嵌入模块（统一中央画布，W14+）

#### 3.3.1 集成架构变化

原架构：OpenPencil 作为独立右窗，用户在中央画布与 OpenPencil 之间切换，AI 结果以 base64 PNG 落回中央画布（矢量->位图退化）。

新架构：OpenPencil 本身成为中央画布，唯一 Editor 实例 + 唯一 SceneGraph 是项目唯一文档。Rust `CanvasState` / `canvasApi` 降为兼容层。

```typescript
// src-web/src/composables/useOpenPencil.ts（W14+ 关键变更）
let singletonEditor: Editor | null = null;
let singletonBridge: OpenPencilBridge | null = null;

export function getOpenPencilBridge(): OpenPencilBridge {
  if (!singletonBridge) singletonBridge = createSingleton();
  return singletonBridge;   // 全应用唯一
}

// 上层组件
const bridge = getOpenPencilBridge();
<OpenPencilView>    // CentralLayout 中挂载一处，提供 provideEditor
  <ToolbarRoot />   // OpenPencil 自带工具面
  <LayerTreeRoot />
</OpenPencilView>
```

#### 3.3.2 责任划分

- **OpenPencil editor（唯一编辑器）**：
  - SceneGraph 唯一真理源（节点 / 选区 / 矢量图层 / 文本）
  - `undoAction()` / `redoAction()` 统一所有姿势的 Undo/Redo
  - `pasteFromHTML(svg, undefined, { replaceSelection: true })` 接收 AI SVG（直入，不栅格化）
  - `replaceGraph()` 重置文档（如示例 / 加载 .op）
  - `getLayerTree()` / `getSelectedNodes()` 透出给 Vue 状态
- **Rust `canvasApi`（兼容层）**：
  - 位图层 / 画笔 / 橡皮 / 旋转 / 文字 / 混合模式 / 缩放适配
  - `paste_image_to_layer` 仍用于位图导入（不供 AI 路径使用）
- **不重复实现**：Rust 不在维护中央文档 OpenPencil 已表达的选区 / 节点树。

#### 3.3.3 AI 闭环通信

```
OpenPaint                                OpenPencil
 (Tauri WebView)                          (中央画布)

AI Assistant ──「插画一个圆形」 ─→  aiApi.sendToAiEngine → LLM
                                            │
                                            ▼ svg/png
                                    预览弹窗 PreviewModal
                                            │ 「插入中央画布」
                                            ▼
                              bridge.importSVG(svg, { replaceSelection: true })
                                            │
                                            ▼  editor.pasteFromHTML()
                                SceneGraph（不栅格化）
```

**关键点**：

1. AI 返回 SVG 不再“PNG 化”又再贴中央画布，避免矢量退化。
2. `replaceSelection: true` 默认替换当前选区，为画布局部重画提供上下文。
3. 乐观插入 + 后续 Undo/Redo 可一键移除，再按 Ctrl+Z 还原。

#### 3.3.4 迁移阶段

| 阶段 | 状态 | 备注 |
| --- | --- | --- |
| Stage 1：中央编辑实例 + OpenPencil 桥接口 | ✅ | `useOpenPencil` 单例化，提供 TODO 必需方法 |
| Stage 2：工具 / 图层 / AI 状态全部走桥 | ✅ | CanvasToolbar / LayerPanel / useShortcuts |
| Stage 3：移除独立 OpenPencil 右窗入口 | ✅ | TopBar / RightSidebar / uiStore / AppView |
| Stage 4：测试与生产验证 | ✅ | 375 vitest · type-check · lint 0 error |
| Stage 5：文档更新 | ✅ | 本轮同步 |

---

### 3.4 原子工具集 (Tool System)

#### 3.4.1 工具注册机制

所有工具通过 MCP 协议注册，每个工具包含：

- **名称**：唯一标识符
- **描述**：功能说明（供 LLM 理解）
- **inputSchema**：JSON Schema 定义参数

#### 3.4.2 工具列表

| 工具名称               | 描述                            | 输入参数                                                | 输出                              |
| :--------------------- | :------------------------------ | :------------------------------------------------------ | :-------------------------------- |
| `get_canvas_selection` | 获取当前选区/图层为 Base64 PNG  | `layer_id?` (可选)                                      | `{ data: string, width, height }` |
| `get_selection_bounds` | 获取选区坐标与尺寸              | 无                                                      | `{ x, y, width, height }`         |
| `paste_image_to_layer` | 将 Base64 图片粘贴到当前图层    | `image_data: string`                                    | `{ layer_id }`                    |
| `get_layer_info`       | 获取所有图层信息                | 无                                                      | `Layer[]`                         |
| `send_to_ai_engine`    | 发送图源 + Prompt 给 OpenPencil | `image_data: string, prompt: string`                    | `{ svg: string, png: string }`    |
| `render_svg_to_png`    | 将 SVG 渲染为指定尺寸 PNG       | `svg: string, width: int, height: int`                  | `{ png_data: string }`            |
| `get_current_svg`      | 获取 OpenPencil 当前文档 SVG    | 无                                                      | `{ svg: string }`                 |
| `save_to_gallery`      | 保存图片到图库                  | `image_data: string, tags: string[], group_id?: string` | `{ record_id }`                   |
| `search_gallery`       | 按标签/关键词搜索图库           | `query: string, limit?: int`                            | `GalleryItem[]`                   |
| `get_gallery_image`    | 按 ID 获取图库原图              | `record_id: string`                                     | `{ image_data: string }`          |
| `search_icons`         | 按关键词搜索图标（Iconify 集成）  | `query: string, style?: string, category?: string, limit?: int` | `{ icons: IconMeta[], total, has_more }` |
| `render_icon_svg`      | 把图标 ID 渲染为指定尺寸/颜色 SVG（带本地缓存） | `prefix: string, name: string, color?: string, size?: int` | `{ svg, width, height, from_cache }` |
| `apply_palette`        | 应用调色板到图层（swatch_bar / replace_color） | `palette_id: string, mode?: string, layer_id?: string, replace_hex?: string` | `{ applied_colors, stroke_count, mode }` |
| `apply_gradient`       | 应用渐变预设到图层（16 个 SVG 渐变） | `gradient_id: string, layer_id?: string, opacity?: number` | `{ gradient_id, gradient_type, stop_count, bytes_written }` |
| `create_brush_from_prompt` | AI 生成画刷（v0.2 stub；v0.3 真实实现） | `prompt: string, name?: string` | `{ status: "not_implemented", message: "AI brush generation available in v0.3" }` |

#### 3.4.4 资产库子模块（W9 + W10 + W11）

**图标（Iconify）**

- 索引：`assets/iconify/index.json` 内置精简版（~ 12 KB / 83 图标，覆盖 6 套 prefix）。
- 缓存：完整 SVG body 在用户首次访问时按需下载，写到 `~/.openpaint/icon-cache/{prefix}/{name}.json`。
- CDN 镜像：`AssetsConfig.cdn_mirror` 控制 base URL，取值 `default` (api.iconify.design) / `jsdelivr` (cdn.jsdelivr.net/npm/@iconify) / `fastly` (api.fastly.iconify.design)。

**画刷**

- 8 个内置 PNG（256×256 RGBA），路径 `assets/brushes/*.png`。
- `BrushPreset` 结构体：`{ id, name_zh, name_en, file_name, category, default_radius, falloff }`。
- 通过 `builtin_brushes()` 函数（`OnceLock<Box<[BrushPreset]>>` 缓存）返回静态切片，避免 `const fn` 限制。

**调色板**

- 4 套 JSON（Material / Tailwind / Pastel / Mono），每套 10 色。
- 应用模式 `swatch_bar`：在图层底部追加 32px 色条（不破坏现有像素）；`replace_color`：HSV 距离替换图层主色像素。

**渐变**

- 16 个预设（8 linear + 5 radial + 3 conic）写在 `assets/gradients/presets.json`。
- 用 resvg 0.48 把 SVG `<linearGradient>` / `<radialGradient>` / `<conicGradient>` 渲染到图层尺寸，写回 `paste_image_to_layer` 路径。

**离线检测 + 状态持久化**

- `icon_commands::probe_online_now()` 每次缓存未命中远程拉取后异步触发（30s 节流 + 10s 超时）。
- 结果写到 `~/.openpaint/asset-state.json`（`{ online, last_check_at, last_error }`）。
- IPC `get_asset_state` 返回该状态；前端 `useAssets.isOnline` 暴露。

**本地遥测**

- `~/.openpaint/telemetry/assets.json` 累计 6 个事件：`search_icons` / `search_icons_cache_hit` / `import_icon` / `apply_palette` / `apply_gradient` / `brush_switch`。
- IPC `record_asset_event(event)` 增量；`get_assets_telemetry` 读取快照。
- **仅本地追加，不外发**。

**资源配置 + 第三方署名**

- `AssetsConfig` 结构：`{ cdn_mirror: String, attribution_notice_shown: bool }`。
- IPC `get_assets_config` / `set_assets_config` 双向同步 Rust 配置 + 前端 `useAssetsConfig` 缓存。
- 设置 → 资源：CDN 镜像 3 选 1（default / jsdelivr / fastly）；设置 → 关于：第三方资源署名页（6 套图标集 + License + 是否需署名）。
- 首次启动 toast：`useOnboarding.shouldShowAttributionToast`，dismiss 后写 `attribution_notice_shown=true`（localStorage + Rust config 双向同步）。

#### 3.4.3 工具实现示例 (Rust)

```rust
// src-tauri/src/tools/mod.rs

use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RenderSvgArgs {
    pub svg: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize)]
pub struct RenderSvgResult {
    pub png_data: String,  // Base64
}

#[command]
pub async fn render_svg_to_png(args: RenderSvgArgs) -> Result<RenderSvgResult, String> {
    // 使用 resvg 库渲染 SVG 到 PNG
    let options = resvg::Options::default();
    let rtree = resvg::svg::parse(&args.svg, &options)?;
    let pixmap = resvg::render(&rtree, args.width, args.height)?;
    let png_data = pixmap.encode_png()?;
    Ok(RenderSvgResult {
        png_data: base64::encode(png_data),
    })
}
```

---

### 3.5 图库管理模块 (Gallery)

#### 3.5.1 数据库设计 (SQLite)

```sql
-- 表: gallery_items
CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY,                -- UUID
    group_id TEXT,                      -- 分组 ID (同一组资产共享)
    thumbnail_path TEXT NOT NULL,       -- WebP 缩略图路径
    full_size_path TEXT,                -- 原始尺寸图片路径 (可选)
    width INTEGER,
    height INTEGER,
    prompt TEXT,                        -- 生成时使用的提示词
    model TEXT,                         -- 使用的 AI 模型
    tags TEXT,                          -- JSON 数组: ["tag1", "tag2"]
    created_at INTEGER NOT NULL,        -- Unix 时间戳
    source TEXT                         -- "ai_generated" | "imported"
);

-- 索引
CREATE INDEX idx_gallery_group ON gallery_items(group_id);
CREATE INDEX idx_gallery_tags ON gallery_items(tags);
CREATE INDEX idx_gallery_created ON gallery_items(created_at DESC);

-- 表: vector_index (LanceDB 未来集成)
-- LanceDB 作为嵌入式向量数据库独立存储，不占用 SQLite 空间
```

#### 3.5.2 存储策略

```
~/.openpaint/gallery/
├── thumbnails/
│   ├── {uuid}.webp          # 256x256 WebP 缩略图
│   └── {uuid}.webp
├── originals/
│   ├── {uuid}.png           # 原始尺寸 (可选，默认只存缩略图)
│   └── {uuid}.png
└── metadata.db              # SQLite 数据库
```

**存储限制**：

- 默认保留最近 500 张
- 超出时自动轮转（删除最旧记录）
- 用户可手动标记“收藏”以永久保留

#### 3.5.3 向量搜索集成 (渐进式)

LanceDB 是 Rust 原生的嵌入式向量数据库，无需独立服务：

```rust
// src-tauri/src/gallery/vector.rs (未来阶段)

use lancedb::{Connection, Table};

pub struct VectorIndex {
    db: Connection,
    table: Table,
}

impl VectorIndex {
    /// 初始化 LanceDB (嵌入模式)
    pub async fn new(path: &str) -> Result<Self, String> {
        let db = Connection::connect(path).await?;
        // 使用 CLIP 模型生成图像向量
        // 存储到 LanceDB 表中
    }

    /// 语义搜索
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<GalleryItem>, String> {
        // 1. 将查询文本转为向量 (使用本地 embedding 模型)
        // 2. LanceDB 相似性搜索
        // 3. 返回匹配的 gallery items
    }
}
```

---

### 3.6 配置管理模块

#### 3.6.1 配置文件结构

```yaml
# ~/.openpaint/config.yaml

# 大模型配置 (用户自配，参考 DeepSeek Harness 模式)
llm:
  provider: 'openai' # openai | anthropic | deepseek | ollama
  api_key: 'sk-xxx'
  base_url: 'https://api.openai.com/v1'
  model: 'gpt-4o'
  # 本地模型 (Ollama)
  local_model: 'qwen2.5:7b'
  local_url: 'http://localhost:11434'

# 预设尺寸模板
presets:
  web: [16, 32, 48, 180, 192, 512]
  ios: [20, 29, 40, 60, 76, 83.5, 1024]
  android: [48, 72, 96, 144, 192, 512]
  favicon: [16, 32, 64]

# 图库设置
gallery:
  max_items: 500
  thumbnail_size: 256
  storage_path: '~/.openpaint/gallery'

# MCP 服务器配置
mcp:
  servers:
    - name: 'openpaint-tools'
      enabled: true
    - name: 'filesystem'
      enabled: false
```

#### 3.6.2 配置加载 (Rust)

```rust
// src-tauri/src/config/mod.rs

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Deserialize, Serialize)]
pub struct AppConfig {
    pub llm: LlmConfig,
    pub presets: PresetConfig,
    pub gallery: GalleryConfig,
    pub mcp: McpConfig,
}

impl AppConfig {
    /// 从 ~/.openpaint/config.yaml 加载配置
    pub fn load() -> Result<Self, String> {
        let config_path = dirs::home_dir()
            .unwrap()
            .join(".openpaint")
            .join("config.yaml");
        // 如果不存在，生成默认配置
        if !config_path.exists() {
            Self::generate_default()?;
        }
        let content = std::fs::read_to_string(config_path)?;
        Ok(serde_yaml::from_str(&content)?)
    }
}
```

---

## 4. 接口设计

### 4.1 Tauri 命令接口 (Rust → Frontend)

所有后端功能通过 Tauri 的 `#[command]` 宏暴露给前端：

```rust
// src-tauri/src/main.rs

#[tauri::command]
async fn get_canvas_selection(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.canvas.get_selection_as_base64()
}

#[tauri::command]
async fn paste_image_to_layer(
    state: tauri::State<'_, AppState>,
    image_data: String,
) -> Result<Uuid, String> {
    state.canvas.paste_image(image_data)
}

#[tauri::command]
async fn send_to_ai_engine(
    state: tauri::State<'_, AppState>,
    image_data: String,
    prompt: String,
) -> Result<AiResult, String> {
    state.agent.send_to_openpencil(image_data, prompt).await
}

#[tauri::command]
async fn save_to_gallery(
    state: tauri::State<'_, AppState>,
    image_data: String,
    tags: Vec<String>,
    group_id: Option<String>,
) -> Result<String, String> {
    state.gallery.save(image_data, tags, group_id)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_canvas_selection,
            paste_image_to_layer,
            send_to_ai_engine,
            save_to_gallery,
            search_gallery,
            render_svg_to_png,
            // ... 更多工具
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 4.2 前端调用示例 (Vue)

```typescript
// src-web/composables/useTools.ts
import { invoke } from '@tauri-apps/api/core';

export async function exportLogoSet(svg: string, tags: string[]) {
  // 1. 获取预设尺寸
  const presets = await invoke('get_preset_sizes', { preset: 'web' });
  // 2. 循环渲染并保存
  const groupId = crypto.randomUUID();
  for (const size of presets) {
    const png = await invoke('render_svg_to_png', { svg, width: size, height: size });
    await invoke('save_to_gallery', {
      image_data: png.png_data,
      tags,
      group_id: groupId,
    });
  }
  return groupId;
}
```

### 4.3 事件系统 (双向通信)

Tauri 提供事件系统，支持 Rust 后端向前端发送事件：

```rust
// Rust 后端触发事件
app.emit("ai-generation-complete", AiResult { ... })?;
```

```typescript
// 前端监听事件
import { listen } from '@tauri-apps/api/event';

await listen('ai-generation-complete', (event) => {
  console.log('AI 生成完成:', event.payload);
  // 显示预览弹窗
});
```

---

## 5. 数据流与交互时序

### 5.1 AI Logo 生成 + 多尺寸导出

```
用户               中央画布           AI助理           Hermes Agent     OpenPencil      图库
 │                   │                 │                  │               │              │
 │  框选区域         │                 │                  │               │              │
 │──────────────────►│                 │                  │               │              │
 │  输入Prompt       │                 │                  │               │              │
 │──────────────────►│────────────────►│                  │               │              │
 │                   │                 │  解析意图         │               │              │
 │                   │                 │─────────────────►│               │              │
 │                   │                 │                  │ 调用 get_canvas_selection     │
 │                   │◄────────────────│──────────────────│               │              │
 │                   │  返回 Base64    │                  │               │              │
 │                   │────────────────►│─────────────────►│               │              │
 │                   │                 │                  │ send_to_ai_engine           │
 │                   │                 │                  │──────────────►│              │
 │                   │                 │                  │  返回 SVG     │              │
 │                   │                 │                  │◄──────────────│              │
 │                   │                 │                  │ render_svg_to_png (循环)     │
 │                   │                 │                  │──────────────►│              │
 │                   │                 │                  │  返回 PNG     │              │
 │                   │                 │                  │◄──────────────│              │
 │                   │                 │                  │ save_to_gallery (循环)       │
 │                   │                 │                  │───────────────│─────────────►│
 │                   │                 │                  │               │  写入 SQLite │
 │                   │                 │  任务完成通知     │               │              │
 │                   │◄────────────────│◄─────────────────│               │              │
 │  预览弹窗         │                 │                  │               │              │
 │◄──────────────────│                 │                  │               │              │
```

---

## 6. 部署与打包

### 6.1 跨平台打包

Tauri v2 支持生成以下安装包：

| 平台    | 格式                   | 命令               |
| :------ | :--------------------- | :----------------- |
| Windows | `.exe` (NSIS) / `.msi` | `pnpm tauri build` |
| macOS   | `.dmg` / `.app`        | `pnpm tauri build` |
| Linux   | `.AppImage` / `.deb`   | `pnpm tauri build` |

### 6.2 依赖打包

Hermes Agent 二进制需随应用一起分发：

```toml
# src-tauri/tauri.conf.json
{
  "bundle": {
    "resources": {
      "../bin/hermes": "./bin/"
    }
  }
}
```

### 6.3 首次启动初始化

```rust
// 首次启动时创建配置目录和默认文件
fn initialize_app() -> Result<(), String> {
    let home = dirs::home_dir().unwrap().join(".openpaint");
    std::fs::create_dir_all(&home)?;
    std::fs::create_dir_all(home.join("gallery/thumbnails"))?;
    std::fs::create_dir_all(home.join("gallery/originals"))?;

    // 生成默认 config.yaml
    if !home.join("config.yaml").exists() {
        let default_config = include_str!("../assets/default_config.yaml");
        std::fs::write(home.join("config.yaml"), default_config)?;
    }
    Ok(())
}
```

---

## 7. 安全与隐私

### 7.1 大模型 API Key

- API Key 仅存储在用户本地的 `~/.openpaint/config.yaml` 中
- OpenPaint **不收集、不上传**任何用户数据
- 所有 AI 调用直接由用户的 API Key 发起

### 7.2 工具调用安全

MCP 协议要求 **“人工在环” (Human-in-the-loop)**：

- 所有工具调用需用户确认
- 批量操作（如多尺寸导出）在预览弹窗中展示待执行列表
- 用户可随时拒绝任何工具调用

### 7.3 本地数据

- 所有图片数据存储在本地 `~/.openpaint/gallery/`
- 不上传任何图片到云端
- 缩略图使用 WebP 格式，兼顾体积与质量

---

## 8. 性能考量

| 场景             | 优化策略                                   |
| :--------------- | :----------------------------------------- |
| **大画布渲染**   | 使用 Canvas 2D 离屏渲染，仅渲染可视区域    |
| **SVG 批量导出** | resvg 基于 Rust 的高性能渲染，支持并发处理 |
| **图库缩略图**   | 统一使用 WebP 格式，缩略图尺寸限制 256px   |
| **向量搜索**     | LanceDB 嵌入式模式，零延迟本地检索         |
| **AI 响应**      | 异步处理，不阻塞 UI 线程                   |

---

## 9. 未来扩展

### 9.1 插件系统

基于 MCP 协议，任何外部工具只要实现 MCP 服务器即可接入：

```yaml
# 用户可自行添加 MCP 服务器
mcp_servers:
  - name: 'custom-plugin'
    command: 'python'
    args: ['my_mcp_server.py']
```

### 9.2 多 AI Provider 支持

用户可在配置文件中切换不同大模型提供商：

```yaml
llm:
  provider: 'anthropic' # 或 deepseek / ollama
  model: 'claude-3-5-sonnet-20241022'
```

### 9.3 团队协作

未来可引入：

- 项目文件格式 (`.openpaint`)
- 图库云端同步（用户自选存储）
- 版本历史与分支管理

---

## 10. 附录

### 附录 A：目录结构

```
openpaint/
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口，命令注册
│   │   ├── canvas/               # 画布引擎
│   │   │   ├── mod.rs
│   │   │   ├── layer.rs
│   │   │   └── history.rs
│   │   ├── agent/                # Hermes Agent 集成
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs        # 进程管理
│   │   │   └── mcp.rs            # MCP 协议适配
│   │   ├── gallery/              # 图库管理
│   │   │   ├── mod.rs
│   │   │   ├── database.rs       # SQLite 操作
│   │   │   └── vector.rs         # LanceDB (未来)
│   │   ├── tools/                # 原子工具
│   │   │   ├── mod.rs
│   │   │   ├── canvas_tools.rs
│   │   │   ├── ai_tools.rs
│   │   │   └── gallery_tools.rs
│   │   └── config/               # 配置管理
│   │       └── mod.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src-web/                      # Vue 3 前端
│   ├── components/
│   │   ├── Canvas.vue            # 中央画布
│   │   ├── AIAssistant.vue       # AI 助理浮窗
│   │   ├── OpenPencilView.vue    # OpenPencil 嵌入
│   │   └── GalleryPanel.vue      # 图库面板
│   ├── composables/
│   │   ├── useCanvas.ts
│   │   ├── useAgent.ts
│   │   └── useGallery.ts
│   ├── main.ts
│   └── vite.config.ts
├── assets/
│   └── default_config.yaml
├── docs/
│   ├── README.md
│   └── technical-design.md
└── package.json
```

### 附录 B：关键依赖版本 (Cargo.toml)

```toml
[package]
name = "openpaint"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-build = "2"
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"
rusqlite = { version = "0.31", features = ["bundled"] }
image = "0.25"
resvg = "0.9"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
dirs = "5"
anyhow = "1"

# 未来阶段
lancedb = { version = "0.23", optional = true }
```

---

> **“OpenPaint —— 你的画布，你的 AI，你的规则。”**
