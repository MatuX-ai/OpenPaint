/**
 * useOpenPencil 单元测试
 *
 * 由于 @open-pencil/core 是 Web Worker 入口且测试环境下 canvaskit-wasm
 * 无法初始化，整个模块（包括 Editor / createEditor）必须在测试中
 * 完全 mock。
 *
 * W14+ 统一画布架构：
 *  - bridge 改为单例：多次调用 createOpenPencilBridge() 返回同一实例。
 *  - undo / redo / getLayerTree / getSelectedNodes / replaceDocument /
 *    onEditorEvent 等新方法已暴露。
 *  - importSVG 默认 replaceSelection=true（替代旧的 false）。
 *  - sendImageToAI 直接 pasteFromHTML，不再回退到 Rust canvasApi。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockEditor: any = {
  getLayerTree: vi.fn(),
  copySelectionAsSVG: vi.fn(),
  pasteFromHTML: vi.fn(),
  placeFiles: vi.fn(),
  undoAction: vi.fn(),
  redoAction: vi.fn(),
  getSelectedNodes: vi.fn(),
  replaceGraph: vi.fn(),
  onEditorEvent: vi.fn(() => () => {}),
  state: { panX: 0, panY: 0, zoom: 1, currentPageId: 'page-1', selectedIds: new Set() },
  renderer: null,
  graph: {},
};

vi.mock('@open-pencil/core/editor', () => ({
  createEditor: vi.fn(() => mockEditor),
}));

vi.mock('@open-pencil/core/io', () => ({
  renderNodesToImage: vi.fn(() => new Uint8Array([1, 2, 3])),
  computeContentBounds: vi.fn(() => ({ minX: 0, minY: 0, maxX: 100, maxY: 80 })),
}));

vi.mock('@api/index', () => ({
  aiApi: {
    sendToAiEngine: vi.fn(),
    renderSvgToPng: vi.fn(),
  },
}));

import * as ApiIndex from '@api/index';
import {
  createOpenPencilBridge,
  getOpenPencilBridge,
  resetOpenPencilBridge,
  syncOpenPencilStateToCanvasStore,
} from '@composables/useOpenPencil';
import { createPinia, setActivePinia } from 'pinia';
import { useCanvasStore } from '@stores/canvasStore';

describe('useOpenPencil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOpenPencilBridge();
    mockEditor.getLayerTree.mockReturnValue([]);
    mockEditor.getSelectedNodes.mockReturnValue([]);
    mockEditor.copySelectionAsSVG.mockReturnValue('<svg/>');
    mockEditor.pasteFromHTML.mockResolvedValue(undefined);
    mockEditor.placeFiles.mockResolvedValue(undefined);
    mockEditor.onEditorEvent.mockReturnValue(() => {});
  });

  afterEach(() => {
    resetOpenPencilBridge();
  });

  it('syncOpenPencilStateToCanvasStore 把顶层节点写入 canvasStore.layerList', () => {
    setActivePinia(createPinia());
    mockEditor.getLayerTree.mockReturnValue([
      { depth: 0, node: { id: 'r1', name: '红点', type: 'RECTANGLE', x: 1, y: 2, width: 10, height: 20 } },
      { depth: 1, node: { id: 'c1', name: 'child' } },
      { depth: 0, node: { id: 'r2', name: '蓝点', type: 'RECTANGLE' } },
    ]);
    mockEditor.getSelectedNodes.mockReturnValue([{ id: 'r2' }]);
    createOpenPencilBridge(); // 绑定 singletonEditor
    syncOpenPencilStateToCanvasStore(mockEditor);
    const store = useCanvasStore();
    expect(store.layerList).toHaveLength(2);
    expect(store.layerList.map((l) => l.name)).toEqual(['红点', '蓝点']);
    expect(store.activeLayerId).toBe('r2');
    expect(store.layerList[0].offsetX).toBe(1);
    expect(store.layerList[0].offsetY).toBe(2);
  });

  it('初始 status=loading', () => {
    const bridge = createOpenPencilBridge();
    expect(bridge.status.value).toBe('loading');
  });

  it('返回的 editor 实例来自 mock createEditor', () => {
    const bridge = createOpenPencilBridge();
    expect(bridge.editor).toBe(mockEditor);
  });

  it('多次调用 createOpenPencilBridge 复用同一单例（中央画布）', () => {
    const a = createOpenPencilBridge();
    const b = createOpenPencilBridge();
    const c = getOpenPencilBridge();
    expect(a).toBe(b);
    expect(b).toBe(c);
    // editor 实例本身也必须一致，避免局部缓存
    expect(a.editor).toBe(b.editor);
    expect(b.editor).toBe(c.editor);
  });

  it('lastResult 初始为 null', () => {
    const bridge = createOpenPencilBridge();
    expect(bridge.lastResult.value).toBeNull();
  });

  it('exportSVG 在无 root node 时返回 null', () => {
    mockEditor.getLayerTree.mockReturnValueOnce([]);
    const bridge = createOpenPencilBridge();
    const r = bridge.exportSVG();
    expect(r).toBeNull();
    expect(bridge.lastResult.value).toBeNull();
  });

  it('exportSVG 在有 root node 时返回 svg 字符串并写入 lastResult', () => {
    mockEditor.getLayerTree.mockReturnValueOnce([
      { depth: 0, node: { id: 'n1' } },
      { depth: 1, node: { id: 'n2' } },
      { depth: 0, node: { id: 'n3' } },
    ]);
    mockEditor.copySelectionAsSVG.mockReturnValueOnce('<svg id="x"/>');
    const bridge = createOpenPencilBridge();
    const r = bridge.exportSVG();
    expect(r).toBe('<svg id="x"/>');
    expect(bridge.lastResult.value).toEqual({ svg: '<svg id="x"/>' });
    expect(mockEditor.copySelectionAsSVG).toHaveBeenCalledWith(['n1', 'n3']);
  });

  it('importSVG 空字符串立即返回，不调 pasteFromHTML', async () => {
    const bridge = createOpenPencilBridge();
    await bridge.importSVG('');
    expect(mockEditor.pasteFromHTML).not.toHaveBeenCalled();
    expect(bridge.lastResult.value).toBeNull();
  });

  it('importSVG 默认 replaceSelection=true（替换当前选区）', async () => {
    const bridge = createOpenPencilBridge();
    await bridge.importSVG('<svg><circle/></svg>');
    expect(mockEditor.pasteFromHTML).toHaveBeenCalledWith('<svg><circle/></svg>', undefined, {
      replaceSelection: true,
    });
    expect(bridge.lastResult.value).toEqual({ svg: '<svg><circle/></svg>' });
  });

  it('importSVG 显式 replaceSelection=false 不替换选区', async () => {
    const bridge = createOpenPencilBridge();
    await bridge.importSVG('<svg><rect/></svg>', { replaceSelection: false });
    expect(mockEditor.pasteFromHTML).toHaveBeenCalledWith('<svg><rect/></svg>', undefined, {
      replaceSelection: false,
    });
  });

  it('sendImageToAI 调 aiApi.sendToAiEngine 并以 replaceSelection=true 直接 pasteFromHTML', async () => {
    vi.mocked(ApiIndex.aiApi.sendToAiEngine).mockResolvedValueOnce({
      svg: '<svg><rect/></svg>',
      png: 'AAAA',
      model: 'mock-v1',
    });
    const bridge = createOpenPencilBridge();
    const r = await bridge.sendImageToAI('data:image/png;base64,BBBB', '画一个圆');
    expect(ApiIndex.aiApi.sendToAiEngine).toHaveBeenCalledWith(
      'data:image/png;base64,BBBB',
      '画一个圆',
    );
    expect(r?.svg).toBe('<svg><rect/></svg>');
    expect(mockEditor.pasteFromHTML).toHaveBeenCalledWith('<svg><rect/></svg>', undefined, {
      replaceSelection: true,
    });
  });

  it('sendImageToAI 抛错时向上抛', async () => {
    vi.mocked(ApiIndex.aiApi.sendToAiEngine).mockRejectedValueOnce(new Error('AI boom'));
    const bridge = createOpenPencilBridge();
    await expect(bridge.sendImageToAI('x', 'y')).rejects.toThrow('AI boom');
  });

  it('undo / redo 直接走 editor.undoAction / editor.redoAction', () => {
    const bridge = createOpenPencilBridge();
    bridge.undo();
    bridge.redo();
    expect(mockEditor.undoAction).toHaveBeenCalledTimes(1);
    expect(mockEditor.redoAction).toHaveBeenCalledTimes(1);
  });

  it('getLayerTree / getSelectedNodes 转发到 editor', () => {
    const bridge = createOpenPencilBridge();
    mockEditor.getLayerTree.mockReturnValueOnce([{ depth: 0, node: { id: 'a' } }]);
    mockEditor.getSelectedNodes.mockReturnValueOnce([{ id: 'b' }]);
    expect(bridge.getLayerTree()).toEqual([{ depth: 0, node: { id: 'a' } }]);
    expect(bridge.getSelectedNodes()).toEqual([{ id: 'b' }]);
  });

  it('replaceDocument 转发到 editor.replaceGraph', () => {
    const bridge = createOpenPencilBridge();
    const fakeGraph = { id: 'g1' };
    bridge.replaceDocument(fakeGraph as never);
    expect(mockEditor.replaceGraph).toHaveBeenCalledWith(fakeGraph);
  });

  it('onEditorEvent 转发到 editor.onEditorEvent.bind(editor)', () => {
    const bridge = createOpenPencilBridge();
    const handler = vi.fn();
    const off = bridge.onEditorEvent('selection:changed' as never, handler as never);
    expect(typeof off).toBe('function');
  });

  it('placeFiles 在 status=ready 时调用 editor.placeFiles', async () => {
    const bridge = createOpenPencilBridge();
    bridge.status.value = 'ready';
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    await bridge.placeFiles([file]);
    expect(mockEditor.placeFiles).toHaveBeenCalledWith([file], expect.any(Number), expect.any(Number));
  });

  it('placeFiles 在未就绪时抛错', async () => {
    const bridge = createOpenPencilBridge();
    await expect(bridge.placeFiles([new File(['x'], 'a.png')])).rejects.toThrow(/尚未就绪/);
  });

  it('返回接口字段齐全', () => {
    const bridge = createOpenPencilBridge();
    expect(bridge).toHaveProperty('editor');
    expect(bridge).toHaveProperty('status');
    expect(bridge).toHaveProperty('lastResult');
    expect(bridge).toHaveProperty('exportSVG');
    expect(bridge).toHaveProperty('importSVG');
    expect(bridge).toHaveProperty('sendImageToAI');
    expect(bridge).toHaveProperty('placeFiles');
    expect(bridge).toHaveProperty('placeDataUrl');
    expect(bridge).toHaveProperty('placeBytes');
    expect(bridge).toHaveProperty('exportRaster');
    expect(bridge).toHaveProperty('undo');
    expect(bridge).toHaveProperty('redo');
    expect(bridge).toHaveProperty('getLayerTree');
    expect(bridge).toHaveProperty('getSelectedNodes');
    expect(bridge).toHaveProperty('replaceDocument');
    expect(bridge).toHaveProperty('onEditorEvent');
    expect(typeof bridge.exportSVG).toBe('function');
    expect(typeof bridge.importSVG).toBe('function');
    expect(typeof bridge.sendImageToAI).toBe('function');
    expect(typeof bridge.placeFiles).toBe('function');
    expect(typeof bridge.undo).toBe('function');
    expect(typeof bridge.redo).toBe('function');
  });
});
