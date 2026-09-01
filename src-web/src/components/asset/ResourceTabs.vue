<!--
  ResourceTabs.vue — 资源面板的三 chip 切换容器（W10）

  嵌入在 LeftSidebar 的 wide 模式下，承载：
  - icons / brushes / palette 三个二级 tab
  - 当前选中 tab 的对应面板组件
  - 折叠状态持久化（localStorage key openpaint:resource-tab-mode）

  Acceptance: US-AST-2 资源面板二级导航（W10 spec §1）
-->

<script setup lang="ts">
import { ref, watch } from 'vue';
import IconPanel from './IconPanel.vue';
import BrushPanel from './BrushPanel.vue';
import PalettePanel from './PalettePanel.vue';
import type { IconMeta } from '@/types/asset';

const STORAGE_KEY = 'openpaint:resource-tab-mode';

export type ResourceTab = 'icons' | 'brushes' | 'palette';

const activeTab = ref<ResourceTab>('icons');
try {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'icons' || saved === 'brushes' || saved === 'palette') {
    activeTab.value = saved;
  }
} catch {
  /* localStorage may be disabled */
}

watch(activeTab, (next) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
});

const emit = defineEmits<{
  (e: 'icon-imported', payload: { icon: IconMeta; layerId: string }): void;
  (e: 'palette-applied', payload: { paletteId: string; mode: 'swatch_bar' | 'replace_color' }): void;
  (e: 'gradient-applied', payload: { gradientId: string }): void;
  (e: 'brush-changed', brushId: string): void;
  (e: 'error', message: string): void;
}>();

function onIconImported(payload: { icon: IconMeta; layerId: string }): void {
  emit('icon-imported', payload);
}
function onError(message: string): void {
  emit('error', message);
}
function onPaletteApplied(payload: { paletteId: string; mode: 'swatch_bar' | 'replace_color' }): void {
  emit('palette-applied', payload);
}
function onGradientApplied(payload: { gradientId: string }): void {
  emit('gradient-applied', payload);
}
function onBrushChanged(brushId: string): void {
  emit('brush-changed', brushId);
}
</script>

<template>
  <div class="resource-tabs">
    <nav class="resource-tabs__bar" role="tablist" :aria-label="'资源二级标签'">
      <button
        type="button"
        role="tab"
        class="resource-tabs__chip"
        :class="{ 'is-active': activeTab === 'icons' }"
        :aria-selected="activeTab === 'icons'"
        @click="activeTab = 'icons'"
      >
        图标
      </button>
      <button
        type="button"
        role="tab"
        class="resource-tabs__chip"
        :class="{ 'is-active': activeTab === 'brushes' }"
        :aria-selected="activeTab === 'brushes'"
        @click="activeTab = 'brushes'"
      >
        画刷
      </button>
      <button
        type="button"
        role="tab"
        class="resource-tabs__chip"
        :class="{ 'is-active': activeTab === 'palette' }"
        :aria-selected="activeTab === 'palette'"
        @click="activeTab = 'palette'"
      >
        调色板
      </button>
    </nav>

    <section v-show="activeTab === 'icons'" class="resource-tabs__pane" role="tabpanel">
      <IconPanel
        @icon-imported="onIconImported"
        @error="onError"
      />
    </section>
    <section v-show="activeTab === 'brushes'" class="resource-tabs__pane" role="tabpanel">
      <BrushPanel
        @brush-changed="onBrushChanged"
        @error="onError"
      />
    </section>
    <section v-show="activeTab === 'palette'" class="resource-tabs__pane" role="tabpanel">
      <PalettePanel
        @palette-applied="onPaletteApplied"
        @gradient-applied="onGradientApplied"
        @error="onError"
      />
    </section>
  </div>
</template>

<style scoped lang="scss">
.resource-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  height: 100%;

  &__bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 var(--space-2);
  }

  &__chip {
    padding: 4px 12px;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &.is-active {
      background: var(--accent-light);
      color: var(--accent);
      border-color: var(--accent);
    }
  }

  &__pane {
    flex: 1 1 auto;
    overflow: hidden;
    min-height: 0;
  }
}
</style>