/**
 * useGallery — gallery data operations wrapped as a composable.
 * Delegates to `galleryApi` and keeps `galleryStore` in sync.
 */

import { useGalleryStore } from '@stores/galleryStore';
import { galleryApi, type SaveToGalleryArgs } from '@api/index';
import type { GalleryItem } from '@/types/gallery';

export interface UseGalleryReturn {
  store: ReturnType<typeof useGalleryStore>;
  items: ReturnType<typeof useGalleryStore>['items'];
  isLoading: ReturnType<typeof useGalleryStore>['isLoading'];
  loadRecent: (limit?: number, offset?: number) => Promise<GalleryItem[]>;
  search: (query: string, tag?: string) => Promise<GalleryItem[]>;
  saveItem: (args: SaveToGalleryArgs) => Promise<string>;
  deleteItem: (recordId: string) => Promise<boolean>;
  getDetail: (recordId: string) => Promise<{ item: GalleryItem; png?: string }>;
}

export function useGallery(): UseGalleryReturn {
  const store = useGalleryStore();

  async function loadRecent(limit = 50, offset = 0): Promise<GalleryItem[]> {
    store.isLoading = true;
    try {
      const items = await galleryApi.list(limit, offset);
      if (offset === 0) store.resetAndSetItems(items);
      else store.appendItems(items);
      store.hasMore = items.length === limit;
      return items;
    } catch (e) {
      console.error('[useGallery] loadRecent failed:', e);
      return [];
    } finally {
      store.isLoading = false;
    }
  }

  async function search(query: string, tag?: string): Promise<GalleryItem[]> {
    store.isLoading = true;
    try {
      const result = await galleryApi.search({
        query: query || undefined,
        tag,
        limit: 50,
        offset: 0,
      });
      store.resetAndSetItems(result.items);
      store.hasMore = result.items.length === 50;
      return result.items;
    } catch (e) {
      console.error('[useGallery] search failed:', e);
      return [];
    } finally {
      store.isLoading = false;
    }
  }

  async function saveItem(args: SaveToGalleryArgs): Promise<string> {
    const res = await galleryApi.save(args);
    await loadRecent(50, 0);
    return res.id;
  }

  async function deleteItem(recordId: string): Promise<boolean> {
    const ok = await galleryApi.delete(recordId);
    if (ok) {
      store.items = store.items.filter((i) => i.id !== recordId);
    }
    return ok;
  }

  async function getDetail(recordId: string): Promise<{ item: GalleryItem; png?: string }> {
    return galleryApi.getImage(recordId);
  }

  return {
    store,
    items: store.items,
    isLoading: store.isLoading,
    loadRecent,
    search,
    saveItem,
    deleteItem,
    getDetail,
  };
}