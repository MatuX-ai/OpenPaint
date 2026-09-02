/**
 * Global UI state.
 *
 * Persists to localStorage so theme + right panel state survive
 * page refresh. AI assistant visibility is per-session.
 */

import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { RightPanelMode, Theme } from '@/types/global';

const STORAGE_KEY = 'openpaint:ui-state';

// UX-A07：从 AI 助理未配置状态点 CTA → 设置高亮 LLM 区最多持续 8s。
const HIGHLIGHT_DURATION_MS = 8000;

interface PersistedState {
  theme?: Theme;
  rightPanelMode?: RightPanelMode;
  rightPanelWidth?: number;
}

function loadPersisted(): PersistedState {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

function persist(state: PersistedState) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded — ignore
  }
}

export const useUIStore = defineStore('ui', () => {
  const initial = loadPersisted();

  const theme = ref<Theme>(initial.theme ?? 'dark');
  const rightPanelMode = ref<RightPanelMode>(initial.rightPanelMode ?? 'openpencil');
  const rightPanelWidth = ref(initial.rightPanelWidth ?? 320);
  const assistantVisible = ref(true);
  const previewModalVisible = ref(false);
  const previewPayload = ref<{ svg?: string; png?: string; title?: string } | null>(null);
  // W12 VDP-UI-02：拆分 SettingsModal → QuickPreferences（齿轮入口 · 3 项）
  // + AdvancedSettings（菜单深处 · 完整 Provider / CDN / 资源库 / 署名）。
  // 保留 settingsModalVisible 作为过渡期转发，后面会逐步被替代。
  const settingsModalVisible = ref(false);
  const quickPreferencesVisible = ref(false);
  const advancedSettingsVisible = ref(false);
  const llmSettingsHighlight = ref(false);
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  // Apply persisted theme to <html> on boot.
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  // Persist any change to theme / panel / width.
  watch(
    [theme, rightPanelMode, rightPanelWidth],
    ([t, m, w]) => persist({ theme: t, rightPanelMode: m, rightPanelWidth: w }),
    { deep: false },
  );

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  function switchRightPanel(mode: RightPanelMode) {
    rightPanelMode.value = mode;
  }

  function setRightPanelWidth(px: number) {
    rightPanelWidth.value = Math.max(240, Math.min(600, Math.round(px)));
  }

  function openPreview(payload: { svg?: string; png?: string; title?: string }) {
    previewPayload.value = payload;
    previewModalVisible.value = true;
  }

  function closePreview() {
    previewModalVisible.value = false;
    previewPayload.value = null;
  }

  function toggleAssistant() {
    assistantVisible.value = !assistantVisible.value;
  }

  /**
   * W12 VDP-UI-02 · 过渡期：openSettings 仍保持可用，内部转发到 AdvancedSettings，
   * 避免外部引用 一次性破坏。后续 commit 会清理。
   */
  function openSettings() {
    openAdvancedSettings();
  }

  function closeSettings() {
    closeAdvancedSettings();
  }

  function toggleSettings() {
    advancedSettingsVisible.value = !advancedSettingsVisible.value;
  }

  /**
   * W12 VDP-UI-01：QuickPreferences 齿轮入口（仅 3 项快速偏好）。
   */
  function openQuickPreferences() {
    quickPreferencesVisible.value = true;
  }

  function closeQuickPreferences() {
    quickPreferencesVisible.value = false;
  }

  /**
   * W12 VDP-UI-02：AdvancedSettings 完整设置面板（从菜单“文件 → 偏好 → 高级…”进入）。
   */
  function openAdvancedSettings() {
    advancedSettingsVisible.value = true;
  }

  function closeAdvancedSettings() {
    advancedSettingsVisible.value = false;
  }

  /**
   * UX-A07：让 AdvancedSettings 在 8 秒内视觉高亮 LLM provider 区。
   * 当 AI 助理未配置时，用户在浮窗点 CTA 会调到这里。
   */
  function highlightLlmSettings() {
    llmSettingsHighlight.value = true;
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      llmSettingsHighlight.value = false;
      highlightTimer = null;
    }, HIGHLIGHT_DURATION_MS);
  }

  return {
    theme,
    rightPanelMode,
    rightPanelWidth,
    assistantVisible,
    previewModalVisible,
    previewPayload,
    settingsModalVisible,
    quickPreferencesVisible,
    advancedSettingsVisible,
    llmSettingsHighlight,
    toggleTheme,
    switchRightPanel,
    setRightPanelWidth,
    openPreview,
    closePreview,
    toggleAssistant,
    openSettings,
    closeSettings,
    toggleSettings,
    openQuickPreferences,
    closeQuickPreferences,
    openAdvancedSettings,
    closeAdvancedSettings,
    highlightLlmSettings,
  };
});
