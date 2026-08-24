/**
 * galleryStore 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGalleryStore } from '@/stores/galleryStore';
import type { GalleryItem } from '@/types/gallery';

// Helper to create mock gallery items
function createMockItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    thumbnailPath: '/path/to/thumb.png',
    width: 512,
    height: 512,
    tags: [],
    createdAt: Date.now(),
    source: 'ai_generated',
    ...overrides,
  };
}

describe('galleryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const store = useGalleryStore();

      expect(store.items).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.hasMore).toBe(true);
      expect(store.page).toBe(0);
      expect(store.pageSize).toBe(50);
      expect(store.searchQuery).toBe('');
      expect(store.selectedTags).toEqual([]);
    });
  });

  describe('resetAndSetItems', () => {
    it('should replace items and reset pagination', () => {
      const store = useGalleryStore();
      const newItems: GalleryItem[] = [
        createMockItem({ id: 'new-1' }),
        createMockItem({ id: 'new-2' }),
      ];

      // Set some initial state
      store.items = [createMockItem({ id: 'old-1' })];
      store.page = 5;
      store.hasMore = false;

      store.resetAndSetItems(newItems);

      expect(store.items).toHaveLength(2);
      expect(store.items[0].id).toBe('new-1');
      expect(store.items[1].id).toBe('new-2');
      expect(store.page).toBe(0);
      expect(store.hasMore).toBe(true);
    });

    it('should handle empty items array', () => {
      const store = useGalleryStore();
      store.items = [createMockItem()];

      store.resetAndSetItems([]);

      expect(store.items).toHaveLength(0);
      expect(store.page).toBe(0);
      expect(store.hasMore).toBe(true);
    });

    it('should preserve item properties', () => {
      const store = useGalleryStore();
      const item: GalleryItem = {
        id: 'detailed-item',
        groupId: 'group-1',
        thumbnailPath: '/thumb.png',
        fullSizePath: '/full.png',
        width: 1024,
        height: 768,
        prompt: 'A beautiful landscape',
        model: 'stable-diffusion-xl',
        tags: ['landscape', 'nature'],
        createdAt: 1700000000000,
        source: 'ai_generated',
      };

      store.resetAndSetItems([item]);

      expect(store.items[0]).toEqual(item);
      expect(store.items[0].prompt).toBe('A beautiful landscape');
      expect(store.items[0].tags).toContain('landscape');
    });
  });

  describe('appendItems', () => {
    it('should add items to existing list', () => {
      const store = useGalleryStore();
      store.items = [createMockItem({ id: 'existing-1' })];

      const newItems: GalleryItem[] = [
        createMockItem({ id: 'new-1' }),
        createMockItem({ id: 'new-2' }),
      ];

      store.appendItems(newItems);

      expect(store.items).toHaveLength(3);
      expect(store.items[0].id).toBe('existing-1');
      expect(store.items[1].id).toBe('new-1');
      expect(store.items[2].id).toBe('new-2');
    });

    it('should handle appending to empty list', () => {
      const store = useGalleryStore();

      store.appendItems([createMockItem({ id: 'first' })]);

      expect(store.items).toHaveLength(1);
      expect(store.items[0].id).toBe('first');
    });

    it('should handle appending empty array', () => {
      const store = useGalleryStore();
      store.items = [createMockItem({ id: 'keep-me' })];

      store.appendItems([]);

      expect(store.items).toHaveLength(1);
      expect(store.items[0].id).toBe('keep-me');
    });

    it('should maintain order when appending multiple times', () => {
      const store = useGalleryStore();

      store.appendItems([createMockItem({ id: 'batch1-1' })]);
      store.appendItems([createMockItem({ id: 'batch2-1' }), createMockItem({ id: 'batch2-2' })]);
      store.appendItems([createMockItem({ id: 'batch3-1' })]);

      expect(store.items).toHaveLength(4);
      expect(store.items.map((i) => i.id)).toEqual([
        'batch1-1',
        'batch2-1',
        'batch2-2',
        'batch3-1',
      ]);
    });
  });

  describe('isLoading state', () => {
    it('should allow setting loading state', () => {
      const store = useGalleryStore();

      store.isLoading = true;
      expect(store.isLoading).toBe(true);

      store.isLoading = false;
      expect(store.isLoading).toBe(false);
    });
  });

  describe('hasMore state', () => {
    it('should allow setting hasMore flag', () => {
      const store = useGalleryStore();

      store.hasMore = false;
      expect(store.hasMore).toBe(false);

      store.hasMore = true;
      expect(store.hasMore).toBe(true);
    });
  });

  describe('page state', () => {
    it('should allow setting page number', () => {
      const store = useGalleryStore();

      store.page = 1;
      expect(store.page).toBe(1);

      store.page = 10;
      expect(store.page).toBe(10);
    });
  });

  describe('searchQuery state', () => {
    it('should allow setting search query', () => {
      const store = useGalleryStore();

      store.searchQuery = 'landscape';
      expect(store.searchQuery).toBe('landscape');
    });

    it('should allow clearing search query', () => {
      const store = useGalleryStore();

      store.searchQuery = 'test';
      store.searchQuery = '';
      expect(store.searchQuery).toBe('');
    });
  });

  describe('selectedTags state', () => {
    it('should allow setting selected tags', () => {
      const store = useGalleryStore();

      store.selectedTags = ['nature', 'portrait'];
      expect(store.selectedTags).toEqual(['nature', 'portrait']);
    });

    it('should allow adding tags', () => {
      const store = useGalleryStore();

      store.selectedTags.push('landscape');
      expect(store.selectedTags).toContain('landscape');
    });

    it('should allow removing tags', () => {
      const store = useGalleryStore();
      store.selectedTags = ['tag1', 'tag2', 'tag3'];

      store.selectedTags = store.selectedTags.filter((t) => t !== 'tag2');

      expect(store.selectedTags).toEqual(['tag1', 'tag3']);
      expect(store.selectedTags).not.toContain('tag2');
    });

    it('should allow clearing all tags', () => {
      const store = useGalleryStore();
      store.selectedTags = ['tag1', 'tag2'];

      store.selectedTags = [];

      expect(store.selectedTags).toEqual([]);
    });
  });

  describe('combined operations', () => {
    it('should handle typical pagination flow', () => {
      const store = useGalleryStore();

      // First page
      const firstPage = Array.from({ length: 50 }, (_, i) => createMockItem({ id: `page0-${i}` }));
      store.resetAndSetItems(firstPage);
      expect(store.items).toHaveLength(50);
      expect(store.page).toBe(0);

      // Second page
      store.page = 1;
      const secondPage = Array.from({ length: 50 }, (_, i) => createMockItem({ id: `page1-${i}` }));
      store.appendItems(secondPage);
      expect(store.items).toHaveLength(100);

      // Third page (partial - last page)
      store.page = 2;
      const thirdPage = Array.from({ length: 20 }, (_, i) => createMockItem({ id: `page2-${i}` }));
      store.appendItems(thirdPage);
      store.hasMore = false;

      expect(store.items).toHaveLength(120);
      expect(store.hasMore).toBe(false);
    });

    it('should handle search reset flow', () => {
      const store = useGalleryStore();

      // Initial load
      store.resetAndSetItems([createMockItem({ id: 'initial' })]);
      expect(store.items).toHaveLength(1);

      // Search
      store.searchQuery = 'test';
      const searchResults = [
        createMockItem({ id: 'result-1', prompt: 'test image' }),
        createMockItem({ id: 'result-2', prompt: 'another test' }),
      ];
      store.resetAndSetItems(searchResults);

      expect(store.items).toHaveLength(2);
      expect(store.page).toBe(0);
      expect(store.searchQuery).toBe('test');
    });
  });

  describe('item source types', () => {
    it('should handle ai_generated items', () => {
      const store = useGalleryStore();
      const item = createMockItem({ source: 'ai_generated', model: 'sd-xl' });

      store.resetAndSetItems([item]);

      expect(store.items[0].source).toBe('ai_generated');
      expect(store.items[0].model).toBe('sd-xl');
    });

    it('should handle imported items', () => {
      const store = useGalleryStore();
      const item = createMockItem({ source: 'imported', model: undefined });

      store.resetAndSetItems([item]);

      expect(store.items[0].source).toBe('imported');
      expect(store.items[0].model).toBeUndefined();
    });
  });
});
