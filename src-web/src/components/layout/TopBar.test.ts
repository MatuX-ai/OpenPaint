/**
 * TopBar 组件测试 — W12 VDP-UI-01 fix。
 *
 * 验证：
 * - 渲染品牌、撤销/重做、保存、面板切换、齿轮入口
 * - 齿轮（Quick Preferences）点击触发 uiStore.openQuickPreferences（不是 toggleSettings）
 * - 不会打开 AdvancedSettings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import TopBar from './TopBar.vue';
import { useUIStore } from '@stores/uiStore';
import { useCanvasStore } from '@stores/canvasStore';

function mountTopBar() {
  return mount(TopBar, { attachTo: document.body });
}

describe('TopBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.textContent = '';
    // 确保 useDocumentState 内部依赖的 canvasStore / UIStore 都已创建
    useCanvasStore();
    useUIStore();
  });

  it('TB-01: 渲染品牌名 + 撤销/重做/保存/齿轮按钮', () => {
    const w = mountTopBar();
    expect(w.text()).toContain('OpenPaint');
    // 6 个按钮：撤销、重做、保存、OpenPencil、图库、齿轮
    const buttons = w.findAll('.top-bar__btn');
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    expect(w.find('[data-testid="top-bar-quick-preferences"]').exists()).toBe(true);
    w.unmount();
  });

  it('TB-02: 点击齿轮触发 openQuickPreferences 而非 toggleSettings', async () => {
    const w = mountTopBar();
    const uiStore = useUIStore();
    const before = {
      quick: uiStore.quickPreferencesVisible,
      advanced: uiStore.advancedSettingsVisible,
    };
    expect(before.quick).toBe(false);
    expect(before.advanced).toBe(false);

    await w.find('[data-testid="top-bar-quick-preferences"]').trigger('click');
    await nextTick();

    expect(uiStore.quickPreferencesVisible).toBe(true);
    expect(uiStore.advancedSettingsVisible).toBe(false);
    w.unmount();
  });

  it('TB-03: 重复点击齿轮不会意外打开 AdvancedSettings', async () => {
    const w = mountTopBar();
    const uiStore = useUIStore();
    const btn = w.find('[data-testid="top-bar-quick-preferences"]');

    // 第一次点击：QuickPreferences 打开
    await btn.trigger('click');
    await nextTick();
    expect(uiStore.quickPreferencesVisible).toBe(true);
    expect(uiStore.advancedSettingsVisible).toBe(false);

    // 再次点击：QuickPreferences 保持开，AdvancedSettings 仍不打开
    // （openQuickPreferences 是单向打开，关闭需通过 closeQuickPreferences / uiStore.closeQuickPreferences）
    await btn.trigger('click');
    await nextTick();
    expect(uiStore.advancedSettingsVisible).toBe(false);
    w.unmount();
  });
});