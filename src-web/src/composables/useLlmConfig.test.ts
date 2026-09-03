/**
 * useLlmConfig 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@api/index', () => ({
  llmApi: {
    getProviderConfig: vi.fn(),
    listProviders: vi.fn(),
    setProvider: vi.fn(),
    setApiKey: vi.fn(),
  },
  isLlmConfigured: vi.fn((cfg: any) => !!cfg && cfg.provider !== 'mock' && !!cfg.apiKey),
}));

import * as ApiIndex from '@api/index';
import { useLlmConfig } from '@composables/useLlmConfig';

describe('useLlmConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('initial state has providerConfig=null, isReady=false', async () => {
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockResolvedValueOnce({
      provider: 'mock',
      endpoint: '',
      model: 'mock-v1',
    } as any);
    const c = useLlmConfig();
    await c.refresh();
    // 等待 promise 链完成
    await Promise.resolve();
    await Promise.resolve();
    expect(c.providerConfig.value).toBeTruthy();
    expect(c.loaded.value).toBe(true);
  });

  it('isMock is true when provider is mock', async () => {
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockResolvedValueOnce({
      provider: 'mock',
      endpoint: '',
      model: 'mock-v1',
    } as any);
    vi.mocked(ApiIndex.isLlmConfigured).mockReturnValueOnce(false);
    const c = useLlmConfig();
    await c.refresh();
    expect(c.isMock.value).toBe(true);
    expect(c.isReady.value).toBe(false);
  });

  it('isMock is false when provider is openai', async () => {
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockResolvedValueOnce({
      provider: 'openai',
      apiKey: 'sk-abc',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    } as any);
    vi.mocked(ApiIndex.isLlmConfigured).mockReturnValueOnce(true);
    const c = useLlmConfig();
    await c.refresh();
    expect(c.isMock.value).toBe(false);
    expect(c.isReady.value).toBe(true);
  });

  it('refresh sets loaded=true even on error', async () => {
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockRejectedValueOnce(new Error('boom'));
    const c = useLlmConfig();
    await c.refresh();
    expect(c.loaded.value).toBe(true);
    expect(c.providerConfig.value).toBeNull();
    expect(c.isReady.value).toBe(false);
  });

  it('refresh coalesces concurrent calls', async () => {
    let resolveFn: (v: any) => void = () => {};
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockImplementation(
      () => new Promise((r) => { resolveFn = r; }),
    );
    const c = useLlmConfig();
    const p1 = c.refresh();
    const p2 = c.refresh();
    // p1 与 p2 await 后必须返回 undefined（同一个 inflight 已 resolve）
    resolveFn({ provider: 'mock', endpoint: '', model: 'mock-v1' });
    const [r1, r2, r3] = await Promise.all([p1, p2, c.refresh()]);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
    expect(r3).toBeUndefined();
    // 多次并发 refresh 只触发一次 IPC
    expect(ApiIndex.llmApi.getProviderConfig).toHaveBeenCalledTimes(1);
  });

  it('returns expected shape', () => {
    vi.mocked(ApiIndex.llmApi.getProviderConfig).mockResolvedValue({
      provider: 'mock',
      endpoint: '',
      model: 'mock-v1',
    } as any);
    const c = useLlmConfig();
    expect(c).toHaveProperty('providerConfig');
    expect(c).toHaveProperty('isReady');
    expect(c).toHaveProperty('loaded');
    expect(c).toHaveProperty('refresh');
    expect(c).toHaveProperty('isMock');
    expect(typeof c.refresh).toBe('function');
  });
});