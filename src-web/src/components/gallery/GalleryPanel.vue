<!--
  Gallery panel (right sidebar tab).
  Loads recent items, supports search, detail view and paste-to-canvas.
-->

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import GallerySearch from './GallerySearch.vue';
import GalleryGrid from './GalleryGrid.vue';
import GalleryDetail from './GalleryDetail.vue';
import Spinner from '@/components/common/Spinner.vue';
import { useGallery } from '@composables/useGallery';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import { useDocumentState } from '@composables/useDocumentState';
import { useToast } from '@composables/useToast';
import type { GalleryItem } from '@/types/gallery';

const { items, isLoading, loadRecent, search, deleteItem, getDetail } = useGallery();
const bridge = getOpenPencilBridge();
const doc = useDocumentState();
const toast = useToast();

const query = ref('');
const detailItem = ref<GalleryItem | null>(null);
const detailPng = ref<string | undefined>(undefined);

onMounted(() => {
  void loadRecent(50, 0);
});

async function onSearch(q: string) {
  if (q.trim()) {
    await search(q.trim());
  } else {
    await loadRecent(50, 0);
  }
}

async function onSelect(item: GalleryItem) {
  detailPng.value = undefined;
  detailItem.value = item;
  try {
    const detail = await getDetail(item.id);
    detailPng.value = detail.png;
  } catch (e) {
    console.error('[GalleryPanel] getDetail failed:', e);
  }
}

async function onDelete(id: string) {
  await deleteItem(id);
  if (detailItem.value?.id === id) {
    detailItem.value = null;
  }
}

async function onPasteToCanvas(item: GalleryItem) {
  // Fetch the original PNG then place into the OpenPencil document.
  try {
    const detail = await getDetail(item.id);
    if (detail.png) {
      await bridge.placeDataUrl(detail.png, `${item.id}.png`);
      doc.markDirty();
      detailItem.value = null;
      toast.success('已导入到画布');
    }
  } catch (e) {
    console.error('[GalleryPanel] paste failed:', e);
    toast.error(`导入失败：${String((e as Error).message ?? e)}`);
  }
}

defineExpose({ loadRecent, search });
</script>

<template>
  <div class="gallery-panel">
    <GallerySearch v-model="query" @search="onSearch" />

    <div v-if="isLoading && !items.length" class="gallery-panel__loading">
      <Spinner size="md" />
    </div>

    <div v-else-if="!items.length" class="gallery-panel__empty">
      <p>图库为空</p>
      <small>AI 生成结果会自动归档到这里</small>
    </div>

    <GalleryGrid v-else :items="items" @select="onSelect" @delete="onDelete" />
  </div>

  <GalleryDetail
    :item="detailItem"
    :png="detailPng"
    @close="detailItem = null"
    @paste-to-canvas="onPasteToCanvas"
  />
</template>

<style scoped lang="scss">
.gallery-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  &__loading,
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);

    small {
      font-size: var(--font-size-xs);
    }
  }
}
</style>
