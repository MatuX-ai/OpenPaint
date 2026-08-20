<!--
  MCP connection status indicator.
-->

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status: 'idle' | 'loading' | 'ready' | 'error' }>();

const label = computed(() => {
  switch (props.status) {
    case 'ready':
      return '已连接';
    case 'error':
      return '连接错误';
    case 'loading':
      return '连接中…';
    default:
      return '未连接';
  }
});
</script>

<template>
  <div class="mcp-status" :class="`mcp-status--${status}`">
    <span class="mcp-status__dot" />
    <span class="mcp-status__label">MCP: {{ label }}</span>
  </div>
</template>

<style scoped lang="scss">
.mcp-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  &--ready .mcp-status__dot {
    background: var(--success);
  }
  &--ready {
    color: var(--success);
  }
  &--error .mcp-status__dot {
    background: var(--error);
  }
  &--error {
    color: var(--error);
  }
  &--loading .mcp-status__dot {
    background: var(--warning);
  }
  &--loading {
    color: var(--warning);
  }
}
</style>
