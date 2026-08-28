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
  { id: 'select', label: '选择', shortcut: 'V', icon: MousePointer2 },
  { id: 'rect-select', label: '矩形选区', shortcut: 'M', icon: Square },
  { id: 'brush', label: '画笔', shortcut: 'B', icon: Brush },
  { id: 'eraser', label: '橡皮', shortcut: 'E', icon: Eraser },
  { id: 'move', label: '移动', shortcut: 'H', icon: Hand },
  { id: 'transform', label: '变形', shortcut: 'T', icon: Crop },
];

const store = useCanvasStore();
</script>

<template>
  <aside class="left-sidebar">
    <nav class="left-sidebar__tools" :aria-label="'绘图工具'">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="left-sidebar__tool"
        type="button"
        :title="`${tool.label} (${tool.shortcut})`"
        :aria-label="`${tool.label}（快捷键 ${tool.shortcut}）`"
        :aria-pressed="store.activeTool === tool.id"
        :class="{ 'is-active': store.activeTool === tool.id }"
        @click="store.setActiveTool(tool.id)"
      >
        <component :is="tool.icon" :size="18" />
        <span class="left-sidebar__shortcut" aria-hidden="true">{{ tool.shortcut }}</span>
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 44px;
    height: 40px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &.is-active {
      background: var(--accent-light);
      color: var(--accent);

      .left-sidebar__shortcut {
        color: var(--accent);
        background: var(--bg-secondary);
      }
    }
  }

  &__shortcut {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 12px;
    height: 12px;
    padding: 0 2px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    line-height: 1;
    color: var(--text-muted);
    background: var(--bg-tertiary, transparent);
    border-radius: 2px;
    letter-spacing: 0;
  }
}
</style>
