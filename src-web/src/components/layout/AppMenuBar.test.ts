/**
 * AppMenuBar 组件测试 — 覆盖四个菜单挂载 + Esc 关闭。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AppMenuBar from './AppMenuBar.vue';
import { setupComponentTest } from '@/test/setup';

setupComponentTest();

describe('AppMenuBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders File / Edit / View / Help triggers', () => {
    const w = mount(AppMenuBar, { attachTo: document.body });
    expect(w.text()).toContain('文件');
    expect(w.text()).toContain('编辑');
    expect(w.text()).toContain('视图');
    expect(w.text()).toContain('帮助');
  });

  it('clicking 文件 opens its dropdown', async () => {
    const w = mount(AppMenuBar, { attachTo: document.body });
    const triggers = w.findAll('.menu-dropdown__trigger');
    await triggers[0].trigger('click');
    await nextTick();
    // 第一个 menu 现在处于 open 状态，aria-expanded=true
    expect(triggers[0].attributes('aria-expanded')).toBe('true');
    const panels = w.findAll('[role="menu"]');
    expect(panels).toHaveLength(1);
    expect(panels[0].text()).toContain('新建画布');
  });

  it('clicking 文件 again toggles it off', async () => {
    const w = mount(AppMenuBar, { attachTo: document.body });
    const triggers = w.findAll('.menu-dropdown__trigger');
    await triggers[0].trigger('click');
    await nextTick();
    await triggers[0].trigger('click');
    await nextTick();
    expect(w.findAll('[role="menu"]')).toHaveLength(0);
  });

  it('Escape closes any open menu', async () => {
    const w = mount(AppMenuBar, { attachTo: document.body });
    const triggers = w.findAll('.menu-dropdown__trigger');
    await triggers[1].trigger('click'); // 编辑
    await nextTick();
    expect(w.findAll('[role="menu"]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(w.findAll('[role="menu"]')).toHaveLength(0);
  });

  it('click outside any menu closes it', async () => {
    const w = mount(AppMenuBar, { attachTo: document.body });
    const triggers = w.findAll('.menu-dropdown__trigger');
    await triggers[0].trigger('click');
    await nextTick();
    expect(w.findAll('[role="menu"]')).toHaveLength(1);
    // 在 menubar 之外点击
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(w.findAll('[role="menu"]')).toHaveLength(0);
  });
});
