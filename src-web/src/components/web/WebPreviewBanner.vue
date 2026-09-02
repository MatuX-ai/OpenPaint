<!--
  WebPreviewBanner — W12 VDP-WEB-01。

  当 `isTauri()` 返回 false 时（即运行在普通浏览器 SPA / Vercel 预览），
  在 /app 顶部展示一条横幅：
  1. 告知用户当前是 Web 预览模式，部分功能降级
  2. 提供「下载桌面版」CTA 跳 GitHub Releases
  3. 提供「了解桌面版优势」CTA 跳回 /
  4. 提供关闭按钮（持久化到 localStorage，避免重复打扰）
-->

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Globe, Download, ArrowRight, X as CloseIcon } from 'lucide-vue-next';
import { isTauri } from '@api/runtime';
import { STORAGE_KEY } from './webPreviewBannerStorage';

/**
 * 桌面版下载链接。保持 GitHub Releases 单一来源，
 * 与 README、LandingView 的 download 入口一致。
 */
const DESKTOP_DOWNLOAD_URL =
  'https://github.com/MatuX-ai/OpenPaint/releases';

const visible = ref(false);

onMounted(() => {
  if (isTauri()) return;
  if (typeof window === 'undefined') return;
  try {
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === '1';
    if (!dismissed) visible.value = true;
  } catch {
    // localStorage 不可用（隐私模式 / SSR），仍允许展示横幅
    visible.value = true;
  }
});

const ariaLabel = computed(() =>
  'Web 预览模式提示：当前为浏览器端演示，画笔 / 文件 / 剪贴板功能不可用，推荐下载桌面端体验完整能力',
);

function dismiss() {
  visible.value = false;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  } catch {
    // 静默：localStorage 写入失败不影响关闭效果
  }
}

function trackDownloadClick() {
  // 这里仅做 console 占位，未来可接 analytics
  // eslint-disable-next-line no-console
  console.info('[web-preview] user clicked download desktop');
}
</script>

<template>
  <div
    v-if="visible"
    class="web-preview-banner"
    role="status"
    :aria-label="ariaLabel"
    data-testid="web-preview-banner"
  >
    <Globe :size="16" class="web-preview-banner__icon" aria-hidden="true" />
    <div class="web-preview-banner__body">
      <strong class="web-preview-banner__title">
        Web 预览模式
        <span class="web-preview-banner__sub">Web preview · recommended: download desktop</span>
      </strong>
      <span class="web-preview-banner__hint">
        画笔 / 文件 / 剪贴板 等系统能力不可用，<a
          href="/"
          class="web-preview-banner__link"
          data-testid="web-preview-banner-learn"
          >了解桌面版优势</a
        >
      </span>
    </div>
    <div class="web-preview-banner__actions">
      <a
        :href="DESKTOP_DOWNLOAD_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="web-preview-banner__cta"
        data-testid="web-preview-banner-download"
        @click="trackDownloadClick"
      >
        <Download :size="14" />
        <span>下载桌面版</span>
        <ArrowRight :size="12" />
      </a>
      <button
        type="button"
        class="web-preview-banner__close"
        aria-label="关闭横幅"
        data-testid="web-preview-banner-close"
        @click="dismiss"
      >
        <CloseIcon :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.web-preview-banner {
  position: relative;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px 16px;
  color: #1f2937;
  background: linear-gradient(90deg, #fef3c7 0%, #fde68a 60%, #fcd34d 100%);
  border-bottom: 1px solid #f59e0b;
  font-size: var(--font-size-sm);
  line-height: 1.4;
  box-shadow: 0 1px 0 rgba(245, 158, 11, 0.15);

  &__icon {
    color: #b45309;
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-weight: 600;
    color: #78350f;
  }

  &__sub {
    font-weight: 400;
    font-size: 12px;
    color: #92400e;
    opacity: 0.8;
  }

  &__hint {
    color: #78350f;
    font-size: 12px;
  }

  &__link {
    color: #78350f;
    text-decoration: underline;
    text-underline-offset: 2px;
    font-weight: 500;

    &:hover {
      color: #422006;
    }
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  &__cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    color: #fff;
    background: #b45309;
    border: 1px solid #92400e;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-decoration: none;
    transition:
      background var(--transition-fast),
      transform var(--transition-fast);

    &:hover {
      background: #92400e;
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 1px;
    }
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: #78350f;
    background: transparent;
    border: 1px solid rgba(120, 53, 15, 0.3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &:hover {
      color: #fff;
      background: #78350f;
      border-color: #78350f;
    }

    &:focus-visible {
      outline: 2px solid #78350f;
      outline-offset: 1px;
    }
  }
}

@media (max-width: 640px) {
  .web-preview-banner {
    flex-wrap: wrap;
    padding: 8px 12px;

    &__title {
      font-size: var(--font-size-sm);
    }

    &__cta {
      padding: 5px 10px;
    }
  }
}
</style>