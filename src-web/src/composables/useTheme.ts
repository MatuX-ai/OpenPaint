/**
 * useTheme 主题切换 composable
 */

import { computed, watch } from 'vue';
import { useUIStore } from '@stores/uiStore';

export function useTheme() {
  const uiStore = useUIStore();

  const isDark = computed(() => uiStore.theme === 'dark');

  // 同步到 document
  watch(
    () => uiStore.theme,
    (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
    },
    { immediate: true }
  );

  function setTheme(theme: 'light' | 'dark') {
    uiStore.theme = theme;
  }

  function toggle() {
    uiStore.toggleTheme();
  }

  return {
    theme: computed(() => uiStore.theme),
    isDark,
    setTheme,
    toggle,
  };
}