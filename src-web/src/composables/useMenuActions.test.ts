/**
 * useMenuActions 单元测试 — 覆盖 menu → action 的总线。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useMenuActions', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  async function load() {
    const mod = await import('@composables/useMenuActions');
    return mod.useMenuActions();
  }

  it('dispatch invokes the most recently registered handler', async () => {
    const a = await load();
    const order: string[] = [];
    const off1 = a.register('file.new', () => { order.push('first'); });
    const off2 = a.register('file.new', () => { order.push('second'); });
    await a.dispatch('file.new');
    expect(order).toEqual(['second']);
    off1();
    off2();
  });

  it('register returns an unsubscribe function', async () => {
    const a = await load();
    let called = 0;
    const off = a.register('file.save', () => { called++; });
    await a.dispatch('file.save');
    expect(called).toBe(1);
    off();
    await a.dispatch('file.save');
    expect(called).toBe(1);
  });

  it('dispatch is a no-op for unregistered id', async () => {
    const a = await load();
    // 用一个合法但未注册过的 id
    await expect(a.dispatch('file.open')).resolves.toBeUndefined();
  });

  it('clear wipes all handlers', async () => {
    const a = await load();
    let called = 0;
    a.register('file.save', () => { called++; });
    a.clear();
    await a.dispatch('file.save');
    expect(called).toBe(0);
  });

  it('async handlers are awaited', async () => {
    const a = await load();
    const order: string[] = [];
    a.register('file.save', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('done');
    });
    await a.dispatch('file.save');
    expect(order).toEqual(['done']);
  });
});
