/**
 * ContextMenu 组件测试 — W15 · G1
 *
 * 覆盖：
 *  - Teleport to body 行为
 *  - visible 守卫生效
 *  - 菜单项点击 / disabled / separator / danger 渲染
 *  - 点击外部 + Esc 触发 close
 *  - adjustedX/adjustedY 视口夹紧
 *  - shortcut 字段渲染
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ContextMenu, { type ContextMenuItem } from './ContextMenu.vue';
import { setupComponentTest, bodyHtml } from '@/test/setup';
import { Copy } from 'lucide-vue-next';

setupComponentTest();

function mountMenu(
  items: ContextMenuItem[],
  propsOverride: Partial<{ x: number; y: number }> = {},
) {
  return mount(ContextMenu, {
    props: { visible: true, x: 100, y: 100, items, ...propsOverride },
    attachTo: document.body,
  });
}

describe('ContextMenu', () => {
  beforeEach(() => {
    // 重置 viewport 尺寸，避免上一次测试影响 adjustedX/Y
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });

  it('visible=true 渲染 role=menu 到 document.body', async () => {
    const w = mountMenu([{ label: '项 A', onSelect: () => {} }]);
    await nextTick();
    expect(bodyHtml()).toContain('role="menu"');
    expect(bodyHtml()).toContain('项 A');
    w.unmount();
  });

  it('visible=false 不渲染 menu div', async () => {
    const w = mount(ContextMenu, {
      props: { visible: false, x: 0, y: 0, items: [] },
      attachTo: document.body,
    });
    await nextTick();
    expect(bodyHtml()).not.toContain('role="menu"');
    w.unmount();
  });

  it('普通 item 点击触发 close 事件', async () => {
    let selected = 0;
    const w = mountMenu([
      {
        label: 'A',
        onSelect: () => {
          selected += 1;
        },
      },
      {
        label: 'B',
        onSelect: () => {
          selected += 1;
        },
      },
    ]);
    await nextTick();
    const buttons = document.body.querySelectorAll('[role="menuitem"]');
    expect(buttons.length).toBe(2);
    (buttons[0] as HTMLElement).click();
    expect(selected).toBe(1);
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  it('disabled item 点击不触发 select / close', async () => {
    let selected = 0;
    const w = mountMenu([
      {
        label: '不可用',
        disabled: true,
        onSelect: () => {
          selected += 1;
        },
      },
    ]);
    await nextTick();
    const btn = document.body.querySelector('[role="menuitem"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(selected).toBe(0);
    expect(w.emitted('close')).toBeFalsy();
    w.unmount();
  });

  it('separator 渲染为 role=separator 且不渲染按钮', async () => {
    const w = mountMenu([
      { label: 'A', onSelect: () => {} },
      { label: '', separator: true },
      { label: 'B', onSelect: () => {} },
    ]);
    await nextTick();
    const separators = document.body.querySelectorAll('[role="separator"]');
    expect(separators.length).toBe(1);
    const items = document.body.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);
    w.unmount();
  });

  it('danger item 渲染 ctx-menu__item--danger class', async () => {
    const w = mountMenu([{ label: '删除', icon: Copy, danger: true, onSelect: () => {} }]);
    await nextTick();
    const btn = document.body.querySelector('[role="menuitem"]') as HTMLElement;
    expect(btn.className).toContain('ctx-menu__item--danger');
    w.unmount();
  });

  it('点击菜单外部（document.mousedown）触发 close', async () => {
    const w = mountMenu([{ label: 'A', onSelect: () => {} }]);
    await nextTick();
    // 点击 body 上非菜单区域
    const outside = document.createElement('div');
    outside.id = 'outside';
    document.body.appendChild(outside);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(w.emitted('close')).toBeTruthy();
    document.body.removeChild(outside);
    w.unmount();
  });

  it('Esc 按键触发 close', async () => {
    const w = mountMenu([{ label: 'A', onSelect: () => {} }]);
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(w.emitted('close')).toBeTruthy();
    w.unmount();
  });

  it('x 超出 viewport 时 adjustedX 自动夹紧', async () => {
    const w = mountMenu([{ label: 'A', onSelect: () => {} }], { x: 9999, y: 50 });
    await nextTick();
    const menu = document.body.querySelector('.ctx-menu') as HTMLElement;
    // adjustedX = min(x, innerWidth - width - 8) = min(9999, 1024 - 200 - 8) = 816
    const left = parseInt(menu.style.left, 10);
    expect(left).toBeLessThanOrEqual(1024 - 8);
    expect(left).toBeGreaterThan(0);
    w.unmount();
  });

  it('shortcut 字段显示在 __shortcut span 内', async () => {
    const w = mountMenu([{ label: '旋转', shortcut: 'R', onSelect: () => {} }]);
    await nextTick();
    expect(bodyHtml()).toContain('ctx-menu__shortcut');
    expect(bodyHtml()).toContain('R');
    w.unmount();
  });
});
