/**
 * useAgent 单元测试
 *
 * 覆盖：
 *  - send: 模拟模式短路返回本地 mockChatReply，不发 IPC
 *  - send: 真实模式走 agentApi.chat
 *  - send: 包含「预览」时触发 uiStore.openPreview
 *  - send: agentApi 抛错时把错误信息作为 assistant 回复
 *  - send: 空文本 / 已处理中忽略
 *  - sendWithSelection: 选区上下文附加
 *  - sendWithSelection: 无选区时仍发送
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@api/index', () => ({
  agentApi: {
    chat: vi.fn(),
    sendCommand: vi.fn(),
  },
  canvasToolsApi: {
    getSelectionBounds: vi.fn(),
    getCanvasSelection: vi.fn(),
    pasteImageToLayer: vi.fn(),
    getLayerInfo: vi.fn(),
  },
}));

const mockIsMockRef = { value: false };
vi.mock('@composables/useLlmConfig', () => ({
  useLlmConfig: () => ({
    isMock: mockIsMockRef,
    providerConfig: { value: null },
    isReady: { value: false },
    loaded: { value: true },
    refresh: vi.fn(),
  }),
}));

import * as ApiIndex from '@api/index';
import { useAgent } from '@composables/useAgent';
import { useChatStore } from '@stores/chatStore';
import { useUIStore } from '@stores/uiStore';

describe('useAgent', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockIsMockRef.value = false;
  });

  it('mock 模式下不调用 agentApi.chat', async () => {
    mockIsMockRef.value = true;
    const a = useAgent();
    await a.send('画布多大？');
    expect(ApiIndex.agentApi.chat).not.toHaveBeenCalled();
    expect(a.store.messages).toHaveLength(2);
    expect(a.store.messages[0].role).toBe('user');
    expect(a.store.messages[1].role).toBe('assistant');
    expect(a.store.messages[1].content).toContain('画布');
    expect(a.store.isProcessing).toBe(false);
  });

  it('真实模式下走 agentApi.chat', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockResolvedValueOnce({
      content: '这是一条 AI 回复',
    });
    const a = useAgent();
    await a.send('你好');
    expect(ApiIndex.agentApi.chat).toHaveBeenCalledWith('你好');
    expect(a.store.messages).toHaveLength(2);
    expect(a.store.messages[1].content).toBe('这是一条 AI 回复');
  });

  it('真实模式下空 content 给默认占位', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockResolvedValueOnce({ content: '' });
    const a = useAgent();
    await a.send('hi');
    expect(a.store.messages[1].content).toBe('（无回复）');
  });

  it('真实模式下包含「预览」触发 uiStore.openPreview', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockResolvedValueOnce({
      content: '请看预览',
    });
    const ui = useUIStore();
    const a = useAgent();
    await a.send('画一张猫');
    expect(ui.previewModalVisible).toBe(true);
    expect(ui.previewPayload?.title).toBe('画一张猫');
  });

  it('真实模式下 agentApi 抛错则把异常文本作为 assistant 回复', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockRejectedValueOnce(new Error('boom'));
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = useAgent();
    await a.send('会出错');
    expect(a.store.messages).toHaveLength(2);
    expect(a.store.messages[1].content).toContain('boom');
    expect(a.store.isProcessing).toBe(false);
    consoleErr.mockRestore();
  });

  it('真实模式下 toolCalls 自动补齐 id', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: '',
          name: 'create_layer',
          arguments: { name: 'L' },
          status: 'pending',
        },
      ],
    });
    const a = useAgent();
    await a.send('建图层');
    const m = a.store.messages[1];
    expect(m.toolCalls).toHaveLength(1);
    expect(m.toolCalls![0].id.length).toBeGreaterThan(0);
    expect(m.toolCalls![0].name).toBe('create_layer');
  });

  it('真实模式下 toolCalls 已带 id 时保留原值', async () => {
    vi.mocked(ApiIndex.agentApi.chat).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'fixed-id',
          name: 'noop',
          arguments: {},
          status: 'success',
        },
      ],
    });
    const a = useAgent();
    await a.send('noop');
    expect(a.store.messages[1].toolCalls![0].id).toBe('fixed-id');
  });

  it('空文本或全空白不发送', async () => {
    const a = useAgent();
    await a.send('');
    await a.send('   ');
    expect(a.store.messages).toHaveLength(0);
    expect(ApiIndex.agentApi.chat).not.toHaveBeenCalled();
  });

  it('isProcessing 时忽略并发 send', async () => {
    let resolveChat: (v: any) => void = () => {};
    vi.mocked(ApiIndex.agentApi.chat).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveChat = r;
        }),
    );
    const a = useAgent();
    const p1 = a.send('first');
    expect(a.store.isProcessing).toBe(true);
    await a.send('second');
    expect(a.store.messages).toHaveLength(1);
    expect(ApiIndex.agentApi.chat).toHaveBeenCalledTimes(1);
    resolveChat({ content: 'ok' });
    await p1;
    expect(a.store.isProcessing).toBe(false);
  });

  it('sendWithSelection 附加选区信息（来自 canvasToolsApi）', async () => {
    vi.mocked(ApiIndex.canvasToolsApi.getSelectionBounds).mockResolvedValueOnce({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    mockIsMockRef.value = true;
    const a = useAgent();
    await a.sendWithSelection('解释这块');
    expect(ApiIndex.canvasToolsApi.getSelectionBounds).toHaveBeenCalled();
    expect(a.store.messages).toHaveLength(2);
    expect(a.store.messages[0].content).toContain('解释这块');
    expect(a.store.messages[0].content).toContain('100×50');
    expect(a.store.messages[0].content).toContain('(10,20)');
  });

  it('sendWithSelection 无选区时使用「无选区」占位', async () => {
    vi.mocked(ApiIndex.canvasToolsApi.getSelectionBounds).mockRejectedValueOnce(
      new Error('no selection'),
    );
    mockIsMockRef.value = true;
    const a = useAgent();
    await a.sendWithSelection('看看');
    expect(a.store.messages[0].content).toContain('无选区');
  });

  it('store 暴露 chatStore 实例', () => {
    const a = useAgent();
    expect(a.store).toBe(useChatStore());
  });

  it('返回的接口字段齐全', () => {
    const a = useAgent();
    expect(typeof a.send).toBe('function');
    expect(typeof a.sendWithSelection).toBe('function');
    expect(a).toHaveProperty('store');
  });
});
