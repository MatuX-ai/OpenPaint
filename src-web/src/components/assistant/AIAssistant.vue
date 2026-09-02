<!--
  AI assistant floating panel (bottom-right).
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Bot, Minus, X, Sparkles, Settings as SettingsIcon } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { useAgent } from '@composables/useAgent';
import { useLlmConfig } from '@composables/useLlmConfig';
import ChatMessage from './ChatMessage.vue';
import ChatInput from './ChatInput.vue';
import ThinkingIndicator from './ThinkingIndicator.vue';
import PreviewModal from './PreviewModal.vue';
// W12 VDP-MOCK-03：模拟模式横幅，仅在当前 Provider 为 mock 时显示。
import MockModeBanner from './MockModeBanner.vue';

const uiStore = useUIStore();
const { store, sendWithSelection } = useAgent();
const { isReady, providerConfig, loaded: llmLoaded } = useLlmConfig();

const minimized = ref(false);
const scrollRef = ref<HTMLElement | null>(null);

// 未配置 LLM 时仍然允许打开面板，但聊天区会被空状态占据。
const llmReady = computed(() => isReady.value);
const llmLabel = computed(() => {
  const p = providerConfig.value?.provider;
  switch (p) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic Claude';
    case 'deepseek':
      return 'DeepSeek';
    case 'ollama':
      return 'Ollama (本地)';
    case 'qwen':
      return '通义千问';
    case 'zhipu':
      return '智谱 GLM';
    case 'moonshot':
      return '月之暗面 Kimi';
    case 'doubao':
      return '豆包';
    case 'minimax':
      return 'Minimax';
    default:
      return '大模型';
  }
});

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

// W12 VDP-UI-01：未配置 LLM 时点 CTA 进入 QuickPreferences（齿轮入口）。
// QuickPreferences 仅 3 项快速偏好；如需切换模型可从内部“更换 AI 模型…” 跳转 AdvancedSettings。
function openQuickPreferences() {
  uiStore.openQuickPreferences();
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

    <!-- W12 VDP-MOCK-03：模拟模式横幅（条件渲染）。 -->
    <MockModeBanner />

    <div ref="scrollRef" class="ai-assistant__messages">
      <!-- 还在加载后端配置时不闪烁：留空容器让用户感知到加载中。 -->
      <div v-if="!llmLoaded" class="ai-assistant__empty">
        <p>正在连接大模型…</p>
      </div>

      <!-- 未配置 LLM：占满聊天区的友好提示。 -->
      <div
        v-else-if="!llmReady"
        class="ai-assistant__empty ai-assistant__empty--unconfigured"
      >
        <Bot :size="28" />
        <p class="ai-assistant__empty-headline">
          嗨，老板，还没有接入 {{ llmLabel }}，我还无法工作
        </p>
        <p class="ai-assistant__empty-hint">
          需要先配置 OpenAI / Anthropic / DeepSeek / Ollama 之一，点击下方按钮直达偏好面板。
        </p>
        <button
          type="button"
          class="ai-assistant__settings-link"
          aria-label="打开偏好"
          @click="openQuickPreferences"
        >
          <SettingsIcon :size="13" />
          <span>打开偏好</span>
        </button>
      </div>

      <!-- 已配置但还没有对话：示例引导。 -->
      <div v-else-if="!store.messages.length" class="ai-assistant__empty">
        <Sparkles :size="28" />
        <p>试试：框选一块区域，然后说“把它变成科技感 Logo”</p>
      </div>

      <ChatMessage v-for="msg in store.messages" :key="msg.id" :message="msg" />
      <ThinkingIndicator v-if="store.isProcessing" text="AI 思考中…" />
    </div>

    <!-- 未配置或加载中时禁用输入框，避免无效调用。 -->
    <ChatInput :disabled="store.isProcessing || !llmLoaded || !llmReady" @send="onSend" />
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

    &--unconfigured {
      gap: var(--space-3);
    }
  }

  &__empty-headline {
    max-width: 280px;
    line-height: 1.6;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  &__empty-hint {
    max-width: 280px;
    margin: 0;
    line-height: 1.6;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  &__settings-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: var(--space-2);
    padding: 8px 18px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: #fff;
    background: var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px var(--accent-light, transparent);
    transition:
      background var(--transition-fast),
      transform var(--transition-fast);

    &:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
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
