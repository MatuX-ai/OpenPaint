/**
 * Onboarding state — 首次启动引导卡 / 已读 hint 记录。
 *
 * 用法：
 *  - `useOnboarding().shouldShowMainCard` 控制 `OnboardingCard` 是否显示。
 *  - 三选项卡（新建 / 打开 / AI 帮忙画）任何一个被点选后调
 *    `markCompleted()`，24h 内不再展示。
 *  - 画布有内容（layerList.length > 0）时 `shouldShowMainCard` 也返回 false。
 *  - "帮助 → 入门引导" 调 `reset()` 强制重新显示。
 *  - W11-B4：`shouldShowAttributionToast` + `dismissAttributionToast()`
 *    负责首次启动的资源署名提示（与三选项卡独立）。
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
  /** W11-B4：是否已展示过资源署名 toast */
  attributionNoticeShown: boolean;
}

function loadPersisted(): OnboardingState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      completed: false,
      lastShownAt: null,
      dismissedHints: [],
      forceShow: false,
      attributionNoticeShown: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        completed: false,
        lastShownAt: null,
        dismissedHints: [],
        forceShow: false,
        attributionNoticeShown: false,
      };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: !!parsed.completed,
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : null,
      dismissedHints: Array.isArray(parsed.dismissedHints) ? parsed.dismissedHints : [],
      forceShow: !!parsed.forceShow,
      attributionNoticeShown: !!parsed.attributionNoticeShown,
    };
  } catch {
    return {
      completed: false,
      lastShownAt: null,
      dismissedHints: [],
      forceShow: false,
      attributionNoticeShown: false,
    };
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
    state.value = {
      completed: false,
      lastShownAt: null,
      dismissedHints: [],
      forceShow: true,
      attributionNoticeShown: false,
    };
    persistNow();
    // 强制显示后下次 onMounted 消费掉 forceShow 后再清掉
  }

  function consumeForceShow(): void {
    if (state.value.forceShow) {
      state.value = { ...state.value, forceShow: false };
      persistNow();
    }
  }

  /**
   * W11-B4：用户已看到资源署名提示（一次性 toast）。
   * 同时写入 Rust 端 `assets.attribution_notice_shown=true`，让 IPC 也返回 true。
   */
  function markAttributionShown(): void {
    if (state.value.attributionNoticeShown) return;
    state.value = { ...state.value, attributionNoticeShown: true };
    persistNow();
    // 同步到 Rust 端（fire-and-forget）
    void (async () => {
      try {
        const { assetApi } = await import('@/api');
        await assetApi.setAssetsConfig({
          cdnMirror: 'default',
          attributionNoticeShown: true,
        });
      } catch (e) {
        // 失败不影响本地提示状态
        console.debug('[useOnboarding] sync attribution_notice_shown failed:', e);
      }
    })();
  }

  /** W11-B4：首次启动且未 dismiss 资源署名 toast */
  const shouldShowAttributionToast = computed(
    () => !state.value.attributionNoticeShown,
  );

  /** W11-B4：dismiss 资源署名 toast（与 markAttributionShown 等价，语义不同）。 */
  function dismissAttributionToast(): void {
    markAttributionShown();
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
    shouldShowAttributionToast,
    markAttributionShown,
    dismissAttributionToast,
  };
}
