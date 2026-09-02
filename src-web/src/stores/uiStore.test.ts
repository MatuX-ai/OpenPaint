/**
 * uiStore 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUIStore } from '@/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initial state is dark theme', () => {
    const store = useUIStore();
    expect(store.theme).toBe('dark');
    expect(store.rightPanelMode).toBe('openpencil');
    expect(store.previewModalVisible).toBe(false);
  });

  it('toggleTheme switches theme', () => {
    const store = useUIStore();
    store.toggleTheme();
    expect(store.theme).toBe('light');
    store.toggleTheme();
    expect(store.theme).toBe('dark');
  });

  it('switchRightPanel changes mode', () => {
    const store = useUIStore();
    store.switchRightPanel('gallery');
    expect(store.rightPanelMode).toBe('gallery');
  });

  it('preview modal can be opened and closed', () => {
    const store = useUIStore();
    store.openPreview({ png: 'data:image/png;base64,xxx', title: 'demo' });
    expect(store.previewModalVisible).toBe(true);
    expect(store.previewPayload?.title).toBe('demo');
    store.closePreview();
    expect(store.previewModalVisible).toBe(false);
    expect(store.previewPayload).toBeNull();
  });

  // W12 VDP-UI-01/02：QuickPreferences / AdvancedSettings 拆分后双向独立。
  it('quickPreferencesVisible toggles independently', () => {
    const store = useUIStore();
    expect(store.quickPreferencesVisible).toBe(false);
    store.openQuickPreferences();
    expect(store.quickPreferencesVisible).toBe(true);
    store.closeQuickPreferences();
    expect(store.quickPreferencesVisible).toBe(false);
  });

  it('advancedSettingsVisible toggles independently', () => {
    const store = useUIStore();
    expect(store.advancedSettingsVisible).toBe(false);
    store.openAdvancedSettings();
    expect(store.advancedSettingsVisible).toBe(true);
    store.closeAdvancedSettings();
    expect(store.advancedSettingsVisible).toBe(false);
  });

  it('openSettings 过渡期转发到 AdvancedSettings', () => {
    const store = useUIStore();
    expect(store.advancedSettingsVisible).toBe(false);
    store.openSettings();
    expect(store.advancedSettingsVisible).toBe(true);
    store.closeSettings();
    expect(store.advancedSettingsVisible).toBe(false);
  });

  it('QuickPreferences 和 AdvancedSettings 互不影响', () => {
    const store = useUIStore();
    store.openQuickPreferences();
    expect(store.quickPreferencesVisible).toBe(true);
    expect(store.advancedSettingsVisible).toBe(false);
    store.openAdvancedSettings();
    expect(store.quickPreferencesVisible).toBe(true);
    expect(store.advancedSettingsVisible).toBe(true);
    store.closeQuickPreferences();
    expect(store.quickPreferencesVisible).toBe(false);
    expect(store.advancedSettingsVisible).toBe(true);
  });
});
