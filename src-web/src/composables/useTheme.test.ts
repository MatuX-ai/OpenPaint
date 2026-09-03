/**
 * useTheme 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useTheme } from '@composables/useTheme';
import { useUIStore } from '@stores/uiStore';

describe('useTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.documentElement.removeAttribute('data-theme');
    // 默认 ui.theme 从 localStorage 还原为 'dark'，测试中显式重置
    try {
      window.localStorage?.removeItem('openpaint:ui-state');
    } catch {
      // ignore
    }
  });

  it('exposes reactive theme derived from store', () => {
    const ui = useUIStore();
    ui.theme = 'dark';
    const t = useTheme();
    expect(t.theme.value).toBe('dark');
    expect(t.isDark.value).toBe(true);
  });

  it('isDark reflects theme state（先设 light 再设 dark）', () => {
    const ui = useUIStore();
    ui.theme = 'light';
    const t = useTheme();
    expect(t.isDark.value).toBe(false);
    ui.theme = 'dark';
    expect(t.isDark.value).toBe(true);
  });

  it('setTheme 更新 store 并反映到 documentElement data-theme', async () => {
    const ui = useUIStore();
    ui.theme = 'light';
    const t = useTheme();
    await nextTick();
    t.setTheme('dark');
    await nextTick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(ui.theme).toBe('dark');
    t.setTheme('light');
    await nextTick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(ui.theme).toBe('light');
  });

  it('toggle 在 light/dark 间切换', () => {
    const ui = useUIStore();
    ui.theme = 'light';
    const t = useTheme();
    const before = ui.theme;
    t.toggle();
    expect(ui.theme).not.toBe(before);
    t.toggle();
    expect(ui.theme).toBe(before);
  });

  it('返回稳定接口字段', () => {
    const t = useTheme();
    expect(t).toHaveProperty('theme');
    expect(t).toHaveProperty('isDark');
    expect(t).toHaveProperty('setTheme');
    expect(t).toHaveProperty('toggle');
    expect(typeof t.setTheme).toBe('function');
    expect(typeof t.toggle).toBe('function');
  });
});
