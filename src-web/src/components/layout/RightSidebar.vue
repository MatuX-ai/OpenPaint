<!--
  Right sidebar — 图库 / 折叠。

  W14+ 统一画布架构：
    - 右侧不再默认显示 OpenPencil 编辑器；OpenPencil 是中央画布。
    - 右侧仅承担图库、属性等辅助面板职责。
    - 与 uiStore.rightPanelMode 保持兼容（保留 'gallery' / 'none' 两种模式）。
-->

<script setup lang="ts">
import { Library } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import GalleryPanel from '@/components/gallery/GalleryPanel.vue';

const uiStore = useUIStore();
</script>

<template>
  <aside class="right-sidebar">
    <header class="right-sidebar__header">
      <button
        type="button"
        class="right-sidebar__tab"
        :class="{ 'is-active': uiStore.rightPanelMode === 'gallery' }"
        @click="uiStore.switchRightPanel('gallery')"
      >
        <Library :size="14" />
        <span>图库</span>
      </button>
    </header>

    <section class="right-sidebar__content">
      <GalleryPanel v-if="uiStore.rightPanelMode === 'gallery'" />
      <div v-else class="right-sidebar__placeholder">
        <p>右侧面板已折叠</p>
      </div>
    </section>
  </aside>
</template>

<style scoped lang="scss">
.right-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  &__header {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: transparent;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.is-active {
      color: var(--accent);
      box-shadow: inset 0 -2px 0 var(--accent);
    }
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
}
</style>