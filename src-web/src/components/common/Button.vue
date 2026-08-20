<!--
  自定义按钮
-->

<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  type: 'button',
});

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    :type="props.type"
    class="op-btn"
    :class="[
      `op-btn--${props.variant}`,
      `op-btn--${props.size}`,
      { 'op-btn--block': props.block, 'is-loading': props.loading },
    ]"
    :disabled="props.disabled || props.loading"
    @click="(e) => $emit('click', e)"
  >
    <span v-if="props.loading" class="op-btn__spinner" />
    <slot />
  </button>
</template>

<style scoped lang="scss">
.op-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-weight: 500;
  border-radius: var(--radius-sm);
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--sm {
    padding: 4px 8px;
    font-size: var(--font-size-xs);
  }
  &--md {
    padding: 6px 12px;
    font-size: var(--font-size-sm);
  }
  &--lg {
    padding: 8px 16px;
    font-size: var(--font-size-base);
  }

  &--primary {
    background: var(--accent);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }
  }

  &--secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
    }
  }

  &--ghost {
    background: transparent;
    color: var(--text-secondary);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &--danger {
    background: var(--error);
    color: #fff;

    &:hover:not(:disabled) {
      filter: brightness(1.1);
    }
  }

  &--block {
    width: 100%;
  }

  &__spinner {
    width: 12px;
    height: 12px;
    border: 2px solid currentcolor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
