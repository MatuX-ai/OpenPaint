/**
 * chatStore 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage, ToolCall } from '@/types/agent';

describe('chatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const store = useChatStore();

      expect(store.messages).toEqual([]);
      expect(store.isProcessing).toBe(false);
      expect(store.inputText).toBe('');
    });
  });

  describe('appendMessage', () => {
    it('should add a user message', () => {
      const store = useChatStore();
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, AI!',
        timestamp: Date.now(),
      };

      store.appendMessage(msg);

      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual(msg);
    });

    it('should add an assistant message', () => {
      const store = useChatStore();
      const msg: ChatMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: 'How can I help you?',
        timestamp: Date.now(),
      };

      store.appendMessage(msg);

      expect(store.messages[0].role).toBe('assistant');
      expect(store.messages[0].content).toBe('How can I help you?');
    });

    it('should add multiple messages in order', () => {
      const store = useChatStore();
      const msg1: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'First message',
        timestamp: 1000,
      };
      const msg2: ChatMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Second message',
        timestamp: 2000,
      };
      const msg3: ChatMessage = {
        id: 'msg-3',
        role: 'user',
        content: 'Third message',
        timestamp: 3000,
      };

      store.appendMessage(msg1);
      store.appendMessage(msg2);
      store.appendMessage(msg3);

      expect(store.messages).toHaveLength(3);
      expect(store.messages[0].id).toBe('msg-1');
      expect(store.messages[1].id).toBe('msg-2');
      expect(store.messages[2].id).toBe('msg-3');
    });

    it('should handle message with tool calls', () => {
      const store = useChatStore();
      const toolCall: ToolCall = {
        id: 'tc-1',
        name: 'create_layer',
        arguments: { name: 'New Layer' },
        status: 'success',
        result: 'Layer created successfully',
      };
      const msg: ChatMessage = {
        id: 'msg-with-tools',
        role: 'assistant',
        content: 'I will create a layer for you.',
        timestamp: Date.now(),
        toolCalls: [toolCall],
      };

      store.appendMessage(msg);

      expect(store.messages[0].toolCalls).toHaveLength(1);
      expect(store.messages[0].toolCalls?.[0].name).toBe('create_layer');
      expect(store.messages[0].toolCalls?.[0].status).toBe('success');
    });

    it('should handle system message', () => {
      const store = useChatStore();
      const msg: ChatMessage = {
        id: 'sys-1',
        role: 'system',
        content: 'System initialized',
        timestamp: Date.now(),
      };

      store.appendMessage(msg);

      expect(store.messages[0].role).toBe('system');
    });

    it('should handle tool message', () => {
      const store = useChatStore();
      const msg: ChatMessage = {
        id: 'tool-1',
        role: 'tool',
        content: '{"result": "ok"}',
        timestamp: Date.now(),
      };

      store.appendMessage(msg);

      expect(store.messages[0].role).toBe('tool');
    });
  });

  describe('clearMessages', () => {
    it('should remove all messages', () => {
      const store = useChatStore();

      store.appendMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Test',
        timestamp: Date.now(),
      });
      store.appendMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now(),
      });

      expect(store.messages).toHaveLength(2);

      store.clearMessages();

      expect(store.messages).toHaveLength(0);
      expect(store.messages).toEqual([]);
    });

    it('should work on empty message list', () => {
      const store = useChatStore();

      store.clearMessages();

      expect(store.messages).toEqual([]);
    });
  });

  describe('setProcessing', () => {
    it('should set processing to true', () => {
      const store = useChatStore();

      store.setProcessing(true);

      expect(store.isProcessing).toBe(true);
    });

    it('should set processing to false', () => {
      const store = useChatStore();

      store.setProcessing(true);
      store.setProcessing(false);

      expect(store.isProcessing).toBe(false);
    });

    it('should toggle processing state', () => {
      const store = useChatStore();

      expect(store.isProcessing).toBe(false);

      store.setProcessing(true);
      expect(store.isProcessing).toBe(true);

      store.setProcessing(false);
      expect(store.isProcessing).toBe(false);
    });
  });

  describe('inputText', () => {
    it('should allow setting input text', () => {
      const store = useChatStore();

      store.inputText = 'Hello world';

      expect(store.inputText).toBe('Hello world');
    });

    it('should allow clearing input text', () => {
      const store = useChatStore();

      store.inputText = 'Some text';
      store.inputText = '';

      expect(store.inputText).toBe('');
    });
  });

  describe('message ordering and integrity', () => {
    it('should preserve message order after multiple operations', () => {
      const store = useChatStore();

      // Add messages
      for (let i = 0; i < 5; i++) {
        store.appendMessage({
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: i * 1000,
        });
      }

      expect(store.messages).toHaveLength(5);

      // Verify order
      store.messages.forEach((msg, index) => {
        expect(msg.id).toBe(`msg-${index}`);
        expect(msg.timestamp).toBe(index * 1000);
      });
    });

    it('should handle rapid message additions', () => {
      const store = useChatStore();

      for (let i = 0; i < 100; i++) {
        store.appendMessage({
          id: `rapid-${i}`,
          role: 'user',
          content: `Rapid message ${i}`,
          timestamp: Date.now(),
        });
      }

      expect(store.messages).toHaveLength(100);
    });
  });
});
