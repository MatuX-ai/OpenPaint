/**
 * QuickPreferences 组件测试 — 覆盖 W12 VDP-UI-01。
 * 验证只暴露 3 项快速偏好，主题按钮触发 uiStore.toggleTheme，
 * "更换 AI 模型…" 触发 uiStore.openAdvancedSettings。
 *
 * 注意：组件用 <Teleport to="body"> 渲染，Vue Test Utils 的 wrapper.find
 * 默认查不到 teleport 出去的 DOM，因此用 document.body.querySelector 兜查。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import QuickPreferences from './QuickPreferences.vue';
import { useUIStore } from '@/stores/uiStore';

describe('QuickPreferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function q(selector: string): Element | null {
    return document.body.querySelector(selector);
  }

  it('默认隐藏（未打开时不渲染 dialog）', async () => {
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="quick-prefs"]')).toBeNull();
    w.unmount();
  });

  it('openQuickPreferences 后渲染 3 个区块', async () => {
    const store = useUIStore();
    store.openQuickPreferences();
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="quick-prefs-theme"]')).not.toBeNull();
    expect(q('[data-testid="quick-prefs-model"]')).not.toBeNull();
    expect(q('[data-testid="quick-prefs-data-dir"]')).not.toBeNull();
    expect(q('[data-testid="quick-prefs-open-advanced"]')).not.toBeNull();
    w.unmount();
  });

  it('点击主题按钮调 uiStore.toggleTheme', async () => {
    const store = useUIStore();
    store.openQuickPreferences();
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    expect(store.theme).toBe('dark');
    q('[data-testid="quick-prefs-theme"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await nextTick();
    expect(store.theme).toBe('light');
    w.unmount();
  });

  it('点击"AI 模型"行调 uiStore.openAdvancedSettings', async () => {
    const store = useUIStore();
    store.openQuickPreferences();
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    q('[data-testid="quick-prefs-model"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await nextTick();
    expect(store.advancedSettingsVisible).toBe(true);
    w.unmount();
  });

  it('点击底部"更换 AI 模型…"调 uiStore.openAdvancedSettings', async () => {
    const store = useUIStore();
    store.openQuickPreferences();
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    q('[data-testid="quick-prefs-open-advanced"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await nextTick();
    expect(store.advancedSettingsVisible).toBe(true);
    w.unmount();
  });

  it('closeQuickPreferences 隐藏面板', async () => {
    const store = useUIStore();
    store.openQuickPreferences();
    const w = mount(QuickPreferences, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="quick-prefs"]')).not.toBeNull();
    store.closeQuickPreferences();
    await nextTick();
    expect(q('[data-testid="quick-prefs"]')).toBeNull();
    w.unmount();
  });
});
