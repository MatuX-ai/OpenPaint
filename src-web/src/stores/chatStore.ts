/**
 * Chat (AI assistant) state.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage } from '@/types/agent';

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const inputText = ref('');

  function appendMessage(msg: ChatMessage) {
    messages.value.push(msg);
  }

  function clearMessages() {
    messages.value = [];
  }

  function setProcessing(value: boolean) {
    isProcessing.value = value;
  }

  return {
    messages,
    isProcessing,
    inputText,
    appendMessage,
    clearMessages,
    setProcessing,
  };
});