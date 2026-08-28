<!--
  AppMenuBar — 顶部菜单栏（File / Edit / View / Help）。
  点击外部 / Esc 关闭下拉；菜单项通过 defineExpose 给 AppView 监听键盘快捷键。

  关联需求：docs/ux-onboarding-requirements.md §2.1 菜单栏、US-1~US-11。
-->

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from 'vue';
import FileMenu from './menus/FileMenu.vue';
import EditMenu from './menus/EditMenu.vue';
import ViewMenu from './menus/ViewMenu.vue';
import HelpMenu from './menus/HelpMenu.vue';

type MenuId = 'file' | 'edit' | 'view' | 'help' | null;

const openMenu = ref<MenuId>(null);

function toggle(id: Exclude<MenuId, null>): void {
  openMenu.value = openMenu.value === id ? null : id;
}

function close(): void {
  openMenu.value = null;
}

function onDocClick(event: MouseEvent): void {
  if (!openMenu.value) return;
  const target = event.target as HTMLElement | null;
  if (target && target.closest('[data-openpaint-menubar]')) return;
  close();
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenu.value) {
    event.preventDefault();
    close();
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});

defineExpose({ close });
</script>

<template>
  <div class="menu-bar" data-openpaint-menubar role="menubar" aria-label="主菜单">
    <div class="menu-bar__inner">
      <FileMenu :open="openMenu === 'file'" @toggle="toggle('file')" @close="close" />
      <EditMenu :open="openMenu === 'edit'" @toggle="toggle('edit')" @close="close" />
      <ViewMenu :open="openMenu === 'view'" @toggle="toggle('view')" @close="close" />
      <HelpMenu :open="openMenu === 'help'" @toggle="toggle('help')" @close="close" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.menu-bar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 var(--space-2);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  user-select: none;

  &__inner {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
}
</style>
