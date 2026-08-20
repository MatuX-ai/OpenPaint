<!--
  OpenPaint main layout.
  Structure:
    TopBar                  title bar (48px)
    [LeftSidebar | Center | RightSidebar | LayerPanel]
    StatusBar               footer (24px)
-->

<script setup lang="ts">
import { onMounted } from 'vue';
import TopBar from './TopBar.vue';
import LeftSidebar from './LeftSidebar.vue';
import RightSidebar from './RightSidebar.vue';
import StatusBar from './StatusBar.vue';
import CanvasView from '@/components/canvas/CanvasView.vue';
import CanvasToolbar from '@/components/canvas/CanvasToolbar.vue';
import LayerPanel from '@/components/canvas/LayerPanel.vue';
import { useShortcuts } from '@composables/useShortcuts';

const shortcuts = useShortcuts();

onMounted(() => {
  shortcuts.install();
  // Register default editor shortcuts.
  for (const binding of shortcuts.defaultBindings()) {
    shortcuts.register(binding);
  }
});
</script>

<template>
  <div class="main-layout">
    <TopBar class="main-layout__top" />

    <div class="main-layout__body">
      <LeftSidebar class="main-layout__left" />
      <div class="main-layout__center">
        <CanvasToolbar class="main-layout__toolbar" />
        <CanvasView class="main-layout__canvas" />
      </div>
      <RightSidebar class="main-layout__right" />
      <LayerPanel class="main-layout__layers" />
    </div>

    <StatusBar class="main-layout__status" />
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);

  &__top {
    flex-shrink: 0;
    height: var(--topbar-height);
    border-bottom: 1px solid var(--border-color);
  }

  &__body {
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
  }

  &__left {
    flex-shrink: 0;
    width: var(--left-sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
  }

  &__center {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-primary);
  }

  &__toolbar {
    flex-shrink: 0;
    height: 48px;
  }

  &__canvas {
    flex: 1 1 auto;
    min-height: 0;
  }

  &__right {
    flex-shrink: 0;
    width: var(--right-sidebar-width);
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
  }

  &__layers {
    flex-shrink: 0;
    width: 220px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
  }

  &__status {
    flex-shrink: 0;
    height: var(--statusbar-height);
    border-top: 1px solid var(--border-color);
  }
}
</style>
