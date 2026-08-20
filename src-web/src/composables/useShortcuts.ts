/**
 * useShortcuts — global keyboard shortcuts for the editor.
 *
 * Listens on `window` (or a provided target) and dispatches actions.
 * Designed to be registered once at app boot via `useShortcuts().register()`.
 */

import { onBeforeUnmount, onMounted } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';
import { useUIStore } from '@stores/uiStore';
import { canvasApi } from '@api/index';

export interface ShortcutBinding {
  /** e.g. 'B', 'Ctrl+Z'. Modifiers use 'Ctrl', 'Shift', 'Alt', 'Meta'. */
  combo: string;
  description: string;
  /** True when no input/textarea is focused. */
  whenEditable?: boolean;
  run: (event: KeyboardEvent) => void | Promise<void>;
}

interface ResolvedBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
  description: string;
  whenEditable: boolean;
  run: (event: KeyboardEvent) => void | Promise<void>;
}

function parseCombo(combo: string): {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
} {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') ctrl = true;
    else if (lower === 'shift') shift = true;
    else if (lower === 'alt' || lower === 'option') alt = true;
    else if (lower === 'meta' || lower === 'cmd') meta = true;
    else key = part.length === 1 ? part.toLowerCase() : part.toLowerCase();
  }
  return { ctrl, shift, alt, meta, key };
}

function eventMatches(
  event: KeyboardEvent,
  parsed: Omit<ResolvedBinding, 'run' | 'whenEditable' | 'description'>,
): boolean {
  const ctrl = parsed.ctrl === (event.ctrlKey || event.metaKey);
  if (!ctrl) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  if (parsed.meta !== event.metaKey) return false;
  const k = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  return k === parsed.key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useShortcuts(target: HTMLElement | Window = window) {
  const canvasStore = useCanvasStore();
  const uiStore = useUIStore();

  const bindings: ResolvedBinding[] = [];

  function register(binding: ShortcutBinding) {
    const parsed = parseCombo(binding.combo);
    bindings.push({
      ...parsed,
      description: binding.description,
      whenEditable: binding.whenEditable ?? false,
      run: binding.run,
    });
  }

  function defaultBindings(): ShortcutBinding[] {
    return [
      // Tools (skip when typing)
      {
        combo: 'V',
        description: '选择工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('select'),
      },
      {
        combo: 'B',
        description: '画笔工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('brush'),
      },
      {
        combo: 'E',
        description: '橡皮工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('eraser'),
      },
      {
        combo: 'M',
        description: '矩形选区',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('rect-select'),
      },
      {
        combo: 'H',
        description: '移动工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('move'),
      },

      // History
      {
        combo: 'Ctrl+Z',
        description: '撤销',
        run: async () => {
          try {
            await canvasApi.undo();
            canvasStore.canUndo = await refreshUndoFlag();
          } catch (e) {
            console.error(e);
          }
        },
      },
      {
        combo: 'Ctrl+Shift+Z',
        description: '重做',
        run: async () => {
          try {
            await canvasApi.redo();
            canvasStore.canRedo = await refreshRedoFlag();
          } catch (e) {
            console.error(e);
          }
        },
      },
      {
        combo: 'Ctrl+Y',
        description: '重做',
        run: async () => {
          try {
            await canvasApi.redo();
            canvasStore.canRedo = await refreshRedoFlag();
          } catch (e) {
            console.error(e);
          }
        },
      },

      // Panel toggles
      {
        combo: 'Ctrl+K',
        description: 'AI 助理显隐',
        whenEditable: false,
        run: () => uiStore.toggleAssistant(),
      },
      {
        combo: 'Ctrl+G',
        description: '图库面板',
        whenEditable: false,
        run: () => uiStore.switchRightPanel('gallery'),
      },
      {
        combo: 'Ctrl+G',
        description: 'OpenPencil 面板',
        whenEditable: false,
        run: () => uiStore.switchRightPanel('openpencil'),
      },
    ];
  }

  async function refreshUndoFlag(): Promise<boolean> {
    try {
      const summary = await canvasApi.getCanvasSummary();
      return summary.canUndo;
    } catch {
      return false;
    }
  }
  async function refreshRedoFlag(): Promise<boolean> {
    try {
      const summary = await canvasApi.getCanvasSummary();
      return summary.canRedo;
    } catch {
      return false;
    }
  }

  function handle(event: KeyboardEvent) {
    for (const binding of bindings) {
      if (!eventMatches(event, binding)) continue;
      if (!binding.whenEditable && isEditableTarget(event.target)) continue;
      event.preventDefault();
      event.stopPropagation();
      void binding.run(event);
      return;
    }
  }

  function install() {
    target.addEventListener('keydown', handle as EventListener);
  }
  function uninstall() {
    target.removeEventListener('keydown', handle as EventListener);
    bindings.length = 0;
  }

  onMounted(install);
  onBeforeUnmount(uninstall);

  return { register, install, uninstall, defaultBindings };
}
