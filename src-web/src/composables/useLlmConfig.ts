/**
 * useLlmConfig — tracks whether the LLM provider is configured.
 *
 * Exposes a reactive `isReady` flag plus a `refresh()` action so the
 * AI assistant panel can show a friendly "not configured" empty state
 * until the user wires up a provider + API key in Settings.
 *
 * W12 VDP-MOCK-03：新增 `isMock` getter，让 useAgent 与 AIAssistant
 * 知道当前 Provider 是零配置占位，进而绕过 IPC 走本地规则模板
 * （或直接告诉用户「这是模拟模式」）。
 */

import { computed, ref } from 'vue';
import { llmApi, isLlmConfigured } from '@api/index';
import type { LlmProviderConfig } from '@api/index';

const providerConfig = ref<LlmProviderConfig | null>(null);
const isReady = ref(false);
const loaded = ref(false);
let inflight: Promise<void> | null = null;

async function refresh() {
  // Coalesce concurrent callers; the first call populates both refs.
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cfg = await llmApi.getProviderConfig();
      providerConfig.value = cfg;
      isReady.value = isLlmConfigured(cfg);
    } catch (e) {
      // Treat backend failure as "not configured" rather than crashing
      // the assistant panel.
      console.warn('[useLlmConfig] refresh failed:', e);
      providerConfig.value = null;
      isReady.value = false;
    } finally {
      loaded.value = true;
      inflight = null;
    }
  })();
  return inflight;
}

export function useLlmConfig() {
  // Trigger an initial load the first time this composable is consumed
  // in a session; subsequent calls share the cached promise.
  if (!loaded.value && !inflight) {
    void refresh();
  }
  return {
    providerConfig,
    isReady,
    loaded,
    refresh,
    /** W12 VDP-MOCK-03：当前 Provider 是否为模拟模式。 */
    isMock: computed(() => providerConfig.value?.provider === 'mock'),
  };
}