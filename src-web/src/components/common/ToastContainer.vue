<!--
  Toast container — 全局 Toast 渲染容器。
  挂在 AppView 顶层一次；通过 useToast() 触发。

  关联需求：docs/ux-onboarding-requirements.md §3.2 Toast 组件、§5 错误状态。
-->

<script setup lang="ts">
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-vue-next';
import { useToast } from '@composables/useToast';
import type { Component } from 'vue';

const toast = useToast();

interface KindMeta {
  icon: Component;
  cls: string;
}

const KIND_META: Record<'info' | 'success' | 'warn' | 'error', KindMeta> = {
  info: { icon: Info, cls: 'toast-container__item--info' },
  success: { icon: CheckCircle2, cls: 'toast-container__item--success' },
  warn: { icon: AlertTriangle, cls: 'toast-container__item--warn' },
  error: { icon: XCircle, cls: 'toast-container__item--error' },
};
</script>

<template>
  <div
    class="toast-container"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    data-openpaint-toast-root
  >
    <transition-group name="toast" tag="div" class="toast-container__list">
      <div
        v-for="t in toast.toasts.value"
        :key="t.id"
        class="toast-container__item"
        :class="KIND_META[t.kind].cls"
        :data-toast-kind="t.kind"
      >
        <component :is="KIND_META[t.kind].icon" :size="16" class="toast-container__icon" />
        <span class="toast-container__msg">{{ t.message }}</span>
        <button
          v-if="t.action"
          type="button"
          class="toast-container__action"
          @click="
            t.action.onClick();
            toast.dismiss(t.id);
          "
        >
          {{ t.action.label }}
        </button>
        <button
          type="button"
          class="toast-container__close"
          :aria-label="`关闭通知：${t.message}`"
          @click="toast.dismiss(t.id)"
        >
          <X :size="14" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped lang="scss">
.toast-container {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-8);
  z-index: 8000;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);

  &__list {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
  }

  &__item {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 240px;
    max-width: 420px;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-left-width: 3px;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    color: var(--text-primary);
    font-size: var(--font-size-sm);

    &--info {
      border-left-color: var(--info);
    }
    &--success {
      border-left-color: var(--success);
    }
    &--warn {
      border-left-color: var(--warning);
    }
    &--error {
      border-left-color: var(--error);
    }
  }

  &__icon {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  &__msg {
    flex: 1;
    line-height: 1.4;
  }

  &__action {
    flex-shrink: 0;
    padding: 2px var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--accent);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
    }
  }

  &__close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-muted);
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    transform var(--transition-base),
    opacity var(--transition-base);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
