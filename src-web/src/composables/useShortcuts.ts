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
import { getOpenPencilBridge } from '@composables/useOpenPencil';

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
  // 物理键 '?'、'+' 必带 Shift（标准 US/UK 键盘）。
  // 让用户在绑定里写 '?' 时不需要额外加 Shift 修饰符。
  if (key === '?' || key === '+') {
    shift = true;
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
  const bridge = getOpenPencilBridge();

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
      {
        combo: 'T',
        description: '变形工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('transform'),
      },
      {
        combo: 'R',
        description: '旋转工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('rotate'),
      },
      {
        combo: 'X',
        description: '文字工具',
        whenEditable: false,
        run: () => canvasStore.setActiveTool('text'),
      },

      // History — W14+ 统一走 OpenPencil editor（共享 SceneGraph 历史）。
      {
        combo: 'Ctrl+Z',
        description: '撤销',
        run: async () => {
          try {
            bridge.undo();
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
            bridge.redo();
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
            bridge.redo();
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
      // W14+ 统一画布架构：OpenPencil 已移至中央，不再有 "切到 OpenPencil 右窗" 快捷键。

      // File / Save / Export — 通过 useMenuActions.dispatch 转发
      {
        combo: 'Ctrl+N',
        description: '新建画布',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.new'),
          );
        },
      },
      {
        combo: 'Ctrl+O',
        description: '打开本地图片',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.open'),
          );
        },
      },
      {
        combo: 'Ctrl+S',
        description: '保存到图库',
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.save'),
          );
        },
      },
      {
        combo: 'Ctrl+Shift+S',
        description: '另存为本地',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.saveAs'),
          );
        },
      },
      {
        combo: 'Ctrl+E',
        description: '导出 PNG',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.export.png'),
          );
        },
      },
      {
        combo: 'Ctrl+Shift+E',
        description: '批量导出',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('file.batchExport'),
          );
        },
      },

      // Edit
      {
        // Ctrl+C → 走 menu bus 到 edit.copy handler（桌面端经 tauri-plugin-clipboard-manager
        // 写系统剪贴板；web preview 仅 toast 提示，见 AppView.vue:104）。
        combo: 'Ctrl+C',
        description: '复制',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('edit.copy'),
          );
        },
      },
      {
        // Ctrl+V → 走 menu bus 到 edit.paste handler（桌面端从系统剪贴板读 PNG 并 pasteImage 到画布）。
        // 不带 whenEditable=false 以保留输入框文本粘贴行为；
        // 但 edit.paste 在文本剪贴板上调用 readImage 会抛错并 toast 提示，因此安全。
        combo: 'Ctrl+V',
        description: '粘贴',
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('edit.paste'),
          );
        },
      },
      {
        combo: 'Ctrl+A',
        description: '全选',
        whenEditable: false,
        run: async () => {
          // 兼容模式：仍调用 Rust getSelectionBounds；OpenPencil editor 提供 selectAll()。
          try {
            const bounds = await canvasApi.getSelectionBounds();
            void bounds;
          } catch (e) {
            console.error(e);
          }
        },
      },
      {
        combo: 'Ctrl+D',
        description: '取消选区',
        whenEditable: false,
        run: async () => {
          try {
            await canvasApi.clearSelection();
          } catch (e) {
            console.error(e);
          }
        },
      },

      // View — zoom
      {
        combo: 'Ctrl+0',
        description: '缩放至 100%',
        whenEditable: false,
        run: () => canvasStore.setZoom(1),
      },
      {
        combo: 'Ctrl+Shift+0',
        description: '适配窗口',
        whenEditable: false,
        run: () => canvasStore.resetView(),
      },
      {
        combo: '=',
        description: '放大',
        whenEditable: false,
        run: () => canvasStore.setZoom(canvasStore.zoom * 1.2),
      },
      {
        combo: '+',
        description: '放大',
        whenEditable: false,
        run: () => canvasStore.setZoom(canvasStore.zoom * 1.2),
      },
      {
        combo: '-',
        description: '缩小',
        whenEditable: false,
        run: () => canvasStore.setZoom(canvasStore.zoom / 1.2),
      },

      // Help
      {
        combo: '?',
        description: '快捷键速查',
        whenEditable: false,
        run: () => {
          void import('@composables/useMenuActions').then((m) =>
            m.useMenuActions().dispatch('help.cheatsheet'),
          );
        },
      },
    ];
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
