/**
 * useFileActions 行为测试 — 仅覆盖纯函数 / 内部 helper 的可测部分。
 *
 * W14+：导入 / 导出 / 撤销走 OpenPencil bridge；图库落盘仍走 galleryApi。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type * as ApiIndex from '@api/index';
import type * as Runtime from '@api/runtime';

const placeDataUrl = vi.fn(async () => undefined);
const placeFiles = vi.fn(async () => undefined);
const placeBytes = vi.fn(async () => undefined);
const exportRaster = vi.fn(async () => ({
  mime: 'image/png',
  bytesBase64: 'AAA',
  width: 100,
  height: 100,
  dataUrl: 'data:image/png;base64,AAA',
}));
const undo = vi.fn();
const redo = vi.fn();
const selectAll = vi.fn();
const deleteSelected = vi.fn();
const zoomToFit = vi.fn();

vi.mock('@composables/useOpenPencil', () => ({
  getOpenPencilBridge: () => ({
    status: { value: 'ready' },
    placeDataUrl,
    placeFiles,
    placeBytes,
    exportRaster,
    undo,
    redo,
    editor: {
      selectAll,
      deleteSelected,
      zoomToFit,
    },
  }),
  syncOpenPencilStateToCanvasStore: vi.fn(),
}));

// stub galleryApi
vi.mock('@api/index', async () => {
  const actual = (await vi.importActual('@api/index')) as typeof ApiIndex;
  return {
    ...actual,
    galleryApi: {
      save: vi.fn(async () => ({ id: 'g1', width: 100, height: 100, thumbnail_path: '' })),
    },
  };
});

// stub runtime isTauri: 默认 desktop
vi.mock('@api/runtime', async () => {
  const actual = (await vi.importActual('@api/runtime')) as typeof Runtime;
  return {
    ...actual,
    isTauri: () => true,
  };
});

describe('useFileActions (Tauri desktop mode)', () => {
  beforeEach(async () => {
    vi.resetModules();
    setActivePinia(createPinia());
    placeDataUrl.mockClear();
    placeFiles.mockClear();
    placeBytes.mockClear();
    exportRaster.mockClear();
    undo.mockClear();
    redo.mockClear();
    selectAll.mockClear();
    deleteSelected.mockClear();
    zoomToFit.mockClear();
    const { galleryApi } = await import('@api/index');
    (galleryApi.save as ReturnType<typeof vi.fn>).mockClear();
  });

  async function load() {
    const mod = await import('@composables/useFileActions');
    return mod.useFileActions();
  }

  it('importFromDataUrl calls placeDataUrl + markDirty', async () => {
    const f = await load();
    const ok = await f.importFromDataUrl('data:image/png;base64,XXX', 'png');
    expect(ok).toBe(true);
    expect(placeDataUrl).toHaveBeenCalledWith('data:image/png;base64,XXX', 'import.png');
    const { useDocumentState } = await import('@composables/useDocumentState');
    expect(useDocumentState().isDirty.value).toBe(true);
  });

  it('importFromDataUrl returns false on place failure', async () => {
    placeDataUrl.mockRejectedValueOnce(new Error('boom'));
    const f = await load();
    const ok = await f.importFromDataUrl('data:image/png;base64,XXX');
    expect(ok).toBe(false);
  });

  it('importFromFiles rejects unsupported extension', async () => {
    const f = await load();
    const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
    await f.importFromFiles([file]);
    expect(placeFiles).not.toHaveBeenCalled();
  });

  it('importFromFiles rejects oversized files', async () => {
    const f = await load();
    const huge = new File([new Uint8Array(60 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await f.importFromFiles([huge]);
    expect(placeFiles).not.toHaveBeenCalled();
  });

  it('importFromFiles accepts a supported PNG via placeFiles', async () => {
    const f = await load();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', {
      type: 'image/png',
    });
    await f.importFromFiles([png]);
    expect(placeFiles).toHaveBeenCalledWith([png]);
  });

  it('exportImage resolves without throw when dialog cancels', async () => {
    const f = await load();
    await expect(f.exportImage('jpg', 85)).resolves.toBeUndefined();
  });

  it('newCanvas with mm unit converts to px via DPI and clears document', async () => {
    const f = await load();
    await f.newCanvas({
      width: 210,
      height: 297,
      unit: 'mm',
      dpi: 300,
      handleLayers: 'discard',
    });
    expect(selectAll).toHaveBeenCalled();
    expect(deleteSelected).toHaveBeenCalled();
    const { useCanvasStore } = await import('@stores/canvasStore');
    const store = useCanvasStore();
    expect(store.canvasWidth).toBeGreaterThanOrEqual(2470);
    expect(store.canvasWidth).toBeLessThanOrEqual(2490);
    expect(store.canvasHeight).toBeGreaterThanOrEqual(3490);
    expect(store.canvasHeight).toBeLessThanOrEqual(3520);
  });

  it('saveToGallery calls galleryApi.save with OpenPencil PNG + tags', async () => {
    const f = await load();
    const ok = await f.saveToGallery(['demo', 'test']);
    expect(ok).toBe(true);
    expect(exportRaster).toHaveBeenCalledWith('png');
    const { galleryApi } = await import('@api/index');
    expect(galleryApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: 'data:image/png;base64,AAA',
        tags: ['demo', 'test'],
        source: 'imported',
      }),
    );
    const { useDocumentState } = await import('@composables/useDocumentState');
    expect(useDocumentState().state.value).toBe('saved');
  });

  it('saveToGallery returns false when exportRaster returns empty', async () => {
    exportRaster.mockResolvedValueOnce(null);
    const f = await load();
    const ok = await f.saveToGallery([]);
    expect(ok).toBe(false);
  });
});
