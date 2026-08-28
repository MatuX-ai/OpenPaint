/**
 * KeyboardCheatsheet 组件测试 — 覆盖 ONB-401。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import KeyboardCheatsheet from './KeyboardCheatsheet.vue';
import { setupComponentTest, bodyText } from '@/test/setup';

setupComponentTest();

describe('KeyboardCheatsheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all 6 group titles', () => {
    mount(KeyboardCheatsheet, { props: { open: true }, attachTo: document.body });
    const t = bodyText();
    expect(t).toContain('文件');
    expect(t).toContain('编辑');
    expect(t).toContain('工具');
    expect(t).toContain('视图');
    expect(t).toContain('面板');
    expect(t).toContain('帮助');
  });

  it('contains key Ctrl+S and "保存到图库"', () => {
    mount(KeyboardCheatsheet, { props: { open: true }, attachTo: document.body });
    const t = bodyText();
    expect(t).toContain('Ctrl + S');
    expect(t).toContain('保存到图库');
  });

  it('contains the ? shortcut for opening the cheatsheet', () => {
    mount(KeyboardCheatsheet, { props: { open: true }, attachTo: document.body });
    expect(bodyText()).toContain('显示此面板');
  });
});
