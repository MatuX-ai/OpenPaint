/**
 * useOpenPencil — bridge to the embedded OpenPencil web editor.
 *
 * MVP approach: iframe + postMessage protocol. The real OpenPencil
 * web app is not yet available; the host component renders a local
 * placeholder page (see `components/openpencil/OpenPencilView.vue`)
 * that speaks the same postMessage protocol.
 */

import { ref, type Ref } from 'vue';

export interface OpenPencilMessage {
  type:
    | 'OPENPENCIL_READY'
    | 'OPENPENCIL_RESULT'
    | 'OPENPENCIL_EXPORT_SVG'
    | 'OPENPENCIL_ERROR'
    | 'OPENPENCIL_AI_GENERATE';
  payload?: unknown;
  _prefix?: string;
  [key: string]: unknown;
}

export interface OpenPencilResult {
  svg?: string;
  png?: string;
}

export interface UseOpenPencilReturn {
  iframeRef: Ref<HTMLIFrameElement | null>;
  status: Readonly<Ref<'idle' | 'loading' | 'ready' | 'error'>>;
  /** Send the source image + prompt into the editor. */
  sendImageToAI: (imageData: string, prompt: string) => void;
  /** Ask the editor to export its current SVG. */
  exportSVG: () => void;
  /** Subscribe to editor results. Returns an unsubscribe fn. */
  onResult: (callback: (result: OpenPencilResult) => void) => () => void;
  /** Subscribe to ready / error events. */
  onStatusChange: (callback: (status: 'ready' | 'error') => void) => () => void;
}

const MESSAGE_PREFIX = 'openpaint:';

export function useOpenPencil(): UseOpenPencilReturn {
  const iframeRef = ref<HTMLIFrameElement | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');

  function postToEditor(msg: OpenPencilMessage) {
    const win = iframeRef.value?.contentWindow;
    if (!win) return;
    win.postMessage({ ...msg, _prefix: MESSAGE_PREFIX }, '*');
  }

  function sendImageToAI(imageData: string, prompt: string) {
    postToEditor({
      type: 'OPENPENCIL_AI_GENERATE',
      payload: { imageData, prompt },
    });
  }

  function exportSVG() {
    postToEditor({ type: 'OPENPENCIL_EXPORT_SVG' });
  }

  function onResult(callback: (result: OpenPencilResult) => void): () => void {
    const handler = (event: MessageEvent) => {
      const data = event.data as OpenPencilMessage | undefined;
      if (!data || data._prefix !== MESSAGE_PREFIX) return;
      if (data.type === 'OPENPENCIL_RESULT') {
        callback((data.payload as OpenPencilResult) ?? {});
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  function onStatusChange(callback: (s: 'ready' | 'error') => void): () => void {
    const handler = (event: MessageEvent) => {
      const data = event.data as OpenPencilMessage | undefined;
      if (!data || data._prefix !== MESSAGE_PREFIX) return;
      if (data.type === 'OPENPENCIL_READY') {
        status.value = 'ready';
        callback('ready');
      } else if (data.type === 'OPENPENCIL_ERROR') {
        status.value = 'error';
        callback('error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  return {
    iframeRef,
    status: status as Readonly<Ref<'idle' | 'loading' | 'ready' | 'error'>>,
    sendImageToAI,
    exportSVG,
    onResult,
    onStatusChange,
  };
}
