/**
 * BrushPanel unit tests (W10-D1).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  loadBrushes: vi.fn(),
  setActiveBrush: vi.fn(),
  storeSetActiveBrush: vi.fn(),
  brushes: { value: [] as Array<unknown> },
  brushAssets: { value: [] as Array<unknown> },
  brushLoading: { value: false },
  brushError: { value: null as string | null },
  activeBrushId: { value: 'round-hard' },
}));

vi.mock('@/composables/useAssets', () => ({
  useAssets: () => ({
    loadBrushes: mocks.loadBrushes,
    setActiveBrush: mocks.setActiveBrush,
    brushes: mocks.brushes,
    brushAssets: mocks.brushAssets,
    brushLoading: mocks.brushLoading,
    brushError: mocks.brushError,
    activeBrushId: mocks.activeBrushId,
  }),
}));

vi.mock('@stores/canvasStore', () => ({
  useCanvasStore: () => ({
    setActiveBrush: mocks.storeSetActiveBrush,
    activeBrushId: mocks.activeBrushId.value,
  }),
}));

import BrushPanel from '@/components/asset/BrushPanel.vue';

interface BrushFixture {
  id: string;
  nameZh: string;
  nameEn: string;
  pngBase64: string;
  description: string;
  category: string;
  defaultRadius: number;
  falloff: number;
  byteSize: number;
}

function setBrushAssets(items: BrushFixture[]): void {
  mocks.brushAssets.value = items;
  mocks.brushLoading.value = false;
  mocks.brushError.value = null;
  mocks.brushes.value = items;
}

const sampleBrushes: BrushFixture[] = Array.from({ length: 8 }, (_, k) => ({
  id: `brush-${k}`,
  nameZh: `画刷${k}`,
  nameEn: `Brush ${k}`,
  pngBase64: 'iVBORw0KGgo=',
  description: 'desc',
  category: 'hard',
  defaultRadius: 12,
  falloff: 0.5,
  byteSize: 16,
}));

describe('BrushPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.loadBrushes.mockReset();
    mocks.setActiveBrush.mockReset();
    mocks.storeSetActiveBrush.mockReset();
    mocks.brushAssets.value = [];
    mocks.brushes.value = [];
    mocks.brushLoading.value = false;
    mocks.brushError.value = null;
    mocks.activeBrushId.value = 'round-hard';
  });

  it('BR-101: renders 8 brush thumbnails after load', async () => {
    setBrushAssets(sampleBrushes);
    const w = mount(BrushPanel);
    await flushPromises();
    expect(w.findAll('.brush-panel__item')).toHaveLength(8);
    expect(w.find('.brush-panel__ai').exists()).toBe(true);
  });

  it('BR-102: clicking a brush triggers setActiveBrush + emits brush-changed', async () => {
    setBrushAssets(sampleBrushes);
    const w = mount(BrushPanel);
    await flushPromises();
    const items = w.findAll('.brush-panel__item');
    await items[1].trigger('click');
    expect(mocks.setActiveBrush).toHaveBeenCalledWith('brush-1');
    expect(mocks.storeSetActiveBrush).toHaveBeenCalledWith('brush-1');
    expect(w.emitted('brush-changed')).toBeTruthy();
    expect(w.emitted('brush-changed')![0]).toEqual(['brush-1']);
  });

  it('BR-103: active brush gets the is-active CSS class', async () => {
    mocks.activeBrushId.value = 'brush-2';
    setBrushAssets(sampleBrushes);
    const w = mount(BrushPanel);
    await flushPromises();
    const items = w.findAll('.brush-panel__item');
    expect(items[2].classes()).toContain('is-active');
    expect(items[0].classes()).not.toContain('is-active');
  });

  it('BR-104: AI button emits error with v0.3 hint', async () => {
    setBrushAssets([]);
    const w = mount(BrushPanel);
    await flushPromises();
    await w.find('.brush-panel__ai').trigger('click');
    expect(w.emitted('error')).toBeTruthy();
    expect(String(w.emitted('error')![0][0])).toContain('v0.3');
  });

  it('BR-105: shows error state when loadBrushes fails', async () => {
    mocks.brushAssets.value = [];
    mocks.brushError.value = 'load failed';
    mocks.brushLoading.value = false;
    const w = mount(BrushPanel);
    await flushPromises();
    expect(w.find('.brush-panel__status--error').exists()).toBe(true);
    expect(w.find('.brush-panel__status--error').text()).toContain('load failed');
  });
});
