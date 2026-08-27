/**
 * useOpenPencil — bridge to the real OpenPencil editor
 * (`@open-pencil/core` + `@open-pencil/vue` + `canvaskit-wasm`).
 *
 * Each call creates a fresh editor instance bound to the supplied canvas ref.
 * The component is responsible for `provideEditor(editor)` before `useCanvas()`
 * runs (see `OpenPencilView.vue`).
 *
 * The previous iframe + postMessage placeholder was removed in favour of the
 * official Vue SDK so the right window is a real vector editor (not a stub).
 */
import { ref, type Ref } from 'vue';
import { createEditor } from '@open-pencil/core/editor';
import { aiApi } from '@api/index';
import type { Editor } from '@open-pencil/core/editor';

export type OpenPencilStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OpenPencilResult {
  svg?: string;
  png?: string;
}

export interface OpenPencilBridge {
  /** The freshly created editor instance — caller must `provideEditor` it. */
  editor: Editor;
  /** Reactive status that flips to `ready` once the canvas renderer reports ready. */
  status: Ref<OpenPencilStatus>;
  /** Last result from a successful export. */
  lastResult: Ref<OpenPencilResult | null>;
  /**
   * Push the current selection / page as SVG. Returns the SVG string, or null
   * if there is nothing to export.
   */
  exportSVG: () => string | null;
  /** Import an arbitrary SVG fragment into the editor document. */
  importSVG: (svg: string) => Promise<void>;
  /**
   * Forward an image + prompt to the backend AI engine, then push the
   * returned SVG back into the editor so the user can refine it.
   */
  sendImageToAI: (imageData: string, prompt: string) => Promise<OpenPencilResult | null>;
}

/**
 * Factory: builds an editor instance plus the small bridge surface used by
 * `OpenPencilView.vue`. Call once per mount; pair with `provideEditor` +
 * `useCanvas` in the host component.
 */
export function createOpenPencilBridge(): OpenPencilBridge {
  const status = ref<OpenPencilStatus>('loading');
  const lastResult = ref<OpenPencilResult | null>(null);

  let editor: Editor;
  try {
    editor = createEditor();
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

  async function importSVG(svg: string): Promise<void> {
    if (!svg) return;
    await editor.pasteFromHTML(svg, undefined, { replaceSelection: false });
    lastResult.value = { svg };
  }

  async function sendImageToAI(imageData: string, prompt: string): Promise<OpenPencilResult | null> {
    const res = await aiApi.sendToAiEngine(imageData, prompt);
    lastResult.value = { svg: res.svg, png: res.png };
    await importSVG(res.svg);
    return lastResult.value;
  }

  return {
    editor,
    status,
    lastResult,
    exportSVG,
    importSVG,
    sendImageToAI,
  };
}
