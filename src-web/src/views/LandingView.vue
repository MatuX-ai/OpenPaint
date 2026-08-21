<!--
  OpenPaint 产品推荐说明页（营销首页）。
  - 向访客介绍产品价值、平替软件、差异化场景、技术架构
  - 提供「在线试用」与「下载桌面版」两个主要入口
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
</script>

<template>
  <div class="landing">
    <header class="landing-header">
      <div class="landing-header__brand">
        <img
          src="/logo.svg"
          alt="OpenPaint"
          class="landing-header__logo"
        >
        <span class="landing-header__name">OpenPaint</span>
      </div>
      <nav class="landing-header__nav">
        <a
          href="#features"
          @click="scrollToSection($event, 'features')"
        >核心功能</a>
        <a
          href="#compare"
          @click="scrollToSection($event, 'compare')"
        >平替对比</a>
        <a
          href="#scenarios"
          @click="scrollToSection($event, 'scenarios')"
        >使用场景</a>
        <a
          href="#architecture"
          @click="scrollToSection($event, 'architecture')"
        >技术架构</a>
        <a
          href="#download"
          @click="scrollToSection($event, 'download')"
        >下载</a>
      </nav>
    </header>

    <main class="landing-main">
      <!-- Hero -->
      <section class="hero">
        <p class="hero__eyebrow">
          开源 · 跨平台 · 本地优先
        </p>
        <h1 class="hero__title">
          轻量设计工具，<br>
          为创作者而生
        </h1>
        <p class="hero__desc">
          OpenPaint 是一款开源的像素级设计工作台，融合画布编辑与 AI 辅助能力。
          轻量、快速、可扩展，让你专注于创作本身。
        </p>
        <div class="hero__actions">
          <router-link
            to="/app"
            class="hero__cta hero__cta--primary"
          >
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
      </section>

      <!-- 核心特性 -->
      <section
        id="features"
        class="features"
      >
        <h2 class="section-title">
          核心特性
        </h2>
        <div class="features__grid">
          <div class="feature-card">
            <div class="feature-card__icon">
              <Layers :size="20" />
            </div>
            <h3>中央画布</h3>
            <p>图层系统、蒙版与混合模式，流畅处理 4K+ 画布。</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">
              <Bot :size="20" />
            </div>
            <h3>智能助理</h3>
            <p>常驻对话面板，可调用工具完成设计任务。</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">
              <Pencil :size="20" />
            </div>
            <h3>视觉引擎</h3>
            <p>右窗集成 OpenPencil，支持矢量编辑与图像生成。</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">
              <Library :size="20" />
            </div>
            <h3>智能图库</h3>
            <p>自动归档生成资产，支持标签索引与语义搜索。</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">
              <Brush :size="20" />
            </div>
            <h3>批量导出</h3>
            <p>一次设计，一键生成 Web / iOS / Android 全套图标。</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">
              <Shield :size="20" />
            </div>
            <h3>模型自由</h3>
            <p>自配 API Key，支持 OpenAI、Claude、DeepSeek、本地 Ollama。</p>
          </div>
        </div>
      </section>

      <!-- 平替对比 -->
      <section
        id="compare"
        class="compare"
      >
        <h2 class="section-title">
          可以平替哪些软件？
        </h2>
        <p class="section-subtitle">
          一个工具，覆盖像素编辑、矢量设计、代码驱动的完整工作流
        </p>
        <div class="compare__grid">
          <div class="compare-card">
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
          </div>
          <div class="compare-card">
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
          </div>
          <div class="compare-card">
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
          </div>
        </div>
      </section>

      <!-- 差异化场景 -->
      <section
        id="scenarios"
        class="scenarios"
      >
        <h2 class="section-title">
          不一样的使用场景
        </h2>
        <p class="section-subtitle">
          用自然语言与代码思维驱动设计，减少重复操作
        </p>
        <div class="scenarios__grid">
          <div class="scenario-card">
            <div class="scenario-card__tag">01</div>
            <h3>快速生成 Logo 方案</h3>
            <p>
              描述想要的风格，智能助理调用 OpenPencil 生成矢量稿，
              落回画布后再手动微调。
            </p>
          </div>
          <div class="scenario-card">
            <div class="scenario-card__tag">02</div>
            <h3>批量导出全平台图标</h3>
            <p>
              画好一个图标，通过指令自动生成 iOS、Android、Web 所需的全套尺寸，
              并按平台归档。
            </p>
          </div>
          <div class="scenario-card">
            <div class="scenario-card__tag">03</div>
            <h3>语义召回历史资产</h3>
            <p>
              用自然语言描述要找的内容，图库通过向量搜索秒级定位，
              无需手动翻找文件夹。
            </p>
          </div>
          <div class="scenario-card">
            <div class="scenario-card__tag">04</div>
            <h3>本地模型，数据不出门</h3>
            <p>
              对接本地 Ollama，所有推理在本机完成，
              设计稿和创意素材完全不上传。
            </p>
          </div>
        </div>
      </section>

      <!-- 技术架构 -->
      <section
        id="architecture"
        class="architecture"
      >
        <h2 class="section-title">
          技术架构
        </h2>
        <p class="section-subtitle">
          基于 Tauri + Rust + Vue 3 构建，轻量、安全、可扩展
        </p>
        <div class="architecture__diagram">
          <div class="arch-layer arch-layer--top">
            <div class="arch-layer__title">前端界面层</div>
            <div class="arch-layer__items">
              <span class="arch-chip">Vue 3</span>
              <span class="arch-chip">TypeScript</span>
              <span class="arch-chip">Pinia</span>
              <span class="arch-chip">Vite</span>
            </div>
          </div>
          <div class="arch-arrow" aria-hidden="true">⇅</div>
          <div class="arch-layer arch-layer--mid">
            <div class="arch-layer__title">桌面框架层</div>
            <div class="arch-layer__items">
              <span class="arch-chip arch-chip--accent">Tauri v2</span>
              <span class="arch-chip arch-chip--accent">WebView</span>
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
            </div>
          </div>
        </div>
        <div class="architecture__features">
          <div class="arch-feature">
            <Shield :size="18" />
            <div>
              <h4>安全沙箱</h4>
              <p>Tauri 最小权限模型，仅暴露必要的系统 API。</p>
            </div>
          </div>
          <div class="arch-feature">
            <Cpu :size="18" />
            <div>
              <h4>高性能画布</h4>
              <p>Rust 实现的画布引擎，4K 图层依然流畅。</p>
            </div>
          </div>
          <div class="arch-feature">
            <Puzzle :size="18" />
            <div>
              <h4>插件化扩展</h4>
              <p>基于 MCP 协议，任何人都可以添加新工具。</p>
            </div>
          </div>
          <div class="arch-feature">
            <Database :size="18" />
            <div>
              <h4>本地优先</h4>
              <p>SQLite + LanceDB，数据全在本地，支持离线使用。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 使用流程 -->
      <section class="workflow">
        <h2 class="section-title">
          三步开始创作
        </h2>
        <div class="workflow__steps">
          <div class="workflow__step">
            <div class="workflow__number">
              1
            </div>
            <h3>描述需求</h3>
            <p>用文字描述你想要的设计，例如「设计一个蓝色科技风 Logo」。</p>
          </div>
          <div
            class="workflow__arrow"
            aria-hidden="true"
          >
            →
          </div>
          <div class="workflow__step">
            <div class="workflow__number">
              2
            </div>
            <h3>生成与编辑</h3>
            <p>智能助理调用画布与 OpenPencil 生成素材，你随时框选微调。</p>
          </div>
          <div
            class="workflow__arrow"
            aria-hidden="true"
          >
            →
          </div>
          <div class="workflow__step">
            <div class="workflow__number">
              3
            </div>
            <h3>导出归档</h3>
            <p>一键导出多尺寸资产并自动存入图库，方便下次语义召回复用。</p>
          </div>
        </div>
      </section>

      <!-- 下载 -->
      <section
        id="download"
        class="download"
      >
        <h2 class="section-title">
          获取 OpenPaint
        </h2>
        <p class="download__desc">
          桌面版提供完整画布、文件系统与本地能力；Web 预览可快速体验界面与交互。
        </p>
        <div class="download__actions">
          <router-link
            to="/app"
            class="hero__cta hero__cta--primary"
          >
            在线试用
          </router-link>
          <a
            href="https://github.com/MatuX-ai/OpenPaint/releases"
            target="_blank"
            rel="noopener"
            class="hero__cta hero__cta--secondary"
          >
            前往 Releases 下载
          </a>
        </div>
      </section>
    </main>

    <!-- 底部 -->
    <footer class="landing-footer">
      <div class="landing-footer__inner">
        <div class="landing-footer__brand">
          <img
            src="/logo.svg"
            alt="OpenPaint"
            class="landing-footer__logo"
          >
          <span>OpenPaint</span>
          <p class="landing-footer__tagline">
            开源设计工作台
          </p>
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
                  常见问题
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/MatuX-ai/OpenPaint"
                  target="_blank"
                  rel="noopener"
                >
                  <BookOpen :size="14" />
                  GitHub 仓库
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="landing-footer__bottom">
        <p>© 2026 OpenPaint · MIT License</p>
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
    font-size: var(--font-size-base);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  &__nav {
    display: flex;
    gap: var(--space-6);

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
  padding: var(--space-16) 0 var(--space-12);

  &__eyebrow {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  &__title {
    font-size: clamp(40px, 8vw, 64px);
    font-weight: 700;
    line-height: 1.05;
    margin: 0 0 var(--space-6);
    letter-spacing: -0.04em;
  }

  &__desc {
    max-width: 540px;
    margin: 0 auto var(--space-8);
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    line-height: 1.6;
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
      background: var(--text-primary);
      border: 1px solid var(--text-primary);

      &:hover {
        background: var(--text-secondary);
        border-color: var(--text-secondary);
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
  max-width: 480px;
  font-size: var(--font-size-base);
  line-height: 1.6;
}

.features {
  padding: var(--space-16) 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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
  }
}

/* 平替对比 */
.compare {
  padding: var(--space-16) 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-3);
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
  padding: var(--space-16) 0;

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

/* 技术架构 */
.architecture {
  padding: var(--space-16) 0;

  &__diagram {
    max-width: 560px;
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
  padding: var(--space-16) 0;

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

/* 下载 */
.download {
  padding: var(--space-16) 0;
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
}

/* 底部 */
.landing-footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);

  &__inner {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-6) var(--space-8);
    display: grid;
    grid-template-columns: 1.5fr 2fr;
    gap: var(--space-12);
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

@media (max-width: 480px) {
  .landing-footer__cols {
    grid-template-columns: 1fr;
  }
}
</style>
