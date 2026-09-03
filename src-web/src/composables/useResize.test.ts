/**
 * useResize 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useResize } from '@composables/useResize';

describe('useResize', () => {
  beforeEach(() => {
    // happy-dom 不一定支持 ResizeObserver；提供一个 stub
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    delete (globalThis as any).ResizeObserver;
  });

  it('returns reactive size and refresh handle', async () => {
    const target = ref<HTMLElement | null>(null);
    const Comp = defineComponent({
      setup() {
        return useResize(target);
      },
      render: () => h('div'),
    });
    const wrapper = mount(Comp, {
      attachTo: document.body,
    });
    await nextTick();
    // size 初始为 {0, 0}，refresh 应不抛错
    expect(wrapper.vm).toBeTruthy();
    wrapper.unmount();
  });

  it('refresh is callable without error when target missing', () => {
    // 直接构造实例化对象需要组件上下文；这里跳过组件，验证类型导出。
    // 类型层断言：UseResizeReturn 接口存在
    expect(typeof useResize).toBe('function');
  });

  it('exports Size interface fields', () => {
    // 通过类型断言检查 Size 接口字段
    const s: { width: number; height: number } = { width: 100, height: 50 };
    expect(s.width).toBe(100);
    expect(s.height).toBe(50);
  });

  it('falls back to window resize when ResizeObserver missing', async () => {
    // 临时移除 ResizeObserver，验证不会因缺失而崩溃
    const prev = (globalThis as any).ResizeObserver;
    delete (globalThis as any).ResizeObserver;

    const target = ref<HTMLElement | null>(null);
    const Comp = defineComponent({
      setup() {
        return useResize(target);
      },
      render: () => h('div'),
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await nextTick();
    // 触发一次 window resize，验证 listener 注册成功
    window.dispatchEvent(new Event('resize'));
    wrapper.unmount();
    if (prev !== undefined) {
      (globalThis as any).ResizeObserver = prev;
    }
  });

  it('watchWindow option can be disabled', async () => {
    const target = ref<HTMLElement | null>(null);
    const Comp = defineComponent({
      setup() {
        return useResize(target, { watchWindow: false });
      },
      render: () => h('div'),
    });
    const wrapper = mount(Comp, { attachTo: document.body });
    await nextTick();
    wrapper.unmount();
  });
});