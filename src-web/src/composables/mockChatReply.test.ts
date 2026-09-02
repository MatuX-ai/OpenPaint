/**
 * mockChatReply 单元测试 — W12 VDP-MOCK-03。
 * 验证关键词匹配、本地规则模板与 Rust mock_chat_reply 行为一致。
 */

import { describe, it, expect } from 'vitest';
import { mockChatReply } from '@composables/mockChatReply';

describe('mockChatReply', () => {
  it('MC-01: greeting (你好) returns mock intro', () => {
    const out = mockChatReply('你好');
    expect(out).toContain('模拟');
    expect(out).toContain('不联网');
  });

  it('MC-02: english hi/hello triggers greeting branch', () => {
    expect(mockChatReply('hello')).toContain('模拟');
    expect(mockChatReply('Hey')).toContain('模拟');
  });

  it('MC-03: shortcut keyword returns shortcut table', () => {
    const out = mockChatReply('快捷键');
    expect(out).toContain('Ctrl');
    expect(out).toContain('macOS');
  });

  it('MC-04: canvas keyword returns canvas capabilities', () => {
    const out = mockChatReply('画布');
    expect(out).toContain('图层');
    expect(out).toContain('画笔');
  });

  it('MC-05: brush keyword returns brush system info', () => {
    const out = mockChatReply('画笔');
    expect(out).toContain('9 种内置笔刷');
  });

  it('MC-06: icon keyword returns icon library info', () => {
    const out = mockChatReply('图标');
    expect(out).toContain('Iconify');
  });

  it('MC-07: 大模型 keyword returns provider list', () => {
    const out = mockChatReply('大模型');
    expect(out).toContain('Provider');
    expect(out).toContain('DeepSeek');
  });

  it('MC-08: gradient/palette keyword returns asset library info', () => {
    expect(mockChatReply('色板')).toContain('Material');
    expect(mockChatReply('渐变')).toContain('linear-sunset');
  });

  it('MC-09: fallback replies with 模拟模式 banner', () => {
    const out = mockChatReply('???');
    expect(out).toContain('模拟模式');
    expect(out).toContain('偏好 → AI 模型');
  });

  it('MC-10: empty input treated as fallback', () => {
    const out = mockChatReply('   ');
    expect(out).toContain('模拟模式');
  });
});