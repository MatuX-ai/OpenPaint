/**
 * api/index.ts 中纯函数 `isLlmConfigured` 测试。
 *
 * 该函数决定 LLM provider 是否"可用"——AI 助手模块据此显示 CTA 与错误提示。
 * 业务规则：
 *   - cfg 为 null → false（未配置）
 *   - provider === 'ollama'（本地部署）→ true（无需 API Key）
 *   - provider === 'mock'（W12 模拟模式）→ true（无需 API Key）
 *   - 其他 provider：必须存在非空 api_key 才算已配置
 */

import { describe, it, expect } from 'vitest';
import { isLlmConfigured, type LlmProviderConfig } from '@api/index';

function cfg(overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig {
  return {
    provider: 'deepseek',
    api_key: 'sk-test',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    ...overrides,
  };
}

describe('isLlmConfigured — LLM 可用性判定', () => {
  it('CFG-01: cfg=null 时返回 false', () => {
    expect(isLlmConfigured(null)).toBe(false);
  });

  it('CFG-02: provider=ollama 且无 api_key 返回 true（本地部署免 Key）', () => {
    expect(isLlmConfigured(cfg({ provider: 'ollama', api_key: null }))).toBe(true);
  });

  it('CFG-03: provider=mock（W12 模拟模式）且无 api_key 返回 true', () => {
    expect(isLlmConfigured(cfg({ provider: 'mock', api_key: null }))).toBe(true);
  });

  it('CFG-04: provider=deepseek 且 api_key 非空字符串返回 true', () => {
    expect(isLlmConfigured(cfg({ provider: 'deepseek', api_key: 'sk-1234' }))).toBe(true);
  });

  it('CFG-05: provider=deepseek 且 api_key=null 返回 false', () => {
    expect(isLlmConfigured(cfg({ provider: 'deepseek', api_key: null }))).toBe(false);
  });

  it('CFG-06: provider=openai 且 api_key 为空白字符串返回 false', () => {
    expect(isLlmConfigured(cfg({ provider: 'openai', api_key: '   ' }))).toBe(false);
  });

  it('CFG-07: provider=openai 且 api_key 为空字符串返回 false', () => {
    expect(isLlmConfigured(cfg({ provider: 'openai', api_key: '' }))).toBe(false);
  });

  it('CFG-08: provider=anthropic 且 api_key 为前后空格的 trim 后非空 → true', () => {
    expect(isLlmConfigured(cfg({ provider: 'anthropic', api_key: '  sk-real  ' }))).toBe(true);
  });

  it('CFG-09: provider=qwen 且 api_key 全空白 → false', () => {
    expect(isLlmConfigured(cfg({ provider: 'qwen', api_key: '\t\n' }))).toBe(false);
  });

  it('CFG-10: 一次性遍历所有常见 provider，确保规则一致', () => {
    const requireKey: LlmProviderConfig['provider'][] = [
      'openai',
      'anthropic',
      'deepseek',
      'qwen',
      'zhipu',
      'moonshot',
      'doubao',
      'minimax',
    ];
    for (const provider of requireKey) {
      expect(isLlmConfigured(cfg({ provider, api_key: null }))).toBe(false);
      expect(isLlmConfigured(cfg({ provider, api_key: '' }))).toBe(false);
      expect(isLlmConfigured(cfg({ provider, api_key: 'sk-real' }))).toBe(true);
    }
    // 免 Key 的 provider
    expect(isLlmConfigured(cfg({ provider: 'ollama', api_key: null }))).toBe(true);
    expect(isLlmConfigured(cfg({ provider: 'mock', api_key: null }))).toBe(true);
  });
});
