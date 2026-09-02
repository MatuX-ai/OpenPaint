/**
 * useAgent — AI assistant conversation composable.
 *
 * Wraps `agentApi.chat` and keeps `chatStore` in sync. When the agent
 * returns an image payload (via `ai-generation-complete` event or an
 * embedded preview), it surfaces it through the UI store's preview modal.
 *
 * W12 VDP-MOCK-03：当 useLlmConfig.isMock 为 true 时，send/sendWithSelection
 * 不发 IPC，直接调用前端 mockChatReply 返回规则模板。确保 Web 预览 / 未配
 * Key 时也能拿到确定性的回复。
 */

import { useChatStore } from '@stores/chatStore';
import { useUIStore } from '@stores/uiStore';
import { useLlmConfig } from '@composables/useLlmConfig';
import { mockChatReply } from '@composables/mockChatReply';
import { agentApi, canvasToolsApi } from '@api/index';
import { uuid } from '@utils/helpers';
import type { ChatMessage, ToolCall } from '@/types/agent';

export interface UseAgentReturn {
  store: ReturnType<typeof useChatStore>;
  send: (text: string) => Promise<void>;
  /** Send a message with the current selection attached as context. */
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

  async function send(text: string) {
    if (!text.trim() || store.isProcessing) return;
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
    let selectionNote = '';
    try {
      const bounds = await canvasToolsApi.getSelectionBounds();
      selectionNote = `\n[当前选区: ${bounds.width}×${bounds.height} at (${bounds.x},${bounds.y})]`;
    } catch {
      selectionNote = '\n[无选区]';
    }
    await send(`${text}${selectionNote}`);
  }

  return { store, send, sendWithSelection };
}
