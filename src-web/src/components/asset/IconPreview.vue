<!--
  IconPreview.vue — 单个图标预览（W9）

  显示大尺寸 SVG + 名称 + category + tags。
  - 关闭时通过 `@close` 通知父组件
  - 插入画布通过 `@insert` 触发父组件的 `importIconToCanvas`

  Acceptance: US-AST-1 预览浮窗
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { IconMeta } from '@/types/asset';

const props = defineProps<{
  icon: IconMeta;
  svg: string | null;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'insert', icon: IconMeta): void;
}>();

const title = computed(() => `${props.icon.prefix}/${props.icon.name}`);
const tagsText = computed(() => props.icon.tags.join(' · '));
</script>

<template>
  <div
    class="icon-preview"
    role="dialog"
    aria-modal="true"
    :aria-label="`图标预览 ${title}`"
  >
    <div class="icon-preview__backdrop" @click="emit('close')"></div>
    <div class="icon-preview__panel">
      <header class="icon-preview__header">
        <h2 class="icon-preview__title">{{ title }}</h2>
        <button
          type="button"
          class="icon-preview__close"
          aria-label="关闭预览"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="icon-preview__body">
        <div class="icon-preview__canvas" aria-hidden="true">
          <span v-if="props.loading" class="icon-preview__loading">加载中…</span>
          <span v-else-if="props.error" class="icon-preview__error">
            {{ props.error }}
          </span>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-else-if="props.svg" class="icon-preview__svg" v-html="props.svg"></div>
          <span v-else class="icon-preview__placeholder">—</span>
        </div>

        <dl class="icon-preview__meta">
          <dt>分类</dt>
          <dd>{{ props.icon.category || '—' }}</dd>
          <dt>标签</dt>
          <dd>{{ tagsText || '—' }}</dd>
        </dl>
      </div>

      <footer class="icon-preview__actions">
        <button
          type="button"
          class="icon-preview__btn icon-preview__btn--secondary"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="icon-preview__btn icon-preview__btn--primary"
          :disabled="props.loading || !props.svg"
          @click="emit('insert', props.icon)"
        >
          插入画布
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.icon-preview {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;

  &__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
  }

  &__panel {
    position: relative;
    z-index: 1;
    width: 320px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  &__close {
    width: 24px;
    height: 24px;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 18px;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    background: var(--bg-primary);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--accent);
  }

  &__svg {
    display: inline-flex;

    :deep(svg) {
      width: 96px;
      height: 96px;
    }
  }

  &__loading,
  &__error,
  &__placeholder {
    font-size: 12px;
    color: var(--text-muted);
  }

  &__error {
    color: var(--error);
  }

  &__meta {
    margin: 0;
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: var(--space-1);
    font-size: 12px;

    dt {
      color: var(--text-muted);
    }

    dd {
      margin: 0;
      color: var(--text-primary);
      word-break: break-all;
    }
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  &__btn {
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);

    &--secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);

      &:hover {
        background: var(--bg-hover);
      }
    }

    &--primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);

      &:hover:not(:disabled) {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}
</style>