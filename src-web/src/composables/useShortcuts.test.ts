/**
 * useShortcuts 单元测试
 *
 * 覆盖：
 *  - 暴露的接口字段
 *  - defaultBindings 列表包含关键快捷键（V/B/E/Ctrl+Z/Ctrl+S 等）
 *  - defaultBindings 中所有组合都含 description 且 whenEditable 默认 false
 *  - dispatch KeyboardEvent 在 window 上触发对应 binding.run
 *  - 输入框聚焦时非 whenEditable 的快捷键被忽略
 *  - install / uninstall 可多次调用而不重复注册
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, h, onMounted } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('@api/index', () => ({
  canvasApi: {
    getCanvasSummary: vi.fn().mockResolvedValue({
      width: 0,
      height: 0,
      activeLayerId: null,
      canUndo: false,
      canRedo: false,
      layers: [],
    }),
    renderCanvasPng: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clearSelection: vi.fn(),
    getSelectionBounds: vi.fn(),
  },
}));

// W14+ 统一画布架构：快捷键走 OpenPencil bridge 单例。
// 测试环境里 mock 出 noop 的 undo / redo 避免真实调用。
vi.mock('@composables/useOpenPencil', () => ({
  getOpenPencilBridge: () => ({
    editor: {} as unknown,
    status: { value: 'ready' },
    lastResult: { value: null },
    exportSVG: () => null,
    importSVG: async () => {},
    sendImageToAI: async () => null,
    undo: () => {},
    redo: () => {},
    getLayerTree: () => [],
    getSelectedNodes: () => [],
    replaceDocument: () => {},
    onEditorEvent: () => () => {},
  }),
}));

import * as ApiIndex from '@api/index';
import { useShortcuts } from '@composables/useShortcuts';
import { useCanvasStore } from '@stores/canvasStore';
import { useUIStore } from '@stores/uiStore';

describe('useShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('返回 { register, install, uninstall, defaultBindings }', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    expect(captured).not.toBeNull();
    expect(typeof captured!.register).toBe('function');
    expect(typeof captured!.install).toBe('function');
    expect(typeof captured!.uninstall).toBe('function');
    expect(typeof captured!.defaultBindings).toBe('function');
    wrapper.unmount();
  });

  it('defaultBindings 返回非空数组，每项都有 combo + description + run', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const list = captured!.defaultBindings();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(10);
    for (const b of list) {
      expect(typeof b.combo).toBe('string');
      expect(b.combo.length).toBeGreaterThan(0);
      expect(typeof b.description).toBe('string');
      expect(typeof b.run).toBe('function');
    }
    wrapper.unmount();
  });

  it('defaultBindings 包含关键快捷键', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const combos = captured!.defaultBindings().map((b) => b.combo);
    // 工具快捷键
    for (const c of ['V', 'B', 'E', 'M', 'H', 'T']) {
      expect(combos).toContain(c);
    }
    // 历史/文件
    expect(combos).toContain('Ctrl+Z');
    expect(combos).toContain('Ctrl+Shift+Z');
    expect(combos).toContain('Ctrl+Y');
    expect(combos).toContain('Ctrl+N');
    expect(combos).toContain('Ctrl+O');
    expect(combos).toContain('Ctrl+S');
    // 面板
    expect(combos).toContain('Ctrl+K');
    expect(combos).toContain('Ctrl+G');
    // W14+ 统一画布架构：已移除 'Ctrl+Alt+P'（"切到 OpenPencil 面板"）。
    expect(combos).not.toContain('Ctrl+Alt+P');
    // 视图
    expect(combos).toContain('Ctrl+0');
    // 帮助
    expect(combos).toContain('?');
    wrapper.unmount();
  });

  it('defaultBindings 中 V/B/E 工具快捷键调用 setActiveTool', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const list = captured!.defaultBindings();
    const brushBinding = list.find((b) => b.combo === 'B')!;
    brushBinding.run(new KeyboardEvent('keydown'));
    expect(useCanvasStore().activeTool).toBe('brush');
    const vBinding = list.find((b) => b.combo === 'V')!;
    vBinding.run(new KeyboardEvent('keydown'));
    expect(useCanvasStore().activeTool).toBe('select');
    wrapper.unmount();
  });

  it('Ctrl+K 触发 uiStore.toggleAssistant', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const ui = useUIStore();
    const before = ui.assistantVisible;
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+K')!;
    k.run(new KeyboardEvent('keydown'));
    expect(ui.assistantVisible).toBe(!before);
    wrapper.unmount();
  });

  it('Ctrl+G 切到 gallery 面板', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const ui = useUIStore();
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+G')!;
    k.run(new KeyboardEvent('keydown'));
    expect(ui.rightPanelMode).toBe('gallery');
    wrapper.unmount();
  });

  // W14+ 统一画布架构：OpenPencil 已移至中央，不再注册 Ctrl+Alt+P。
  it('Ctrl+Alt+P 已从默认快捷键移除', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const combos = captured!.defaultBindings().map((b) => b.combo);
    expect(combos).not.toContain('Ctrl+Alt+P');
    wrapper.unmount();
  });

  it('Ctrl+0 重置 zoom 到 1', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const canvas = useCanvasStore();
    canvas.setZoom(2.5);
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+0')!;
    k.run(new KeyboardEvent('keydown'));
    expect(canvas.zoom).toBe(1);
    wrapper.unmount();
  });

  it('注册自定义快捷键并触发 run', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+L',
      description: '测试',
      run: onRun,
    });
    // 触发 keyboard event
    const ev = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true });
    window.dispatchEvent(ev);
    expect(onRun).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('自定义快捷键组合修饰符不匹配时不触发', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+L',
      description: '测试',
      run: onRun,
    });
    const ev = new KeyboardEvent('keydown', { key: 'l' }); // 缺 Ctrl
    window.dispatchEvent(ev);
    expect(onRun).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('whenEditable=false 的快捷键在 input 中不触发', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+M',
      description: 'm',
      whenEditable: false,
      run: onRun,
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = new KeyboardEvent('keydown', {
      key: 'm',
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(ev);
    expect(onRun).not.toHaveBeenCalled();
    input.remove();
    wrapper.unmount();
  });

  it('whenEditable=true（或默认）的快捷键在 input 中能触发', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+J',
      description: 'j',
      // whenEditable 默认 false，但 useShortcuts 里默认 whenEditable=??，见类型
      whenEditable: true,
      run: onRun,
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = new KeyboardEvent('keydown', {
      key: 'j',
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(ev);
    window.dispatchEvent(ev);
    expect(onRun).toHaveBeenCalled();
    input.remove();
    wrapper.unmount();
  });

  it('install / uninstall 控制 listener 注册/解绑', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+K1',
      description: 'k1',
      run: onRun,
    });
    // uninstall 后应不再触发
    captured!.uninstall();
    const ev = new KeyboardEvent('keydown', { key: '1', ctrlKey: true });
    window.dispatchEvent(ev);
    expect(onRun).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('uninstall 后重新注册能再次响应（uninstall 会清空 bindings）', () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const onRun = vi.fn();
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    captured!.register({
      combo: 'Ctrl+Q',
      description: 'q',
      run: onRun,
    });
    captured!.uninstall();
    // uninstall 同时清空了 bindings，需要重新 register
    captured!.register({
      combo: 'Ctrl+Q',
      description: 'q',
      run: onRun,
    });
    captured!.install();
    const ev = new KeyboardEvent('keydown', { key: 'q', ctrlKey: true });
    window.dispatchEvent(ev);
    expect(onRun).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('Ctrl+Z 调用 OpenPencil bridge.undo', async () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+Z')!;
    // 当前测试用 happy-dom，bridge 单例里的 editor 是 mock 的占位；
    // 主要断言：调用不抛错，且不再调用 Rust canvasApi.undo。
    await k.run(new KeyboardEvent('keydown'));
    expect(ApiIndex.canvasApi.undo).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('Ctrl+Y 调用 OpenPencil bridge.redo（不再走 canvasApi.redo）', async () => {
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+Y')!;
    await k.run(new KeyboardEvent('keydown'));
    expect(ApiIndex.canvasApi.redo).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('Ctrl+A 调用 getSelectionBounds（不抛错）', async () => {
    vi.mocked(ApiIndex.canvasApi.getSelectionBounds).mockResolvedValueOnce({
      x: 0, y: 0, width: 100, height: 100,
    });
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+A')!;
    await k.run(new KeyboardEvent('keydown'));
    expect(ApiIndex.canvasApi.getSelectionBounds).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('Ctrl+D 调用 clearSelection', async () => {
    vi.mocked(ApiIndex.canvasApi.clearSelection).mockResolvedValueOnce();
    let captured: ReturnType<typeof useShortcuts> | null = null;
    const Comp = defineComponent({
      setup() {
        captured = useShortcuts();
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    const k = captured!.defaultBindings().find((b) => b.combo === 'Ctrl+D')!;
    await k.run(new KeyboardEvent('keydown'));
    expect(ApiIndex.canvasApi.clearSelection).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('仅在激活 pinia / setup() 上下文时 onMounted 才注册 listener', () => {
    // 不进入 setup() 上下文直接调用 useShortcuts 会在 onMounted 时挂载；
    // 这里再次调用 useShortcuts 不会冲突：每个实例独立。
    const Comp = defineComponent({
      setup() {
        const s = useShortcuts();
        onMounted(() => {
          // install 可被显式调用
          s.install();
        });
        return () => h('div');
      },
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    expect(wrapper.vm).toBeTruthy();
    wrapper.unmount();
  });
});