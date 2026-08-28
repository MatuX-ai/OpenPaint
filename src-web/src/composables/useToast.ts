/**
 * Toast 通知 — 全局轻量提示。
 *
 * 设计目标：
 *  - 任何组件都可以 `useToast().show({ kind: 'success', message: '已保存' })`。
 *  - Toast 列表由 `ToastContainer.vue` 在 App 顶层渲染一次。
 *  - 默认 3 秒自动消失；error 类默认 5 秒；可传入 `action` 提供撤销等按钮。
 *  - `dismissAll()` 用于批量清空（路由切换 / 关闭应用时调用）。
 *
 * 关联需求：docs/ux-onboarding-requirements.md §3.2 useToast、§5 错误状态。
 */

import { ref, readonly } from 'vue';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** 自动消失毫秒数；0 表示需要手动 dismiss（默认 3000） */
  durationMs: number;
  action?: ToastAction;
  createdAt: number;
}

export interface ShowToastInput {
  kind?: ToastKind;
  message: string;
  /** 覆盖默认时长 */
  durationMs?: number;
  action?: ToastAction;
}

const DEFAULT_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;

const toasts = ref<Toast[]>([]);
let counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function nextId(): string {
  counter += 1;
  return `toast-${Date.now().toString(36)}-${counter}`;
}

function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t !== undefined) {
    clearTimeout(t);
    timers.delete(id);
  }
}

export function useToast() {
  function dismiss(id: string): void {
    clearTimer(id);
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function dismissAll(): void {
    for (const t of toasts.value) clearTimer(t.id);
    timers.clear();
    toasts.value = [];
  }

  function show(input: ShowToastInput): string {
    const kind = input.kind ?? 'info';
    const duration = input.durationMs ?? (kind === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
    const id = nextId();
    const toast: Toast = {
      id,
      kind,
      message: input.message,
      durationMs: duration,
      action: input.action,
      createdAt: Date.now(),
    };
    toasts.value = [...toasts.value, toast];
    if (duration > 0) {
      const handle = setTimeout(() => dismiss(id), duration);
      timers.set(id, handle);
    }
    return id;
  }

  function success(message: string, opts?: Partial<ShowToastInput>): string {
    return show({ kind: 'success', message, ...opts });
  }

  function info(message: string, opts?: Partial<ShowToastInput>): string {
    return show({ kind: 'info', message, ...opts });
  }

  function warn(message: string, opts?: Partial<ShowToastInput>): string {
    return show({ kind: 'warn', message, ...opts });
  }

  function error(message: string, opts?: Partial<ShowToastInput>): string {
    return show({ kind: 'error', message, ...opts });
  }

  return {
    toasts: readonly(toasts),
    show,
    success,
    info,
    warn,
    error,
    dismiss,
    dismissAll,
  };
}
