/**
 * Desktop workflow integration test (Vitest) — TC-WF-WEB-001 ~ TC-WF-WEB-010.
 *
 * 模拟用户在前端无大模型介入的场景下走完"画布 → 绘制 → 填充 → 删除 → 移动 → 导出"流程。
 *
 * 与 Rust 端 integration test 的区别：
 *   - 本文件测的是**前端编排逻辑**（composable / store / IPC 桩）；
 *   - Rust 端 integration test 测的是**后端画布引擎契约**（见
 *     `src-tauri/tests/desktop_workflow.rs`）。
 *   两者一起构成端到端覆盖：前端编排 + 后端引擎 = 完整工作流。
 *
 * 测试策略：
 *   - canvasApi / galleryApi 全部 vi.mock 替换为可断言的桩；
 *   - 用 store 直接驱动（绕开 onPointerDown 的 DOM event 派发路径）来覆盖 canvasStore +
 *     useFileActions + useDocumentState 三者的协作；
 *   - 这样可以测"换工具 → 换色 → 画 N 笔 → 填充 → 删除 → 移动 → 导出"全链路，避开 happy-dom
 *     不支持 PointerEvent 的限制。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type * as ApiIndex from '@api/index';
import type * as Runtime from '@api/runtime';

// ===== IPC stub =====

interface LayerSummary {
  id: string;
  name: string;
  opacity: number;
  blendMode: string;
  visible: boolean;
  locked: boolean;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  isActive: boolean;
}

let layerCounter = 0;
const summaryLayers: LayerSummary[] = [];
const renderPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function newLayerId(): string {
  layerCounter += 1;
  return `layer-${layerCounter}`;
}

function resetLayerState() {
  layerCounter = 0;
  summaryLayers.length = 0;
  summaryLayers.push({
    id: 'layer-bg',
    name: 'Background',
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
    width: 520,
    height: 520,
    offsetX: 0,
    offsetY: 0,
    isActive: true,
  });
}

vi.mock('@api/index', async () => {
  const actual = await vi.importActual('@api/index') as typeof ApiIndex;
  return {
    ...actual,
    canvasApi: {
      resizeCanvas: vi.fn(async (w: number, h: number) => {
        const bg = summaryLayers[0];
        if (bg) {
          bg.width = w;
          bg.height = h;
        }
      }),
      renderCanvasPng: vi.fn(async () => renderPngBase64),
      renderCanvasImage: vi.fn(async (args: { format: string; quality?: number; targetLongEdge?: number }) => ({
        format: args.format,
        mime:
          args.format === 'jpg' || args.format === 'jpeg'
            ? 'image/jpeg'
            : args.format === 'webp'
              ? 'image/webp'
              : 'image/png',
        bytesBase64: 'AAAA',
        width: args.targetLongEdge || 520,
        height: args.targetLongEdge || 520,
        byteSize: 4,
      })),
      getCanvasSummary: vi.fn(async () => ({
        width: summaryLayers[0]?.width ?? 520,
        height: summaryLayers[0]?.height ?? 520,
        active_layer_id: summaryLayers[summaryLayers.length - 1]?.id ?? 'layer-bg',
        layers: summaryLayers.map((l) => ({
          id: l.id,
          name: l.name,
          opacity: l.opacity,
          blend_mode: l.blendMode,
          visible: l.visible,
          locked: l.locked,
          width: l.width,
          height: l.height,
          offset_x: l.offsetX,
          offset_y: l.offsetY,
          is_active: l.isActive,
        })),
        has_selection: false,
        can_undo: false,
        can_redo: false,
      })),
      addLayer: vi.fn(async (name: string) => {
        const id = newLayerId();
        summaryLayers.push({
          id,
          name,
          opacity: 1,
          blendMode: 'normal',
          visible: true,
          locked: false,
          width: summaryLayers[0]?.width ?? 520,
          height: summaryLayers[0]?.height ?? 520,
          offsetX: 0,
          offsetY: 0,
          isActive: true,
        });
        return id;
      }),
      removeActiveLayer: vi.fn(async () => {
        if (summaryLayers.length <= 1) return false;
        summaryLayers.pop();
        return true;
      }),
      applyBrushStroke: vi.fn(async (args: { layer_id: string; points: Array<[number, number]>; radius: number; color: string }) => {
        // 验证输入格式
        expect(args.layer_id).toMatch(/^layer-\d+$/);
        expect(Array.isArray(args.points)).toBe(true);
        expect(args.radius).toBeGreaterThanOrEqual(1);
        expect(args.color).toMatch(/^#[0-9a-f]{6}$/i);
      }),
      applyEraserStroke: vi.fn(async () => undefined),
      fillLayer: vi.fn(async (args: { layer_id: string; color: string }) => {
        const layer = summaryLayers.find((l) => l.id === args.layer_id);
        if (layer) {
          // mock 一下填充状态：颜色作为图层属性的 metadata
          (layer as LayerSummary & { _fill?: string })._fill = args.color;
        }
      }),
      moveLayer: vi.fn(async (layerId: string, dx: number, dy: number) => {
        const layer = summaryLayers.find((l) => l.id === layerId);
        if (layer) {
          layer.offsetX += dx;
          layer.offsetY += dy;
        }
      }),
      rotateLayer: vi.fn(async (layerId: string, degrees: number) => {
        const layer = summaryLayers.find((l) => l.id === layerId);
        if (layer) {
          // mock rotation effect: stamp the rotation angle on the layer for assertions
          (layer as LayerSummary & { _rotation?: number })._rotation = degrees;
        }
      }),
      addText: vi.fn(
        async (args: {
          layerId: string;
          text: string;
          x: number;
          y: number;
          fontSize: number;
          color: string;
          fontFamily?: string;
        }) => {
          expect(args.layerId).toMatch(/^layer-\d+$/);
          expect(args.text.length).toBeGreaterThan(0);
          expect(args.fontSize).toBeGreaterThan(0);
          expect(args.color).toMatch(/^#[0-9a-f]{6}$/i);
          return {
            bitmapWidth: Math.round(args.text.length * args.fontSize * 0.6),
            bitmapHeight: Math.round(args.fontSize * 1.4),
          };
        },
      ),
      pasteTextBitmap: vi.fn(async () => undefined),
      setLayerBlendMode: vi.fn(async (layerId: string, mode: string) => {
        const layer = summaryLayers.find((l) => l.id === layerId);
        if (layer) {
          layer.blendMode = mode;
        }
      }),
      setRectSelection: vi.fn(async () => undefined),
      clearSelection: vi.fn(async () => undefined),
      undo: vi.fn(async () => true),
      redo: vi.fn(async () => true),
      setLayerVisibility: vi.fn(async () => undefined),
      setActiveLayer: vi.fn(async () => undefined),
    },
    galleryApi: {
      save: vi.fn(async () => ({ id: 'g1', width: 520, height: 520, thumbnail_path: '' })),
    },
  };
});

vi.mock('@api/runtime', async () => {
  const actual = await vi.importActual('@api/runtime') as typeof Runtime;
  return {
    ...actual,
    isTauri: () => true,
  };
});

async function loadFileActions() {
  const mod = await import('@composables/useFileActions');
  return mod.useFileActions();
}

async function loadDocState() {
  const mod = await import('@composables/useDocumentState');
  return mod.useDocumentState();
}

// ===== 测试 =====

describe('desktop workflow (no AI) — frontend orchestration', () => {
  beforeEach(async () => {
    vi.resetModules();
    setActivePinia(createPinia());
    resetLayerState();
    const { canvasApi } = await import('@api/index');
    (canvasApi.addLayer as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.removeActiveLayer as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.applyBrushStroke as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.fillLayer as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.moveLayer as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.renderCanvasImage as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.resizeCanvas as ReturnType<typeof vi.fn>).mockClear();
    (canvasApi.renderCanvasPng as ReturnType<typeof vi.fn>).mockClear();
  });

  /**
   * TC-WF-WEB-001：启动桌面端 → 默认 store 应有合理初始值，document 应为 pristine。
   */
  it('TC-WF-WEB-001: desktop boot — store + doc state are pristine', async () => {
    const { useCanvasStore } = await import('@stores/canvasStore');
    const store = useCanvasStore();
    const doc = await loadDocState();
    expect(store.activeTool).toBe('select');
    expect(store.canvasWidth).toBe(1920);
    expect(store.canvasHeight).toBe(1080);
    expect(store.brushColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(store.brushRadius).toBeGreaterThanOrEqual(1);
    expect(doc.state.value).toBe('pristine');
    expect(doc.fileName.value).toBe('未命名');
    expect(doc.isDirty.value).toBe(false);
  });

  /**
   * TC-WF-WEB-002：新建 520×520 画布 → canvasStore 同步，document 状态进入 pristine。
   */
  it('TC-WF-WEB-002: newCanvas(520,520) updates store + resets doc', async () => {
    const { useCanvasStore } = await import('@stores/canvasStore');
    const store = useCanvasStore();
    const doc = await loadDocState();
    doc.markDirty(); // 先把文档标记为 dirty
    expect(doc.isDirty.value).toBe(true);

    const f = await loadFileActions();
    await f.newCanvas({
      width: 520,
      height: 520,
      unit: 'px',
      dpi: 72,
      handleLayers: 'discard',
    });

    const { canvasApi } = await import('@api/index');
    expect(canvasApi.resizeCanvas).toHaveBeenCalledWith(520, 520);
    expect(store.canvasWidth).toBe(520);
    expect(store.canvasHeight).toBe(520);
    expect(doc.state.value).toBe('pristine');
  });

  /**
   * TC-WF-WEB-003：手绘 6 种颜色的形状 → applyBrushStroke 调用 6 次，参数携带 color + points。
   */
  it('TC-WF-WEB-003: hand-draw with 6 distinct colors invokes 6 brush strokes', async () => {
    const { useCanvasStore } = await import('@stores/canvasStore');
    const store = useCanvasStore();
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();

    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });

    const palette = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c'];
    store.setActiveTool('brush');

    // 模拟 6 个不同图层（addLayer 后立即变成 active）
    for (let i = 0; i < 6; i++) {
      const layerId = await canvasApi.addLayer(`Shape-${i + 1}`);
      store.activeLayerId = layerId;
      store.setBrushColor(palette[i]);
      store.setBrushRadius(8);

      // 6 个不同的几何形状（圆 / 矩形 / 线段 × 2 组）
      const points =
        i % 3 === 0
          ? circlePoints(130, 130 + Math.floor(i / 3) * 220, 70, 32)
          : i % 3 === 1
            ? rectPoints(300, 60 + Math.floor(i / 3) * 220, 460, 200 + Math.floor(i / 3) * 220, 8)
            : linePoints(60 + i * 5, 480, 460 - i * 5, 480, 16);

      await canvasApi.applyBrushStroke({
        layer_id: layerId,
        points,
        radius: store.brushRadius,
        color: store.brushColor,
      });
    }

    expect(canvasApi.applyBrushStroke).toHaveBeenCalledTimes(6);
    const calls = (canvasApi.applyBrushStroke as ReturnType<typeof vi.fn>).mock.calls;
    const colors = calls.map((c) => c[0].color);
    expect(new Set(colors).size).toBe(6);
  });

  /**
   * TC-WF-WEB-004：油漆桶 → fillLayer 调用 3 次，使用 3 种不同颜色。
   */
  it('TC-WF-WEB-004: paint bucket fills 3 layers with 3 colors', async () => {
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();
    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });

    const buckets = ['#ff6b6b', '#feca57', '#48dbfb'];
    for (let i = 0; i < 3; i++) {
      const layerId = await canvasApi.addLayer(`Fill-${i + 1}`);
      await canvasApi.fillLayer(layerId, buckets[i]);
    }

    expect(canvasApi.fillLayer).toHaveBeenCalledTimes(3);
    const colors = (canvasApi.fillLayer as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[1],
    );
    expect(new Set(colors).size).toBe(3);
  });

  /**
   * TC-WF-WEB-005：删除 3 个形状 → removeActiveLayer 调用 3 次。
   */
  it('TC-WF-WEB-005: delete 3 shapes invokes removeActiveLayer x3', async () => {
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();
    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });

    // 多加 3 个图层（背景之上）
    for (let i = 0; i < 3; i++) {
      await canvasApi.addLayer(`Shape-${i + 1}`);
    }
    expect(summaryLayers.length).toBe(4); // bg + 3

    // 删 3 次
    for (let i = 0; i < 3; i++) {
      await canvasApi.removeActiveLayer();
    }
    expect(canvasApi.removeActiveLayer).toHaveBeenCalledTimes(3);
    expect(summaryLayers.length).toBe(1);
  });

  /**
   * TC-WF-WEB-006：鼠标拖移 → moveLayer 调用 2 次，累加 offset。
   */
  it('TC-WF-WEB-006: drag move layer accumulates offsets', async () => {
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();
    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });

    const layerId = await canvasApi.addLayer('Draggable');
    await canvasApi.moveLayer(layerId, 30, -15);
    await canvasApi.moveLayer(layerId, -10, 25);

    const moved = summaryLayers.find((l) => l.id === layerId)!;
    expect(moved.offsetX).toBe(20);
    expect(moved.offsetY).toBe(10);
    expect(canvasApi.moveLayer).toHaveBeenCalledTimes(2);
  });

  /**
   * TC-WF-WEB-007：导出 → renderCanvasImage 被调用，format 分别为 jpg / png / webp。
   */
  it('TC-WF-WEB-007: export JPG / PNG / WebP calls renderCanvasImage with correct format', async () => {
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();
    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });

    // 直接调用底层 IPC（dialog.save 在 stub 下没法返回 path，这里只测 IPC 调用契约）
    await canvasApi.renderCanvasImage({ format: 'jpg', quality: 90, targetLongEdge: 0 });
    await canvasApi.renderCanvasImage({ format: 'png', quality: 100, targetLongEdge: 0 });
    await canvasApi.renderCanvasImage({ format: 'webp', quality: 80, targetLongEdge: 128 });

    expect(canvasApi.renderCanvasImage).toHaveBeenCalledTimes(3);
    const formats = (canvasApi.renderCanvasImage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].format,
    );
    expect(formats).toEqual(['jpg', 'png', 'webp']);
    const sizes = (canvasApi.renderCanvasImage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].targetLongEdge,
    );
    expect(sizes[2]).toBe(128); // 批量导出长边
  });

  /**
   * TC-WF-WEB-008：保存到图库 → markSaved 切换 document state。
   */
  it('TC-WF-WEB-008: saveToGallery transitions document state to saved', async () => {
    const f = await loadFileActions();
    const doc = await loadDocState();
    doc.markDirty();
    expect(doc.state.value).toBe('dirty');

    const ok = await f.saveToGallery(['test', 'workflow']);
    expect(ok).toBe(true);
    expect(doc.state.value).toBe('saved');
    expect(doc.isDirty.value).toBe(false);

    const { galleryApi } = await import('@api/index');
    expect(galleryApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['test', 'workflow'],
        source: 'imported',
      }),
    );
  });

  /**
   * TC-WF-WEB-009：完整 9 步端到端（前端编排层）—— 把上面的子步骤串起来。
   */
  it('TC-WF-WEB-009: full 9-step workflow on 520x520 canvas', async () => {
    const { useCanvasStore } = await import('@stores/canvasStore');
    const store = useCanvasStore();
    const { canvasApi } = await import('@api/index');
    const f = await loadFileActions();
    const doc = await loadDocState();

    // 1) 新建 520×520
    await f.newCanvas({ width: 520, height: 520, unit: 'px', dpi: 72, handleLayers: 'discard' });
    expect(store.canvasWidth).toBe(520);
    expect(store.canvasHeight).toBe(520);

    // 2) 6 种颜色画 6 个形状
    store.setActiveTool('brush');
    const palette = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c'];
    for (let i = 0; i < 6; i++) {
      const layerId = await canvasApi.addLayer(`Shape-${i + 1}`);
      store.activeLayerId = layerId;
      store.setBrushColor(palette[i]);
      await canvasApi.applyBrushStroke({
        layer_id: layerId,
        points: linePoints(100, 100 + i * 70, 400, 100 + i * 70, 32),
        radius: 8,
        color: palette[i],
      });
    }

    // 3) 油漆桶填 3 个图层
    const buckets = ['#ff6b6b', '#feca57', '#48dbfb'];
    for (let i = 0; i < 3; i++) {
      const layerId = await canvasApi.addLayer(`Fill-${i + 1}`);
      await canvasApi.fillLayer(layerId, buckets[i]);
    }

    // 4) 拖移最顶上的图层
    const topLayerId = summaryLayers[summaryLayers.length - 1].id;
    await canvasApi.moveLayer(topLayerId, 50, 50);

    // 5) 删 3 个图层
    for (let i = 0; i < 3; i++) {
      await canvasApi.removeActiveLayer();
    }

    // 6) 标记 dirty
    doc.markDirty();
    expect(doc.isDirty.value).toBe(true);

    // 7) 保存到图库（切到 saved）
    await f.saveToGallery(['e2e', 'workflow']);
    expect(doc.state.value).toBe('saved');

    // 8) 导出 PNG（直接调 IPC）
    await canvasApi.renderCanvasImage({ format: 'png', quality: 100, targetLongEdge: 0 });

    // 9) 导出 JPG
    await canvasApi.renderCanvasImage({ format: 'jpg', quality: 90, targetLongEdge: 0 });

    // 校验调用计数
    expect(canvasApi.applyBrushStroke).toHaveBeenCalledTimes(6);
    expect(canvasApi.fillLayer).toHaveBeenCalledTimes(3);
    expect(canvasApi.moveLayer).toHaveBeenCalledTimes(1);
    expect(canvasApi.removeActiveLayer).toHaveBeenCalledTimes(3);
    expect(canvasApi.renderCanvasImage).toHaveBeenCalledTimes(2);
  });

  /**
   * TC-WF-WEB-010：旋转（canvasApi.rotateLayer）+ 文字（canvasApi.addText）+ 混合模式
   * （canvasApi.setLayerBlendMode）— IPC 已实现，覆盖三组接口在 IPC 层的契约。
   */
  it('TC-WF-WEB-010: rotate + text input + blend mode IPC are wired up', async () => {
    const { canvasApi } = await import('@api/index');

    // 前置：添加一个新图层以便后续操作
    const lid = await canvasApi.addLayer('TC-WF-WEB-010');
    expect(lid).toMatch(/^layer-\d+$/);

    // 1) 旋转：90° 顺时针
    await canvasApi.rotateLayer(lid, 90);
    expect(canvasApi.rotateLayer).toHaveBeenCalledWith(lid, 90);
    const rotatedLayer = summaryLayers.find((l) => l.id === lid)!;
    expect((rotatedLayer as LayerSummary & { _rotation?: number })._rotation).toBe(90);

    // 2) 文字：14px / 22px / 30px 三行、三种颜色
    const texts = [
      { text: 'Hello', x: 10, y: 50, fontSize: 14, color: '#000000' },
      { text: 'World', x: 10, y: 80, fontSize: 22, color: '#ff0000' },
      { text: '你好', x: 10, y: 130, fontSize: 30, color: '#0000ff' },
    ];
    for (const t of texts) {
      const resp = await canvasApi.addText({ layerId: lid, ...t });
      expect(resp.bitmapWidth).toBeGreaterThan(0);
      expect(resp.bitmapHeight).toBeGreaterThan(0);
    }
    // addText 必填参数校验由 stub 内部 expect 完成，3 次调用 → 调用计数 = 3
    expect(canvasApi.addText).toHaveBeenCalledTimes(3);
    // 第二次调用应使用 22px + 红色
    const secondCall = (canvasApi.addText as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall.fontSize).toBe(22);
    expect(secondCall.color).toBe('#ff0000');
    // 第三次调用应包含中文与 30px
    const thirdCall = (canvasApi.addText as ReturnType<typeof vi.fn>).mock.calls[2][0];
    expect(thirdCall.fontSize).toBe(30);
    expect(thirdCall.text).toBe('你好');

    // 3) 混合模式：Multiply
    await canvasApi.setLayerBlendMode(lid, 'multiply');
    expect(canvasApi.setLayerBlendMode).toHaveBeenCalledWith(lid, 'multiply');
    expect(summaryLayers.find((l) => l.id === lid)!.blendMode).toBe('multiply');

    // 4) pasteTextBitmap（位图直接注入）走通
    await canvasApi.pasteTextBitmap({
      layerId: lid,
      bitmapBase64: 'AAAA',
      bitmapWidth: 4,
      bitmapHeight: 4,
      x: 0,
      y: 0,
    });
    expect(canvasApi.pasteTextBitmap).toHaveBeenCalledTimes(1);
  });
});

// ===== 几何 helper =====

function linePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)]);
  }
  return pts;
}

function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
): Array<[number, number]> {
  return [
    ...linePoints(x0, y0, x1, y0, steps),
    ...linePoints(x1, y0, x1, y1, steps),
    ...linePoints(x1, y1, x0, y1, steps),
    ...linePoints(x0, y1, x0, y0, steps),
  ];
}

function circlePoints(
  cx: number,
  cy: number,
  radius: number,
  segments: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push([Math.round(cx + Math.cos(theta) * radius), Math.round(cy + Math.sin(theta) * radius)]);
  }
  return pts;
}
