/**
 * useCanvas 单元测试
 *
 * 覆盖：
 *  - 默认属性 / 接口字段
 *  - viewportToCanvas 缩放与平移的坐标变换（通过 zoom/pan 间接验证）
 *  - zoomIn / zoomOut / resetView 行为
 *  - paintBase64：无 canvas ref 时 resolve 不抛错
 *  - refresh：调用 canvasApi.renderCanvasPng 与 sync
 *  - syncFromBackend：把 backend summary 映射到 store 字段
 *  - clearSelection：清掉 store.selection 并调用 canvasApi.clearSelection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, h, nextTick, type Ref } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('@api/index', () => ({
  canvasApi: {
    getCanvasSummary: vi.fn(),
    renderCanvasPng: vi.fn(),
    applyBrushStroke: vi.fn(),
    applyEraserStroke: vi.fn(),
    setRectSelection: vi.fn(),
    clearSelection: vi.fn(),
    getSelectionBounds: vi.fn(),
    renderCanvasImage: vi.fn(),
    pasteImage: vi.fn(),
    moveLayer: vi.fn(),
    fillLayer: vi.fn(),
    rotateLayer: vi.fn(),
    addText: vi.fn(),
    pasteTextBitmap: vi.fn(),
    setLayerBlendMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    addLayer: vi.fn(),
    removeActiveLayer: vi.fn(),
    setActiveLayer: vi.fn(),
    setLayerVisibility: vi.fn(),
    resizeCanvas: vi.fn(),
    listTools: vi.fn(),
  },
}));

import * as ApiIndex from '@api/index';
import { useCanvas } from '@composables/useCanvas';
import { useCanvasStore } from '@stores/canvasStore';
import type { CanvasSummary } from '@/types/canvas';

function makeSummary(overrides: Partial<CanvasSummary> = {}): CanvasSummary {
  return {
    width: 800,
    height: 600,
    activeLayerId: 'layer-1',
    canUndo: true,
    canRedo: false,
    layers: [
      {
        id: 'layer-1',
        name: 'Background',
        opacity: 1,
        blend_mode: 'normal',
        visible: true,
        locked: false,
        width: 800,
        height: 600,
        offset_x: 5,
        offset_y: 10,
        is_active: true,
      },
    ],
    ...overrides,
  } as unknown as CanvasSummary;
}

describe('useCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('默认接口字段齐全', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    expect(captured).not.toBeNull();
    expect(captured!.store).toBe(useCanvasStore());
    expect(captured!.canvasRef).toBeDefined();
    expect(captured!.isDrawing.value).toBe(false);
    expect(captured!.viewport.value.zoom).toBe(1);
    expect(captured!.viewport.value.panX).toBe(0);
    expect(captured!.viewport.value.panY).toBe(0);
    expect(typeof captured!.refresh).toBe('function');
    expect(typeof captured!.zoomIn).toBe('function');
    expect(typeof captured!.zoomOut).toBe('function');
    expect(typeof captured!.resetView).toBe('function');
    expect(typeof captured!.clearSelection).toBe('function');
    expect(typeof captured!.paintBase64).toBe('function');
    wrapper.unmount();
  });

  it('zoomIn / zoomOut 按 1.2 倍数更新 store', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const store = captured!.store;
    expect(store.zoom).toBe(1);
    captured!.zoomIn();
    expect(store.zoom).toBeCloseTo(1.2, 5);
    captured!.zoomIn();
    expect(store.zoom).toBeCloseTo(1.44, 5);
    captured!.zoomOut();
    expect(store.zoom).toBeCloseTo(1.2, 5);
    wrapper.unmount();
  });

  it('zoom 受 store.setZoom 边界 (0.1, 10) 限制', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.store.setZoom(100);
    expect(captured!.store.zoom).toBeLessThanOrEqual(10);
    captured!.store.setZoom(0);
    expect(captured!.store.zoom).toBeGreaterThanOrEqual(0.1);
    wrapper.unmount();
  });

  it('resetView 重置 zoom / panX / panY', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const store = captured!.store;
    store.zoom = 2.5;
    store.panX = 100;
    store.panY = -50;
    captured!.resetView();
    expect(store.zoom).toBe(1);
    expect(store.panX).toBe(0);
    expect(store.panY).toBe(0);
    wrapper.unmount();
  });

  it('viewport 是 store.zoom/panX/panY 的派生值', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const store = captured!.store;
    store.zoom = 2;
    store.panX = 30;
    store.panY = 40;
    expect(captured!.viewport.value).toEqual({ zoom: 2, panX: 30, panY: 40 });
    wrapper.unmount();
  });

  it('paintBase64 在没有 canvas ref 时静默 resolve', async () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await expect(captured!.paintBase64('AAAA')).resolves.toBeUndefined();
    wrapper.unmount();
  });

  it('refresh 调用 renderCanvasPng + getCanvasSummary 并更新 store', async () => {
    vi.mocked(ApiIndex.canvasApi.renderCanvasPng).mockResolvedValueOnce('AAAA');
    vi.mocked(ApiIndex.canvasApi.getCanvasSummary).mockResolvedValueOnce(makeSummary());
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await captured!.refresh();
    expect(ApiIndex.canvasApi.renderCanvasPng).toHaveBeenCalled();
    expect(ApiIndex.canvasApi.getCanvasSummary).toHaveBeenCalled();
    const store = captured!.store;
    expect(store.canvasWidth).toBe(800);
    expect(store.canvasHeight).toBe(600);
    expect(store.activeLayerId).toBe('layer-1');
    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);
    expect(store.layerList).toHaveLength(1);
    expect(store.layerList[0].offsetX).toBe(5);
    expect(store.layerList[0].offsetY).toBe(10);
    wrapper.unmount();
  });

  it('refresh 在 renderCanvasPng 抛错时静默处理', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(ApiIndex.canvasApi.renderCanvasPng).mockRejectedValueOnce(
      new Error('render boom'),
    );
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await expect(captured!.refresh()).resolves.toBeUndefined();
    consoleErr.mockRestore();
    wrapper.unmount();
  });

  it('syncFromBackend 把 blend_mode 缺失映射为 normal', async () => {
    vi.mocked(ApiIndex.canvasApi.getCanvasSummary).mockResolvedValueOnce(
      makeSummary({
        layers: [
          {
            id: 'layer-x',
            name: 'L',
            opacity: 0.5,
            blend_mode: undefined as unknown as string,
            visible: true,
            locked: false,
            width: 100,
            height: 100,
            offset_x: 0,
            offset_y: 0,
            is_active: false,
          },
        ],
        activeLayerId: 'layer-x',
      } as Partial<CanvasSummary>),
    );
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await captured!.refresh();
    expect(captured!.store.layerList[0].blendMode).toBe('normal');
    expect(captured!.store.layerList[0].opacity).toBe(0.5);
    wrapper.unmount();
  });

  it('clearSelection 调用 IPC 并清 store.selection', async () => {
    vi.mocked(ApiIndex.canvasApi.clearSelection).mockResolvedValueOnce();
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.store.selection = { x: 1, y: 2, width: 3, height: 4 };
    await captured!.clearSelection();
    expect(ApiIndex.canvasApi.clearSelection).toHaveBeenCalled();
    expect(captured!.store.selection).toBeNull();
    wrapper.unmount();
  });

  it('clearSelection 在 IPC 失败时不清 store.selection', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(ApiIndex.canvasApi.clearSelection).mockRejectedValueOnce(
      new Error('boom'),
    );
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.store.selection = { x: 0, y: 0, width: 1, height: 1 };
    await captured!.clearSelection();
    // IPC 报错，store 保持不变
    expect(captured!.store.selection).not.toBeNull();
    consoleErr.mockRestore();
    wrapper.unmount();
  });

  it('onPointerDown / onPointerUp 在没有 canvas ref 时安全 no-op', () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const evt = new PointerEvent('pointerdown', { clientX: 10, clientY: 20 });
    expect(() => captured!.onPointerDown(evt)).not.toThrow();
    expect(() => captured!.onPointerMove(evt)).not.toThrow();
    expect(() => captured!.onPointerUp(evt)).not.toThrow();
    expect(captured!.isDrawing.value).toBe(false);
    wrapper.unmount();
  });

  it('pointer getter 在 onPointerMove 后反映位置', async () => {
    let captured: ReturnType<typeof useCanvas> | null = null;
    const fakeCanvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => '' }),
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      getContext: () => null,
    };
    const Comp = defineComponent({
      setup() {
        captured = useCanvas();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    // 把 ref 指到 fakeCanvas
    (captured!.canvasRef as Ref<HTMLCanvasElement | null>).value =
      fakeCanvas as unknown as HTMLCanvasElement;
    await nextTick();
    const evt = new PointerEvent('pointermove', { clientX: 42, clientY: 7 });
    captured!.onPointerMove(evt);
    expect(captured!.pointer.value).toEqual({ x: 42, y: 7 });
    wrapper.unmount();
  });
});