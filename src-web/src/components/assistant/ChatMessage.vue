<!--
  Chat message bubble — user / assistant / tool-call variants.
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@/types/agent';
import ToolCallCard from './ToolCallCard.vue';

const props = defineProps<{ message: ChatMessage }>();

const isUser = computed(() => props.message.role === 'user');
const isTool = computed(() => props.message.role === 'tool');
const time = computed(() =>
  new Date(props.message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
);
</script>

<template>
  <div
    class="chat-message"
    :class="{
      'chat-message--user': isUser,
      'chat-message--assistant': !isUser && !isTool,
      'chat-message--tool': isTool,
    }"
  >
    <span class="chat-message__role">{{ isUser ? '你' : isTool ? '工具' : 'AI' }}</span>
    <div class="chat-message__content">
      <div class="chat-message__bubble">{{ message.content }}</div>
      <ToolCallCard
        v-for="call in message.toolCalls"
        :key="call.id"
        :call="call"
      />
    </div>
    <span class="chat-message__time">{{ time }}</span>
  </div>
</template>

<style scoped lang="scss">
.chat-message {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);

  &__role {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    min-width: 20px;
  }

  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__bubble {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    border-radius: var(--radius);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    word-break: break-word;
    white-space: pre-wrap;
  }

  &--user {
    flex-direction: row-reverse;

    .chat-message__bubble {
      background: var(--accent);
      color: #fff;
    }
  }

  &--tool .chat-message__bubble {
    background: transparent;
    border: 1px dashed var(--border-color);
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
  }

  &__time {
    align-self: flex-end;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>