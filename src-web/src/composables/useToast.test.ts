/**
 * useToast 单元测试 — 覆盖 ONB-1xx ~ ONB-3xx 关联的 Toast 行为。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { nextTick } from 'vue';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadFreshModule() {
    vi.resetModules();
    const mod = await import('@composables/useToast');
    return mod.useToast();
  }

  it('show adds a toast and returns id', async () => {
    const t = await loadFreshModule();
    const id = t.show({ message: 'hello' });
    expect(id).toMatch(/^toast-/);
    expect(t.toasts.value).toHaveLength(1);
    expect(t.toasts.value[0].message).toBe('hello');
    expect(t.toasts.value[0].kind).toBe('info');
  });

  it('auto-dismisses after default duration (3000ms)', async () => {
    const t = await loadFreshModule();
    t.show({ message: 'soon gone' });
    expect(t.toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(3001);
    await nextTick();
    expect(t.toasts.value).toHaveLength(0);
  });

  it('error kind uses longer default duration (5000ms)', async () => {
    const t = await loadFreshModule();
    t.error('bad');
    vi.advanceTimersByTime(3001);
    expect(t.toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(t.toasts.value).toHaveLength(0);
  });

  it('durationMs=0 keeps toast until manually dismissed', async () => {
    const t = await loadFreshModule();
    const id = t.show({ message: 'sticky', durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(t.toasts.value).toHaveLength(1);
    t.dismiss(id);
    expect(t.toasts.value).toHaveLength(0);
  });

  it('dismiss removes by id', async () => {
    const t = await loadFreshModule();
    const id = t.show({ message: 'a' });
    t.show({ message: 'b' });
    t.dismiss(id);
    expect(t.toasts.value.map((x) => x.message)).toEqual(['b']);
  });

  it('dismissAll clears everything', async () => {
    const t = await loadFreshModule();
    t.show({ message: 'a' });
    t.show({ message: 'b' });
    t.show({ message: 'c', durationMs: 0 });
    t.dismissAll();
    expect(t.toasts.value).toHaveLength(0);
  });

  it('success / info / warn shortcuts set kind correctly', async () => {
    const t = await loadFreshModule();
    t.success('s');
    t.info('i');
    t.warn('w');
    expect(t.toasts.value.map((x) => x.kind)).toEqual(['success', 'info', 'warn']);
  });

  it('action button is preserved on toast', async () => {
    const t = await loadFreshModule();
    let called = 0;
    const id = t.show({
      message: 'with action',
      action: { label: 'undo', onClick: () => { called++; } },
    });
    expect(t.toasts.value[0].action?.label).toBe('undo');
    t.toasts.value[0].action?.onClick();
    t.dismiss(id);
    expect(called).toBe(1);
  });
});
