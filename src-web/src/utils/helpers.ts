/**
 * 通用工具函数
 */

/**
 * 防抖
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay = 200,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流
 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  delay = 200,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * 生成 UUID（不依赖 crypto.randomUUID，兼容旧环境）
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
