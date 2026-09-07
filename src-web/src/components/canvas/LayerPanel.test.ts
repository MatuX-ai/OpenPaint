/**
 * LayerPanel — OpenPencil-backed layer actions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import LayerPanel from './LayerPanel.vue';
import LayerItem from './LayerItem.vue';
import { useCanvasStore } from '@stores/canvasStore';
import type { Layer } from '@/types/canvas';

const editor = {
  select: vi.fn(),
  deleteSelected: vi.fn(),
  duplicateSelected: vi.fn(),
  renameNode: vi.fn(),
  createShape: vi.fn(() => 'new-frame'),
  updateNodeWithUndo: vi.fn(),
  rotateNodes: vi.fn(),
  reorderChildWithUndo: vi.fn(),
  groupSelected: vi.fn(() => 'group-1'),
  flattenSelected: vi.fn(() => 'flat-1'),
  getLayerTree: vi.fn(() => []),
  requestRepaint: vi.fn(),
  state: { currentPageId: 'page-1', panX: 0, panY: 0, zoom: 1 },
  graph: {
    getNode: vi.fn((id: string) => ({ id, name: id, parentId: 'page-1' })),
  },
};

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastWarn: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@composables/useOpenPencil', () => ({
  getOpenPencilBridge: () => ({ editor }),
  syncOpenPencilStateToCanvasStore: vi.fn(),
}));

vi.mock('@composables/useToast', () => ({
  useToast: () => ({
    error: mocks.toastError,
    warn: mocks.toastWarn,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  }),
}));

function makeLayer(id: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    name: `Layer ${id}`,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
    width: 1280,
    height: 720,
    offsetX: 0,
    offsetY: 0,
    isActive: false,
    ...overrides,
  };
}

function mountPanel() {
  return mount(LayerPanel, { attachTo: document.body });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await nextTick();
}

describe('LayerPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    Object.values(editor).forEach((v) => {
      if (typeof v === 'function' && 'mockReset' in v) (v as ReturnType<typeof vi.fn>).mockReset();
    });
    editor.createShape.mockReturnValue('new-frame');
    editor.groupSelected.mockReturnValue('group-1');
    editor.flattenSelected.mockReturnValue('flat-1');
    editor.graph.getNode.mockImplementation((id: string) => ({
      id,
      name: id,
      parentId: 'page-1',
    }));
    editor.getLayerTree.mockImplementation(() => {
      const store = useCanvasStore();
      return store.layerList.map((l) => ({
        depth: 0,
        node: { id: l.id, name: l.name, visible: l.visible, parentId: 'page-1' },
      }));
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('P1: 渲染 layers（reverse 顺序，top-most 在前）', async () => {
    const store = useCanvasStore();
    store.layerList = [
      makeLayer('a', { isActive: false }),
      makeLayer('b', { isActive: true }),
      makeLayer('c', { isActive: false }),
    ];
    const w = mountPanel();
    await nextTick();
    const items = w.findAllComponents(LayerItem);
    expect(items.length).toBe(3);
    expect(items[0].props('layer').id).toBe('c');
    expect(items[1].props('layer').id).toBe('b');
    expect(items[2].props('layer').id).toBe('a');
  });

  it('P2: 点击 + 调 editor.createShape', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a')];
    const w = mountPanel();
    await nextTick();
    const addBtn = w.findAll('.layer-panel__btn')[0];
    await addBtn.trigger('click');
    await flush();
    expect(editor.createShape).toHaveBeenCalled();
  });

  it('P3: 点击垃圾桶删除活动图层（layerList > 1）', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    store.activeLayerId = 'b';
    const w = mountPanel();
    await nextTick();
    const trashBtn = w.findAll('.layer-panel__btn')[1];
    await trashBtn.trigger('click');
    await flush();
    expect(editor.select).toHaveBeenCalledWith(['b']);
    expect(editor.deleteSelected).toHaveBeenCalled();
  });

  it('P3b: layerList 长度为 1 时垃圾桶按钮禁用', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a')];
    const w = mountPanel();
    await nextTick();
    const trashBtn = w.findAll('.layer-panel__btn')[1];
    expect((trashBtn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('P4: LayerItem locked-changed 触发 updateNodeWithUndo', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('x', { locked: false })];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('locked-changed', 'x', true);
    await nextTick();
    expect(editor.updateNodeWithUndo).toHaveBeenCalled();
    expect(store.layerList[0].locked).toBe(true);
  });

  it('P5: 右键菜单含复制 / 合并 / 删除', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('context-menu', new MouseEvent('contextmenu'), 'b');
    await nextTick();
    const html = document.body.innerHTML;
    expect(html).toContain('复制图层');
    expect(html).toContain('向下合并');
    expect(html).toContain('合并可见');
    expect(html).toContain('删除图层');
  });

  it('P6: 点击「删除图层」调 editor.deleteSelected', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('context-menu', new MouseEvent('contextmenu'), 'b');
    await nextTick();
    const buttons = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ) as HTMLElement[];
    const deleteBtn = buttons.find((b) => b.textContent?.includes('删除图层'));
    expect(deleteBtn).toBeTruthy();
    deleteBtn!.click();
    await flush();
    expect(editor.select).toHaveBeenCalledWith(['b']);
    expect(editor.deleteSelected).toHaveBeenCalled();
  });

  it('P7: 点击「复制图层」调 duplicateSelected', async () => {
    const store = useCanvasStore();
    store.layerList = [makeLayer('a'), makeLayer('b')];
    const w = mountPanel();
    await nextTick();
    const item = w.findComponent(LayerItem);
    await item.vm.$emit('context-menu', new MouseEvent('contextmenu'), 'a');
    await nextTick();
    const buttons = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ) as HTMLElement[];
    const dup = buttons.find((b) => b.textContent?.includes('复制图层'));
    dup!.click();
    await flush();
    expect(editor.duplicateSelected).toHaveBeenCalled();
  });
});
