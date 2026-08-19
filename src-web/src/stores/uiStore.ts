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

  // Apply persisted theme to <html> on boot.
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  // Persist any change to theme / panel / width.
  watch(
    [theme, rightPanelMode, rightPanelWidth],
    ([t, m, w]) => persist({ theme: t, rightPanelMode: m, rightPanelWidth: w }),
    { deep: false }
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

  return {
    theme,
    rightPanelMode,
    rightPanelWidth,
    assistantVisible,
    previewModalVisible,
    previewPayload,
    toggleTheme,
    switchRightPanel,
    setRightPanelWidth,
    openPreview,
    closePreview,
    toggleAssistant,
  };
});