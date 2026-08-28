<!--
  AppButton — 通用按钮。
  - variant: primary | secondary | ghost | danger
  - size: sm | md
  - 完整的 aria / disabled / loading 处理
-->

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
  },
);
</script>

<template>
  <button
    class="app-btn"
    :class="[
      `app-btn--${variant}`,
      `app-btn--${size}`,
      { 'is-loading': loading },
    ]"
    :type="type"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="app-btn__spinner" aria-hidden="true" />
    <span class="app-btn__content">
      <slot />
    </span>
  </button>
</template>

<style scoped lang="scss">
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  border-radius: var(--radius-sm);
  font-weight: 500;
  white-space: nowrap;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--sm {
    height: 26px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-xs);
  }
  &--md {
    height: 32px;
    padding: 0 var(--space-4);
    font-size: var(--font-size-sm);
  }

  &--primary {
    color: #fff;
    background: var(--accent);
    border: 1px solid var(--accent);

    &:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }
  }

  &--secondary {
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
    }
  }

  &--ghost {
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid transparent;

    &:hover:not(:disabled) {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
  }

  &--danger {
    color: #fff;
    background: var(--error);
    border: 1px solid var(--error);

    &:hover:not(:disabled) {
      filter: brightness(1.1);
    }
  }

  &__spinner {
    width: 12px;
    height: 12px;
    border: 2px solid currentcolor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: app-btn-spin 0.8s linear infinite;
  }
}

@keyframes app-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
