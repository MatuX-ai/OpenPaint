<!--
  AppModal — 通用 Modal 容器。
  - Esc 关闭
  - 点击遮罩关闭（除非 `dismissible=false`）
  - 焦点陷阱：打开时焦点进入第一个 focusable，关闭时还原
  - aria-modal / role=dialog
-->

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    width?: number;
    dismissible?: boolean;
  }>(),
  {
    title: '',
    width: 480,
    dismissible: true,
  },
);

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
}>();

const panelRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function close(): void {
  if (!props.dismissible) return;
  emit('update:open', false);
}

function onKey(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      const first = panelRef.value?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.value)?.focus();
      document.addEventListener('keydown', onKey);
    } else {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    }
  },
);

onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <transition name="app-modal">
      <div
        v-if="open"
        class="app-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="title || '对话框'"
        data-openpaint-modal
      >
        <div class="app-modal__scrim" @click="close" />
        <div
          ref="panelRef"
          class="app-modal__panel"
          tabindex="-1"
          :style="{ maxWidth: `${width}px` }"
        >
          <header v-if="title || $slots.title" class="app-modal__header">
            <h2 class="app-modal__title">
              <slot name="title">{{ title }}</slot>
            </h2>
            <button
              v-if="dismissible"
              type="button"
              class="app-modal__close"
              aria-label="关闭对话框"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>
          <div class="app-modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="app-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.app-modal {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;

  &__scrim {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 55%);
  }

  &__panel {
    position: relative;
    z-index: 1;
    width: calc(100% - var(--space-8));
    max-height: calc(100vh - var(--space-12));
    overflow: auto;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    outline: none;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 600;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    color: var(--text-muted);
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
  }

  &__body {
    padding: var(--space-4);
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border-color);
  }
}

.app-modal-enter-active,
.app-modal-leave-active {
  transition: opacity var(--transition-base);
  .app-modal__panel {
    transition: transform var(--transition-base);
  }
}
.app-modal-enter-from,
.app-modal-leave-to {
  opacity: 0;
  .app-modal__panel {
    transform: translateY(8px) scale(0.98);
  }
}

// 全局 focus-visible 样式（仅作用于打开的 modal 内部）
.app-modal :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
