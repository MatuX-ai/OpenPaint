<!--
  Gallery item card — thumbnail, tags, hover actions.
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Trash2, Maximize2 } from 'lucide-vue-next';
import type { GalleryItem } from '@/types/gallery';

const props = defineProps<{ item: GalleryItem }>();
const emit = defineEmits<{ select: [item: GalleryItem]; delete: [id: string] }>();

const hovered = ref(false);

const thumbSrc = computed(() => props.item.thumbnailPath);

/** Deterministic color from a string id. */
function hashColor(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}
</script>

<template>
  <div class="gallery-item" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <button
      class="gallery-item__thumb"
      type="button"
      :title="item.prompt || item.id"
      @click="emit('select', item)"
    >
      <!-- Backend returns local paths; MVP shows a colored placeholder block. -->
      <img
        v-if="thumbSrc.startsWith('http') || thumbSrc.startsWith('data:')"
        :src="thumbSrc"
        alt=""
        loading="lazy"
      />
      <div
        v-else
        class="gallery-item__placeholder"
        :style="{ backgroundColor: hashColor(item.id) }"
      >
        <span class="gallery-item__dim">{{ item.width }}×{{ item.height }}</span>
      </div>
      <div v-if="hovered" class="gallery-item__overlay">
        <Maximize2 :size="16" />
      </div>
    </button>
    <div class="gallery-item__meta">
      <span class="gallery-item__tags">
        {{ (item.tags || []).slice(0, 2).join(' · ') || '无标签' }}
      </span>
      <button
        class="gallery-item__delete"
        type="button"
        title="删除"
        @click="emit('delete', item.id)"
      >
        <Trash2 :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gallery-item {
  position: relative;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  background: var(--bg-tertiary);
  overflow: hidden;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);

  &:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow);
  }

  &__thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--bg-tertiary);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  &__dim {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.8);
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  &__tags {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--text-muted);
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--error);
      background: var(--bg-hover);
    }
  }
}
</style>
