/**
 * Menu actions bus — 菜单项 → 实际动作的解耦。
 *
 * 设计目的：菜单 UI 组件（FileMenu / EditMenu / ViewMenu / HelpMenu）只 emit
 * 一个 `select` 事件 + item id，具体动作（弹新建画布向导、调 API、保存到图库、
 * 切换主题等）由 `AppView` 在 onMounted 时注册一次。这样菜单组件保持纯净，
 * 且 onMounted 的注册顺序天然保证快捷键与菜单走同一条路径（未来共用）。

 * 关联需求：docs/ux-onboarding-requirements.md §2.1、§3.2。
 */

export type MenuActionId =
  // File
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.export.png'
  | 'file.export.jpg'
  | 'file.export.webp'
  | 'file.batchExport'
  | 'file.recent'
  | 'file.quit'
  // Edit
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.selectAll'
  | 'edit.clearSelection'
  | 'edit.copy'
  | 'edit.paste'
  // View
  | 'view.zoom.100'
  | 'view.zoom.fit'
  | 'view.zoom.in'
  | 'view.zoom.out'
  | 'view.rightPanel.openpencil'
  | 'view.rightPanel.gallery'
  | 'view.rightPanel.none'
  | 'view.theme'
  | 'view.fullscreen'
  // Help
  | 'help.cheatsheet'
  | 'help.onboarding'
  | 'help.about'
  | 'help.issues'
  | 'help.docs';

type Handler = () => void | Promise<void>;

const handlers = new Map<MenuActionId, Set<Handler>>();

export function useMenuActions() {
  function register(id: MenuActionId, handler: Handler): () => void {
    let set = handlers.get(id);
    if (!set) {
      set = new Set();
      handlers.set(id, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) handlers.delete(id);
    };
  }

  async function dispatch(id: MenuActionId): Promise<void> {
    const set = handlers.get(id);
    if (!set || set.size === 0) return;
    // 只调用最后一个注册（onMounted 后注册的覆盖之前的）
    const last = Array.from(set).pop();
    if (last) await last();
  }

  function clear(): void {
    handlers.clear();
  }

  return { register, dispatch, clear };
}
