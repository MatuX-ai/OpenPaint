/**
 * LayerPanel 组件测试 — W15 · G1
 *
 * 覆盖：
 *  - 渲染 layers（reverse 顺序，top-most 在前）
 *  - addLayer / removeActiveLayer 调用
 *  - LayerItem 事件转发到 store
 *  - 右键菜单构建（旋转 90° 等项）
 *  - 菜单"删除图层"项触发 setActiveLayer + removeActiveLayer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import LayerPanel from './LayerPanel.vue';
import LayerItem from './LayerItem.vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer } from '@/types/canvas';

const mocks = vi.hoisted(() => ({
  addLayer: vi.fn(),
  removeActiveLayer: vi.fn(),
  setActiveLayer: vi.fn(),
  rotateLayer: vi.fn(),
  setLayerLocked: vi.fn(),
  setLayerVisibility: vi.fn(),
  toastError: vi.fn(),
  toastWarn: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@api/index', () => ({
  canvasApi: {
    addLayer: mocks.addLayer,
    removeActiveLayer: mocks.removeActiveLayer,
    setActiveLayer: mocks.setActiveLayer,
    rotateLayer: mocks.rotateLayer,
    setLayerLocked: mocks.setLayerLocked,
    setLayerVisibility: mocks.setLayerVisibility,
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

function makeLayer(id: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    name: `Layer ${id}`,
    opacity: 1,
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

function mountPanel() {
  return mount(LayerPanel, { attachTo: document.body });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await nextTick();
}

describe('LayerPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => {
      if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
    });
    mocks.addLayer.mockImplementation(async (name: string) => `new-${name}`);
    mocks.removeActiveLayer.mockResolvedValue(true);
    mocks.setActiveLayer.mockResolvedValue(undefined);
    mocks.rotateLayer.mockResolvedValue(undefined);
    mocks.setLayerLocked.mockResolvedValue(undefined);
    mocks.setLayerVisibility.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // 卸载组件 + 清理 document.body，避免上一个测试的 Teleport DOM 干扰下一个
    document.body.innerHTML = '';
  });

  it('P1: 渲染 layers（reverse 顺序，top-most 在前）', async () => {
    const store = useCanvasStore();
    store.layerList = [
      makeLayer('a', { isActive: false }),
      makeLayer('b', { isActive: true }),
      makeLayer('c', { isActive: false }),
    ];
    const w = mountPanel();
    await nextTick();
    const items = w.findAllComponents(LayerItem);
    expect(items.length).toBe(3);
    // store.layerList 顺序为 [a, b, c]，reverse 后 [c, b, a]
    expect(items[0].props('layer').id).toBe('c');
    expect(items[1].props('layer').id).toBe('b');
    expect(items[2].props('layer').id).toBe('a');
  });

  it('P2: 点击 + 调 canvasApi.addLayer + 更新 store.activeLayerId', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a')];
    const w = mountPanel();
    await nextTick();
    const addBtn = w.findAll('.layer-panel__btn')[0];
    await addBtn.trigger('click');
    await flush();
    expect(mocks.addLayer).toHaveBeenCalledTimes(1);
    expect(store.activeLayerId).toMatch(/^new-/);
  });

  it('P3: 点击垃圾桶按钮调 canvasApi.removeActiveLayer（layerList > 1）', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    const w = mountPanel();
    await nextTick();
    const trashBtn = w.findAll('.layer-panel__btn')[1];
    await trashBtn.trigger('click');
    await flush();
    expect(mocks.removeActiveLayer).toHaveBeenCalledTimes(1);
  });

  it('P3b: layerList 长度为 1 时垃圾桶按钮禁用', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a')];
    const w = mountPanel();
    await nextTick();
    const trashBtn = w.findAll('.layer-panel__btn')[1];
    expect((trashBtn.element as HTMLButtonElement).disabled).toBe(true);
    await trashBtn.trigger('click');
    await flush();
    expect(mocks.removeActiveLayer).not.toHaveBeenCalled();
  });

  it('P4: LayerItem locked-changed 事件触发 store.layer.locked 更新', async () => {
    const store = useCanvasStore();
    const layer = makeLayer('x', { locked: false });
    store.layerList = [layer];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('locked-changed', 'x', true);
    await nextTick();
    expect(store.layerList[0].locked).toBe(true);
  });

  it('P5: 右键 LayerItem 弹出 ContextMenu，含「顺时针旋转 90°」等项', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a', { locked: false, visible: true })];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('context-menu', new MouseEvent('contextmenu'), 'a');
    await nextTick();
    // ContextMenu 通过 Teleport 渲染到 body
    const html = document.body.innerHTML;
    expect(html).toContain('顺时针旋转 90°');
    expect(html).toContain('逆时针旋转 90°');
    expect(html).toContain('删除图层');
  });

  it('P6: 点击「删除图层」菜单项调 setActiveLayer + removeActiveLayer', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('context-menu', new MouseEvent('contextmenu'), 'b');
    await nextTick();
    // 找到「删除图层」按钮
    const buttons = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ) as HTMLElement[];
    const deleteBtn = buttons.find((b) => b.textContent?.includes('删除图层'));
    expect(deleteBtn).toBeTruthy();
    deleteBtn!.click();
    await flush();
    expect(mocks.setActiveLayer).toHaveBeenCalledWith('b');
    expect(mocks.removeActiveLayer).toHaveBeenCalled();
  });
});
