/**
 * useLlmConfig — tracks whether the LLM provider is configured.
 *
 * Exposes a reactive `isReady` flag plus a `refresh()` action so the
 * AI assistant panel can show a friendly "not configured" empty state
 * until the user wires up a provider + API key in Settings.
 */

import { ref } from 'vue';
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
  return { providerConfig, isReady, loaded, refresh };
}