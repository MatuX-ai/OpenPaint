<!--
  Left sidebar — tool picker + resource picker (W9).

  Two modes (toggled via the bottom chip):
    - `tools`   (default): the original 6 tool buttons (V/M/B/E/H/T)
    - `icons`   (W9)     : the IconPanel rendered into a wider sidebar

  When switching to `icons` the sidebar widens from 48px to 280px so the
  IconPanel can lay out a search input + result grid. The user can click
  the chip again to collapse back.

  Wired to canvasStore.activeTool via useCanvasStore.setActiveTool.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Brush,
  Eraser,
  MousePointer2,
  Hand,
  Crop,
  Square,
  Shapes,
  RotateCw,
  Type,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { ToolType } from '@/types/canvas';
import ResourceTabs from '@/components/asset/ResourceTabs.vue';
import type { IconMeta } from '@/types/asset';
import { useToast } from '@/composables/useToast';

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
  // W13 UX 验收补齐：旋转 / 文字两个工具
  { id: 'rotate', label: '旋转', shortcut: 'R', icon: RotateCw },
  { id: 'text', label: '文字', shortcut: 'X', icon: Type },
];

const store = useCanvasStore();
const toast = useToast();

type SidebarMode = 'tools' | 'icons';
const mode = ref<SidebarMode>('tools');

// Persist the user's last selection so the next launch feels consistent.
try {
  const saved = window.localStorage.getItem('openpaint:left-sidebar-mode');
  if (saved === 'icons') mode.value = 'icons';
} catch {
  /* localStorage may be disabled in some environments — fall back to default */
}

watch(mode, (next) => {
  try {
    window.localStorage.setItem('openpaint:left-sidebar-mode', next);
  } catch {
    /* ignore */
  }
});

const isIcons = computed(() => mode.value === 'icons');

// 同步 body class，让 MainLayout 的 CSS 变量 `--left-sidebar-width` 跟随模式切换：
// - tools: 56px（工具条宽度）
// - icons: 280px（资源面板需要的最小宽度）
// 不直接修改子组件 width：父容器 MainLayout__left 是 hardcode 的 CSS 变量，
// 只能通过 :root 或 documentElement 的 data 属性反向覆盖。
watch(
  isIcons,
  (next) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.leftSidebarMode = next ? 'icons' : 'tools';
    }
  },
  { immediate: true },
);

function toggleMode(): void {
  mode.value = mode.value === 'tools' ? 'icons' : 'tools';
}

function onIconImported(payload: { icon: IconMeta; layerId: string }): void {
  toast.show({
    kind: 'success',
    message: `已插入图标 ${payload.icon.prefix}/${payload.icon.name}`,
    durationMs: 2000,
  });
}

function onPaletteApplied(payload: {
  paletteId: string;
  mode: 'swatch_bar' | 'replace_color';
}): void {
  const label = payload.mode === 'swatch_bar' ? '色条' : '主色替换';
  toast.show({
    kind: 'success',
    message: `已应用调色板（${label}）: ${payload.paletteId}`,
    durationMs: 2000,
  });
}

function onGradientApplied(payload: { gradientId: string }): void {
  toast.show({
    kind: 'success',
    message: `已应用渐变: ${payload.gradientId}`,
    durationMs: 2000,
  });
}

function onBrushChanged(brushId: string): void {
  toast.show({
    kind: 'info',
    message: `已切换画刷：${brushId}`,
    durationMs: 1200,
  });
}

function onImportError(message: string): void {
  toast.show({ kind: 'error', message, durationMs: 3000 });
}
</script>

<template>
  <aside
    class="left-sidebar"
    :class="{ 'left-sidebar--wide': isIcons }"
    :aria-label="isIcons ? '资源面板' : '绘图工具'"
  >
    <nav v-if="!isIcons" class="left-sidebar__tools" :aria-label="'绘图工具'">
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

    <div v-else class="left-sidebar__panel">
      <ResourceTabs
        @icon-imported="onIconImported"
        @palette-applied="onPaletteApplied"
        @gradient-applied="onGradientApplied"
        @brush-changed="onBrushChanged"
        @error="onImportError"
      />
    </div>

    <button
      type="button"
      class="left-sidebar__mode-toggle"
      :title="isIcons ? '切回工具栏' : '切到资源面板'"
      :aria-label="isIcons ? '切回工具栏' : '切到资源面板'"
      :aria-pressed="isIcons"
      @click="toggleMode"
    >
      <component :is="Shapes" :size="16" />
      <span class="left-sidebar__mode-label">{{ isIcons ? '工具' : '资源' }}</span>
    </button>
  </aside>
</template>

<style scoped lang="scss">
.left-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--space-2) 0;
  // W12 VDP-FIX-02：去掉 width 过渡。
  // 原 transition: width var(--transition-fast) 在 data 属性切换时与
  // CSS 变量更新并发触发，浏览器反复中断重启 transition，导致宽度卡在
  // 初始值不动。这里使用瞬时切换，避免渲染与动画相互干扰。

  &--wide {
    width: 280px;
  }

  &__tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    flex: 1 1 auto;
  }

  &__panel {
    flex: 1 1 auto;
    overflow: hidden;
    min-height: 0;
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

  &__mode-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: var(--space-1) auto 0;
    padding: 4px 8px;
    background: var(--bg-tertiary, transparent);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--accent);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }

  &__mode-label {
    font-weight: 500;
  }

  // 当展开到 wide 模式，模式按钮放底部居左，更适合宽布局
  &--wide &__mode-toggle {
    align-self: flex-start;
    margin-left: var(--space-2);
  }
}
</style>
