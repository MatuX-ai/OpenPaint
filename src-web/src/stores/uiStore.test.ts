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
});
