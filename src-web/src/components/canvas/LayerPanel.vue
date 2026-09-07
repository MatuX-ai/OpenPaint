<!--
  Layer panel — OpenPencil top-level nodes as layers.

  Actions: add / delete / duplicate / merge down / merge visible / flatten /
  rename / reorder / visibility / lock / opacity / blend / rotate.
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Plus,
  Trash2,
  RotateCw,
  RotateCcw,
  Copy,
  Layers,
  Combine,
} from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import * as layerOps from '@composables/layerOps';
import LayerItem from './LayerItem.vue';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue';
import type { BlendMode } from '@/types/canvas';

const store = useCanvasStore();
const toast = useToast();
const bridge = getOpenPencilBridge();

const isAdding = ref(false);
const dragFromId = ref<string | null>(null);

const menuState = ref<{ visible: boolean; x: number; y: number; layerId: string }>({
  visible: false,
  x: 0,
  y: 0,
  layerId: '',
});

/** UI list: top-most first. */
const layers = computed(() => [...store.layerList].reverse());

function run(result: layerOps.LayerOpResult, successMsg?: string) {
  if (!result.ok) {
    toast.warn(result.message);
    return false;
  }
  if (successMsg) toast.success(successMsg);
  return true;
}

async function addLayer() {
  if (isAdding.value) return;
  isAdding.value = true;
  try {
    const r = layerOps.addLayer(bridge.editor, `图层 ${store.layerList.length + 1}`);
    run(r);
  } catch (e) {
    toast.error(`新建图层失败：${String((e as Error).message ?? e)}`);
  } finally {
    isAdding.value = false;
  }
}

function removeActive() {
  const r = layerOps.deleteActiveLayer(bridge.editor, store.activeLayerId);
  run(r);
}

function onVisibilityChanged(layerId: string, visible: boolean) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.visible = visible;
  try {
    layerOps.setLayerVisible(bridge.editor, layerId, visible);
  } catch (e) {
    if (layer) layer.visible = !visible;
    toast.error(`切换可见性失败：${String((e as Error).message ?? e)}`);
  }
}

function onLockedChanged(layerId: string, locked: boolean) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.locked = locked;
  try {
    layerOps.setLayerLocked(bridge.editor, layerId, locked);
  } catch (e) {
    if (layer) layer.locked = !locked;
    toast.error(`切换锁定失败：${String((e as Error).message ?? e)}`);
  }
}

function onOpacityChanged(layerId: string, opacity: number) {
  const layer = store.layerList.find((l) => l.id === layerId);
  const prev = layer?.opacity;
  if (layer) layer.opacity = opacity;
  try {
    layerOps.setLayerOpacity(bridge.editor, layerId, opacity);
  } catch (e) {
    if (layer && prev != null) layer.opacity = prev;
    toast.error(`调节不透明度失败：${String((e as Error).message ?? e)}`);
  }
}

function onBlendChanged(layerId: string, mode: BlendMode) {
  const layer = store.layerList.find((l) => l.id === layerId);
  const prev = layer?.blendMode;
  if (layer) layer.blendMode = mode;
  try {
    layerOps.setLayerBlendMode(bridge.editor, layerId, mode);
  } catch (e) {
    if (layer && prev) layer.blendMode = prev;
    toast.error(`切换混合模式失败：${String((e as Error).message ?? e)}`);
  }
}

function onRotateRequest(layerId: string, degrees: number) {
  try {
    const r = layerOps.rotateLayer(bridge.editor, layerId, degrees);
    run(r, `已旋转 ${degrees > 0 ? '顺时针' : '逆时针'} ${Math.abs(degrees)}°`);
  } catch (e) {
    toast.error(`旋转失败：${String((e as Error).message ?? e)}`);
  }
}

function onDeleteRequest(layerId: string) {
  try {
    run(layerOps.deleteLayer(bridge.editor, layerId));
  } catch (e) {
    toast.error(`删除失败：${String((e as Error).message ?? e)}`);
  }
}

function onDuplicateRequest(layerId: string) {
  try {
    run(layerOps.duplicateLayer(bridge.editor, layerId), '已复制图层');
  } catch (e) {
    toast.error(`复制失败：${String((e as Error).message ?? e)}`);
  }
}

function onRenameRequest(layerId: string, name: string) {
  try {
    run(layerOps.renameLayer(bridge.editor, layerId, name));
  } catch (e) {
    toast.error(`重命名失败：${String((e as Error).message ?? e)}`);
  }
}

function onSelectRequest(layerId: string) {
  try {
    layerOps.selectLayer(bridge.editor, layerId);
  } catch (e) {
    console.error('[LayerPanel] select failed:', e);
  }
}

function onDragStart(layerId: string) {
  dragFromId.value = layerId;
}

function onDrop(targetId: string) {
  const fromId = dragFromId.value;
  dragFromId.value = null;
  if (!fromId || fromId === targetId) return;
  const display = layers.value.map((l) => l.id);
  const toIndex = display.indexOf(targetId);
  if (toIndex < 0) return;
  try {
    run(layerOps.reorderLayer(bridge.editor, fromId, toIndex));
  } catch (e) {
    toast.error(`重排失败：${String((e as Error).message ?? e)}`);
  }
}

function onMergeDown(layerId: string) {
  try {
    run(layerOps.mergeDown(bridge.editor, layerId), '已向下合并');
  } catch (e) {
    toast.error(`合并失败：${String((e as Error).message ?? e)}`);
  }
}

function onMergeVisible() {
  try {
    run(layerOps.mergeVisible(bridge.editor), '已合并可见图层');
  } catch (e) {
    toast.error(`合并可见失败：${String((e as Error).message ?? e)}`);
  }
}

function onFlattenVisible() {
  try {
    run(layerOps.flattenVisible(bridge.editor), '已拼合可见图层');
  } catch (e) {
    toast.error(`拼合失败：${String((e as Error).message ?? e)}`);
  }
}

function onContextMenu(event: MouseEvent, layerId: string) {
  menuState.value = { visible: true, x: event.clientX, y: event.clientY, layerId };
}

function closeMenu() {
  menuState.value = { ...menuState.value, visible: false };
}

function buildMenuItems(layerId: string): ContextMenuItem[] {
  const layer = store.layerList.find((l) => l.id === layerId);
  const bottomToTop = store.layerList.map((l) => l.id);
  const idx = bottomToTop.indexOf(layerId);
  const canMergeDown = idx > 0;
  const hasMultipleLayers = store.layerList.length > 1;
  const visibleCount = store.layerList.filter((l) => l.visible).length;

  return [
    {
      label: '顺时针旋转 90°',
      icon: RotateCw,
      shortcut: 'R',
      onSelect: () => onRotateRequest(layerId, 90),
    },
    {
      label: '逆时针旋转 90°',
      icon: RotateCcw,
      shortcut: 'Shift+R',
      onSelect: () => onRotateRequest(layerId, -90),
    },
    { label: '', separator: true },
    {
      label: '复制图层',
      icon: Copy,
      onSelect: () => onDuplicateRequest(layerId),
    },
    {
      label: '向下合并',
      icon: Combine,
      disabled: !canMergeDown,
      onSelect: () => onMergeDown(layerId),
    },
    {
      label: '合并可见',
      icon: Layers,
      disabled: visibleCount < 2,
      onSelect: () => onMergeVisible(),
    },
    {
      label: '拼合可见',
      disabled: visibleCount < 1,
      onSelect: () => onFlattenVisible(),
    },
    { label: '', separator: true },
    {
      label: layer?.locked ? '解锁图层' : '锁定图层',
      onSelect: () => onLockedChanged(layerId, !layer?.locked),
    },
    {
      label: layer?.visible ? '隐藏图层' : '显示图层',
      onSelect: () => onVisibilityChanged(layerId, !layer?.visible),
    },
    { label: '', separator: true },
    {
      label: '删除图层',
      icon: Trash2,
      danger: true,
      disabled: !hasMultipleLayers,
      onSelect: () => onDeleteRequest(layerId),
    },
  ];
}
</script>

<template>
  <aside class="layer-panel">
    <header class="layer-panel__header">
      <span class="layer-panel__title">图层</span>
      <div class="layer-panel__actions">
        <button
          class="layer-panel__btn"
          type="button"
          title="新增图层"
          :disabled="isAdding"
          @click="addLayer"
        >
          <Plus :size="14" />
        </button>
        <button
          class="layer-panel__btn"
          type="button"
          title="删除活动图层"
          :disabled="layers.length <= 1"
          @click="removeActive"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </header>

    <ul v-if="layers.length" class="layer-panel__list">
      <LayerItem
        v-for="layer in layers"
        :key="layer.id"
        :layer="layer"
        @visibility-changed="onVisibilityChanged"
        @locked-changed="onLockedChanged"
        @opacity-changed="onOpacityChanged"
        @blend-changed="onBlendChanged"
        @rotate-request="onRotateRequest"
        @delete-request="onDeleteRequest"
        @rename-request="onRenameRequest"
        @select-request="onSelectRequest"
        @drag-start="onDragStart"
        @drop-on="onDrop"
        @context-menu="onContextMenu"
      />
    </ul>

    <div v-else class="layer-panel__empty">
      <p>暂无图层</p>
      <small>点击右上 + 创建第一个图层</small>
    </div>

    <ContextMenu
      :visible="menuState.visible"
      :x="menuState.x"
      :y="menuState.y"
      :items="buildMenuItems(menuState.layerId)"
      @close="closeMenu"
    />
  </aside>
</template>

<style scoped lang="scss">
.layer-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__actions {
    display: inline-flex;
    gap: 2px;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__list {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: var(--space-1);
    color: var(--text-muted);

    small {
      font-size: var(--font-size-xs);
    }
  }
}
</style>
