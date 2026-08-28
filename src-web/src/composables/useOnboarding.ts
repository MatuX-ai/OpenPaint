/**
 * Onboarding state — 首次启动引导卡 / 已读 hint 记录。
 *
 * 用法：
 *  - `useOnboarding().shouldShowMainCard` 控制 `OnboardingCard` 是否显示。
 *  - 三选项卡（新建 / 打开 / AI 帮忙画）任何一个被点选后调
 *    `markCompleted()`，24h 内不再展示。
 *  - 画布有内容（layerList.length > 0）时 `shouldShowMainCard` 也返回 false。
 *  - "帮助 → 入门引导" 调 `reset()` 强制重新显示。
 *
 * 持久化：localStorage key `openpaint:onboarding`。
 *
 * 关联需求：docs/ux-onboarding-requirements.md §3.2 useOnboarding、US-1 / ONB-101~105。
 */

import { ref, computed } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';

const STORAGE_KEY = 'openpaint:onboarding';
const SUPPRESS_HOURS = 24;
const SUPPRESS_MS = SUPPRESS_HOURS * 60 * 60 * 1000;

export interface OnboardingState {
  /** 全部完成过三选项之一 */
  completed: boolean;
  /** 上次"已显示"的时间戳（毫秒），用于 24h 节流 */
  lastShownAt: number | null;
  /** 已显式 dismiss 的小提示 id 集合 */
  dismissedHints: string[];
  /** 强制再次显示标记（"帮助 → 入门引导"触发） */
  forceShow: boolean;
}

function loadPersisted(): OnboardingState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { completed: false, lastShownAt: null, dismissedHints: [], forceShow: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false, lastShownAt: null, dismissedHints: [], forceShow: false };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: !!parsed.completed,
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : null,
      dismissedHints: Array.isArray(parsed.dismissedHints) ? parsed.dismissedHints : [],
      forceShow: !!parsed.forceShow,
    };
  } catch {
    return { completed: false, lastShownAt: null, dismissedHints: [], forceShow: false };
  }
}

function persist(state: OnboardingState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
}

const state = ref<OnboardingState>(loadPersisted());

export function useOnboarding() {
  function persistNow(): void {
    persist(state.value);
  }

  function recordShown(): void {
    state.value = { ...state.value, lastShownAt: Date.now() };
    persistNow();
  }

  function markCompleted(): void {
    state.value = { ...state.value, completed: true, lastShownAt: Date.now() };
    persistNow();
  }

  function dismissHint(id: string): void {
    if (state.value.dismissedHints.includes(id)) return;
    state.value = {
      ...state.value,
      dismissedHints: [...state.value.dismissedHints, id],
    };
    persistNow();
  }

  function reset(): void {
    state.value = { completed: false, lastShownAt: null, dismissedHints: [], forceShow: true };
    persistNow();
    // 强制显示后下次 onMounted 消费掉 forceShow 后再清掉
  }

  function consumeForceShow(): void {
    if (state.value.forceShow) {
      state.value = { ...state.value, forceShow: false };
      persistNow();
    }
  }

  const shouldShowMainCard = computed(() => {
    if (state.value.forceShow) return true;
    if (state.value.completed) return false;
    const canvasStore = useCanvasStore();
    if (canvasStore.layerList.length > 0) return false;
    const last = state.value.lastShownAt;
    if (last === null) return true;
    return Date.now() - last > SUPPRESS_MS;
  });

  return {
    state: computed(() => state.value),
    shouldShowMainCard,
    recordShown,
    markCompleted,
    dismissHint,
    reset,
    consumeForceShow,
  };
}
