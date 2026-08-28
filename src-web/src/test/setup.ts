/**
 * 测试共享 setup — 用于需要 Pinia / 路由 stub 的组件测试。
 *
 * 用法：
 *   import { setupComponentTest } from '@/test/setup';
 *   beforeEach(() => setupComponentTest());
 */

import { beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
// happy-dom 自带 Element / window 等；只需要在每个组件测试前重置 Pinia
// 与 localStorage 即可。

export function setupComponentTest(): void {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 清理 onboarding 持久化键，避免跨测试污染
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
  });

  afterEach(() => {
    // 卸载已挂载的 teleport 内容（happy-dom 不自动清理）
    document.body.innerHTML = '';
  });
}

/**
 * 由于 AppModal 使用 Teleport 把内容渲染到 body，
 * `wrapper.text()` 取不到 teleport 出去的 DOM。
 * 这个 helper 直接读 document.body.innerHTML。
 */
export function bodyHtml(): string {
  return document.body.innerHTML;
}

export function bodyText(): string {
  return document.body.textContent ?? '';
}

