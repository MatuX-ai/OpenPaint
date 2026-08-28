<!--
  File 菜单。
  通过 useMenuActions().dispatch('file.xxx') 触发实际动作。
-->

<script setup lang="ts">
import MenuDropdown from './MenuDropdown.vue';
import type { DropdownItem } from './MenuDropdown.vue';
import { useMenuActions } from '@composables/useMenuActions';
import { computed } from 'vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'close'): void }>();

const menu = useMenuActions();

const items = computed<DropdownItem[]>(() => [
  { id: 'file.new', label: '新建画布…', shortcut: 'Ctrl+N' },
  { id: 'file.open', label: '打开…', shortcut: 'Ctrl+O' },
  { id: 'file.sep-1', separator: true },
  { id: 'file.save', label: '保存到图库', shortcut: 'Ctrl+S' },
  { id: 'file.saveAs', label: '另存为…', shortcut: 'Ctrl+Shift+S' },
  { id: 'file.export.png', label: '导出为 PNG…', shortcut: 'Ctrl+E' },
  { id: 'file.export.jpg', label: '导出为 JPG…' },
  { id: 'file.export.webp', label: '导出为 WebP…' },
  { id: 'file.batchExport', label: '批量导出…', shortcut: 'Ctrl+Shift+E' },
  { id: 'file.sep-2', separator: true },
  { id: 'file.recent', label: '最近文件', disabled: true },
  { id: 'file.sep-3', separator: true },
  { id: 'file.quit', label: '退出', shortcut: 'Alt+F4', danger: true },
]);

function onSelect(id: string): void {
  void menu.dispatch(id as Parameters<typeof menu.dispatch>[0]);
}
</script>

<template>
  <MenuDropdown label="文件" :open="open" :items="items" @toggle="emit('toggle')" @close="emit('close')" @select="onSelect" />
</template>
