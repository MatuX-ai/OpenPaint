<!--
  OpenPaint 产品营销首页（Landing）。
  - 介绍产品价值、平替软件、差异化场景、技术架构、LLM Provider 矩阵
  - 提供「在线试用」与「下载桌面版」两个主要入口
  - SEO/GEO 友好的语义化 HTML5 结构（article / section / aside / dl）
-->

<script setup lang="ts">
import {
  Brush,
  Bot,
  Pencil,
  Library,
  Download,
  Layers,
  Shield,
  Cpu,
  Database,
  Puzzle,
  MessageCircle,
  HelpCircle,
  BookOpen,
  Check,
  Palette,
  Image as ImageIcon,
  FileCode,
  ArrowRight,
  Sparkles,
  Globe,
  Heart,
  Star,
  Github,
  Keyboard,
  Layers3,
  Zap,
} from 'lucide-vue-next';

/**
 * 平滑滚动到指定锚元素。
 * 使用 JS scrollIntoView 而非 <a href="#id">，避免在 createWebHashHistory
 * 模式下 hash fragment 被 Vue Router 误解析为路由路径导致重定向。
 */
function scrollToSection(event: Event, id: string): void {
  event.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 当前文档版本与最后更新时间（用于 GEO 信任信号与 AI 检索）
const DOC_VERSION = '0.1.0';
const LAST_UPDATED = '2026-09-01';

// Provider 分组：与 src-tauri list_providers() 顺序保持一致（国内优先）
interface ProviderGroup {
  key: 'cn' | 'foreign' | 'local';
  title: string;
  hint: string;
  items: { id: string; label: string; model: string; badge?: string }[];
}
const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    key: 'cn',
    title: '国内大模型（OpenAI 兼容接口）',
    hint: '默认推荐 · 首次打开设置面板即高亮',
    items: [
      { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', badge: '推荐' },
      { id: 'qwen', label: '通义千问（阿里云）', model: 'qwen-plus' },
      { id: 'zhipu', label: '智谱 GLM', model: 'glm-4-plus' },
      { id: 'moonshot', label: '月之暗面 Kimi', model: 'moonshot-v1-8k' },
      { id: 'doubao', label: '豆包（字节火山）', model: 'doubao-pro-32k' },
      { id: 'minimax', label: 'MiniMax', model: 'MiniMax-Text-01' },
    ],
  },
  {
    key: 'foreign',
    title: '海外大模型',
    hint: '面向海外用户 / 跨境场景',
    items: [
      { id: 'openai', label: 'OpenAI', model: 'gpt-4o' },
      { id: 'anthropic', label: 'Anthropic Claude', model: 'claude-3-5-sonnet-20241022' },
    ],
  },
  {
    key: 'local',
    title: '本地离线',
    hint: '无需 API Key · 数据不出本机',
    items: [{ id: 'ollama', label: 'Ollama', model: 'llama3.1', badge: '本地' }],
  },
];

// 常见问答（同时用于页面正文与 JSON-LD FAQPage 结构化数据）
const FAQS: { q: string; a: string }[] = [
  {
    q: 'OpenPaint 是什么？',
    a: 'OpenPaint 是一款开源、AI 原生的轻量级桌面设计工作台，基于 Tauri v2 + Rust + Vue 3 构建。它将像素级画布、AI 副驾驶与 OpenPencil 矢量右窗整合在同一窗口，可平替 Photoshop、Figma、Paint.NET 等商业设计软件。',
  },
  {
    q: '支持哪些大模型？',
    a: 'OpenPaint 内置 9 家 LLM Provider：国内优先 DeepSeek、通义千问（Qwen）、智谱 GLM、月之暗面 Kimi、字节豆包 Doubao、MiniMax；海外 OpenAI、Anthropic Claude；本地离线 Ollama。用户自配 API Key，调用不经 OpenPaint 中转。',
  },
  {
    q: '我的设计稿会上传到云端吗？',
    a: '不会。OpenPaint 默认本地优先：画布状态、图库元数据、设置都保存在本地 SQLite 与 ~/.openpaint/ 目录；AI 调用由你配置的 Key 直接发往所选 Provider，OpenPaint 不上传、不缓存画布或提示词。Ollama 模式下全部推理在本机完成。',
  },
  {
    q: 'OpenPencil 在 OpenPaint 里扮演什么角色？',
    a: 'OpenPencil 0.14（@open-pencil/vue SDK）作为右窗引擎嵌入，负责矢量编辑与 AI 图像生成。画布选区可一键送入 OpenPencil 微调，满意后回落到中央画布图层并自动归档图库。',
  },
  {
    q: '是免费的吗？',
    a: '是。OpenPaint 主体以 MIT 协议开源，可自由用于个人与商业项目；无任何订阅费或抽成。AI 调用由用户自配 Key 直连 Provider，对应厂商按其自家用量计费。',
  },
  {
    q: '支持哪些平台？',
    a: 'Windows 10/11（NSIS .exe 与 .msi），macOS 10.15+（.dmg），Linux Ubuntu 20.04+ / Fedora 36+（.deb / AppImage）。同时提供 Web 端预览，可在浏览器直接体验核心交互。',
  },
  {
    q: 'MCP 协议是什么意思？',
    a: 'MCP（Model Context Protocol）是 OpenPaint 内部工具调用的统一协议：所有画布交互、AI 生成、图库管理都注册为 MCP 工具，由 Hermes Agent 自主编排。这意味着后续第三方扩展也能无缝接入。',
  },
  {
    q: '如何贡献代码？',
    a: 'Fork 仓库 → pnpm install → pnpm tauri dev → 提交 PR。核心模块（画布、图库、AI 桥接、UI 组件）独立解耦，新功能建议先在 GitHub Discussions 立项再实现。',
  },
];
</script>

<template>
  <div class="landing">
    <header class="landing-header">
      <div class="landing-header__brand">
        <img src="/logo.svg" alt="OpenPaint" class="landing-header__logo" />
        <span class="landing-header__name">OpenPaint</span>
        <span class="landing-header__version" aria-label="当前版本号">v{{ DOC_VERSION }}</span>
      </div>
      <nav class="landing-header__nav" aria-label="主导航">
        <a href="#features" @click="scrollToSection($event, 'features')">核心特性</a>
        <a href="#compare" @click="scrollToSection($event, 'compare')">平替对比</a>
        <a href="#scenarios" @click="scrollToSection($event, 'scenarios')">使用场景</a>
        <a href="#providers" @click="scrollToSection($event, 'providers')">大模型</a>
        <a href="#architecture" @click="scrollToSection($event, 'architecture')">技术架构</a>
        <a href="#faq" @click="scrollToSection($event, 'faq')">常见问答</a>
        <a href="#download" @click="scrollToSection($event, 'download')">下载</a>
      </nav>
    </header>

    <main class="landing-main" itemscope itemtype="https://schema.org/SoftwareApplication">
      <meta itemprop="name" content="OpenPaint" />
      <meta itemprop="applicationCategory" content="DesignApplication" />
      <meta itemprop="operatingSystem" content="Windows, macOS, Linux" />
      <meta itemprop="softwareVersion" :content="DOC_VERSION" />
      <meta itemprop="dateModified" :content="LAST_UPDATED" />

      <!-- Hero -->
      <section class="hero" aria-labelledby="hero-title">
        <p class="hero__eyebrow">MIT 开源 · 跨平台桌面 · 本地优先 · v{{ DOC_VERSION }}</p>
        <h1 class="hero__title" id="hero-title">
          轻量设计工具，
          <br />
          为 AI 时代的创作者而生
        </h1>
        <p class="hero__desc">
          OpenPaint 是一款开源、AI 原生的桌面设计工作台。它把像素级画布、AI 副驾驶与
          <strong>OpenPencil 0.14 SDK</strong>
          整合在同一个窗口，9 家大模型随选，
          <strong>MCP 协议</strong>
          编排工具，本地优先、数据不出门。
        </p>
        <div class="hero__actions">
          <router-link to="/app" class="hero__cta hero__cta--primary">
            在线试用
            <ArrowRight :size="16" />
          </router-link>
          <a
            href="https://github.com/MatuX-ai/OpenPaint/releases"
            target="_blank"
            rel="noopener"
            class="hero__cta hero__cta--secondary"
          >
            <Download :size="16" />
            下载桌面版
          </a>
        </div>
        <p class="hero__meta">支持 Windows 10/11 · macOS 10.15+ · Ubuntu 20.04+ · Fedora 36+</p>
      </section>

      <!-- 信任条：用于 E-E-A-T 信任信号 -->
      <section class="trust" aria-label="项目指标">
        <div class="trust__item">
          <Star :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">MIT</div>
            <div class="trust__label">开源协议</div>
          </div>
        </div>
        <div class="trust__item">
          <Cpu :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">Tauri v2</div>
            <div class="trust__label">Rust + WebView</div>
          </div>
        </div>
        <div class="trust__item">
          <Layers3 :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">9 家</div>
            <div class="trust__label">LLM Provider</div>
          </div>
        </div>
        <div class="trust__item">
          <Puzzle :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">MCP</div>
            <div class="trust__label">插件协议</div>
          </div>
        </div>
        <div class="trust__item">
          <Shield :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">0</div>
            <div class="trust__label">数据外发</div>
          </div>
        </div>
        <div class="trust__item">
          <Zap :size="18" class="trust__icon" />
          <div>
            <div class="trust__num">4K+</div>
            <div class="trust__label">画布流畅</div>
          </div>
        </div>
      </section>

      <!-- 核心特性 -->
      <section id="features" class="features" aria-labelledby="features-title">
        <h2 class="section-title" id="features-title">核心特性</h2>
        <p class="section-subtitle">
          从画布到 AI 副驾驶，再到图库与导出，OpenPaint 把设计工作流收敛在同一个窗口里。
        </p>
        <div class="features__grid">
          <article class="feature-card">
            <div class="feature-card__icon">
              <Layers :size="20" />
            </div>
            <h3>中央画布</h3>
            <p>图层系统、蒙版、混合模式、无限历史，4K+ 画布依然流畅。GPU 加速渲染，秒开即用。</p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Bot :size="20" />
            </div>
            <h3>AI 副驾驶</h3>
            <p>右下角常驻对话面板，自然语言驱动 10+ 原子工具。未配置 LLM 时显示引导空状态。</p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Pencil :size="20" />
            </div>
            <h3>OpenPencil 右窗</h3>
            <p>
              真实集成
              <strong>@open-pencil/vue 0.14 SDK</strong>
              ，原生工具栏 + 矢量编辑 + AI 图像生成。
            </p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Library :size="20" />
            </div>
            <h3>智能图库</h3>
            <p>自动归档生成资产，SQLite + 标签索引，渐进式集成 LanceDB 语义召回。</p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Brush :size="20" />
            </div>
            <h3>批量导出</h3>
            <p>一次设计，一键生成 Web / iOS / Android / Favicon 全套图标，自动按平台归档。</p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Shield :size="20" />
            </div>
            <h3>模型自由</h3>
            <p>
              自配 API Key，9 家大模型随选：DeepSeek、通义千问、GLM、Kimi、豆包、MiniMax、
              OpenAI、Claude、Ollama。
            </p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Keyboard :size="20" />
            </div>
            <h3>完整快捷键</h3>
            <p>
              30+ 组合快捷键，文件 / 编辑 / 工具 / 视图 / 面板五大分组，按
              <kbd>?</kbd>
              唤起速查。
            </p>
          </article>
          <article class="feature-card">
            <div class="feature-card__icon">
              <Sparkles :size="20" />
            </div>
            <h3>首次启动引导</h3>
            <p>新建 / 打开 / 让 AI 来画 — 三选项引导卡让首次用户 30 秒内进入创作状态。</p>
          </article>
        </div>
      </section>

      <!-- 平替对比 -->
      <section id="compare" class="compare" aria-labelledby="compare-title">
        <h2 class="section-title" id="compare-title">可以平替哪些软件？</h2>
        <p class="section-subtitle">一个工具，覆盖像素编辑、矢量设计、AI 编排的完整工作流</p>

        <div class="compare__grid">
          <article class="compare-card">
            <div class="compare-card__header">
              <ImageIcon :size="22" />
              <h3>Photoshop 平替</h3>
            </div>
            <ul class="compare-card__list">
              <li>
                <Check :size="16" />
                图层、蒙版、混合模式
              </li>
              <li>
                <Check :size="16" />
                选区、画笔、橡皮擦
              </li>
              <li>
                <Check :size="16" />
                历史记录与撤销重做
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                对话式编辑（独有）
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                本地优先，零订阅费
              </li>
            </ul>
          </article>
          <article class="compare-card">
            <div class="compare-card__header">
              <Palette :size="22" />
              <h3>Figma 平替</h3>
            </div>
            <ul class="compare-card__list">
              <li>
                <Check :size="16" />
                矢量编辑与路径操作
              </li>
              <li>
                <Check :size="16" />
                组件化与资源管理
              </li>
              <li>
                <Check :size="16" />
                多尺寸批量导出
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                一键生成矢量稿（独有）
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                桌面原生，离线可用
              </li>
            </ul>
          </article>
          <article class="compare-card">
            <div class="compare-card__header">
              <Brush :size="22" />
              <h3>Paint.NET 平替</h3>
            </div>
            <ul class="compare-card__list">
              <li>
                <Check :size="16" />
                轻量启动，秒开即用
              </li>
              <li>
                <Check :size="16" />
                像素级精确编辑
              </li>
              <li>
                <Check :size="16" />
                插件扩展体系
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                智能体自主完成任务（独有）
              </li>
              <li>
                <ArrowRight :size="16" class="icon-accent" />
                跨平台 Win / Mac / Linux
              </li>
            </ul>
          </article>
        </div>

        <!-- GEO 友好的对比表 -->
        <div class="compare__table-wrap">
          <table class="compare__table" aria-label="OpenPaint 与主流设计工具的能力对比">
            <thead>
              <tr>
                <th scope="col">能力</th>
                <th scope="col">OpenPaint</th>
                <th scope="col">Photoshop</th>
                <th scope="col">Figma</th>
                <th scope="col">Paint.NET</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">许可证 / 价格</th>
                <td><strong>MIT 免费</strong></td>
                <td>订阅制</td>
                <td>免费 + 团队订阅</td>
                <td>免费（Windows）</td>
              </tr>
              <tr>
                <th scope="row">AI 副驾驶</th>
                <td><strong>内置 9 家 LLM</strong></td>
                <td>Firefly（独立）</td>
                <td>插件市场</td>
                <td>无</td>
              </tr>
              <tr>
                <th scope="row">本地优先 / 离线</th>
                <td><strong>是</strong></td>
                <td>否</td>
                <td>否（云端）</td>
                <td>是</td>
              </tr>
              <tr>
                <th scope="row">跨平台</th>
                <td><strong>Win / macOS / Linux</strong></td>
                <td>Win / macOS</td>
                <td>Web / macOS</td>
                <td>仅 Windows</td>
              </tr>
              <tr>
                <th scope="row">插件协议</th>
                <td><strong>MCP</strong></td>
                <td>CEP / UXP</td>
                <td>Plugin API</td>
                <td>PDN</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 差异化场景 -->
      <section id="scenarios" class="scenarios" aria-labelledby="scenarios-title">
        <h2 class="section-title" id="scenarios-title">不一样的使用场景</h2>
        <p class="section-subtitle">用自然语言与代码思维驱动设计，减少重复操作</p>
        <div class="scenarios__grid">
          <article class="scenario-card">
            <div class="scenario-card__tag">01 · Logo</div>
            <h3>快速生成 Logo 方案</h3>
            <p>
              描述想要的风格，AI 副驾驶调用 OpenPencil 生成矢量稿，落回画布后再手动微调，全程 3
              分钟。
            </p>
          </article>
          <article class="scenario-card">
            <div class="scenario-card__tag">02 · 图标</div>
            <h3>批量导出全平台图标</h3>
            <p>
              画好一个图标，通过指令自动生成 iOS、Android、Web、Favicon 所需全套尺寸，并按平台归档。
            </p>
          </article>
          <article class="scenario-card">
            <div class="scenario-card__tag">03 · 召回</div>
            <h3>语义召回历史资产</h3>
            <p>用自然语言描述要找的内容，图库通过向量搜索秒级定位，无需手动翻找文件夹。</p>
          </article>
          <article class="scenario-card">
            <div class="scenario-card__tag">04 · 离线</div>
            <h3>本地模型，数据不出门</h3>
            <p>对接本地 Ollama，所有推理在本机完成，设计稿和创意素材完全不上传任何云端。</p>
          </article>
        </div>
      </section>

      <!-- LLM Provider 分组 -->
      <section id="providers" class="providers" aria-labelledby="providers-title">
        <h2 class="section-title" id="providers-title">9 家大模型，随选随用</h2>
        <p class="section-subtitle">
          国内大模型优先曝光，开箱即用；海外与本地模型一个不少。自配 API Key，调用不经 OpenPaint
          中转。
        </p>

        <div class="providers__groups">
          <article
            v-for="group in PROVIDER_GROUPS"
            :key="group.key"
            class="providers__group"
            :data-region="group.key"
          >
            <header class="providers__group-head">
              <h3 class="providers__group-title">{{ group.title }}</h3>
              <span class="providers__group-hint">{{ group.hint }}</span>
            </header>
            <ul class="providers__list">
              <li
                v-for="p in group.items"
                :key="p.id"
                class="providers__chip"
                :class="{ 'is-recommended': !!p.badge }"
              >
                <span class="providers__chip-name">{{ p.label }}</span>
                <span class="providers__chip-model">{{ p.model }}</span>
                <span v-if="p.badge" class="providers__chip-badge">{{ p.badge }}</span>
              </li>
            </ul>
          </article>
        </div>

        <p class="providers__note">
          所有 Provider 走 OpenAI 兼容 Chat Completions 接口（Claude 走 Messages API），用户可在
          <code>~/.openpaint/config.yaml</code>
          中随时切换或自定义
          <code>base_url</code>
          。
        </p>
      </section>

      <!-- 技术架构 -->
      <section id="architecture" class="architecture" aria-labelledby="architecture-title">
        <h2 class="section-title" id="architecture-title">技术架构</h2>
        <p class="section-subtitle">基于 Tauri v2 + Rust + Vue 3 构建，轻量、安全、可扩展</p>
        <div class="architecture__diagram">
          <div class="arch-layer arch-layer--top">
            <div class="arch-layer__title">前端界面层</div>
            <div class="arch-layer__items">
              <span class="arch-chip">Vue 3</span>
              <span class="arch-chip">TypeScript</span>
              <span class="arch-chip">Pinia</span>
              <span class="arch-chip">Vite 5</span>
              <span class="arch-chip">CanvasKit WASM 0.39</span>
            </div>
          </div>
          <div class="arch-arrow" aria-hidden="true">⇅</div>
          <div class="arch-layer arch-layer--mid">
            <div class="arch-layer__title">桌面框架层</div>
            <div class="arch-layer__items">
              <span class="arch-chip arch-chip--accent">Tauri v2</span>
              <span class="arch-chip arch-chip--accent">WebView</span>
              <span class="arch-chip arch-chip--accent">最小权限 ACL</span>
              <span class="arch-chip arch-chip--accent">@open-pencil/vue 0.14</span>
            </div>
          </div>
          <div class="arch-arrow" aria-hidden="true">⇅</div>
          <div class="arch-layer arch-layer--bottom">
            <div class="arch-layer__title">Rust 后端层</div>
            <div class="arch-layer__items">
              <span class="arch-chip">Canvas Engine</span>
              <span class="arch-chip">Hermes Agent</span>
              <span class="arch-chip">MCP 协议</span>
              <span class="arch-chip">SQLite</span>
              <span class="arch-chip">LanceDB</span>
              <span class="arch-chip">LLM Bridge</span>
            </div>
          </div>
        </div>
        <div class="architecture__features">
          <article class="arch-feature">
            <Shield :size="18" />
            <div>
              <h4>安全沙箱</h4>
              <p>Tauri v2 capabilities + CSP 最小权限模型，仅暴露必要系统 API。</p>
            </div>
          </article>
          <article class="arch-feature">
            <Cpu :size="18" />
            <div>
              <h4>高性能画布</h4>
              <p>Rust 实现的画布引擎 + CanvasKit WASM，4K+ 图层依然流畅。</p>
            </div>
          </article>
          <article class="arch-feature">
            <Puzzle :size="18" />
            <div>
              <h4>插件化扩展</h4>
              <p>基于 MCP 协议，任何人都可以添加新工具，Hermes Agent 自主编排。</p>
            </div>
          </article>
          <article class="arch-feature">
            <Database :size="18" />
            <div>
              <h4>本地优先</h4>
              <p>SQLite + LanceDB，所有数据存本地，支持完全离线工作。</p>
            </div>
          </article>
        </div>
      </section>

      <!-- 使用流程 -->
      <section class="workflow" aria-labelledby="workflow-title">
        <h2 class="section-title" id="workflow-title">三步开始创作</h2>
        <div class="workflow__steps">
          <article class="workflow__step">
            <div class="workflow__number">1</div>
            <h3>描述需求</h3>
            <p>用文字描述你想要的设计，例如「设计一个蓝色科技风 Logo」。</p>
          </article>
          <div class="workflow__arrow" aria-hidden="true">→</div>
          <article class="workflow__step">
            <div class="workflow__number">2</div>
            <h3>生成与编辑</h3>
            <p>智能助理调用画布与 OpenPencil 生成素材，你随时框选微调。</p>
          </article>
          <div class="workflow__arrow" aria-hidden="true">→</div>
          <article class="workflow__step">
            <div class="workflow__number">3</div>
            <h3>导出归档</h3>
            <p>一键导出多尺寸资产并自动存入图库，方便下次语义召回复用。</p>
          </article>
        </div>
      </section>

      <!-- FAQ（GEO 关键：常见问答与机器可读答案） -->
      <section id="faq" class="faq" aria-labelledby="faq-title">
        <h2 class="section-title" id="faq-title">常见问答</h2>
        <p class="section-subtitle">
          关于 OpenPaint 的功能、隐私、平台、贡献 — 这里整理了最常被问到的问题。
        </p>
        <dl class="faq__list">
          <template v-for="(item, idx) in FAQS" :key="idx">
            <dt class="faq__q">{{ item.q }}</dt>
            <dd class="faq__a">{{ item.a }}</dd>
          </template>
        </dl>
      </section>

      <!-- 下载 -->
      <section id="download" class="download" aria-labelledby="download-title">
        <h2 class="section-title" id="download-title">获取 OpenPaint</h2>
        <p class="download__desc">
          桌面版提供完整画布、文件系统与本地能力；Web 预览可快速体验界面与交互。
        </p>
        <div class="download__actions">
          <router-link to="/app" class="hero__cta hero__cta--primary">在线试用</router-link>
          <a
            href="https://github.com/MatuX-ai/OpenPaint/releases"
            target="_blank"
            rel="noopener"
            class="hero__cta hero__cta--secondary"
          >
            <Github :size="16" />
            前往 Releases 下载
          </a>
        </div>
        <p class="download__hint">
          Windows · macOS · Linux 全平台原生安装包；源码构建见
          <a
            href="https://github.com/MatuX-ai/OpenPaint/blob/main/DEVELOPMENT.md"
            target="_blank"
            rel="noopener"
          >
            DEVELOPMENT.md
          </a>
          。
        </p>
      </section>
    </main>

    <!-- 底部 -->
    <footer class="landing-footer">
      <div class="landing-footer__inner">
        <div class="landing-footer__brand">
          <img src="/logo.svg" alt="OpenPaint" class="landing-footer__logo" />
          <span>OpenPaint</span>
          <p class="landing-footer__tagline">开源 AI 原生设计工作台</p>
          <p class="landing-footer__meta">v{{ DOC_VERSION }} · 更新于 {{ LAST_UPDATED }}</p>
        </div>
        <div class="landing-footer__cols">
          <div class="landing-footer__col">
            <h4>文档</h4>
            <ul>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint/blob/main/README.md"
                  target="_blank"
                  rel="noopener"
                >
                  <BookOpen :size="14" />
                  README
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint/blob/main/DEVELOPMENT.md"
                  target="_blank"
                  rel="noopener"
                >
                  <FileCode :size="14" />
                  开发指南
                </a>
              </li>
              <li>
                <a href="/llms.txt" target="_blank" rel="noopener">
                  <Bot :size="14" />
                  llms.txt（AI 摘要）
                </a>
              </li>
            </ul>
          </div>
          <div class="landing-footer__col">
            <h4>社区</h4>
            <ul>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint/discussions"
                  target="_blank"
                  rel="noopener"
                >
                  <MessageCircle :size="14" />
                  讨论区
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint/issues"
                  target="_blank"
                  rel="noopener"
                >
                  <HelpCircle :size="14" />
                  反馈问题
                </a>
              </li>
            </ul>
          </div>
          <div class="landing-footer__col">
            <h4>支持</h4>
            <ul>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint/wiki/FAQ"
                  target="_blank"
                  rel="noopener"
                >
                  <HelpCircle :size="14" />
                  Wiki FAQ
                </a>
              </li>
              <li>
                <a href="https://github.com/MatuX-ai/OpenPaint" target="_blank" rel="noopener">
                  <Heart :size="14" />
                  Star 我们
                </a>
              </li>
              <li>
                <a href="/sitemap.xml" target="_blank" rel="noopener">
                  <Globe :size="14" />
                  sitemap.xml
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="landing-footer__bottom">
        <p>© 2026 OpenPaint Contributors · MIT License · Made with Tauri + Rust + Vue 3</p>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.landing {
  min-height: 100%;
  overflow-y: auto;
  color: var(--text-primary);
  background: var(--bg-primary);
}

.landing-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  height: 60px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);

  &__brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  &__logo {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
  }

  &__name {
    font-size: var(--font-size-lg);
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  &__version {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    line-height: 1;
  }

  &__nav {
    display: flex;
    gap: var(--space-5);

    a {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
      text-decoration: none;
      transition: color var(--transition-fast);

      &:hover {
        color: var(--text-primary);
      }
    }
  }
}

.landing-main {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-16) var(--space-6);
}

.hero {
  text-align: center;
  padding: var(--space-12) 0 var(--space-10);

  &__eyebrow {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    letter-spacing: 0.05em;
    font-family: var(--font-family-mono);
  }

  &__title {
    font-size: clamp(40px, 8vw, 64px);
    font-weight: 700;
    line-height: 1.05;
    margin: 0 0 var(--space-6);
    letter-spacing: -0.04em;
  }

  &__desc {
    max-width: 620px;
    margin: 0 auto var(--space-8);
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    line-height: 1.6;

    strong {
      color: var(--text-primary);
      font-weight: 600;
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
  }

  &__cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius);
    font-size: var(--font-size-base);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);

    &--primary {
      color: #fff;
      background: var(--accent);
      border: 1px solid var(--accent);

      &:hover {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
      }
    }

    &--secondary {
      color: var(--text-primary);
      background: transparent;
      border: 1px solid var(--border-color);

      &:hover {
        background: var(--bg-secondary);
      }
    }
  }

  &__meta {
    margin: var(--space-5) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
}

/* 信任条 */
.trust {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-3);
  padding: var(--space-5) 0 var(--space-12);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  margin: var(--space-6) 0 var(--space-8);

  &__item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    text-align: left;
  }

  &__icon {
    color: var(--text-primary);
    flex-shrink: 0;
  }

  &__num {
    font-size: var(--font-size-base);
    font-weight: 700;
    line-height: 1.2;
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.2;
  }
}

.section-title {
  text-align: center;
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.section-subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin: 0 auto var(--space-8);
  max-width: 560px;
  font-size: var(--font-size-base);
  line-height: 1.6;
}

.features {
  padding: var(--space-12) 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-3);
  }
}

.feature-card {
  padding: var(--space-5);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  transition: border-color var(--transition-fast);

  &:hover {
    border-color: var(--text-muted);
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-bottom: var(--space-4);
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  h3 {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0 0 var(--space-1);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: var(--font-size-sm);

    strong {
      color: var(--text-primary);
      font-weight: 600;
    }
  }

  kbd {
    display: inline-flex;
    align-items: center;
    padding: 0 5px;
    font-family: var(--font-family-mono);
    font-size: 11px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-bottom-width: 2px;
    border-radius: 3px;
  }
}

/* 平替对比 */
.compare {
  padding: var(--space-12) 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-8);
  }

  &__table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
  }

  &__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);

    th,
    td {
      padding: var(--space-3) var(--space-4);
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    thead th {
      font-weight: 600;
      color: var(--text-muted);
      background: var(--bg-secondary);
      font-size: var(--font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tbody th {
      font-weight: 500;
      color: var(--text-secondary);
      background: transparent;
    }

    tbody td {
      color: var(--text-secondary);
    }

    tbody tr:last-child th,
    tbody tr:last-child td {
      border-bottom: 0;
    }

    strong {
      color: var(--text-primary);
      font-weight: 600;
    }
  }
}

.compare-card {
  padding: var(--space-5);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);

  &__header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--border-color);

    h3 {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: 600;
    }

    svg {
      color: var(--text-primary);
    }
  }

  &__list {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-1) 0;
      color: var(--text-secondary);
      font-size: var(--font-size-sm);

      svg:first-child {
        color: var(--text-primary);
        flex-shrink: 0;
      }

      .icon-accent {
        color: var(--text-primary);
      }
    }
  }
}

/* 差异化场景 */
.scenarios {
  padding: var(--space-12) 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-3);
  }
}

.scenario-card {
  padding: var(--space-5);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  transition: border-color var(--transition-fast);

  &:hover {
    border-color: var(--text-muted);
  }

  &__tag {
    display: inline-block;
    margin-bottom: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    letter-spacing: 0.05em;
    font-family: var(--font-family-mono);
  }

  h3 {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: var(--font-size-sm);
  }
}

/* LLM Provider 分组 */
.providers {
  padding: var(--space-12) 0;

  &__groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  &__group {
    padding: var(--space-5);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    background: transparent;

    &[data-region='cn'] {
      // 国内大模型组用一道细圈提升优先感
      border-color: rgba(214, 51, 108, 0.45);
      background: rgba(214, 51, 108, 0.03);
    }
  }

  &__group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }

  &__group-title {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;

    [data-region='cn'] & {
      color: #d6336c;
    }
  }

  &__group-hint {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  &__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2);
  }

  &__chip {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);

    &.is-recommended {
      border-color: rgba(214, 51, 108, 0.4);
    }
  }

  &__chip-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  &__chip-model {
    flex: 1;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chip-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(214, 51, 108, 0.15);
    color: #d6336c;
    letter-spacing: 0.05em;
    line-height: 1.4;
  }

  &__note {
    margin: var(--space-5) 0 0;
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--text-muted);

    code {
      font-family: var(--font-family-mono);
      padding: 1px 5px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      font-size: 12px;
    }
  }
}

/* 技术架构 */
.architecture {
  padding: var(--space-12) 0;

  &__diagram {
    max-width: 640px;
    margin: 0 auto var(--space-8);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  &__features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-3);
  }
}

.arch-layer {
  width: 100%;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  text-align: center;
  background: var(--bg-secondary);

  &__title {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__items {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }
}

.arch-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);

  &--accent {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }
}

.arch-arrow {
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
}

.arch-feature {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);

  svg {
    flex-shrink: 0;
    color: var(--text-primary);
    margin-top: 2px;
  }

  h4 {
    margin: 0 0 var(--space-1);
    font-size: var(--font-size-base);
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }
}

/* 使用流程 */
.workflow {
  padding: var(--space-12) 0;

  &__steps {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  &__step {
    flex: 1 1 240px;
    max-width: 300px;
    padding: var(--space-5);
    text-align: center;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
  }

  &__number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin-bottom: var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
  }

  h3 {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: var(--font-size-sm);
  }

  &__arrow {
    display: flex;
    align-items: center;
    color: var(--text-muted);
    font-size: 20px;
  }
}

/* FAQ */
.faq {
  padding: var(--space-12) 0;

  &__list {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid var(--border-color);
  }

  &__q {
    margin: 0;
    padding: var(--space-4) var(--space-2);
    font-weight: 600;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);
    cursor: default;
  }

  &__a {
    margin: 0;
    padding: 0 var(--space-2) var(--space-4);
    color: var(--text-secondary);
    line-height: 1.7;
    font-size: var(--font-size-sm);
    border-bottom: 1px solid var(--border-color);
  }
}

/* 下载 */
.download {
  padding: var(--space-12) 0;
  text-align: center;

  &__desc {
    max-width: 480px;
    margin: 0 auto var(--space-6);
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }

  &__hint {
    max-width: 540px;
    margin: var(--space-5) auto 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);

    a {
      color: var(--text-secondary);
      text-decoration: underline;
      text-underline-offset: 2px;

      &:hover {
        color: var(--text-primary);
      }
    }
  }
}

/* 底部 */
.landing-footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);

  &__inner {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-6) var(--space-8);
    display: grid;
    grid-template-columns: 1.5fr 2fr;
    gap: var(--space-10);
  }

  &__brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    img {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
    }

    span {
      font-size: var(--font-size-base);
      font-weight: 600;
    }
  }

  &__tagline {
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  &__meta {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
  }

  &__cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
  }

  &__col {
    h4 {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        margin-bottom: var(--space-2);

        a {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--text-secondary);
          text-decoration: none;
          font-size: var(--font-size-sm);
          transition: color var(--transition-fast);

          &:hover {
            color: var(--text-primary);
          }
        }
      }
    }
  }

  &__bottom {
    padding: var(--space-3) var(--space-6);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    border-top: 1px solid var(--border-color);

    p {
      margin: 0;
    }
  }
}

@media (max-width: 900px) {
  .trust {
    grid-template-columns: repeat(3, 1fr);

    &__item:nth-child(n + 4) {
      border-top: 1px solid var(--border-color);
      padding-top: var(--space-3);
    }
  }
}

@media (max-width: 768px) {
  .landing-header__nav {
    display: none;
  }

  .workflow__arrow {
    display: none;
  }

  .landing-footer__inner {
    grid-template-columns: 1fr;
    gap: var(--space-8);
  }

  .landing-footer__cols {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 600px) {
  .trust {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);

    &__item {
      justify-content: flex-start;
    }
  }
}

@media (max-width: 480px) {
  .landing-footer__cols {
    grid-template-columns: 1fr;
  }
}
</style>
