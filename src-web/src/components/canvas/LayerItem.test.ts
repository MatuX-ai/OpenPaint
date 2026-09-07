/**
 * LayerItem — emit-only property / rename / drag events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import LayerItem from './LayerItem.vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer } from '@/types/canvas';

vi.mock('@composables/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'layer-1',
    name: '背景',
    opacity: 0.8,
    blendMode: 'normal',
    visible: true,
    locked: false,
    width: 1280,
    height: 720,
    offsetX: 0,
    offsetY: 0,
    isActive: false,
    ...overrides,
  };
}

describe('LayerItem', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders name and opacity', () => {
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    expect(w.find('.layer-item__name').text()).toBe('背景');
    expect(w.find('.layer-item__opacity-value').text()).toBe('80%');
  });

  it('click emits select-request', async () => {
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    await w.trigger('click');
    expect(w.emitted('select-request')?.[0]).toEqual(['layer-1']);
  });

  it('visibility / lock toggles emit events', async () => {
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    await w.find('button[aria-label="隐藏图层"]').trigger('click');
    expect(w.emitted('visibility-changed')?.[0]).toEqual(['layer-1', false]);
    await w.find('button[aria-label="锁定图层"]').trigger('click');
    expect(w.emitted('locked-changed')?.[0]).toEqual(['layer-1', true]);
  });

  it('opacity slider emits opacity-changed', async () => {
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    const slider = w.find('.layer-item__opacity-slider');
    (slider.element as HTMLInputElement).value = '50';
    await slider.trigger('input');
    expect(w.emitted('opacity-changed')?.[0]).toEqual(['layer-1', 0.5]);
  });

  it('double-click name enters rename; Enter commits', async () => {
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    await w.find('.layer-item__name').trigger('dblclick');
    await nextTick();
    const input = w.find('.layer-item__name-input');
    expect(input.exists()).toBe(true);
    await input.setValue('新名称');
    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(w.emitted('rename-request')?.[0]).toEqual(['layer-1', '新名称']);
  });

  it('active layer gets is-active class', () => {
    const store = useCanvasStore();
    store.activeLayerId = 'layer-1';
    const w = mount(LayerItem, { props: { layer: makeLayer() } });
    expect(w.classes()).toContain('is-active');
  });
});
