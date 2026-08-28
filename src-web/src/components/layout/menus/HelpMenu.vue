<!--
  Help 菜单。
-->

<script setup lang="ts">
import MenuDropdown from './MenuDropdown.vue';
import type { DropdownItem } from './MenuDropdown.vue';
import { useMenuActions } from '@composables/useMenuActions';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'close'): void }>();

const menu = useMenuActions();

const items: DropdownItem[] = [
  { id: 'help.cheatsheet', label: '快捷键速查…', shortcut: '?' },
  { id: 'help.onboarding', label: '入门引导' },
  { id: 'help.sep-1', separator: true },
  { id: 'help.docs', label: '在线文档…' },
  { id: 'help.issues', label: '报告问题…' },
  { id: 'help.sep-2', separator: true },
  { id: 'help.about', label: '关于 OpenPaint' },
];

function onSelect(id: string): void {
  void menu.dispatch(id as Parameters<typeof menu.dispatch>[0]);
}
</script>

<template>
  <MenuDropdown label="帮助" :open="open" :items="items" @toggle="emit('toggle')" @close="emit('close')" @select="onSelect" />
</template>
