<!--
  TopBar — 标题栏 + 全局操作。
  - 左侧：Logo + 应用名
  - 中间：当前文件名 + 未保存指示器
  - 右侧：撤销/重做 · 保存 · OpenPencil/图库切换 · 设置

  关联需求：docs/ux-onboarding-requirements.md §2.2 标题栏、US-4。
-->

<script setup lang="ts">
import { computed } from 'vue';
import { Undo2, Redo2, Library, Sparkles, Settings, Save, Loader2 } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useUIStore } from '@stores/uiStore';
import { useDocumentState } from '@composables/useDocumentState';
import { useFileActions } from '@composables/useFileActions';
import { useMenuActions } from '@composables/useMenuActions';

const canvasStore = useCanvasStore();
const uiStore = useUIStore();
const doc = useDocumentState();
const files = useFileActions();
const menu = useMenuActions();

const indicatorLabel = computed(() => {
  switch (doc.indicator.value) {
    case 'dirty':
      return '已修改';
    case 'saving':
      return '保存中…';
    case 'saved':
      return '已保存';
    case 'exported':
      return '已导出';
    default:
      return '';
  }
});

const indicatorClass = computed(() => `top-bar__file--${doc.indicator.value}`);

function togglePanel(mode: 'openpencil' | 'gallery') {
  uiStore.switchRightPanel(uiStore.rightPanelMode === mode ? 'none' : mode);
}

async function onUndo() {
  await files.undo();
}
async function onRedo() {
  await files.redo();
}
async function onSave() {
  void files.saveToGallery([]);
  void menu.dispatch('file.save');
}
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__brand">
      <img src="/logo.svg" alt="OpenPaint" class="top-bar__logo" />
      <span class="top-bar__title">OpenPaint</span>
      <span class="top-bar__stage">MVP</span>
    </div>

    <div class="top-bar__file" :class="indicatorClass" aria-live="polite">
      <span class="top-bar__filename" :title="doc.fileName.value">{{ doc.fileName.value }}</span>
      <span v-if="indicatorLabel" class="top-bar__file-state">
        <template v-if="doc.isSaving.value">
          <Loader2 :size="12" class="top-bar__spinner" />
        </template>
        <template v-else-if="doc.indicator.value === 'dirty'">
          <span class="top-bar__dot" />
        </template>
        {{ indicatorLabel }}
      </span>
    </div>

    <div class="top-bar__actions">
      <button
        class="top-bar__btn"
        type="button"
        title="撤销 (Ctrl+Z)"
        aria-label="撤销"
        :disabled="!canvasStore.canUndo"
        @click="onUndo"
      >
        <Undo2 :size="16" />
      </button>
      <button
        class="top-bar__btn"
        type="button"
        title="重做 (Ctrl+Shift+Z)"
        aria-label="重做"
        :disabled="!canvasStore.canRedo"
        @click="onRedo"
      >
        <Redo2 :size="16" />
      </button>

      <span class="top-bar__divider" />

      <button
        class="top-bar__btn top-bar__btn--save"
        :class="{ 'is-dirty': doc.isDirty.value }"
        type="button"
        :title="doc.isDirty.value ? `保存到图库 (Ctrl+S) · 有未保存改动` : '已保存到图库'"
        :aria-label="doc.isDirty.value ? '保存到图库（有未保存改动）' : '保存到图库'"
        :disabled="doc.isSaving.value"
        @click="onSave"
      >
        <Loader2 v-if="doc.isSaving.value" :size="16" class="top-bar__spinner" />
        <Save v-else :size="16" />
        <span v-if="doc.isDirty.value" class="top-bar__dirty-dot" aria-hidden="true" />
      </button>

      <span class="top-bar__divider" />

      <button
        class="top-bar__btn"
        type="button"
        :class="{ 'is-active': uiStore.rightPanelMode === 'openpencil' }"
        title="OpenPencil 右窗 (Ctrl+Alt+P)"
        aria-label="OpenPencil 右窗"
        @click="togglePanel('openpencil')"
      >
        <Sparkles :size="16" />
      </button>
      <button
        class="top-bar__btn"
        type="button"
        :class="{ 'is-active': uiStore.rightPanelMode === 'gallery' }"
        title="图库 (Ctrl+G)"
        aria-label="图库"
        @click="togglePanel('gallery')"
      >
        <Library :size="16" />
      </button>

      <span class="top-bar__divider" />

      <button
        class="top-bar__btn"
        type="button"
        title="设置"
        aria-label="设置"
        @click="uiStore.toggleSettings"
      >
        <Settings :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.top-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 100%;
  padding: 0 var(--space-3);
  background: var(--bg-secondary);

  &__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-self: start;
  }

  &__logo {
    width: 24px;
    height: 24px;
  }

  &__title {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  &__stage {
    margin-left: var(--space-2);
    padding: 2px 8px;
    font-size: var(--font-size-xs);
    color: var(--accent);
    background: var(--accent-light);
    border-radius: var(--radius-sm);
  }

  &__file {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    max-width: 360px;
    padding: 2px var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);

    &--dirty {
      color: var(--text-primary);
    }
    &--saving {
      color: var(--info);
    }
    &--saved {
      color: var(--success);
    }
    &--exported {
      color: var(--info);
    }
  }

  &__filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  &__file-state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--error);
  }

  &__spinner {
    animation: top-bar-spin 0.8s linear infinite;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    justify-self: end;
  }

  &__btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.is-active {
      background: var(--accent-light);
      color: var(--accent);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--save.is-dirty {
      color: var(--text-primary);
    }
  }

  &__dirty-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: var(--error);
    border: 2px solid var(--bg-secondary);
    border-radius: 50%;
  }

  &__divider {
    display: inline-block;
    width: 1px;
    height: 18px;
    margin: 0 var(--space-1);
    background: var(--divider-color);
  }
}

@keyframes top-bar-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
