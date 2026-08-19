<!--
  Left sidebar — tool picker.
  Wired to canvasStore.activeTool via useCanvasStore.setActiveTool.
-->

<script setup lang="ts">
import { Brush, Eraser, MousePointer2, Hand, Crop, Square } from 'lucide-vue-next';
import type { Component } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { ToolType } from '@/types/canvas';

interface ToolDef {
  id: ToolType;
  label: string;
  shortcut: string;
  icon: Component;
}

const tools: ToolDef[] = [
  { id: 'select', label: '閫夋嫨', shortcut: 'V', icon: MousePointer2 },
  { id: 'rect-select', label: '鐭╁舰閫夊尯', shortcut: 'M', icon: Square },
  { id: 'brush', label: '鐢荤瑪', shortcut: 'B', icon: Brush },
  { id: 'eraser', label: '姗＄毊', shortcut: 'E', icon: Eraser },
  { id: 'move', label: '绉诲姩', shortcut: 'H', icon: Hand },
  { id: 'transform', label: '鍙樺舰', shortcut: 'T', icon: Crop },
];

const store = useCanvasStore();
</script>

<template>
  <aside class="left-sidebar">
    <nav class="left-sidebar__tools">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="left-sidebar__tool"
        type="button"
        :title="`${tool.label} (${tool.shortcut})`"
        :class="{ 'is-active': store.activeTool === tool.id }"
        @click="store.setActiveTool(tool.id)"
      >
        <component :is="tool.icon" :size="20" />
      </button>
    </nav>
  </aside>
</template>

<style scoped lang="scss">
.left-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--space-2) 0;

  &__tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  &__tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast), color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.is-active {
      background: var(--accent-light);
      color: var(--accent);
    }
  }
}
</style>