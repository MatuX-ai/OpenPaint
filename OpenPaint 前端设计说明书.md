# OpenPaint 前端设计说明书

**版本**：v1.1.0 | **状态**：规划中 | **最后更新**：2026-09-01

---

## 1. 文档概述

本文档为 OpenPaint 项目的前端（WebView 层）详细设计，涵盖 UI/UX 设计原则、组件架构、状态管理、性能优化及开发规范。阅读对象为前端开发人员与 UI/UX 设计师。

---

## 2. 设计原则

| 原则               | 说明                                                                            |
| :----------------- | :------------------------------------------------------------------------------ |
| **AI 原生**        | AI 助理不是“附加功能”，而是贯穿始终的核心交互入口，所有设计围绕“对话驱动”展开。 |
| **像素级精确**     | 提供专业级画布交互（选区、变换、图层），不因 AI 功能而牺牲精确控制能力。        |
| **无感切换**       | 用户无需感知“前端/后端”或“画布/AI 引擎”的边界，所有操作流畅连贯。               |
| **轻量快速**       | 保持极低的启动延迟和操作响应，即使是 4K 画布也保持 60fps 渲染。                 |
| **可配置与可扩展** | 布局、主题、快捷键均支持用户自定义，为未来插件系统预留界面扩展点。              |

---

## 3. 技术栈明细

| 类别           | 技术选型                      | 用途                      |
| :------------- | :---------------------------- | :------------------------ |
| **框架**       | Vue 3 (Composition API)       | 组件化开发、响应式状态    |
| **语言**       | TypeScript 5.x                | 类型安全、IDE 友好        |
| **构建工具**   | Vite 5.x                      | 快速冷启动、HMR           |
| **状态管理**   | Pinia                         | 全局 UI 状态、跨组件共享  |
| **UI 组件库**  | 无（完全自研）                | 保持轻量，避免样式污染    |
| **画布渲染**   | HTML Canvas 2D                | 像素级图形渲染            |
| **图标**       | Lucide Vue 3                  | 开源图标集，按需加载      |
| **样式方案**   | CSS 变量 + SCSS               | 深色/浅色主题支持         |
| **代码规范**   | ESLint + Prettier + Stylelint | 统一代码风格              |
| **与后端通信** | `@tauri-apps/api`             | invoke 调用命令、监听事件 |

---

## 4. 目录结构

```
src-web/
├── index.html                    # 入口 HTML
├── main.ts                       # 应用入口，挂载 Vue
├── App.vue                       # 根组件，布局骨架
├── vite-env.d.ts                 # Vite 类型声明
│
├── components/                   # 组件目录
│   ├── layout/                   # 布局组件
│   │   ├── MainLayout.vue        # 主布局（左/中/右三栏）
│   │   ├── TopBar.vue            # 顶部工具栏
│   │   ├── LeftSidebar.vue       # 左侧工具面板
│   │   ├── RightSidebar.vue      # 右侧面板（OpenPencil / 图库切换）
│   │   └── StatusBar.vue         # 底部状态栏
│   │
│   ├── canvas/                   # 中央画布
│   │   ├── CanvasView.vue        # 画布主视图
│   │   ├── CanvasToolbar.vue     # 画布上方的快捷工具条
│   │   ├── LayerPanel.vue        # 图层面板（可折叠）
│   │   ├── LayerItem.vue         # 单个图层项
│   │   └── SelectionRect.vue     # 选区边框（覆盖层）
│   │
│   ├── assistant/                # AI 助理
│   │   ├── AIAssistant.vue       # 浮窗根组件
│   │   ├── ChatMessage.vue       # 单条消息（用户/AI）
│   │   ├── ChatInput.vue         # 输入框与发送按钮
│   │   ├── ThinkingIndicator.vue # AI 思考动画
│   │   ├── ToolCallCard.vue      # 工具调用卡片（展示 AI 执行了什么）
│   │   └── PreviewModal.vue      # AI 生成结果预览弹窗
│   │
│   ├── openpencil/               # OpenPencil 嵌入
│   │   ├── OpenPencilView.vue    # 右窗容器
│   │   ├── OpenPencilToolbar.vue # 右上角操作栏（OK / 取消 / 刷新）
│   │   └── MCPStatus.vue         # MCP 连接状态指示器
│   │
│   ├── gallery/                  # 图库管理
│   │   ├── GalleryPanel.vue      # 图库侧面板
│   │   ├── GalleryGrid.vue       # 缩略图网格
│   │   ├── GalleryItem.vue       # 单个缩略图卡片
│   │   ├── GallerySearch.vue     # 搜索框与标签筛选
│   │   └── GalleryDetail.vue     # 大图预览（浮层）
│   │
│   └── common/                   # 通用组件
│       ├── Button.vue            # 自定义按钮
│       ├── Icon.vue              # 图标包装器
│       ├── Spinner.vue           # 加载动画
│       ├── ResizeHandle.vue      # 面板拖拽调整大小
│       └── ThemeToggle.vue       # 深色/浅色切换
│
├── composables/                  # 组合式函数 (Composition API)
│   ├── useCanvas.ts              # 画布状态与操作
│   ├── useAgent.ts               # AI 助理对话与工具调用
│   ├── useGallery.ts             # 图库加载与搜索
│   ├── useOpenPencil.ts          # OpenPencil 嵌入通信
│   ├── useTheme.ts               # 主题切换
│   ├── useShortcuts.ts           # 键盘快捷键
│   └── useResize.ts              # 面板尺寸调整
│
├── stores/                       # Pinia 状态管理
│   ├── canvasStore.ts            # 画布 UI 状态（工具激活、缩放、选区）
│   ├── chatStore.ts              # 对话历史、输入状态
│   ├── galleryStore.ts           # 图库列表、搜索关键词
│   ├── uiStore.ts                # 全局 UI（主题、面板展开/折叠、弹窗）
│   └── index.ts                  # 统一导出
│
├── api/                          # 后端通信层
│   ├── canvasApi.ts              # 画布相关命令（截图、粘贴、工具操作）
│   ├── agentApi.ts               # AI 助理命令（发送消息、获取状态）
│   ├── galleryApi.ts             # 图库命令（保存、搜索、获取）
│   ├── openpencilApi.ts          # OpenPencil 通信（导入/导出 SVG）
│   └── events.ts                 # 事件监听器（统一管理 Tauri 事件）
│
├── types/                        # TypeScript 类型定义
│   ├── canvas.d.ts               # 图层、选区、工具类型
│   ├── agent.d.ts                # 消息、工具调用类型
│   ├── gallery.d.ts              # 图库条目类型
│   ├── config.d.ts               # 配置类型
│   └── global.d.ts               # 全局类型
│
├── utils/                        # 工具函数
│   ├── image.ts                  # Base64 / Blob / Canvas 互转
│   ├── debounce.ts               # 防抖节流
│   ├── format.ts                 # 时间格式化、文件大小
│   └── constants.ts              # 预设尺寸、默认配置
│
├── assets/                       # 静态资源
│   ├── styles/
│   │   ├── variables.scss        # CSS 变量（主题色）
│   │   ├── reset.scss            # 样式重置
│   │   └── global.scss           # 全局样式
│   └── fonts/                    # 字体文件（可选）
│
├── public/                       # 公共静态资源
│   └── logo.svg                  # 应用图标
│
└── vite.config.ts                # Vite 构建配置
```

---

## 5. 布局架构

### 5.1 整体布局（三栏 + 浮窗）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               TopBar (标题 + 全局操作)                      │
├───────┬───────────────────────────────────────────┬─────────────────────────┤
│       │                                           │   RightSidebar  (可折叠)│
│ Left  │           Central Canvas                  │ ┌─────────────────────┐ │
│ Side- │           (中央画布)                      │ │ OpenPencil / Gallery │ │
│ bar   │                                           │ │                     │ │
│ (工  │                                           │ │   (右窗内容)        │ │
│ 具  │                                           │ │                     │ │
│ 栏) │                                           │ │                     │ │
│       │                                           │ └─────────────────────┘ │
│       │                                           │   Resize Handle        │
├───────┴───────────────────────────────────────────┴─────────────────────────┤
│  StatusBar (坐标 / 缩放 / 图层数 / 内存占用 / MCP 状态)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   AI Assistant (右下角浮窗)    │
                    │   ┌────────────────────────┐  │
                    │   │  Chat History          │  │
                    │   │  [用户] 把背景换成森林  │  │
                    │   │  [AI]  正在生成...     │  │
                    │   └────────────────────────┘  │
                    │   [输入框]           [发送]   │
                    └───────────────────────────────┘
```

### 5.2 尺寸策略

| 区域           | 默认宽度                | 可调范围      | 折叠                       |
| :------------- | :---------------------- | :------------ | :------------------------- |
| Left Sidebar   | 48px                    | 48px ~ 64px   | 不可折叠                   |
| Central Canvas | 剩余空间                | —             | —                          |
| RightSidebar   | 320px                   | 240px ~ 600px | 可完全折叠（仅显示标签栏） |
| AI Assistant   | 360px (宽) × 480px (高) | 自由拖拽      | 可最小化为图标             |

---

## 6. 组件详细设计

### 6.1 CanvasView.vue（核心画布）

**职责**：

- 渲染所有图层合成结果
- 处理鼠标/触控事件（绘制、选区、拖动）
- 渲染选区边框、辅助网格、参考线
- 响应式缩放与平移（鼠标滚轮 + 触控板）

**交互模式**：

| 工具模式     | 鼠标点击 | 鼠标拖拽     | 键盘修饰         |
| :----------- | :------- | :----------- | :--------------- |
| **画笔**     | 绘制点   | 绘制连续路径 | Shift → 直线     |
| **橡皮**     | 擦除点   | 擦除连续路径 | —                |
| **矩形选区** | 起始点   | 拉出选区矩形 | Shift → 正方形   |
| **移动**     | 选中图层 | 拖动图层位移 | —                |
| **变形**     | —        | 拖拽控制点   | Shift → 等比缩放 |

**视图变换**：

```typescript
// composables/useCanvas.ts
export const useCanvas = () => {
  const zoom = ref(1.0); // 缩放比例 (0.1 ~ 10.0)
  const panX = ref(0); // 平移偏移 X
  const panY = ref(0); // 平移偏移 Y

  const viewportToCanvas = (x: number, y: number) => {
    return {
      x: (x - panX.value) / zoom.value,
      y: (y - panY.value) / zoom.value,
    };
  };

  const canvasToViewport = (x: number, y: number) => {
    return {
      x: x * zoom.value + panX.value,
      y: y * zoom.value + panY.value,
    };
  };
};
```

### 6.2 AIAssistant.vue（AI 助理浮窗）

**交互逻辑**：

```
┌─────────────────────────────────────────────┐
│  🔮 AI 助理  [—] [□] [×]                   │ ← 标题栏（拖拽移动）
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐│
│  │  👤 用户：把选区背景换成星空            ││ ← 用户消息（靠右）
│  ├─────────────────────────────────────────┤│
│  │  🤖 AI：好的，正在调用 OpenPencil 生成… ││ ← AI 消息（靠左）
│  │  📋 工具调用：send_to_ai_engine         ││ ← 工具调用卡片
│  │  ⏳ 进度: ██████░░░░ 60%                ││
│  ├─────────────────────────────────────────┤│
│  │  🤖 AI：已生成 3 个方案，预览如下：     ││
│  │  [🌃方案1] [🌌方案2] [🌠方案3]         ││ ← 内嵌预览缩略图
│  ├─────────────────────────────────────────┤│
│  │  👤 用户：用方案2，导出 iOS 尺寸        ││
│  ├─────────────────────────────────────────┤│
│  │  🤖 AI：✅ 已导出 8 个尺寸，存入图库！ ││
│  └─────────────────────────────────────────┘│
│  ┌───────────────────────────────────────┐   │
│  │ 💬 输入消息...     [📎] [发送]       │   │ ← 输入区
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**状态管理**：

```typescript
// stores/chatStore.ts
export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as ChatMessage[],
    isThinking: false,
    inputText: '',
    pendingToolCalls: [] as ToolCall[],
  }),
  actions: {
    async sendMessage(text: string) {
      this.messages.push({ role: 'user', content: text });
      this.isThinking = true;
      // 调用后端 agentApi.sendCommand
      const response = await agentApi.sendCommand(text);
      this.isThinking = false;
      this.messages.push({ role: 'assistant', content: response });
    },
  },
});
```

### 6.3 OpenPencilView.vue（右窗嵌入）

**嵌入方式**：使用 OpenPencil 官方 Vue SDK（如提供），或通过 `<iframe>` 加载其 Web 版。

**方案选择**：

- **优先方案**：`@open-pencil/vue-sdk`（官方 NPM 包），可精细控制通信。
- **备选方案**：`<iframe>` 加载 OpenPencil Web 版，通过 `postMessage` 通信。

**通信协议**：

```typescript
// composables/useOpenPencil.ts
export const useOpenPencil = () => {
  const iframeRef = ref<HTMLIFrameElement>();

  // 向 OpenPencil 发送图源和 Prompt
  const sendImageToAI = (imageData: string, prompt: string) => {
    iframeRef.value?.contentWindow?.postMessage(
      {
        type: 'OPENPENCIL_AI_GENERATE',
        payload: { imageData, prompt },
      },
      '*',
    );
  };

  // 监听 OpenPencil 返回结果
  const onResult = (callback: (svg: string, png: string) => void) => {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'OPENPENCIL_RESULT') {
        callback(event.data.svg, event.data.png);
      }
    });
  };

  // 导出当前 SVG
  const exportSVG = () => {
    iframeRef.value?.contentWindow?.postMessage(
      {
        type: 'OPENPENCIL_EXPORT_SVG',
      },
      '*',
    );
  };
};
```

**OK / 取消 流程**：

1. 用户点击右窗的 **OK** → 前端调用 `openpencilApi.exportPNG()` → 拿到 Base64 图片
2. 调用 `canvasApi.pasteImageToLayer()` → 图片覆盖到中央画布当前图层
3. 自动触发 `galleryApi.saveToGallery()` → 归档图库
4. 关闭右窗（或切换回图库面板）
5. 用户点击 **取消** → 丢弃 OpenPencil 中所有未保存改动，关闭右窗

### 6.4 GalleryPanel.vue（图库面板）

**布局**：

```
┌─────────────────────────────────────────────┐
│  📚 图库  [🔍 搜索框]  [标签筛选 ▼]        │
├─────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │
│  │缩略图│ │缩略图│ │缩略图│ │缩略图│          │
│  │ 512px│ │ 256px│ │ 128px│ │ 64px │          │
│  │ 标签  │ │ 标签  │ │ 标签  │ │ 标签  │          │
│  └─────┘ └─────┘ └─────┘ └─────┘          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │
│  │缩略图│ │缩略图│ │缩略图│ │缩略图│          │
│  └─────┘ └─────┘ └─────┘ └─────┘          │
│  ... (虚拟滚动，无限加载)                    │
│                                             │
│  共 128 张   [加载更多]                     │
├─────────────────────────────────────────────┤
│  点击缩略图 → 大图预览浮层                  │
└─────────────────────────────────────────────┘
```

**交互行为**：

- **点击缩略图**：弹出大图预览浮层，显示完整尺寸、提示词、标签、创建时间。
- **拖拽缩略图到中央画布**：直接粘贴到当前图层（需实现拖拽 API）。
- **右键菜单**：重新打标签、删除、导出为文件、复制到剪贴板。

**性能优化**：

- **虚拟滚动**：使用 `vue-virtual-scroller` 库，只渲染可视区域缩略图。
- **缩略图缓存**：浏览器缓存缩略图图片（设置 `Cache-Control`）。

### 6.5 ResourceTabs.vue（资源二级 Tab，W10）

**职责**：

- 在 `LeftSidebar` 折叠 / 展开状态下统一渲染「图标 / 画刷 / 调色板」三类资源的二级 tab。
- 持久化当前选中的 tab 到 `localStorage` key `openpaint:resource-tab-mode`。
- 在离线模式下显示「⚠️ 离线模式：仅显示已缓存的图标」顶部提示。

**组件契约**：

```ts
// 接收 + 发出
const mode = ref<'icons' | 'brushes' | 'palette'>('icons');
// 内部状态（持久化）
const persistedMode = useLocalStorage('openpaint:resource-tab-mode', 'icons');
```

### 6.6 BrushPanel.vue（画刷宫格，W10）

**职责**：

- 显示 8 个画刷缩略图网格（4×2），从 `assetApi.listBrushAssets()` 加载 PNG base64。
- 点击画刷 → 调 `useAssets.setActiveBrush(id)` + `canvasStore.setActiveBrush(id)` + `recordAssetEvent('brush_switch')`。
- 顶部「AI 生成画刷」按钮调 `create_brush_from_prompt`（v0.2 返回 stub 提示）。

**组件契约**：

```ts
const assets = useAssets().brushAssets;
const activeId = useAssets().activeBrushId;
function onPickBrush(id: string): void;
```

### 6.7 PalettePanel.vue（调色板 + 渐变 chip，W10）

**职责**：

- 顶部 chip 切换「调色板 / 渐变」两种视图。
- 调色板视图：4 套横排（每套 10 个色块），点击色块 → 调 `applyPalette(id, 'swatch_bar')` 或 `applyPalette(id, 'replace_color')`。
- 渐变视图：16 个缩略图（用 CSS `linear-gradient` / `radial-gradient` / `conic-gradient` 渲染预览），点击 → 调 `applyGradient(id, 1.0)`。

### 6.8 ToolCallCard.vue（AI 工具调用卡片，W10）

**职责**：

- 在 AI 助理浮窗内显示一次工具调用（attribution 区分 agent / user）。
- `attribution="agent"` 时显示 `🤖 AI` tag + `tool-call-card--agent` 强调样式。
- 接收 `toolName: string` + `args: Record<string, unknown>` + `result: string`。

### 6.9 SettingsModal.vue（设置面板，W11）

**职责**：

- 两个 section：「大模型接入」 + 「资源与第三方署名」。
- 资源 section 包含：
  - **CDN 镜像下拉**：3 个 chip（default / jsdelivr / fastly），调 `useAssetsConfig.setCdnMirror()`。
  - **第三方资源署名列表**：6 套图标集 + License + 是否需署名 + 官网链接。
- toast 反馈：CDN 切换成功 / 失败。

### 6.10 useAssetsConfig composable（W11）

**职责**：

- 封装 `get_assets_config` / `set_assets_config` IPC。
- 暴露 `config: Ref<AssetsConfig>` / `setCdnMirror(mirror)` / `markAttributionShown()` / `refresh()`。
- `setCdnMirror` 失败时回滚 UI 状态 + 抛错给 toast。
- 并发 refresh 共享同一 inflight promise（避免重复 IPC）。

---

## 7. 状态管理（Pinia）

### 7.1 canvasStore（画布 UI 状态）

```typescript
// stores/canvasStore.ts
export const useCanvasStore = defineStore('canvas', {
  state: () => ({
    activeTool: 'brush' as ToolType, // brush | eraser | select | move | transform
    zoom: 1.0,
    panX: 0,
    panY: 0,
    selection: null as Selection | null,
    layerList: [] as Layer[], // 从后端同步的图层元数据
    activeLayerId: null as string | null,
    canvasWidth: 1920,
    canvasHeight: 1080,
  }),
  actions: {
    async refreshLayers() {
      this.layerList = await canvasApi.getLayerInfo();
    },
    async setActiveTool(tool: ToolType) {
      this.activeTool = tool;
      // 发送事件给后端（切换光标等）
      await canvasApi.setTool(tool);
    },
  },
});
```

### 7.2 chatStore（对话状态）

```typescript
// stores/chatStore.ts
export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as ChatMessage[],
    isProcessing: false,
    inputText: '',
    // AI 上下文
    currentContext: {
      hasSelection: false,
      activeLayer: null,
    },
  }),
  getters: {
    lastMessage(): ChatMessage | null {
      return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    },
  },
  actions: {
    async send(text: string) {
      this.messages.push({ role: 'user', content: text, timestamp: Date.now() });
      this.isProcessing = true;
      this.inputText = '';

      try {
        const response = await agentApi.chat(text);
        this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      } finally {
        this.isProcessing = false;
      }
    },
  },
});
```

### 7.3 galleryStore（图库状态）

```typescript
// stores/galleryStore.ts
export const useGalleryStore = defineStore('gallery', {
  state: () => ({
    items: [] as GalleryItem[],
    isLoading: false,
    hasMore: true,
    page: 0,
    pageSize: 50,
    searchQuery: '',
    selectedTags: [] as string[],
  }),
  actions: {
    async loadMore() {
      if (this.isLoading || !this.hasMore) return;
      this.isLoading = true;
      const result = await galleryApi.search({
        query: this.searchQuery,
        tags: this.selectedTags,
        offset: this.page * this.pageSize,
        limit: this.pageSize,
      });
      this.items.push(...result.items);
      this.hasMore = result.hasMore;
      this.page++;
      this.isLoading = false;
    },
    async search(query: string) {
      this.searchQuery = query;
      this.items = [];
      this.page = 0;
      await this.loadMore();
    },
  },
});
```

### 7.4 uiStore（全局 UI 状态）

```typescript
// stores/uiStore.ts
export const useUIStore = defineStore('ui', {
  state: () => ({
    theme: 'dark' as 'light' | 'dark',
    rightPanelMode: 'openpencil' as 'openpencil' | 'gallery' | 'none',
    rightPanelWidth: 320,
    assistantVisible: true,
    assistantPosition: { x: 0, y: 0 }, // 右下角偏移
    previewModalVisible: false,
    previewImage: null as string | null,
    // 弹窗队列
    modalStack: [] as ModalInstance[],
  }),
  actions: {
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', this.theme);
    },
    openPreview(imageData: string) {
      this.previewImage = imageData;
      this.previewModalVisible = true;
    },
    closePreview() {
      this.previewModalVisible = false;
      this.previewImage = null;
    },
    switchRightPanel(mode: 'openpencil' | 'gallery' | 'none') {
      this.rightPanelMode = mode;
    },
  },
});
```

---

## 8. 通信层设计

### 8.1 API 封装

每个 API 模块封装与 Tauri 后端的通信：

```typescript
// api/canvasApi.ts
import { invoke } from '@tauri-apps/api/core';

export const canvasApi = {
  // 获取选区 Base64
  getSelection(): Promise<string> {
    return invoke('get_canvas_selection');
  },

  // 粘贴图片到图层
  pasteImage(imageData: string): Promise<string> {
    return invoke('paste_image_to_layer', { imageData });
  },

  // 获取图层列表
  getLayerInfo(): Promise<Layer[]> {
    return invoke('get_layer_info');
  },

  // 撤销
  undo(): Promise<void> {
    return invoke('undo');
  },

  // 重做
  redo(): Promise<void> {
    return invoke('redo');
  },
};
```

### 8.2 事件监听统一管理

```typescript
// api/events.ts
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type EventMap = {
  'ai-generation-complete': AiResult;
  'ai-generation-progress': { progress: number };
  'canvas-updated': { layerId: string };
  'gallery-updated': { count: number };
};

class EventManager {
  private listeners: Map<keyof EventMap, UnlistenFn[]> = new Map();

  async on<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void) {
    const unlisten = await listen(event, (e) => callback(e.payload as EventMap[K]));
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(unlisten);
  }

  // 清理所有监听（组件卸载时调用）
  clearAll() {
    for (const [event, unlistens] of this.listeners) {
      for (const unlisten of unlistens) {
        unlisten();
      }
    }
    this.listeners.clear();
  }
}

export const eventManager = new EventManager();
```

---

## 9. UI/UX 规范

### 9.1 色彩体系（CSS 变量）

```scss
// assets/styles/variables.scss
:root {
  // 深色主题（默认）
  --bg-primary: #1a1a1e;
  --bg-secondary: #25252b;
  --bg-tertiary: #2e2e36;
  --bg-hover: #3a3a44;

  --text-primary: #e8e8ea;
  --text-secondary: #a8a8b0;
  --text-muted: #6a6a72;

  --border-color: #3a3a44;

  --accent: #6c5ce7;
  --accent-hover: #7d6ff0;
  --accent-light: rgba(108, 92, 231, 0.2);

  --success: #00b894;
  --warning: #fdcb6e;
  --error: #e17055;

  --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  --radius: 8px;
  --radius-sm: 4px;
}

[data-theme='light'] {
  --bg-primary: #f5f5f7;
  --bg-secondary: #eeeeef;
  --bg-tertiary: #e5e5e8;
  --bg-hover: #d4d4d8;

  --text-primary: #1a1a1e;
  --text-secondary: #5a5a62;
  --text-muted: #8a8a92;

  --border-color: #d4d4d8;
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
```

### 9.2 字体与排版

| 使用场景 | 字体              | 字号 | 行高 |
| :------- | :---------------- | :--- | :--- |
| 正文     | Inter / system-ui | 14px | 1.6  |
| 标题     | Inter / system-ui | 18px | 1.4  |
| 小标签   | Inter / system-ui | 12px | 1.2  |
| 代码     | JetBrains Mono    | 13px | 1.6  |

### 9.3 间距系统

采用 4px 为基数的网格系统：`4, 8, 12, 16, 20, 24, 32, 48, 64`

### 9.4 动画与过渡

| 类型            | 时长  | 缓动函数                     |
| :-------------- | :---- | :--------------------------- |
| 微交互（hover） | 150ms | ease-in-out                  |
| 面板展开/折叠   | 250ms | cubic-bezier(0.4, 0, 0.2, 1) |
| 浮窗显隐        | 200ms | ease                         |
| 加载动画        | 循环  | linear                       |

---

## 10. 性能优化策略

### 10.1 画布渲染

- **离屏渲染**：图层合成使用 OffscreenCanvas，仅当图层变更时重绘。
- **脏区标记**：仅重绘选区变化区域，而非整张画布。
- **缩放时使用低分辨率代理**：快速缩放时先用降采样图预览，松手后渲染高精图。

### 10.2 图库加载

- **虚拟滚动**：只渲染可见区域的缩略图卡片。
- **缩略图懒加载**：使用 `<img loading="lazy">` 或 IntersectionObserver。
- **分页加载**：滚动到底部时自动加载下一批。

### 10.3 AI 助理

- **消息列表虚拟滚动**：如果历史对话很长，也采用虚拟滚动。
- **工具调用防抖**：用户连续发送消息时，取消前一个未完成的工具调用。

### 10.4 通用优化

- **组件懒加载**：`defineAsyncComponent` 异步加载不常显示的组件（如大图预览）。
- **Vite 构建优化**：启用 `build.rollupOptions` 进行代码分割。
- **内存泄漏防护**：组件卸载时清理事件监听和定时器。

---

## 11. 快捷键设计

| 快捷键                    | 功能              |
| :------------------------ | :---------------- |
| `Ctrl+Z`                  | 撤销              |
| `Ctrl+Shift+Z` / `Ctrl+Y` | 重做              |
| `B`                       | 画笔工具          |
| `E`                       | 橡皮工具          |
| `V`                       | 移动工具          |
| `M`                       | 矩形选区          |
| `Ctrl+A`                  | 全选              |
| `Ctrl+D`                  | 取消选区          |
| `Ctrl+C`                  | 复制选区          |
| `Ctrl+V`                  | 粘贴（从剪贴板）  |
| `+` / `-`                 | 缩放画布          |
| `0`                       | 重置缩放至 100%   |
| `Space` + 拖拽            | 平移画布          |
| `Ctrl+Enter`              | 发送 AI 消息      |
| `Ctrl+K`                  | 打开/关闭 AI 助理 |
| `Ctrl+G`                  | 打开/关闭图库面板 |
| `F11`                     | 全屏模式          |

---

## 12. 响应式设计

OpenPaint 主要面向桌面端，但仍需适应不同屏幕尺寸：

| 屏幕宽度        | 布局调整                                     |
| :-------------- | :------------------------------------------- |
| > 1280px        | 标准三栏布局（左工具栏 + 中央画布 + 右面板） |
| 1024px ~ 1280px | 右侧面板自动折叠为标签栏                     |
| < 1024px        | 左侧工具栏折叠为图标，AI 助理自动最小化      |

---

## 13. 开发规范

### 13.1 组件命名规范

- 组件文件：**PascalCase**，如 `CanvasView.vue`
- 组件内 `<script setup>`：使用 `defineProps` / `defineEmits` + TypeScript
- 组合式函数：**camelCase**，以 `use` 开头，如 `useCanvas`

### 13.2 样式规范

- 使用 SCSS + CSS 变量，禁止硬编码颜色值
- 类名采用 **BEM** 命名法：`.block__element--modifier`
- 每个组件作用域样式使用 `<style scoped>`

### 13.3 Git 提交规范

```
feat: 新增功能
fix: 修复 Bug
style: 样式调整（不影响逻辑）
refactor: 重构代码
perf: 性能优化
docs: 文档更新
chore: 构建工具/依赖更新
```

---

## 14. 开发与调试

### 14.1 开发环境启动

```bash
# 安装依赖
pnpm install

# 启动前端开发服务器（Vite HMR）
pnpm dev:web

# 同时启动 Tauri 应用（含后端）
pnpm tauri dev
```

### 14.2 调试工具

- **Vue Devtools**：检查组件状态和 Pinia Store
- **Tauri Devtools**：在应用中按 `Ctrl+Shift+I` 打开 Chrome DevTools
- **日志系统**：使用 `console.debug` 输出，生产环境自动禁用

### 14.3 构建命令

```bash
# 构建前端静态文件
pnpm build:web

# 构建跨平台桌面应用
pnpm tauri build
```

### 14.4 Web 预览模式

- `pnpm dev:web` 启动纯浏览器版本（无 Tauri 后端）
- 大部分画布/AI 命令返回桩数据
- 用于快速验证 UI 改动 / 演示页效果

---

## 15. 形态分布：桌面 vs Web（W12 VDP-DOC-02）

OpenPaint 同时提供两种分发形态：**桌面端**（Tauri WebView）和 **Web 端**（浏览器 SPA）。
两者共享同一份 `src-web` 代码，但运行时能力差异显著，需在产品体验层面做出区分。

### 15.1 形态定位

| 形态 | 用户场景 | 核心价值 | 限制 |
| --- | --- | --- | --- |
| **桌面端**（Tauri） | 主力使用者、设计/开发专业人员 | 完整画布 + 文件系统 + 本地优先 + 系统级集成（剪贴板/菜单/快捷键） | 需下载安装包 |
| **Web 端**（Vercel） | 首次访客、营销 / SEO / GEO、内容传播 | 0 安装、可被搜索引擎索引、支持 LLM 抓取 `llms.txt` | 无 Tauri IPC，部分高级功能降级 |

### 15.2 共享代码与运行时差异

- **共享代码**：所有 Vue 组件、Pinia store、组合式函数、API 抽象层
- **差异点**：
  - `invoke()` 由 `api/runtime.ts` 桩化（Web 模式下大部分返回 mock）
  - 菜单栏 / 系统快捷键 / 系统剪贴板在 Web 模式禁用
  - 文件系统读写在 Web 模式完全不可用

### 15.3 首启引导流差异

| 形态 | 首启引导默认 Provider | 引导语 |
| --- | --- | --- |
| **桌面端**（首启） | 模拟模式（`provider: mock`） | 点「先用模拟模式体验」一键进入 |
| **Web 端**（首启） | 模拟模式（同上） | 顶部横幅提示「Web 预览模式 · 推荐下载桌面端体验完整功能」 |

### 15.4 LLM Provider 在两种形态下的能力

| Provider | 桌面端 | Web 端 |
| --- | --- | --- |
| **模拟模式**（mock） | ✅ 本地规则模板 | ✅ 前端规则模板 |
| **DeepSeek / 通义千问 / OpenAI / 等云端 API** | ✅ 走用户自配 Key | ✅ 可调用（前端直连，Key 由用户在偏好面板粘贴） |
| **Ollama**（本地推理） | ✅ | ❌（CORS / 模型文件体积问题，不在 Web 暴露） |

> **设计取舍**：Web 形态下默认隐藏 Ollama 选项，避免浏览器跨域限制带来的「调用永远失败」挫败感。

### 15.5 Web 端能力降级清单

- 🟡 **可工作但功能简化**：画布（仅展示 / 不可画笔）、设置面板、引导流
- 🔴 **完全不可用**：真实画笔绘制、文件读写、剪贴板、系统菜单、原生快捷键、OpenPencil 右窗（仅桌面端）
- 🟢 **仅 Web 独占**：SEO 友好的落地页 `/`、可被 LLM 抓取的 `llms.txt`、可嵌入第三方 iframe

### 15.6 「桌面 vs Web」选择建议

- 想快速了解 OpenPaint 是什么？**先访问 Web**：`/` 落地页 + `/app` 30 秒试用。
- 准备当作主力工具？**下载桌面版**：原生体验 + 本地数据。
- 不知道选哪个？**从模拟模式起步**：两个形态都内置，0 成本。

---

## 16. 变更历史

| 版本 | 日期 | 主要变更 |
| --- | --- | --- |
| v1.0.0 | 2026-08-18 | 初稿，覆盖 W1-W11 设计要点 |
| v1.1.0（W12）| 2026-09-01 | 新增第 6.9 节 SettingsModal 拆分（QuickPreferences / AdvancedSettings）；新增第 6.10 节 useAssetsConfig composable；新增第 15 章「桌面 vs Web 双形态」；调整第 12 章响应式设计；新增 OnboardingCard 四选项卡（新建/打开/AI 帮忙画/先用模拟模式）设计说明 |

---

> **“OpenPaint —— 你的画布，你的 AI，你的规则。”**
