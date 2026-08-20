<!--
  加载动画
-->

<script setup lang="ts">
type Size = 'sm' | 'md' | 'lg';

interface Props {
  size?: Size;
}

withDefaults(defineProps<Props>(), { size: 'md' });
</script>

<template>
  <span class="op-spinner" :class="`op-spinner--${size}`" role="status" aria-label="加载中" />
</template>

<style scoped lang="scss">
.op-spinner {
  display: inline-block;
  border: 2px solid var(--accent-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: op-spin 0.8s linear infinite;

  &--sm {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }
  &--md {
    width: 18px;
    height: 18px;
  }
  &--lg {
    width: 28px;
    height: 28px;
    border-width: 3px;
  }
}

@keyframes op-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
