/**
 * Gallery state.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GalleryItem } from '@/types/gallery';

export const useGalleryStore = defineStore('gallery', () => {
  const items = ref<GalleryItem[]>([]);
  const isLoading = ref(false);
  const hasMore = ref(true);
  const page = ref(0);
  const pageSize = 50;
  const searchQuery = ref('');
  const selectedTags = ref<string[]>([]);

  function resetAndSetItems(newItems: GalleryItem[]) {
    items.value = newItems;
    page.value = 0;
    hasMore.value = true;
  }

  function appendItems(newItems: GalleryItem[]) {
    items.value.push(...newItems);
  }

  return {
    items,
    isLoading,
    hasMore,
    page,
    pageSize,
    searchQuery,
    selectedTags,
    resetAndSetItems,
    appendItems,
  };
});