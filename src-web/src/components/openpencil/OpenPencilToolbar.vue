<!--
  OpenPencil 工具条兜底（中央画布）。

  W14+ 中央画布架构：
    - 默认由 OpenPencil 自带的 <ToolbarRoot> 渲染工具按钮（见 OpenPencilView.vue）。
    - 当前组件仅在 SDK 尚未 ready 时，作为轻量 title 占位展示，避免中央画布顶部
      出现"OK / 取消 / 刷新"等历史右窗残留语义。
-->

<script setup lang="ts">
defineProps<{ loading?: boolean }>();
</script>

<template>
  <div class="openpencil-toolbar">
    <span class="openpencil-toolbar__title">OpenPencil</span>
    <span v-if="loading" class="openpencil-toolbar__state">载入中…</span>
  </div>
</template>

<style scoped lang="scss">
.openpencil-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  &__title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  &__state {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>
