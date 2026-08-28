<!--
  Edit 菜单。
-->

<script setup lang="ts">
import MenuDropdown from './MenuDropdown.vue';
import type { DropdownItem } from './MenuDropdown.vue';
import { useMenuActions } from '@composables/useMenuActions';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'close'): void }>();

const menu = useMenuActions();

const items: DropdownItem[] = [
  { id: 'edit.undo', label: '撤销', shortcut: 'Ctrl+Z' },
  { id: 'edit.redo', label: '重做', shortcut: 'Ctrl+Y' },
  { id: 'edit.sep-1', separator: true },
  { id: 'edit.selectAll', label: '全选', shortcut: 'Ctrl+A' },
  { id: 'edit.clearSelection', label: '取消选区', shortcut: 'Ctrl+D' },
  { id: 'edit.sep-2', separator: true },
  { id: 'edit.copy', label: '复制', shortcut: 'Ctrl+C' },
  { id: 'edit.paste', label: '粘贴', shortcut: 'Ctrl+V' },
];

function onSelect(id: string): void {
  void menu.dispatch(id as Parameters<typeof menu.dispatch>[0]);
}
</script>

<template>
  <MenuDropdown label="编辑" :open="open" :items="items" @toggle="emit('toggle')" @close="emit('close')" @select="onSelect" />
</template>
