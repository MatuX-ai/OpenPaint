<!--
  Gallery grid — thumbnail cards with lazy loading.
-->

<script setup lang="ts">
import { computed } from 'vue';
import GalleryItem from './GalleryItem.vue';
import type { GalleryItem as GalleryItemType } from '@/types/gallery';

const props = defineProps<{ items: GalleryItemType[] }>();

const emit = defineEmits<{ select: [item: GalleryItemType]; delete: [id: string] }>();

const sorted = computed(() => [...props.items].sort((a, b) => b.createdAt - a.createdAt));
</script>

<template>
  <div class="gallery-grid">
    <GalleryItem
      v-for="item in sorted"
      :key="item.id"
      :item="item"
      @select="(it) => emit('select', it)"
      @delete="(id) => emit('delete', id)"
    />
  </div>
</template>

<style scoped lang="scss">
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: var(--space-2);
  padding: var(--space-2);
  overflow: auto;
}
</style>
