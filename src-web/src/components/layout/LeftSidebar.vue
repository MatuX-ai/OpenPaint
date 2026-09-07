<!--
  Left sidebar — Paint.NET–inspired tool rail + resource picker.

  Live tools drive OpenPencil via `activateTool()` → editor.setTool().
  Vector pen (B) draws paths; eraser / paint bucket edit IMAGE pixels.
  Pixel brush stays comingSoon until a dedicated raster stroke path exists.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Brush,
  Eraser,
  MousePointer2,
  Hand,
  Square,
  Circle,
  Type,
  Box,
  Droplet,
  Palette,
  Hexagon,
  Star,
  Minus,
  Pencil,
  PenTool,
  Sparkles,
  Crosshair,
  ChevronRight,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';
import ResourceTabs from '@/components/asset/ResourceTabs.vue';
import type { IconMeta } from '@/types/asset';
import { useToast } from '@/composables/useToast';
import {
  RAIL_TOOL_IDS,
  getToolDef,
  railLabel,
  type ToolType,
} from '@/tools/editorTools';
import { activateTool } from '@/tools/useEditorTool';

const ICONS: Record<ToolType, Component> = {
  select: MousePointer2,
  'rect-select': Square,
  lasso: Pencil,
  'ellipse-select': Circle,
  'magic-wand': Sparkles,
  hand: Hand,
  pen: PenTool,
  brush: Brush,
  eraser: Eraser,
  bucket: Droplet,
  gradient: Palette,
  eyedropper: Crosshair,
  text: Type,
  rectangle: Square,
  ellipse: Circle,
  line: Minus,
  polygon: Hexagon,
  star: Star,
  frame: Box,
};

const store = useCanvasStore();
const toast = useToast();

type SidebarMode = 'tools' | 'icons';
const mode = ref<SidebarMode>('tools');
const flyoutFor = ref<ToolType | null>(null);

try {
  const saved = window.localStorage.getItem('openpaint:left-sidebar-mode');
  if (saved === 'icons') mode.value = 'icons';
} catch {
  /* ignore */
}

watch(mode, (next) => {
  try {
    window.localStorage.setItem('openpaint:left-sidebar-mode', next);
  } catch {
    /* ignore */
  }
});

const isIcons = computed(() => mode.value === 'icons');

watch(
  isIcons,
  (next) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.leftSidebarMode = next ? 'icons' : 'tools';
    }
  },
  { immediate: true },
);

const railTools = computed(() =>
  RAIL_TOOL_IDS.map((id) => getToolDef(id)!).filter(Boolean),
);

function isActive(id: ToolType): boolean {
  const def = getToolDef(id);
  if (!def) return false;
  if (store.activeTool === id) return true;
  // Shape / selection flyout: highlight parent when a sibling is active
  if (def.flyout?.includes(store.activeTool)) return true;
  return false;
}

function onToolClick(id: ToolType, event: MouseEvent): void {
  const def = getToolDef(id);
  if (!def) return;

  // Right-click or Alt+click opens flyout when present
  if (def.flyout && def.flyout.length > 1 && (event.altKey || event.button === 2)) {
    event.preventDefault();
    flyoutFor.value = flyoutFor.value === id ? null : id;
    return;
  }

  // Second click on an active flyout parent toggles the menu
  if (def.flyout && def.flyout.length > 1 && isActive(id) && flyoutFor.value !== id) {
    flyoutFor.value = id;
    return;
  }

  flyoutFor.value = null;
  const result = activateTool(id);
  if (!result.ok && result.message) {
    toast.info(result.message);
  }
}

function onFlyoutPick(id: ToolType): void {
  flyoutFor.value = null;
  const result = activateTool(id);
  if (!result.ok && result.message) {
    toast.info(result.message);
  }
}

function toggleMode(): void {
  mode.value = mode.value === 'tools' ? 'icons' : 'tools';
  flyoutFor.value = null;
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

function titleFor(id: ToolType): string {
  const def = getToolDef(id)!;
  const label = railLabel(id);
  const parts = [label];
  if (def.shortcut) parts.push(`(${def.shortcut})`);
  if (def.availability === 'comingSoon') parts.push('· 即将推出');
  if (def.flyout && def.flyout.length > 1) parts.push('· Alt+点击展开');
  return parts.join(' ');
}
</script>

<template>
  <aside
    class="left-sidebar"
    :class="{ 'left-sidebar--wide': isIcons }"
    :aria-label="isIcons ? '资源面板' : '绘图工具'"
  >
    <nav v-if="!isIcons" class="left-sidebar__tools" aria-label="绘图工具">
      <div
        v-for="tool in railTools"
        :key="tool.id"
        class="left-sidebar__slot"
      >
        <button
          class="left-sidebar__tool"
          type="button"
          :title="titleFor(tool.id)"
          :aria-label="`${railLabel(tool.id)}${tool.shortcut ? `（快捷键 ${tool.shortcut}）` : ''}${tool.availability === 'comingSoon' ? '，即将推出' : ''}`"
          :aria-pressed="isActive(tool.id)"
          :aria-disabled="tool.availability === 'comingSoon'"
          :class="{
            'is-active': isActive(tool.id) && tool.availability === 'live',
            'is-soon': tool.availability === 'comingSoon',
          }"
          @click="onToolClick(tool.id, $event)"
          @contextmenu.prevent="onToolClick(tool.id, $event)"
        >
          <component :is="ICONS[tool.id]" :size="18" />
          <ChevronRight
            v-if="tool.flyout && tool.flyout.length > 1"
            :size="10"
            class="left-sidebar__flyout-caret"
            aria-hidden="true"
          />
        </button>

        <div
          v-if="flyoutFor === tool.id && tool.flyout"
          class="left-sidebar__flyout"
          role="menu"
        >
          <button
            v-for="fid in tool.flyout"
            :key="fid"
            type="button"
            role="menuitem"
            class="left-sidebar__flyout-item"
            :class="{
              'is-active': store.activeTool === fid,
              'is-soon': getToolDef(fid)?.availability === 'comingSoon',
            }"
            :aria-disabled="getToolDef(fid)?.availability === 'comingSoon'"
            @click="onFlyoutPick(fid)"
          >
            <component :is="ICONS[fid]" :size="14" />
            <span>{{ getToolDef(fid)?.label }}</span>
            <span v-if="getToolDef(fid)?.availability === 'comingSoon'" class="left-sidebar__soon-tag">
              即将
            </span>
          </button>
        </div>
      </div>
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

  &--wide {
    width: 280px;
  }

  &__tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1 1 auto;
    overflow-y: auto;
  }

  &__slot {
    position: relative;
  }

  &__panel {
    flex: 1 1 auto;
    overflow: hidden;
    min-height: 0;
  }

  &__tool {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 36px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      opacity var(--transition-fast);

    &:hover:not(.is-soon) {
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
    }

    &.is-soon {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  &__flyout-caret {
    position: absolute;
    right: 2px;
    bottom: 2px;
    opacity: 0.7;
  }

  &__flyout {
    position: absolute;
    left: calc(100% + 6px);
    top: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 148px;
    padding: 6px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }

  &__flyout-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    font-size: 12px;
    text-align: left;
    white-space: nowrap;

    &:hover:not(.is-soon) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.is-active {
      background: var(--accent-light);
      color: var(--accent);
    }

    &.is-soon {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  &__soon-tag {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-muted);
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

  &--wide &__mode-toggle {
    align-self: flex-start;
    margin-left: var(--space-2);
  }
}
</style>
