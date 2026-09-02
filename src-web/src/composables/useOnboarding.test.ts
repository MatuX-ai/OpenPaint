/**
 * useOnboarding 单元测试 — 覆盖 US-1 / ONB-101 ~ ONB-105。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const STORAGE_KEY = 'openpaint:onboarding';

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

describe('useOnboarding', () => {
  beforeEach(async () => {
    vi.resetModules();
    clearStorage();
    setActivePinia(createPinia());
    // canvasStore 是 useCanvasStore().layerList 依赖，需要 active pinia
    const { useCanvasStore } = await import('@stores/canvasStore');
    useCanvasStore();
  });

  async function load() {
    const mod = await import('@composables/useOnboarding');
    return mod.useOnboarding();
  }

  it('first launch: shouldShowMainCard is true', async () => {
    const o = await load();
    expect(o.shouldShowMainCard.value).toBe(true);
  });

  it('after markCompleted, card hides permanently until reset', async () => {
    const o = await load();
    o.markCompleted();
    expect(o.shouldShowMainCard.value).toBe(false);
  });

  it('layerList > 0 hides card even before completion', async () => {
    const o = await load();
    const { useCanvasStore } = await import('@stores/canvasStore');
    const cs = useCanvasStore();
    cs.layerList = [{ id: 'l1' } as never];
    expect(o.shouldShowMainCard.value).toBe(false);
  });

  it('reset() forces re-show via forceShow flag', async () => {
    const o = await load();
    o.markCompleted();
    expect(o.shouldShowMainCard.value).toBe(false);
    o.reset();
    expect(o.shouldShowMainCard.value).toBe(true);
    o.consumeForceShow();
    // 第二次 forceShow 已消费，应回到 completed=false 但 lastShownAt 仍 null → 显示
    expect(o.shouldShowMainCard.value).toBe(true);
  });

  it('recordShown writes lastShownAt', async () => {
    const o = await load();
    const before = Date.now();
    o.recordShown();
    const after = Date.now();
    expect(o.state.value.lastShownAt).not.toBeNull();
    const t = o.state.value.lastShownAt as number;
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('dismissHint adds id once and is idempotent', async () => {
    const o = await load();
    o.dismissHint('h1');
    o.dismissHint('h1');
    expect(o.state.value.dismissedHints).toEqual(['h1']);
  });

  it('persists to localStorage', async () => {
    const o = await load();
    o.markCompleted();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.completed).toBe(true);
  });

  // W12 VDP-UI-04：completed=false 无视 lastShownAt 立即显示。
  // 避免“用户启动后不选任何选项 · 下次启动 24h 内不弹”造成重复错误引导。
  it('completed=false ignores lastShownAt (first-launch priority)', async () => {
    const o = await load();
    const t0 = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    o.recordShown();
    // 推进 1 小时：旧逻辑会隐藏，新逻辑仍显示。
    nowSpy.mockReturnValue(t0 + 60 * 60 * 1000);
    expect(o.shouldShowMainCard.value).toBe(true);
    nowSpy.mockRestore();
  });

  it('completed=false 且超过 24h 仍立即显示（VDP-UI-04）', async () => {
    const o = await load();
    const t0 = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    o.recordShown();
    nowSpy.mockReturnValue(t0 + 25 * 60 * 60 * 1000);
    expect(o.shouldShowMainCard.value).toBe(true);
    nowSpy.mockRestore();
  });

  // ===== W11-B4：资源署名 toast =====

  it('ONB-201: first launch → shouldShowAttributionToast is true', async () => {
    const o = await load();
    expect(o.shouldShowAttributionToast.value).toBe(true);
  });

  it('ONB-202: dismissAttributionToast hides it and persists', async () => {
    const o = await load();
    o.dismissAttributionToast();
    expect(o.shouldShowAttributionToast.value).toBe(false);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.attributionNoticeShown).toBe(true);
  });

  it('ONB-203: markAttributionShown is idempotent (persistence wise)', async () => {
    const o = await load();
    o.markAttributionShown();
    o.markAttributionShown();
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.attributionNoticeShown).toBe(true);
  });

  it('ONB-204: reset() also resets attributionNoticeShown to false', async () => {
    const o = await load();
    o.dismissAttributionToast();
    expect(o.shouldShowAttributionToast.value).toBe(false);
    o.reset();
    expect(o.shouldShowAttributionToast.value).toBe(true);
  });

  it('ONB-205: shouldShowAttributionToast is independent from shouldShowMainCard', async () => {
    const o = await load();
    // markCompleted 不影响 attribution toast
    o.markCompleted();
    expect(o.shouldShowMainCard.value).toBe(false);
    expect(o.shouldShowAttributionToast.value).toBe(true);
  });
});
