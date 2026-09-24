/**
 * useAgent — AI assistant conversation composable.
 *
 * Wraps `agentApi.chat` and keeps `chatStore` in sync. When the agent
 * returns an image payload (via `ai-generation-complete` event or an
 * embedded preview), it surfaces it through the UI store's preview modal.
 *
 * W12 VDP-MOCK-03：当 useLlmConfig.isMock 为 true 时，send 不发 IPC，
 * 直接调用前端 mockChatReply 返回规则模板。确保 Web 预览 / 未配 Key
 * 时也能拿到确定性的回复。
 */

import { useChatStore } from '@stores/chatStore';
import { useUIStore } from '@stores/uiStore';
import { useLlmConfig } from '@composables/useLlmConfig';
import { mockChatReply } from '@composables/mockChatReply';
import { agentApi } from '@api/index';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import { uuid } from '@utils/helpers';
import type { ChatMessage, ToolCall } from '@/types/agent';

/** 内部选区上下文（不暴露给聊天 UI；目前作为隐藏 hook，未来扩展 AgentContext 用）。 */
export interface SelectionContext {
  /** 是否有选区（包含 0 节点视为无）。 */
  hasSelection: boolean;
  /** 节点数量。 */
  nodeCount: number;
  /** 选区包围盒（CSS 像素）。 */
  bbox: { x: number; y: number; width: number; height: number } | null;
}

export interface UseAgentReturn {
  store: ReturnType<typeof useChatStore>;
  send: (text: string, selection?: SelectionContext | null) => Promise<void>;
  /** Send a message with the current selection attached as hidden context. */
  sendWithSelection: (text: string) => Promise<void>;
}

export function useAgent(): UseAgentReturn {
  const store = useChatStore();
  const uiStore = useUIStore();
  const { isMock } = useLlmConfig();

  function pushMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
    store.appendMessage({
      ...msg,
      id: uuid(),
      timestamp: Date.now(),
    } as ChatMessage);
  }

  async function send(text: string, selection: SelectionContext | null = null) {
    if (!text.trim() || store.isProcessing) return;
    // 修复：用户消息只显示原始文本，不再把内部选区状态拼到 text 末尾。
    // 之前 sendWithSelection 会把「[当前选区: 0×0 at (0,0)]」拼进去，导致
    // 聊天气泡里出现内部状态。选区上下文作为隐藏参数保留在 selection 里，
    // 后续接入真实 LLM 时可注入 AgentContext。void 标记防止 lint 报警。
    void selection;
    pushMessage({ role: 'user', content: text });
    store.setProcessing(true);
    try {
      // W12 VDP-MOCK-03：模拟模式短路返回本地规则模板。
      if (isMock.value) {
        pushMessage({ role: 'assistant', content: mockChatReply(text) });
        return;
      }
      const response = await agentApi.chat(text);
      const toolCalls: ToolCall[] | undefined = response.toolCalls?.map((tc) => ({
        ...tc,
        id: tc.id || uuid(),
      }));
      pushMessage({
        role: 'assistant',
        content: response.content || '（无回复）',
        toolCalls,
      });
      // If the response references an image we cannot display inline,
      // the backend would have emitted 'ai-generation-complete'; the
      // PreviewModal listens for it separately. For MVP we surface a
      // fake preview if the response contains one (W5 real impl).
      if (response.content.includes('预览')) {
        uiStore.openPreview({ title: text, png: '' });
      }
    } catch (e) {
      console.error('[useAgent] chat failed:', e);
      pushMessage({ role: 'assistant', content: `出错了：${String(e)}` });
    } finally {
      store.setProcessing(false);
    }
  }

  async function sendWithSelection(text: string) {
    const selection = collectSelection();
    await send(text, selection);
  }

  /**
   * 从 OpenPencil 桥读取当前选区，归一成 SelectionContext。任何抛错都被吞掉，
   * 默认当作无选区，避免阻塞聊天主路径。
   */
  function collectSelection(): SelectionContext | null {
    try {
      const bridge = getOpenPencilBridge();
      const nodes = bridge.editor.getSelectedNodes();
      if (!nodes || nodes.length === 0) {
        return { hasSelection: false, nodeCount: 0, bbox: null };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }
      const x = Math.round(minX);
      const y = Math.round(minY);
      const width = Math.max(0, Math.round(maxX - minX));
      const height = Math.max(0, Math.round(maxY - minY));
      return {
        hasSelection: true,
        nodeCount: nodes.length,
        bbox: { x, y, width, height },
      };
    } catch {
      return { hasSelection: false, nodeCount: 0, bbox: null };
    }
  }

  return { store, send, sendWithSelection };
}
