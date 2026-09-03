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
 *  - Rust `canvasApi.pasteImage` 不再作为主编辑路径，只保留为兼容能力。
 */

import { ref, type Ref } from 'vue';
import { createEditor } from '@open-pencil/core/editor';
import type { Editor } from '@open-pencil/core/editor';
import { aiApi } from '@api/index';

export type OpenPencilStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OpenPencilResult {
  svg?: string;
  png?: string;
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

  function undo() {
    editor.undoAction();
  }
  function redo() {
    editor.redoAction();
  }
  function getLayerTree() {
    return editor.getLayerTree();
  }
  function getSelectedNodes() {
    return editor.getSelectedNodes();
  }
  function replaceDocument(graph: Parameters<Editor['replaceGraph']>[0]) {
    editor.replaceGraph(graph);
  }

  return {
    editor,
    status,
    lastResult,
    exportSVG,
    importSVG,
    sendImageToAI,
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
