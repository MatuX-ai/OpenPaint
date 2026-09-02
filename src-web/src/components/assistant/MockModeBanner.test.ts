/**
 * MockModeBanner 组件测试 — W12 VDP-MOCK-03。
 * 验证 isMock 为 true 时显示横幅 + 提供切换入口，
 * isMock 为 false 时不渲染。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, computed, ref, type ComputedRef, type Ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import MockModeBanner from './MockModeBanner.vue';
import { useUIStore } from '@stores/uiStore';
import * as useLlmConfigMod from '@composables/useLlmConfig';
import type { LlmProviderConfig } from '@api/index';

interface LlmConfigStub {
  providerConfig: Ref<LlmProviderConfig | null>;
  isReady: Ref<boolean>;
  loaded: Ref<boolean>;
  refresh: () => Promise<void>;
  isMock: ComputedRef<boolean>;
}

function stub(_isMock: boolean, provider: LlmProviderConfig['provider'] = 'mock'): LlmConfigStub {
  const cfg = ref({ provider, api_key: null, endpoint: '', model: '' }) as Ref<LlmProviderConfig | null>;
  return {
    providerConfig: cfg,
    isReady: ref(true) as Ref<boolean>,
    loaded: ref(true) as Ref<boolean>,
    refresh: (() => Promise.resolve()) as () => Promise<void>,
    // isMock 在 useLlmConfig 中是 computed，这里 mock 也用 computed 保持类型一致。
    isMock: computed(() => cfg.value?.provider === 'mock'),
  };
}

describe('MockModeBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.textContent = '';
  });
  afterEach(() => {
    document.body.textContent = '';
    vi.restoreAllMocks();
  });

  function q(selector: string): Element | null {
    return document.body.querySelector(selector);
  }

  it('MB-01: isMock=false 时不渲染', async () => {
    vi.spyOn(useLlmConfigMod, 'useLlmConfig').mockReturnValue(stub(false, 'deepseek'));
    const w = mount(MockModeBanner, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="mock-mode-banner"]')).toBeNull();
    w.unmount();
  });

  it('MB-02: isMock=true 时显示横幅 + 切换按钮', async () => {
    vi.spyOn(useLlmConfigMod, 'useLlmConfig').mockReturnValue(stub(true));
    const w = mount(MockModeBanner, { attachTo: document.body });
    await nextTick();
    const banner = q('[data-testid="mock-mode-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('模拟模式');
    expect(q('[data-testid="mock-banner-open-preferences"]')).not.toBeNull();
    w.unmount();
  });

  it('MB-03: 点击切换按钮调 uiStore.openQuickPreferences', async () => {
    vi.spyOn(useLlmConfigMod, 'useLlmConfig').mockReturnValue(stub(true));
    const store = useUIStore();
    const w = mount(MockModeBanner, { attachTo: document.body });
    await nextTick();
    q('[data-testid="mock-banner-open-preferences"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await nextTick();
    expect(store.quickPreferencesVisible).toBe(true);
    w.unmount();
  });
});