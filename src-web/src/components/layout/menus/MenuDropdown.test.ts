/**
 * MenuDropdown 组件测试 — 覆盖 FileMenu 等通用行为。
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MenuDropdown, { type DropdownItem } from './MenuDropdown.vue';

const ITEMS: DropdownItem[] = [
  { id: 'a', label: 'Item A', shortcut: 'Ctrl+A' },
  { id: 'sep', separator: true },
  { id: 'b', label: 'Item B', disabled: true },
  { id: 'c', label: 'Item C', danger: true },
];

describe('MenuDropdown', () => {
  it('renders the trigger label', () => {
    const w = mount(MenuDropdown, { props: { label: '文件', open: false, items: ITEMS } });
    expect(w.text()).toContain('文件');
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('clicking trigger emits toggle', async () => {
    const w = mount(MenuDropdown, { props: { label: '文件', open: false, items: ITEMS } });
    await w.find('.menu-dropdown__trigger').trigger('click');
    expect(w.emitted('toggle')).toHaveLength(1);
  });

  it('opens panel and renders items when open=true', async () => {
    const w = mount(MenuDropdown, { props: { label: '文件', open: true, items: ITEMS } });
    await nextTick();
    const panel = w.find('[role="menu"]');
    expect(panel.exists()).toBe(true);
    const items = w.findAll('[role="menuitem"]');
    expect(items).toHaveLength(3);
    expect(items[0].text()).toContain('Item A');
    expect(items[0].text()).toContain('Ctrl+A');
    expect(items[1].classes()).toContain('is-disabled');
    expect(items[2].classes()).toContain('is-danger');
  });

  it('clicking an item emits select and close', async () => {
    const w = mount(MenuDropdown, { props: { label: '文件', open: true, items: ITEMS } });
    await w.findAll('[role="menuitem"]')[0].trigger('click');
    expect(w.emitted('select')?.at(0)?.[0]).toBe('a');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('clicking a disabled item does nothing', async () => {
    const w = mount(MenuDropdown, { props: { label: '文件', open: true, items: ITEMS } });
    await w.findAll('[role="menuitem"]')[1].trigger('click');
    expect(w.emitted('select')).toBeUndefined();
    expect(w.emitted('close')).toBeUndefined();
  });

  it('trigger is disabled when disabled=true', () => {
    const w = mount(MenuDropdown, { props: { label: 'X', open: false, items: ITEMS, disabled: true } });
    expect(w.find('.menu-dropdown__trigger').attributes('disabled')).toBeDefined();
  });

  it('aria-expanded reflects open state', async () => {
    const w = mount(MenuDropdown, { props: { label: 'X', open: false, items: ITEMS } });
    expect(w.find('.menu-dropdown__trigger').attributes('aria-expanded')).toBe('false');
    await w.setProps({ open: true });
    expect(w.find('.menu-dropdown__trigger').attributes('aria-expanded')).toBe('true');
  });
});
