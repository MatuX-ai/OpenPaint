/**
 * Runtime (api/runtime.ts) Web Preview stub 测试 — W12 VDP-MOCK-03 fix +
 * W12 VDP-WEB-01 fix。
 *
 * 验证：
 * - 默认 provider 配置是 mock（零配置演示）
 * - set_provider({ provider: 'deepseek' }) 真正更新内存状态
 * - 后续 get_provider_config 返回新 provider
 * - set_api_key 同步更新 api_key
 * - 修改不会污染全局（每次 import 是单例）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@api/runtime';

describe('runtime — web preview provider state', () => {
  beforeEach(() => {
    // 重置：尝试把 provider 切回 mock。如果下次加了 reset API，这里改成 reset 调用。
    void invoke('set_provider', { provider: 'mock' });
    void invoke('set_api_key', { provider: 'mock', apiKey: null });
  });

  it('RPC-01: 默认 provider 配置是 mock（零配置）', async () => {
    const cfg = (await invoke('get_provider_config')) as {
      provider: string;
      api_key: string | null;
      endpoint: string;
      model: string;
    };
    expect(cfg.provider).toBe('mock');
    expect(cfg.model).toBe('mock-v1');
    expect(cfg.api_key).toBeNull();
  });

  it('RPC-02: set_provider({ provider }) 真正更新内存状态', async () => {
    await invoke('set_provider', { provider: 'deepseek' });
    const cfg = (await invoke('get_provider_config')) as { provider: string };
    expect(cfg.provider).toBe('deepseek');
  });

  it('RPC-03: set_provider 后立即 get_provider_config 返回新值（无 IPC 异步延迟）', async () => {
    await invoke('set_provider', { provider: 'qwen' });
    const cfg = (await invoke('get_provider_config')) as { provider: string };
    expect(cfg.provider).toBe('qwen');
  });

  it('RPC-04: set_api_key({ provider, apiKey }) 同步更新 api_key', async () => {
    await invoke('set_api_key', { provider: 'deepseek', apiKey: 'sk-test-1234' });
    const cfg = (await invoke('get_provider_config')) as {
      provider: string;
      api_key: string | null;
    };
    expect(cfg.provider).toBe('deepseek');
    expect(cfg.api_key).toBe('sk-test-1234');
  });

  it('RPC-05: set_api_key(null) 清空 key 但保留 provider', async () => {
    await invoke('set_api_key', { provider: 'deepseek', apiKey: 'sk-test' });
    await invoke('set_api_key', { provider: 'deepseek', apiKey: null });
    const cfg = (await invoke('get_provider_config')) as {
      provider: string;
      api_key: string | null;
    };
    expect(cfg.provider).toBe('deepseek');
    expect(cfg.api_key).toBeNull();
  });

  it('RPC-06: 缺少 provider 字段时 set_provider 不更新（健壮性）', async () => {
    // 故意构造一个没有 provider 键的 args
    await invoke('set_provider', { notProvider: 'ignored' });
    const cfg = (await invoke('get_provider_config')) as { provider: string };
    // 仍然应该是 mock（beforeEach 重置后没变）
    expect(cfg.provider).toBe('mock');
  });

  it('RPC-07: list_providers 第一项是 mock', async () => {
    const list = (await invoke('list_providers')) as Array<{ id: string }>;
    expect(list[0].id).toBe('mock');
    expect(list).toHaveLength(10);
  });
});
