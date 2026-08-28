/**
 * Document state — 画布的"脏"状态、文件名、保存态。
 *
 * 用法：
 *  - 任何会修改画布的 IPC 在成功后调 `markDirty()`，红点亮。
 *  - 保存按钮 / `Ctrl+S` 在成功后调 `markSaved()`，红点消失。
 *  - 关闭窗口 / 路由切换前调 `requestClose()`：若 dirty 弹确认，
 *    用户选择 save/discard/cancel 三种之一。
 *
 * 关联需求：docs/ux-onboarding-requirements.md §3.2 useDocumentState、US-4 / US-6。
 */

import { ref, computed } from 'vue';
import { useToast } from './useToast';

export type SaveState = 'pristine' | 'dirty' | 'saving' | 'saved' | 'exported';
export type CloseIntent = 'save' | 'discard' | 'cancel';

const state = ref<SaveState>('pristine');
const fileName = ref<string>('未命名');
const lastSavedAt = ref<number | null>(null);

export function useDocumentState() {
  const toast = useToast();

  const isDirty = computed(() => state.value === 'dirty' || state.value === 'saving');
  const isSaving = computed(() => state.value === 'saving');
  const indicator = computed<SaveState>(() => state.value);

  function markDirty(): void {
    if (state.value === 'saving') return; // 保存中不要被覆盖
    state.value = 'dirty';
  }

  function markSaving(): void {
    state.value = 'saving';
  }

  function markSaved(name?: string): void {
    state.value = 'saved';
    if (name) fileName.value = name;
    lastSavedAt.value = Date.now();
  }

  function markExported(): void {
    state.value = 'exported';
    lastSavedAt.value = Date.now();
  }

  function resetForNew(): void {
    state.value = 'pristine';
    fileName.value = '未命名';
    lastSavedAt.value = null;
  }

  /**
   * 关闭 / 路由离开前调用。
   *
   * 非脏：直接返回 'discard'，由调用方执行关闭。
   * 脏：弹确认 dialog，由 dialog 回调执行实际关闭动作。
   *
   * 这里我们不直接弹 UI（保持 composable 纯净），而是返回意图。
   * UI 层 `UnsavedConfirmDialog` 负责弹窗与按钮 → 返回 CloseIntent。
   */
  async function confirmClose(): Promise<CloseIntent> {
    if (!isDirty.value) return 'discard';
    // 真正的弹窗逻辑在组件里（避免 composable 引入 vue 组件依赖），
    // 这里只提供一个判定，组件可以根据 isDirty 决定是否弹窗。
    return 'cancel';
  }

  function noticeUnsaved(): void {
    toast.warn('有未保存的改动，请先保存或丢弃');
  }

  return {
    state: computed(() => state.value),
    fileName: computed(() => fileName.value),
    lastSavedAt: computed(() => lastSavedAt.value),
    indicator,
    isDirty,
    isSaving,
    markDirty,
    markSaving,
    markSaved,
    markExported,
    resetForNew,
    confirmClose,
    noticeUnsaved,
  };
}
