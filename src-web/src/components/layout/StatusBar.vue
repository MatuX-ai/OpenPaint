<!--
  底部状态栏（MVP 占位）
  - 坐标 / 缩放 / 图层数 / 内存占用 / MCP 状态
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useUIStore } from '@stores/uiStore';
import { useCanvasStore } from '@stores/canvasStore';

const uiStore = useUIStore();
const canvasStore = useCanvasStore();

const zoomPercent = computed(() => Math.round(canvasStore.zoom * 100));
const mcpStatus = computed(() => 'disconnected' as const); // 阶段二 W4 接入
</script>

<template>
  <footer class="status-bar">
    <div class="status-bar__group status-bar__group--left">
      <span class="status-bar__item">{{ canvasStore.canvasWidth }} × {{ canvasStore.canvasHeight }}</span>
      <span class="status-bar__divider">|</span>
      <span class="status-bar__item">{{ zoomPercent }}%</span>
      <span class="status-bar__divider">|</span>
      <span class="status-bar__item">图层 {{ canvasStore.layerList.length }}</span>
    </div>

    <div class="status-bar__group status-bar__group--right">
      <span class="status-bar__item" :class="`status-bar__item--${mcpStatus}`">
        MCP: {{ mcpStatus }}
      </span>
      <span class="status-bar__divider">|</span>
      <button class="status-bar__btn" type="button" @click="uiStore.toggleTheme">
        {{ uiStore.theme === 'dark' ? '深色' : '浅色' }}
      </button>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-secondary);

  &__group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__divider {
    color: var(--divider-color);
  }

  &__item {
    &--connected {
      color: var(--success);
    }
    &--disconnected {
      color: var(--text-muted);
    }
    &--error {
      color: var(--error);
    }
  }

  &__btn {
    padding: 2px 6px;
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: transparent;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
    }
  }
}
</style>