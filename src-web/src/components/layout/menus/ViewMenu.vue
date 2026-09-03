<!--
  View 菜单。
-->

<script setup lang="ts">
import MenuDropdown from './MenuDropdown.vue';
import type { DropdownItem } from './MenuDropdown.vue';
import { useMenuActions } from '@composables/useMenuActions';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'close'): void }>();

const menu = useMenuActions();

const items: DropdownItem[] = [
  { id: 'view.zoom.100', label: '缩放至 100%', shortcut: 'Ctrl+0' },
  { id: 'view.zoom.fit', label: '适配窗口', shortcut: 'Ctrl+Shift+0' },
  { id: 'view.zoom.in', label: '放大', shortcut: '+' },
  { id: 'view.zoom.out', label: '缩小', shortcut: '-' },
  { id: 'view.sep-1', separator: true },
  { id: 'view.rightPanel.openpencil', label: '右窗 · OpenPencil' },
  { id: 'view.rightPanel.gallery', label: '右窗 · 图库' },
  { id: 'view.rightPanel.none', label: '右窗 · 折叠' },
  { id: 'view.sep-2', separator: true },
  { id: 'view.theme', label: '切换主题' },
  { id: 'view.fullscreen', label: '全屏', shortcut: 'F11' },
];

function onSelect(id: string): void {
  void menu.dispatch(id as Parameters<typeof menu.dispatch>[0]);
}
</script>

<template>
  <MenuDropdown
    label="视图"
    :open="open"
    :items="items"
    @toggle="emit('toggle')"
    @close="emit('close')"
    @select="onSelect"
  />
</template>
