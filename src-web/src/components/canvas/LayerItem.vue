<!--
  LayerItem — single row in the LayerPanel list.

  Emits property / action events; LayerPanel applies OpenPencil mutations.
  Supports inline rename (double-click name) and HTML5 drag reorder.
-->

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Eye, EyeOff, Lock, Unlock, GripVertical } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer, BlendMode } from '@/types/canvas';

const props = defineProps<{ layer: Layer }>();
const emit = defineEmits<{
  'visibility-changed': [layerId: string, visible: boolean];
  'locked-changed': [layerId: string, locked: boolean];
  'opacity-changed': [layerId: string, opacity: number];
  'blend-changed': [layerId: string, mode: BlendMode];
  'rotate-request': [layerId: string, degrees: number];
  'delete-request': [layerId: string];
  'rename-request': [layerId: string, name: string];
  'select-request': [layerId: string];
  'drag-start': [layerId: string];
  'drop-on': [layerId: string];
  'context-menu': [event: MouseEvent, layerId: string];
}>();

const store = useCanvasStore();

const isActive = computed(() => props.layer.isActive || props.layer.id === store.activeLayerId);

const editing = ref(false);
const draftName = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const blendModes: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
];

function toggleLocked(e: Event) {
  e.stopPropagation();
  emit('locked-changed', props.layer.id, !props.layer.locked);
}

function toggleVisible(e: Event) {
  e.stopPropagation();
  emit('visibility-changed', props.layer.id, !props.layer.visible);
}

function setOpacity(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  emit('opacity-changed', props.layer.id, value / 100);
}

function setBlendMode(e: Event) {
  e.stopPropagation();
  emit('blend-changed', props.layer.id, (e.target as HTMLSelectElement).value as BlendMode);
}

function select() {
  if (editing.value) return;
  emit('select-request', props.layer.id);
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit('context-menu', e, props.layer.id);
}

async function startRename(e: Event) {
  e.stopPropagation();
  editing.value = true;
  draftName.value = props.layer.name;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
}

function commitRename() {
  if (!editing.value) return;
  editing.value = false;
  const next = draftName.value.trim();
  if (next && next !== props.layer.name) {
    emit('rename-request', props.layer.id, next);
  }
}

function cancelRename() {
  editing.value = false;
  draftName.value = props.layer.name;
}

function onNameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelRename();
  }
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.layer.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  emit('drag-start', props.layer.id);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  emit('drop-on', props.layer.id);
}
</script>

<template>
  <li
    class="layer-item"
    :class="{
      'is-active': isActive,
      'is-locked': layer.locked,
      'is-hidden': !layer.visible,
    }"
    draggable="true"
    @click="select"
    @contextmenu="onContextMenu"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <div class="layer-item__top">
      <span class="layer-item__grip" title="拖动排序" aria-hidden="true">
        <GripVertical :size="12" />
      </span>
      <button
        class="layer-item__icon-btn"
        type="button"
        :title="layer.visible ? '隐藏图层' : '显示图层'"
        :aria-label="layer.visible ? '隐藏图层' : '显示图层'"
        @click="toggleVisible"
      >
        <Eye v-if="layer.visible" :size="14" />
        <EyeOff v-else :size="14" />
      </button>
      <button
        class="layer-item__icon-btn layer-item__icon-btn--lock"
        type="button"
        :title="layer.locked ? '解锁图层' : '锁定图层'"
        :aria-label="layer.locked ? '解锁图层' : '锁定图层'"
        :aria-pressed="layer.locked"
        @click="toggleLocked"
      >
        <Lock v-if="layer.locked" :size="14" />
        <Unlock v-else :size="14" />
      </button>
      <div class="layer-item__name-wrap">
        <input
          v-if="editing"
          ref="nameInput"
          v-model="draftName"
          class="layer-item__name-input"
          type="text"
          aria-label="图层名称"
          @click.stop
          @keydown="onNameKeydown"
          @blur="commitRename"
        />
        <span
          v-else
          class="layer-item__name"
          :title="'双击重命名'"
          @dblclick="startRename"
        >
          {{ layer.name }}
        </span>
      </div>
      <select
        class="layer-item__blend"
        :value="layer.blendMode ?? 'normal'"
        aria-label="混合模式"
        @click.stop
        @change="setBlendMode"
      >
        <option v-for="m in blendModes" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
    </div>
    <div class="layer-item__opacity-row">
      <input
        class="layer-item__opacity-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="Math.round(layer.opacity * 100)"
        :aria-label="`不透明度 ${Math.round(layer.opacity * 100)}%`"
        :title="`不透明度 ${Math.round(layer.opacity * 100)}%`"
        @click.stop
        @input="setOpacity"
      />
      <span class="layer-item__opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
    </div>
  </li>
</template>

<style scoped lang="scss">
.layer-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.is-active {
    background: var(--accent-light);
    color: var(--accent);
    border-left-color: var(--accent);
  }

  &.is-locked {
    opacity: 0.85;
  }

  &.is-hidden {
    opacity: 0.55;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  &__grip {
    display: inline-flex;
    color: var(--text-muted);
    cursor: grab;
    flex-shrink: 0;
  }

  &__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: inherit;
    border-radius: var(--radius-sm);
    flex-shrink: 0;

    &:hover {
      background: var(--bg-hover);
    }
  }

  &__name-wrap {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__name-input {
    width: 100%;
    height: 22px;
    padding: 0 4px;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--accent);
    border-radius: 3px;
  }

  &__blend {
    appearance: none;
    -webkit-appearance: none;
    height: 18px;
    padding: 0 4px;
    font-size: 10px;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      border-color: var(--accent);
    }

    &:focus {
      outline: 1px solid var(--accent);
    }
  }

  &__opacity-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 16px;
  }

  &__opacity-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  &__opacity-value {
    min-width: 32px;
    text-align: right;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>
