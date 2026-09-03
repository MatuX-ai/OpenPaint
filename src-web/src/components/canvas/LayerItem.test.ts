/**
 * LayerItem 组件测试 — W15 · G1
 *
 * 覆盖：
 *  - 基础渲染（名称 + 不透明度百分比）
 *  - 锁 / 可见性 / 不透明度 / 混合模式 / 选中 / 右键 行为
 *  - IPC 错误时 store 状态回滚 + toast.error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import LayerItem from './LayerItem.vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer } from '@/types/canvas';

const mocks = vi.hoisted(() => ({
  setLayerVisibility: vi.fn(),
  setLayerLocked: vi.fn(),
  setLayerOpacity: vi.fn(),
  setLayerBlendMode: vi.fn(),
  setActiveLayer: vi.fn(),
  rotateLayer: vi.fn(),
  toastError: vi.fn(),
  toastWarn: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@api/index', () => ({
  canvasApi: {
    setLayerVisibility: mocks.setLayerVisibility,
    setLayerLocked: mocks.setLayerLocked,
    setLayerOpacity: mocks.setLayerOpacity,
    setLayerBlendMode: mocks.setLayerBlendMode,
    setActiveLayer: mocks.setActiveLayer,
    rotateLayer: mocks.rotateLayer,
  },
}));

vi.mock('@composables/useToast', () => ({
  useToast: () => ({
    error: mocks.toastError,
    warn: mocks.toastWarn,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
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
    Object.values(mocks).forEach((m) => {
      if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
    });
    // 默认所有 IPC 成功
    mocks.setLayerVisibility.mockResolvedValue(undefined);
    mocks.setLayerLocked.mockResolvedValue(undefined);
    mocks.setLayerOpacity.mockResolvedValue(undefined);
    mocks.setLayerBlendMode.mockResolvedValue(undefined);
    mocks.setActiveLayer.mockResolvedValue(undefined);
  });

  it('L1: 渲染 layer.name + Math.round(opacity*100)%', () => {
    const layer = makeLayer({ name: 'Layer A', opacity: 0.7 });
    const w = mount(LayerItem, { props: { layer } });
    expect(w.text()).toContain('Layer A');
    expect(w.text()).toContain('70%');
  });

  it('L2: 点击可见性按钮调 canvasApi.setLayerVisibility + emit visibility-changed', async () => {
    const layer = makeLayer({ visible: true });
    const w = mount(LayerItem, { props: { layer } });
    const btn = w.find('.layer-item__icon-btn:not(.layer-item__icon-btn--lock)');
    await btn.trigger('click');
    expect(mocks.setLayerVisibility).toHaveBeenCalledWith('layer-1', false);
    expect(w.emitted('visibility-changed')).toBeTruthy();
    expect(w.emitted('visibility-changed')![0]).toEqual(['layer-1', false]);
  });

  it('L3: 点击锁按钮调 canvasApi.setLayerLocked + emit locked-changed', async () => {
    const layer = makeLayer({ locked: false });
    const w = mount(LayerItem, { props: { layer } });
    const btn = w.find('.layer-item__icon-btn--lock');
    await btn.trigger('click');
    expect(mocks.setLayerLocked).toHaveBeenCalledWith('layer-1', true);
    expect(w.emitted('locked-changed')![0]).toEqual(['layer-1', true]);
  });

  it('L4: canvasApi.setLayerLocked reject 时回滚 + toast.error', async () => {
    mocks.setLayerLocked.mockRejectedValueOnce(new Error('ipc 失败'));
    const layer = makeLayer({ locked: false });
    const w = mount(LayerItem, { props: { layer } });
    const btn = w.find('.layer-item__icon-btn--lock');
    await btn.trigger('click');
    // 等待 microtask 完成
    await flush();
    expect(w.emitted('locked-changed')).toHaveLength(2);
    expect(w.emitted('locked-changed')![0]).toEqual(['layer-1', true]); // 乐观更新
    expect(w.emitted('locked-changed')![1]).toEqual(['layer-1', false]); // 回滚
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('L5: 拖动 opacity slider 触发 setLayerOpacity + emit', async () => {
    const layer = makeLayer({ opacity: 1 });
    const w = mount(LayerItem, { props: { layer } });
    const slider = w.find('input[type="range"]');
    // setValue + trigger input
    await slider.setValue('50');
    expect(mocks.setLayerOpacity).toHaveBeenCalledWith('layer-1', 0.5);
    expect(w.emitted('opacity-changed')![0]).toEqual(['layer-1', 0.5]);
  });

  it('L6: 切换 blend mode select 触发 setLayerBlendMode + emit', async () => {
    const layer = makeLayer({ blendMode: 'normal' });
    const w = mount(LayerItem, { props: { layer } });
    const select = w.find('select');
    await select.setValue('multiply');
    expect(mocks.setLayerBlendMode).toHaveBeenCalledWith('layer-1', 'multiply');
    expect(w.emitted('blend-changed')![0]).toEqual(['layer-1', 'multiply']);
  });

  it('L7: 点击 li 触发 canvasApi.setActiveLayer + store.activeLayerId 更新', async () => {
    const store = useCanvasStore();
    const layer = makeLayer({ id: 'layer-2', isActive: false });
    const w = mount(LayerItem, { props: { layer } });
    await w.find('li').trigger('click');
    await flush();
    expect(mocks.setActiveLayer).toHaveBeenCalledWith('layer-2');
    expect(store.activeLayerId).toBe('layer-2');
  });

  it('L8: 右键 (contextmenu) emit context-menu(event, id)', async () => {
    const layer = makeLayer({ id: 'layer-3' });
    const w = mount(LayerItem, { props: { layer } });
    await w.find('li').trigger('contextmenu');
    const emitted = w.emitted('context-menu');
    expect(emitted).toBeTruthy();
    expect(emitted![0][1]).toBe('layer-3');
  });

  it('L9: is-active / is-locked / is-hidden class 正确', async () => {
    const layer = makeLayer({ isActive: true, locked: true, visible: false });
    const w = mount(LayerItem, { props: { layer } });
    const li = w.find('li');
    expect(li.classes()).toContain('is-active');
    expect(li.classes()).toContain('is-locked');
    expect(li.classes()).toContain('is-hidden');
  });
});

/** 等待 microtask 队列完成 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await nextTick();
}
