<!--
  Top bar — title, undo/redo, panel toggles, theme switch.
-->

<script setup lang="ts">
import { Undo2, Redo2, Library, Sparkles, Settings } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useUIStore } from '@stores/uiStore';
import { canvasApi } from '@api/index';

const canvasStore = useCanvasStore();
const uiStore = useUIStore();

async function undo() {
  try {
    await canvasApi.undo();
    // Recompute canUndo/canRedo after the operation.
    const summary = await canvasApi.getCanvasSummary();
    canvasStore.canUndo = summary.canUndo;
    canvasStore.canRedo = summary.canRedo;
  } catch (e) {
    console.error('[TopBar] undo failed:', e);
  }
}

async function redo() {
  try {
    await canvasApi.redo();
    const summary = await canvasApi.getCanvasSummary();
    canvasStore.canUndo = summary.canUndo;
    canvasStore.canRedo = summary.canRedo;
  } catch (e) {
    console.error('[TopBar] redo failed:', e);
  }
}

function togglePanel(mode: 'openpencil' | 'gallery') {
  uiStore.switchRightPanel(uiStore.rightPanelMode === mode ? 'none' : mode);
}
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__brand">
      <img src="/logo.svg" alt="OpenPaint" class="top-bar__logo" />
      <span class="top-bar__title">OpenPaint</span>
      <span class="top-bar__stage">MVP</span>
    </div>

    <div class="top-bar__actions">
      <button
        class="top-bar__btn"
        type="button"
        title="撤销 (Ctrl+Z)"
        :disabled="!canvasStore.canUndo"
        @click="undo"
      >
        <Undo2 :size="16" />
      </button>
      <button
        class="top-bar__btn"
        type="button"
        title="重做 (Ctrl+Shift+Z)"
        :disabled="!canvasStore.canRedo"
        @click="redo"
      >
        <Redo2 :size="16" />
      </button>

      <span class="top-bar__divider" />

      <button
        class="top-bar__btn"
        type="button"
        :class="{ 'is-active': uiStore.rightPanelMode === 'openpencil' }"
        title="OpenPencil 右窗 (Ctrl+Alt+P)"
        @click="togglePanel('openpencil')"
      >
        <Sparkles :size="16" />
      </button>
      <button
        class="top-bar__btn"
        type="button"
        :class="{ 'is-active': uiStore.rightPanelMode === 'gallery' }"
        title="图库 (Ctrl+G)"
        @click="togglePanel('gallery')"
      >
        <Library :size="16" />
      </button>

      <span class="top-bar__divider" />

      <button
        class="top-bar__btn"
        type="button"
        title="设置"
        @click="uiStore.toggleSettings"
      >
        <Settings :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 var(--space-3);
  background: var(--bg-secondary);

  &__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  &__btn {
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
  }

  &__divider {
    display: inline-block;
    width: 1px;
    height: 18px;
    margin: 0 var(--space-1);
    background: var(--divider-color);
  }
}
</style>
