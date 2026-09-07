/**
 * useOpenPencil — singleton bridge to the OpenPencil editor
 * (`@open-pencil/core` + `@open-pencil/vue` + `canvaskit-wasm`).
 *
 * 单一中央画布：
 *  - 在模块作用域创建唯一一个 editor，避免右窗 + 中央两套实例。
 *  - `getEditor()` 返回同一实例，由宿主组件 `provideEditor` 后即可被子树使用。
 *  - 通过 `onEditorEvent` 把 selection / tool / viewport / graph 状态同步到 Pinia store，
 *    让工具条、属性、图层共享同一选区、文档和 Undo/Redo。
 *  - 不再把 AI 返回结果栅格化后落回画布：直接把 SVG 通过 `editor.pasteFromHTML`
 *    插入当前 OpenPencil 文档，默认替换当前选区。
 *  - 图片导入走 `editor.placeFiles`（与拖放同一路径），不再经 Rust `canvasApi.pasteImage`。
 */

import { ref, type Ref } from 'vue';
import { createEditor } from '@open-pencil/core/editor';
import type { Editor } from '@open-pencil/core/editor';
import { renderNodesToImage, computeContentBounds } from '@open-pencil/core/io';
import { aiApi } from '@api/index';
import { useCanvasStore } from '@stores/canvasStore';
import type { BlendMode, Layer } from '@/types/canvas';

export type OpenPencilStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OpenPencilResult {
  svg?: string;
  png?: string;
}

export interface OpenPencilRasterExport {
  mime: string;
  bytesBase64: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface OpenPencilBridge {
  /** 唯一的中央 editor 实例。宿主组件须自行 `provideEditor(editor)`。 */
  editor: Editor;
  /** Reactive status that flips to `ready` once the canvas renderer reports ready. */
  status: Ref<OpenPencilStatus>;
  /** Last result from a successful export. */
  lastResult: Ref<OpenPencilResult | null>;
  /** Import an arbitrary SVG fragment into the editor document (替换选区默认开启)。 */
  importSVG: (svg: string, options?: { replaceSelection?: boolean }) => Promise<void>;
  /** Export the current selection / page as SVG. */
  exportSVG: () => string | null;
  /**
   * Forward an image + prompt to the backend AI engine, then push the
   * returned SVG directly into the editor so the user can refine it.
   * 不再做 SVG → PNG → pasteImage 回落：直接走 OpenPencil 文档。
   */
  sendImageToAI: (imageData: string, prompt: string) => Promise<OpenPencilResult | null>;
  /** 在视口中心放置 File 列表（与拖放共用 placeFiles）。 */
  placeFiles: (files: File[]) => Promise<void>;
  /** 将 data URL / 原始字节转为 File 后放入中央画布。 */
  placeDataUrl: (dataUrl: string, fileName?: string) => Promise<void>;
  /** 将二进制图片放入中央画布。 */
  placeBytes: (bytes: Uint8Array, fileName: string, mime: string) => Promise<void>;
  /** 导出当前页内容为光栅图（PNG / JPG / WebP）。 */
  exportRaster: (
    format: 'png' | 'jpg' | 'webp',
    quality?: number,
    nodeIds?: string[],
  ) => Promise<OpenPencilRasterExport | null>;
  /** 导出选区；无选区时导出整页。 */
  exportSelectionOrDocument: (
    format?: 'png' | 'jpg' | 'webp',
    quality?: number,
  ) => Promise<OpenPencilRasterExport | null>;
  /** Editor 撤销 / 重做（与工具条、快捷键共用）。 */
  undo: () => void;
  redo: () => void;
  /** 返回当前 SceneGraph 的层级树（用于右侧 LayerPanel / 属性）。 */
  getLayerTree: () => ReturnType<Editor['getLayerTree']>;
  /** 返回当前选区节点集合。 */
  getSelectedNodes: () => ReturnType<Editor['getSelectedNodes']>;
  /** 替换整个 SceneGraph（用于 .pen / 新建文档）。 */
  replaceDocument: (graph: Parameters<Editor['replaceGraph']>[0]) => void;
  /**
   * 订阅 Editor 事件；返回解绑函数。
   * 当前事件集：selection / tool / page / viewport / graph replaced / render 等。
   */
  onEditorEvent: Editor['onEditorEvent'];
}

// ---------------------------------------------------------------------------
// Module-level singleton — only one editor exists across the whole app.
// ---------------------------------------------------------------------------

let singletonEditor: Editor | null = null;
let singletonBridge: OpenPencilBridge | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

function fileNameFromDataUrl(dataUrl: string, fallback: string): string {
  const m = /^data:([^;,]+)/i.exec(dataUrl);
  const mime = m?.[1] ?? 'image/png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return fallback.replace(/\.[^.]+$/, '') + '.jpg';
  if (mime.includes('webp')) return fallback.replace(/\.[^.]+$/, '') + '.webp';
  if (mime.includes('svg')) return fallback.replace(/\.[^.]+$/, '') + '.svg';
  if (mime.includes('gif')) return fallback.replace(/\.[^.]+$/, '') + '.gif';
  return fallback.replace(/\.[^.]+$/, '') + '.png';
}

function getPlacementCenter(editor: Editor): { x: number; y: number } {
  const canvas = document.querySelector(
    '.openpencil-view canvas, .main-layout__canvas canvas, canvas',
  ) as HTMLCanvasElement | null;
  const vw = canvas?.clientWidth || 1280;
  const vh = canvas?.clientHeight || 720;
  const { panX, panY, zoom } = editor.state;
  const z = zoom || 1;
  return {
    x: (-panX + vw / 2) / z,
    y: (-panY + vh / 2) / z,
  };
}

function asBlendMode(value: unknown): BlendMode {
  if (value === 'multiply' || value === 'screen' || value === 'overlay') return value;
  return 'normal';
}

/**
 * 把 OpenPencil 文档树同步到 Pinia canvasStore（状态栏图层数、引导卡、图层面板）。
 * 顶层（depth === 0）节点计为「图层」。
 */
export function syncOpenPencilStateToCanvasStore(editor?: Editor | null): void {
  const ed = editor ?? singletonEditor;
  if (!ed) return;
  let store: ReturnType<typeof useCanvasStore>;
  try {
    store = useCanvasStore();
  } catch {
    return;
  }

  const tree = (ed as Editor & { getLayerTree?: () => Array<{ depth: number; node: Record<string, unknown> }> })
    .getLayerTree?.() ?? [];
  const selected = new Set(
    (
      (ed as Editor & { getSelectedNodes?: () => Array<{ id?: string }> }).getSelectedNodes?.() ?? []
    )
      .map((n) => n.id)
      .filter((id): id is string => Boolean(id)),
  );

  const layers: Layer[] = tree
    .filter((entry) => (entry.depth ?? 0) === 0)
    .map((entry) => {
      const n = entry.node ?? {};
      const id = String(n.id ?? '');
      const name = String(n.name || n.type || id || '图层');
      const opacity = typeof n.opacity === 'number' ? n.opacity : 1;
      return {
        id,
        name,
        opacity,
        blendMode: asBlendMode(n.blendMode ?? n.blend_mode),
        visible: n.visible !== false,
        locked: Boolean(n.locked),
        width: typeof n.width === 'number' ? n.width : 0,
        height: typeof n.height === 'number' ? n.height : 0,
        offsetX: typeof n.x === 'number' ? n.x : typeof n.offsetX === 'number' ? n.offsetX : 0,
        offsetY: typeof n.y === 'number' ? n.y : typeof n.offsetY === 'number' ? n.offsetY : 0,
        isActive: selected.has(id),
      };
    })
    .filter((l) => l.id);

  store.layerList = layers;
  store.activeLayerId =
    [...selected][0] ?? layers.find((l) => l.isActive)?.id ?? layers[0]?.id ?? null;

  const zoom = ed.state?.zoom;
  if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) {
    store.zoom = zoom;
  }
  if (typeof ed.state?.panX === 'number') store.panX = ed.state.panX;
  if (typeof ed.state?.panY === 'number') store.panY = ed.state.panY;

  try {
    const undo = (ed as Editor & { undo?: { canUndo?: boolean; canRedo?: boolean } }).undo;
    if (undo) {
      store.canUndo = Boolean(undo.canUndo);
      store.canRedo = Boolean(undo.canRedo);
    }
  } catch {
    /* ignore */
  }
}

function createSingleton(): OpenPencilBridge {
  const status = ref<OpenPencilStatus>('loading');
  const lastResult = ref<OpenPencilResult | null>(null);

  let editor: Editor;
  try {
    editor = createEditor();
    singletonEditor = editor;
  } catch (err) {
    status.value = 'error';
    console.error('[useOpenPencil] createEditor failed:', err);
    throw err;
  }

  function getRootIds(): string[] {
    return editor
      .getLayerTree()
      .filter(({ depth }) => depth === 0)
      .map(({ node }) => node.id);
  }

  function ensureReady(): void {
    if (status.value !== 'ready') {
      throw new Error('画布尚未就绪，请稍候再试');
    }
  }

  function exportSVG(): string | null {
    const ids = getRootIds();
    if (ids.length === 0) return null;
    const svg = editor.copySelectionAsSVG(ids);
    if (svg) lastResult.value = { svg };
    return svg;
  }

  async function importSVG(
    svg: string,
    options: { replaceSelection?: boolean } = {},
  ): Promise<void> {
    if (!svg) return;
    const replaceSelection = options.replaceSelection ?? true;
    await editor.pasteFromHTML(svg, undefined, { replaceSelection });
    lastResult.value = { svg };
    syncOpenPencilStateToCanvasStore(editor);
  }

  async function sendImageToAI(
    imageData: string,
    prompt: string,
  ): Promise<OpenPencilResult | null> {
    const res = await aiApi.sendToAiEngine(imageData, prompt);
    lastResult.value = { svg: res.svg, png: res.png };
    // AI SVG 直接进入中央文档，替换当前选区；不再经由 Rust canvasApi.pasteImage。
    await importSVG(res.svg, { replaceSelection: true });
    return lastResult.value;
  }

  async function placeFiles(files: File[]): Promise<void> {
    ensureReady();
    if (files.length === 0) return;
    const { x, y } = getPlacementCenter(editor);
    await editor.placeFiles(files, x, y);
    syncOpenPencilStateToCanvasStore(editor);
  }

  async function placeBytes(bytes: Uint8Array, fileName: string, mime: string): Promise<void> {
    // Copy into a standalone ArrayBuffer so File/Blob ownership is unambiguous
    // (Tauri readFile may return a view into a larger buffer).
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const file = new File([copy], fileName, { type: mime || mimeFromExt(fileName) });
    await placeFiles([file]);
  }

  async function placeDataUrl(dataUrl: string, fileName = 'import.png'): Promise<void> {
    ensureReady();
    const name = fileNameFromDataUrl(dataUrl, fileName);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], name, { type: blob.type || mimeFromExt(name) });
    await placeFiles([file]);
  }

  async function exportRaster(
    format: 'png' | 'jpg' | 'webp',
    quality = 92,
    nodeIds?: string[],
  ): Promise<OpenPencilRasterExport | null> {
    ensureReady();
    const renderer = editor.renderer;
    if (!renderer) {
      throw new Error('画布渲染器未就绪');
    }
    const ids =
      nodeIds && nodeIds.length > 0
        ? nodeIds
        : getRootIds();
    if (ids.length === 0) return null;

    const rasterFormat = format === 'jpg' ? 'JPG' : format === 'webp' ? 'WEBP' : 'PNG';
    const bytes = renderNodesToImage(
      renderer.ck,
      renderer,
      editor.graph,
      editor.state.currentPageId,
      ids,
      {
        scale: 1,
        format: rasterFormat,
        quality,
        trimTransparent: true,
      },
    );
    if (!bytes || bytes.length === 0) return null;

    const bounds = computeContentBounds(editor.graph, ids);
    const width = bounds ? Math.max(1, Math.ceil(bounds.maxX - bounds.minX)) : 0;
    const height = bounds ? Math.max(1, Math.ceil(bounds.maxY - bounds.minY)) : 0;
    const mime =
      format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const bytesBase64 = bytesToBase64(bytes);
    const dataUrl = `data:${mime};base64,${bytesBase64}`;
    if (format === 'png') {
      lastResult.value = { ...(lastResult.value ?? {}), png: dataUrl };
    }
    return { mime, bytesBase64, width, height, dataUrl };
  }

  /** Prefer current selection; fall back to full page roots. */
  async function exportSelectionOrDocument(
    format: 'png' | 'jpg' | 'webp' = 'png',
    quality = 92,
  ): Promise<OpenPencilRasterExport | null> {
    const selected = editor.getSelectedNodes().map((n) => n.id).filter(Boolean);
    return exportRaster(format, quality, selected.length > 0 ? selected : undefined);
  }

  function undo() {
    editor.undoAction();
    syncOpenPencilStateToCanvasStore(editor);
  }
  function redo() {
    editor.redoAction();
    syncOpenPencilStateToCanvasStore(editor);
  }
  function getLayerTree() {
    return editor.getLayerTree();
  }
  function getSelectedNodes() {
    return editor.getSelectedNodes();
  }
  function replaceDocument(graph: Parameters<Editor['replaceGraph']>[0]) {
    editor.replaceGraph(graph);
    syncOpenPencilStateToCanvasStore(editor);
  }

  return {
    editor,
    status,
    lastResult,
    exportSVG,
    importSVG,
    sendImageToAI,
    placeFiles,
    placeDataUrl,
    placeBytes,
    exportRaster,
    exportSelectionOrDocument,
    undo,
    redo,
    getLayerTree,
    getSelectedNodes,
    replaceDocument,
    onEditorEvent: editor.onEditorEvent.bind(editor),
  };
}

/**
 * 获取（或惰性创建）唯一的 OpenPencil bridge。
 * 多处调用返回同一实例，确保整个应用只有一个 editor。
 */
export function getOpenPencilBridge(): OpenPencilBridge {
  if (!singletonBridge) singletonBridge = createSingleton();
  return singletonBridge;
}

/**
 * 与旧的 `createOpenPencilBridge()` 工厂保持兼容。
 * 现在直接返回单例桥接，调用方仍然需要自行 `provideEditor(editor)`。
 */
export function createOpenPencilBridge(): OpenPencilBridge {
  return getOpenPencilBridge();
}

/** 仅在测试或调试场景下重置单例（例如 canvas 错误降级后重建）。 */
export function resetOpenPencilBridge(): void {
  singletonEditor = null;
  singletonBridge = null;
}

/** 取当前单例 editor；若尚未创建则返回 null。 */
export function getEditorInstance(): Editor | null {
  return singletonEditor;
}
