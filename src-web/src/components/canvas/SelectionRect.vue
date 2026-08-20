<!--
  Selection overlay — renders a dashed border around the current selection.
  Reads from `canvasStore.selection`. Hidden when no selection exists.
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Selection } from '@/types/canvas';

const props = defineProps<{ selection: Selection | null }>();

const visible = computed(
  () => !!props.selection && props.selection.width > 0 && props.selection.height > 0,
);
const style = computed(() => {
  if (!props.selection) return {};
  return {
    left: `${props.selection.x}px`,
    top: `${props.selection.y}px`,
    width: `${props.selection.width}px`,
    height: `${props.selection.height}px`,
  };
});
</script>

<template>
  <div v-if="visible" class="selection-rect" :style="style" aria-hidden="true">
    <span class="selection-rect__tag">
      {{ Math.round(selection!.width) }} 脳 {{ Math.round(selection!.height) }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.selection-rect {
  position: absolute;
  border: 1px dashed var(--accent);
  background: rgba(108, 92, 231, 0.06);
  pointer-events: none;
  z-index: 4;
  animation: selection-marquee 1.2s linear infinite;

  &__tag {
    position: absolute;
    top: -22px;
    left: 0;
    padding: 1px 6px;
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--accent);
    background: var(--bg-secondary);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }
}

@keyframes selection-marquee {
  0% {
    border-color: var(--accent);
  }
  50% {
    border-color: var(--accent-hover);
  }
  100% {
    border-color: var(--accent);
  }
}
</style>
