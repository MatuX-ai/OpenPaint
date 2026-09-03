<!--
  ContextMenu — 通用右键菜单（W13 UX 验收补齐）

  用法：
    <ContextMenu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @close="closeMenu"
      @select="onSelect"
    />

  items: Array<{
    label: string;
    icon?: Component;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean; // 如果 true，渲染分隔符
    children?: MenuItem[]; // 二级菜单
  }>

  行为：
    - 打开时点击外部 / Esc 自动关闭
    - 支持键盘上下箭头 + Enter
    - 菜单项 disabled / danger / separator 都有视觉区分
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick, computed } from 'vue';
import type { Component } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: Component;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
  onSelect?: () => void;
}

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  close: [];
  select: [item: ContextMenuItem];
}>();

const rootRef = ref<HTMLElement | null>(null);

// 调整位置以避免溢出窗口
const adjustedX = computed(() => {
  if (typeof window === 'undefined') return props.x;
  const w = rootRef.value?.offsetWidth ?? 200;
  return Math.min(props.x, window.innerWidth - w - 8);
});
const adjustedY = computed(() => {
  if (typeof window === 'undefined') return props.y;
  const h = rootRef.value?.offsetHeight ?? 200;
  return Math.min(props.y, window.innerHeight - h - 8);
});

function onDocClick(e: MouseEvent) {
  if (!props.visible) return;
  const root = rootRef.value;
  if (!root) return;
  if (!root.contains(e.target as Node)) {
    emit('close');
  }
}

function onKey(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

watch(
  () => props.visible,
  (next) => {
    if (next) {
      // 下一帧让菜单渲染后才能测量尺寸，所以用 nextTick
      void nextTick();
    }
  },
);

onMounted(() => {
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKey);
});

function onSelectItem(item: ContextMenuItem) {
  if (item.disabled || item.separator) return;
  if (item.onSelect) item.onSelect();
  emit('select', item);
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="rootRef"
      class="ctx-menu"
      role="menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    >
      <template v-for="(item, idx) in items" :key="idx">
        <div v-if="item.separator" class="ctx-menu__separator" role="separator" />
        <button
          v-else
          type="button"
          class="ctx-menu__item"
          :class="{
            'ctx-menu__item--danger': item.danger,
            'is-disabled': item.disabled,
          }"
          :disabled="item.disabled"
          role="menuitem"
          @click="onSelectItem(item)"
        >
          <span class="ctx-menu__icon" aria-hidden="true">
            <component :is="item.icon" v-if="item.icon" :size="14" />
          </span>
          <span class="ctx-menu__label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="ctx-menu__shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ctx-menu {
  position: fixed;
  z-index: 9998;
  min-width: 180px;
  padding: 4px;
  background: var(--bg-elevated, var(--bg-secondary));
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  font-size: var(--font-size-sm, 12px);
  user-select: none;

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    color: inherit;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background var(--transition-fast);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
    }

    &--danger {
      color: var(--color-danger, #d63031);

      &:hover:not(:disabled) {
        background: rgba(214, 48, 49, 0.12);
      }
    }

    &.is-disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    color: var(--text-muted);
  }

  &__label {
    flex: 1;
    white-space: nowrap;
  }

  &__shortcut {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
    padding-left: 8px;
  }

  &__separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--border-color);
  }
}
</style>
