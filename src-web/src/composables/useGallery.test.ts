/**
 * useGallery 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as ApiIndex from '@api/index';

vi.mock('@api/index', async () => {
  const actual = await vi.importActual<typeof ApiIndex>('@api/index');
  return {
    ...actual,
    galleryApi: {
      list: vi.fn(),
      search: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      getImage: vi.fn(),
    },
  };
});

import { useGallery } from '@composables/useGallery';
import { useGalleryStore } from '@stores/galleryStore';

describe('useGallery', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('loadRecent delegates to galleryApi and updates store', async () => {
    const fakeItems = [
      { id: 'a', prompt: 'cat', model: 'gpt-4o', tags: ['animal'], createdAt: 1 },
      { id: 'b', prompt: 'dog', model: 'gpt-4o', tags: ['animal'], createdAt: 2 },
    ];
    vi.mocked(ApiIndex.galleryApi.list).mockResolvedValueOnce(fakeItems as any);
    const g = useGallery();
    const items = await g.loadRecent(50, 0);
    expect(items).toHaveLength(2);
    expect(g.store.items).toHaveLength(2);
    expect(g.store.isLoading).toBe(false);
    expect(ApiIndex.galleryApi.list).toHaveBeenCalledWith(50, 0);
  });

  it('loadRecent appends when offset > 0', async () => {
    vi.mocked(ApiIndex.galleryApi.list).mockResolvedValueOnce([] as any);
    const g = useGallery();
    await g.loadRecent(50, 5);
    expect(ApiIndex.galleryApi.list).toHaveBeenCalledWith(50, 5);
  });

  it('loadRecent returns [] on error', async () => {
    vi.mocked(ApiIndex.galleryApi.list).mockRejectedValueOnce(new Error('boom'));
    const g = useGallery();
    const items = await g.loadRecent();
    expect(items).toEqual([]);
    expect(g.store.isLoading).toBe(false);
  });

  it('search delegates and resets store', async () => {
    vi.mocked(ApiIndex.galleryApi.search).mockResolvedValueOnce({
      items: [{ id: 'x', prompt: 'tree', model: 'mock-v1', tags: ['nature'], createdAt: 1 }],
      total: 1,
    } as any);
    const g = useGallery();
    const items = await g.search('tree');
    expect(items).toHaveLength(1);
    expect(ApiIndex.galleryApi.search).toHaveBeenCalledWith({
      query: 'tree',
      tag: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('saveItem calls save + refresh list', async () => {
    vi.mocked(ApiIndex.galleryApi.save).mockResolvedValueOnce({ id: 'new-id' } as any);
    vi.mocked(ApiIndex.galleryApi.list).mockResolvedValueOnce([] as any);
    const g = useGallery();
    const id = await g.saveItem({
      image_data: 'AAAA',
      tags: ['demo'],
    } as any);
    expect(id).toBe('new-id');
    expect(ApiIndex.galleryApi.save).toHaveBeenCalled();
    expect(ApiIndex.galleryApi.list).toHaveBeenCalledWith(50, 0);
  });

  it('deleteItem removes from store on true', async () => {
    vi.mocked(ApiIndex.galleryApi.delete).mockResolvedValueOnce(true);
    const g = useGallery();
    // 直接填 store
    g.store.items = [
      { id: 'a' } as any,
      { id: 'b' } as any,
    ];
    const ok = await g.deleteItem('a');
    expect(ok).toBe(true);
    expect(g.store.items).toHaveLength(1);
    expect(g.store.items[0].id).toBe('b');
  });

  it('deleteItem leaves store unchanged on false', async () => {
    vi.mocked(ApiIndex.galleryApi.delete).mockResolvedValueOnce(false);
    const g = useGallery();
    g.store.items = [{ id: 'a' } as any];
    await g.deleteItem('a');
    expect(g.store.items).toHaveLength(1);
  });

  it('getDetail delegates to galleryApi.getImage', async () => {
    const detail = { item: { id: 'a', prompt: 'p' } as any, png: 'AAAA' };
    vi.mocked(ApiIndex.galleryApi.getImage).mockResolvedValueOnce(detail);
    const g = useGallery();
    const result = await g.getDetail('a');
    expect(result).toEqual(detail);
  });

  it('items and isLoading are reactive store refs', () => {
    const g = useGallery();
    expect(g.store.items).toBeDefined();
    expect(g.store.isLoading).toBeDefined();
    expect(g.store.isLoading).toBe(false);
  });

  it('store accessor returns the gallery store instance', () => {
    const g = useGallery();
    expect(g.store).toBe(useGalleryStore());
  });
});