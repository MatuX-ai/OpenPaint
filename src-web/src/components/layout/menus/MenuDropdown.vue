<!--
  MenuDropdown — 单个顶级菜单 + 下拉内容。
  由 FileMenu / EditMenu / ViewMenu / HelpMenu 共用。

  Props:
    label       顶级菜单显示文字
    open        是否展开下拉
    disabled    是否禁用顶级按钮

  Events:
    toggle  点击顶级按钮
    close   点击菜单项 / 外部点击 / Esc
-->

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed } from 'vue';

interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: never;
  danger?: boolean;
}
interface Separator {
  id: string;
  separator: true;
}
export type DropdownItem = MenuItem | Separator;

const props = defineProps<{
  label: string;
  open: boolean;
  items: DropdownItem[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'close'): void;
  (e: 'select', id: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const openState = computed(() => props.open);

function onItemClick(item: DropdownItem): void {
  if ('separator' in item) return;
  if (item.disabled) return;
  emit('select', item.id);
  emit('close');
}

function onKey(event: KeyboardEvent): void {
  if (!openState.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div ref="rootRef" class="menu-dropdown" :data-open="open">
    <button
      type="button"
      class="menu-dropdown__trigger"
      :class="{ 'is-open': open }"
      :disabled="disabled"
      :aria-haspopup="'menu'"
      :aria-expanded="open"
      @click.stop="emit('toggle')"
    >
      {{ label }}
    </button>
    <div v-if="open" class="menu-dropdown__panel" role="menu">
      <template v-for="item in items" :key="item.id">
        <div
          v-if="'separator' in item && item.separator"
          class="menu-dropdown__sep"
          role="separator"
        />
        <button
          v-else
          type="button"
          role="menuitem"
          class="menu-dropdown__item"
          :class="{
            'is-disabled': item.disabled,
            'is-danger': item.danger,
          }"
          :disabled="item.disabled"
          @click="onItemClick(item)"
        >
          <span class="menu-dropdown__label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="menu-dropdown__shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.menu-dropdown {
  position: relative;
  display: inline-flex;

  &__trigger {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.is-open {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1000;
    min-width: 220px;
    padding: var(--space-1);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    text-align: left;

    &:hover:not(.is-disabled) {
      background: var(--bg-hover);
    }

    &.is-disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &.is-danger {
      color: var(--error);
    }
  }

  &__shortcut {
    margin-left: var(--space-4);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
  }

  &__sep {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--divider-color);
  }
}
</style>
