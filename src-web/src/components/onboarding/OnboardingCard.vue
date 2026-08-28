<!--
  OnboardingCard — 首次启动引导卡（US-1）。
  三选项：新建 / 打开本地 / 让 AI 帮忙画。
  显示条件由 useOnboarding().shouldShowMainCard 控制。

  关联需求：docs/ux-onboarding-requirements.md US-1、§5.1。
-->

<script setup lang="ts">
import { Plus, FolderOpen, Sparkles } from 'lucide-vue-next';
import { useOnboarding } from '@composables/useOnboarding';

const emit = defineEmits<{
  (e: 'new'): void;
  (e: 'open'): void;
  (e: 'ai'): void;
}>();

const onboarding = useOnboarding();

function pick(action: 'new' | 'open' | 'ai'): void {
  onboarding.markCompleted();
  if (action === 'new') emit('new');
  else if (action === 'open') emit('open');
  else emit('ai');
}
</script>

<template>
  <div class="onboarding" role="region" aria-label="首次启动引导">
    <div class="onboarding__card">
      <div class="onboarding__hero">
        <div class="onboarding__emoji" aria-hidden="true">🎨</div>
        <h2 class="onboarding__title">从一张画布开始</h2>
        <p class="onboarding__subtitle">选个尺寸开始，或让 AI 帮你定</p>
      </div>

      <div class="onboarding__actions">
        <button
          type="button"
          class="onboarding__action"
          aria-label="新建画布"
          @click="pick('new')"
        >
          <Plus :size="20" />
          <div class="onboarding__action-title">新建</div>
          <div class="onboarding__action-desc">1080×1080 等预设</div>
        </button>

        <button
          type="button"
          class="onboarding__action"
          aria-label="打开本地图片"
          @click="pick('open')"
        >
          <FolderOpen :size="20" />
          <div class="onboarding__action-title">打开</div>
          <div class="onboarding__action-desc">PNG / JPG / WebP / SVG</div>
        </button>

        <button
          type="button"
          class="onboarding__action onboarding__action--accent"
          aria-label="让 AI 帮我画"
          @click="pick('ai')"
        >
          <Sparkles :size="20" />
          <div class="onboarding__action-title">让 AI 来画</div>
          <div class="onboarding__action-desc">描述你想要的设计</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.onboarding {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;

  &__card {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 560px;
    padding: var(--space-8);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  &__hero {
    text-align: center;
  }

  &__emoji {
    font-size: 36px;
    margin-bottom: var(--space-3);
  }

  &__title {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-xl);
    font-weight: 600;
  }

  &__subtitle {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  &__actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  &__action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    color: var(--text-primary);
    transition: border-color var(--transition-fast);

    &:hover {
      border-color: var(--accent);
    }

    &--accent {
      background: var(--accent-light);
      border-color: var(--accent);
      color: var(--accent);
    }
  }

  &__action-title {
    font-size: var(--font-size-base);
    font-weight: 600;
  }

  &__action-desc {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>
