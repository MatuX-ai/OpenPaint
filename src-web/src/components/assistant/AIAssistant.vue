<!--
  AI assistant floating panel (bottom-right).
-->

<script setup lang="ts">
import { ref } from 'vue';
import { Bot, Minus, X, Sparkles } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { useAgent } from '@composables/useAgent';
import ChatMessage from './ChatMessage.vue';
import ChatInput from './ChatInput.vue';
import ThinkingIndicator from './ThinkingIndicator.vue';
import PreviewModal from './PreviewModal.vue';

const uiStore = useUIStore();
const { store, sendWithSelection } = useAgent();

const minimized = ref(false);
const scrollRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  requestAnimationFrame(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  });
}

async function onSend(text: string) {
  // Include selection context when a selection exists.
  await sendWithSelection(text);
  scrollToBottom();
}
</script>

<template>
  <div v-if="uiStore.assistantVisible && !minimized" class="ai-assistant">
    <header class="ai-assistant__header">
      <div class="ai-assistant__brand">
        <Bot :size="16" />
        <span>AI 助理</span>
      </div>
      <div class="ai-assistant__actions">
        <button type="button" title="最小化" @click="minimized = true">
          <Minus :size="14" />
        </button>
        <button type="button" title="关闭" @click="uiStore.toggleAssistant">
          <X :size="14" />
        </button>
      </div>
    </header>

    <div ref="scrollRef" class="ai-assistant__messages">
      <div v-if="!store.messages.length" class="ai-assistant__empty">
        <Sparkles :size="28" />
        <p>试试：框选一块区域，然后说“把它变成科技感 Logo”</p>
      </div>
      <ChatMessage v-for="msg in store.messages" :key="msg.id" :message="msg" />
      <ThinkingIndicator v-if="store.isProcessing" text="AI 思考中…" />
    </div>

    <ChatInput :disabled="store.isProcessing" @send="onSend" />
  </div>

  <button
    v-else-if="uiStore.assistantVisible"
    class="ai-assistant__fab"
    type="button"
    title="打开 AI 助理"
    @click="minimized = false"
  >
    <Bot :size="20" />
  </button>

  <PreviewModal />
</template>

<style scoped lang="scss">
.ai-assistant {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--statusbar-height) + var(--space-4));
  z-index: 900;
  display: flex;
  flex-direction: column;
  width: 360px;
  height: 480px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-tertiary);
    cursor: move;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  &__actions {
    display: inline-flex;
    gap: var(--space-1);

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      color: var(--text-secondary);
      border-radius: var(--radius-sm);

      &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    }
  }

  &__messages {
    flex: 1;
    overflow: auto;
    padding: var(--space-2) 0;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 100%;
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-3);
    font-size: var(--font-size-sm);

    p {
      max-width: 240px;
    }
  }

  &__fab {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--statusbar-height) + var(--space-4));
    z-index: 900;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    color: #fff;
    background: var(--accent);
    border-radius: 50%;
    box-shadow: var(--shadow);

    &:hover {
      background: var(--accent-hover);
    }
  }
}
</style>