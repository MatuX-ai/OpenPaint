/**
 * WebPreviewBanner 组件测试 — W12 VDP-WEB-01。
 *
 * 验证：
 * - isTauri=true 时不渲染（Tauri 桌面内不显示横幅）
 * - isTauri=false 时渲染横幅、CTA、关闭按钮
 * - 点击关闭按钮后隐藏横幅 + 写 localStorage
 * - localStorage 已记录 dismissed=1 时不渲染
 * - 下载链接指向 GitHub Releases
 * - 「了解桌面版优势」CTA 指向 /
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// vi.mock 工厂会被 hoist 到 import 之前执行，不能直接引用顶层变量；
// 用 vi.hoisted() 把 mock 函数提到 import 之前。
const mocks = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
}));
vi.mock('@api/runtime', () => ({
  isTauri: mocks.isTauriMock,
}));

import WebPreviewBanner from './WebPreviewBanner.vue';
import { STORAGE_KEY } from './webPreviewBannerStorage';

describe('WebPreviewBanner', () => {
  beforeEach(() => {
    mocks.isTauriMock.mockReset();
    mocks.isTauriMock.mockReturnValue(false);
    window.localStorage.clear();
    document.body.textContent = '';
  });

  afterEach(() => {
    window.localStorage.clear();
    document.body.textContent = '';
    vi.restoreAllMocks();
  });

  function q(sel: string): Element | null {
    return document.body.querySelector(sel);
  }

  it('WB-01: isTauri=true 时不渲染横幅', async () => {
    mocks.isTauriMock.mockReturnValue(true);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="web-preview-banner"]')).toBeNull();
    w.unmount();
  });

  it('WB-02: isTauri=false 且未 dismissed 时渲染横幅 + CTA + 关闭按钮', async () => {
    mocks.isTauriMock.mockReturnValue(false);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    const banner = q('[data-testid="web-preview-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Web 预览模式');
    expect(banner?.textContent).toContain('下载桌面版');
    expect(q('[data-testid="web-preview-banner-download"]')).not.toBeNull();
    expect(q('[data-testid="web-preview-banner-close"]')).not.toBeNull();
    expect(q('[data-testid="web-preview-banner-learn"]')).not.toBeNull();
    w.unmount();
  });

  it('WB-03: 点击关闭按钮后隐藏横幅 + 写 localStorage', async () => {
    mocks.isTauriMock.mockReturnValue(false);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="web-preview-banner"]')).not.toBeNull();
    q('[data-testid="web-preview-banner-close"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await nextTick();
    expect(q('[data-testid="web-preview-banner"]')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    w.unmount();
  });

  it('WB-04: localStorage 已 dismissed=1 时不渲染', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    mocks.isTauriMock.mockReturnValue(false);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    expect(q('[data-testid="web-preview-banner"]')).toBeNull();
    w.unmount();
  });

  it('WB-05: 下载 CTA 指向 GitHub Releases', async () => {
    mocks.isTauriMock.mockReturnValue(false);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    const cta = q('[data-testid="web-preview-banner-download"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe('https://github.com/MatuX-ai/OpenPaint/releases');
    expect(cta?.getAttribute('target')).toBe('_blank');
    expect(cta?.getAttribute('rel')).toContain('noopener');
    w.unmount();
  });

  it('WB-06: 「了解桌面版优势」CTA 指向落地页根路径', async () => {
    mocks.isTauriMock.mockReturnValue(false);
    const w = mount(WebPreviewBanner, { attachTo: document.body });
    await nextTick();
    const learn = q('[data-testid="web-preview-banner-learn"]') as HTMLAnchorElement | null;
    expect(learn).not.toBeNull();
    expect(learn?.getAttribute('href')).toBe('/');
    w.unmount();
  });
});
