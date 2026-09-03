<!--
  OpenPaint main layout.
  Structure:
    AppMenuBar              菜单栏 (32px)  -- 文件 / 编辑 / 视图 / 帮助
    TopBar                  title bar (48px) -- 标题 + 全局操作
    [LeftSidebar | Center (OpenPencil 中央画布 + 共享工具条) | RightSidebar | LayerPanel]
    StatusBar               footer (24px)

  W14+ 统一画布架构：
    - 中央区域 = OpenPencil View，唯一主画布与文档状态。
    - 不再同时挂载 Rust 像素画 CanvasView；保留该组件作为兼容参考但不在主布局。
    - 右侧仅保留图库 / 折叠等辅助面板，浮动 AI 助理独立显示。
-->

<script setup lang="ts">
import AppMenuBar from './AppMenuBar.vue';
import TopBar from './TopBar.vue';
import LeftSidebar from './LeftSidebar.vue';
import RightSidebar from './RightSidebar.vue';
import StatusBar from './StatusBar.vue';
import CanvasToolbar from '@/components/canvas/CanvasToolbar.vue';
import LayerPanel from '@/components/canvas/LayerPanel.vue';
import OpenPencilView from '@/components/openpencil/OpenPencilView.vue';
</script>

<template>
  <div class="main-layout">
    <AppMenuBar class="main-layout__menu" />
    <TopBar class="main-layout__top" />

    <div class="main-layout__body">
      <LeftSidebar class="main-layout__left" />
      <div class="main-layout__center">
        <CanvasToolbar class="main-layout__toolbar" />
        <OpenPencilView class="main-layout__canvas" />
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

  &__menu {
    flex-shrink: 0;
  }

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
