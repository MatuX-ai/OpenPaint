/**
 * CanvasToolbar 组件测试 — W15 · G1
 *
 * 覆盖：
 *  - 撤销 / 重做走 OpenPencil bridge（不调 canvasApi.undo / redo）
 *  - 新建图层、顺时针旋转 90°、文字按钮、混合模式切换
 *  - 工具名 label 跟随 activeTool 切换
 *  - watch: 切到 text 工具时自动打开文字对话框
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import CanvasToolbar from './CanvasToolbar.vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer } from '@/types/canvas';

const mocks = vi.hoisted(() => ({
  bridgeUndo: vi.fn(),
  bridgeRedo: vi.fn(),
  createShape: vi.fn(() => 'new-frame'),
  rotateNodes: vi.fn(),
  updateNodeWithUndo: vi.fn(),
  select: vi.fn(),
  addLayer: vi.fn(),
  rotateLayer: vi.fn(),
  addText: vi.fn(),
  setLayerBlendMode: vi.fn(),
  removeActiveLayer: vi.fn(),
  setActiveLayer: vi.fn(),
  canvasUndo: vi.fn(),
  canvasRedo: vi.fn(),
  toastError: vi.fn(),
  toastWarn: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@composables/useOpenPencil', () => ({
  getOpenPencilBridge: () => ({
    editor: {
      setTool: vi.fn(),
      state: { activeTool: 'SELECT', penState: null, currentPageId: 'page-1', panX: 0, panY: 0, zoom: 1 },
      getSelectedNodes: vi.fn(() => []),
      updateNodeWithUndo: mocks.updateNodeWithUndo,
      requestRepaint: vi.fn(),
      createShape: mocks.createShape,
      select: mocks.select,
      rotateNodes: mocks.rotateNodes,
      getLayerTree: vi.fn(() => []),
      graph: { getNode: vi.fn() },
    },
    status: { value: 'ready' },
    lastResult: { value: null },
    importSVG: vi.fn(),
    exportSVG: vi.fn(),
    sendImageToAI: vi.fn(),
    undo: mocks.bridgeUndo,
    redo: mocks.bridgeRedo,
    getLayerTree: vi.fn(),
    getSelectedNodes: vi.fn(),
    replaceDocument: vi.fn(),
    onEditorEvent: vi.fn(),
  }),
  syncOpenPencilStateToCanvasStore: vi.fn(),
}));

vi.mock('@api/index', () => ({
  canvasApi: {
    addLayer: mocks.addLayer,
    rotateLayer: mocks.rotateLayer,
    addText: mocks.addText,
    setLayerBlendMode: mocks.setLayerBlendMode,
    removeActiveLayer: mocks.removeActiveLayer,
    setActiveLayer: mocks.setActiveLayer,
    undo: mocks.canvasUndo,
    redo: mocks.canvasRedo,
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
    name: `L ${id}`,
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

function mountToolbar() {
  return mount(CanvasToolbar, { attachTo: document.body });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await nextTick();
}

describe('CanvasToolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => {
      if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
    });
    mocks.createShape.mockReturnValue('new-frame');
    mocks.addLayer.mockImplementation(async (name: string) => `new-${name}`);
    mocks.rotateLayer.mockResolvedValue(undefined);
    mocks.addText.mockResolvedValue({ bitmapWidth: 100, bitmapHeight: 20 });
    mocks.setLayerBlendMode.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('T1: 点击撤销按钮调 bridge.undo（不调 canvasApi.undo）', async () => {
    const store = useCanvasStore();
    store.canUndo = true;
    const w = mountToolbar();
    await nextTick();
    const undoBtn = w.find('button[aria-label="撤销"]');
    expect((undoBtn.element as HTMLButtonElement).disabled).toBe(false);
    await undoBtn.trigger('click');
    expect(mocks.bridgeUndo).toHaveBeenCalledTimes(1);
    expect(mocks.canvasUndo).not.toHaveBeenCalled();
  });

  it('T2: 点击重做按钮调 bridge.redo', async () => {
    const store = useCanvasStore();
    store.canRedo = true;
    const w = mountToolbar();
    await nextTick();
    const redoBtn = w.find('button[aria-label="重做"]');
    expect((redoBtn.element as HTMLButtonElement).disabled).toBe(false);
    await redoBtn.trigger('click');
    expect(mocks.bridgeRedo).toHaveBeenCalledTimes(1);
    expect(mocks.canvasRedo).not.toHaveBeenCalled();
  });

  it('T3: 点击「图层」按钮调 editor.createShape 新建图层', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a')];
    const w = mountToolbar();
    await nextTick();
    const addBtn = w.find('button[aria-label="新建图层"]');
    await addBtn.trigger('click');
    await flush();
    expect(mocks.createShape).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('T4: 点击顺时针旋转 90° 调 editor.rotateNodes', async () => {
    const store = useCanvasStore();
    const layer = makeLayer('rot-1');
    store.layerList = [layer];
    store.activeLayerId = 'rot-1';
    const w = mountToolbar();
    await nextTick();
    const rotateBtn = w.find('button[aria-label="顺时针旋转 90°"]');
    await rotateBtn.trigger('click');
    await flush();
    expect(mocks.rotateNodes).toHaveBeenCalledWith(['rot-1'], 90);
  });

  it('T4b: 无 active layer 时点击旋转按钮不调 IPC', async () => {
    const w = mountToolbar();
    await nextTick();
    const rotateBtn = w.find('button[aria-label="顺时针旋转 90°"]');
    await rotateBtn.trigger('click');
    await flush();
    expect(mocks.rotateNodes).not.toHaveBeenCalled();
    expect(mocks.toastWarn).toHaveBeenCalled();
  });

  it('T5: 点击文字按钮切换到 OpenPencil 文字工具', async () => {
    const store = useCanvasStore();
    const w = mountToolbar();
    await nextTick();
    const textBtn = w.find('button[aria-label="文字输入"]');
    await textBtn.trigger('click');
    await nextTick();
    expect(store.activeTool).toBe('text');
  });

  it('T6: 选中文字工具不再自动弹出旧像素文字对话框', async () => {
    const store = useCanvasStore();
    store.activeLayerId = 'text-2';
    mountToolbar();
    await nextTick();
    expect(document.body.querySelector('.text-dialog')).toBeFalsy();
    store.setActiveTool('text');
    await flush();
    expect(document.body.querySelector('.text-dialog')).toBeFalsy();
  });

  it('T7: blend mode 切换调 editor.updateNodeWithUndo', async () => {
    const store = useCanvasStore();
    store.activeLayerId = 'b-1';
    store.layerList = [makeLayer('b-1', { blendMode: 'normal' })];
    const w = mountToolbar();
    await nextTick();
    const select = w.find('.canvas-toolbar__select');
    await select.setValue('multiply');
    await flush();
    expect(mocks.updateNodeWithUndo).toHaveBeenCalled();
    const args = mocks.updateNodeWithUndo.mock.calls[0];
    expect(args[0]).toBe('b-1');
    expect(args[1]).toMatchObject({ blendMode: 'MULTIPLY' });
  });

  it('T8: 工具名 label 跟随 activeTool 切换（选择 / 钢笔 / 文字）', async () => {
    const store = useCanvasStore();
    const w = mountToolbar();
    await nextTick();
    const labelEl = w.find('.canvas-toolbar__tool-label strong');

    store.setActiveTool('select');
    await nextTick();
    expect(labelEl.text()).toBe('选择 / 移动');

    store.setActiveTool('pen');
    await nextTick();
    expect(labelEl.text()).toBe('钢笔 / 路径');

    store.setActiveTool('rectangle');
    await nextTick();
    expect(labelEl.text()).toBe('矩形');

    store.setActiveTool('text');
    await nextTick();
    expect(labelEl.text()).toBe('文字');
  });

  it('T8b: 矢量钢笔不显示像素粗细 / 颜色控件', async () => {
    const store = useCanvasStore();
    store.setActiveTool('pen');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('input[aria-label^="橡皮粗细"]').exists()).toBe(false);
    expect(w.find('input[aria-label^="画笔粗细"]').exists()).toBe(false);
    expect(w.find('button[aria-label^="描边颜色"]').exists()).toBe(true);
    expect(w.find('input[aria-label^="描边线宽"]').exists()).toBe(true);
  });

  it('T8c: 矩形工具显示填充与描边控件', async () => {
    const store = useCanvasStore();
    store.setActiveTool('rectangle');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('button[aria-label^="填充颜色"]').exists()).toBe(true);
    expect(w.find('button[aria-label^="描边颜色"]').exists()).toBe(true);
    expect(w.find('input[aria-label^="描边线宽"]').exists()).toBe(true);
  });

  it('T8d: 文字工具显示字号与文字色', async () => {
    const store = useCanvasStore();
    store.setActiveTool('text');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('input[aria-label^="字号"]').exists()).toBe(true);
    expect(w.find('button[aria-label^="填充颜色"]').exists()).toBe(true);
  });

  it('T8e: 多边形 / 星形显示形状参数', async () => {
    const store = useCanvasStore();
    store.setActiveTool('polygon');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('input[aria-label^="多边形边数"]').exists()).toBe(true);
    store.setActiveTool('star');
    await nextTick();
    expect(w.find('input[aria-label^="星形角数"]').exists()).toBe(true);
    expect(w.find('input[aria-label^="星形内径"]').exists()).toBe(true);
  });

  it('T9: 橡皮显示粗细，不显示颜色 / 容差', async () => {
    const store = useCanvasStore();
    store.setActiveTool('eraser');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('input[aria-label^="橡皮粗细"]').exists()).toBe(true);
    expect(w.find('button[aria-label^="选择颜色"]').exists()).toBe(false);
    expect(w.find('input[aria-label^="填充容差"]').exists()).toBe(false);
  });

  it('T10: 油漆桶显示颜色与容差，拖动写入 bucketTolerance', async () => {
    const store = useCanvasStore();
    store.setActiveTool('bucket');
    const w = mountToolbar();
    await nextTick();
    expect(w.find('button[aria-label^="选择颜色"]').exists()).toBe(true);
    const tol = w.find('input[aria-label^="填充容差"]');
    expect(tol.exists()).toBe(true);
    (tol.element as HTMLInputElement).value = '64';
    await tol.trigger('input');
    await nextTick();
    expect(store.bucketTolerance).toBe(64);
  });
});
