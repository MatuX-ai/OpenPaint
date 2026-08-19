<!--
  Chat input — text box + send button.
-->

<script setup lang="ts">
import { ref } from 'vue';
import { SendHorizonal, Paperclip } from 'lucide-vue-next';

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ send: [text: string]; attach: [] }>();

const text = ref('');

function submit() {
  const trimmed = text.value.trim();
  if (!trimmed || props.disabled) return;
  emit('send', trimmed);
  text.value = '';
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <div class="chat-input">
    <button class="chat-input__attach" type="button" title="附加图片" @click="emit('attach')">
      <Paperclip :size="16" />
    </button>
    <textarea
      v-model="text"
      class="chat-input__field"
      rows="1"
      placeholder="描述你要做的事… (Ctrl+Enter 发送)"
      :disabled="disabled"
      @keydown="onKeydown"
    />
    <button
      class="chat-input__send"
      type="button"
      :disabled="disabled || !text.trim()"
      title="发送"
      @click="submit"
    >
      <SendHorizonal :size="16" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.chat-input {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  padding: var(--space-2);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);

  &__attach,
  &__send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__field {
    flex: 1;
    min-width: 0;
    max-height: 96px;
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    font-family: inherit;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    resize: none;

    &:focus {
      border-color: var(--accent);
    }

    &::placeholder {
      color: var(--text-muted);
    }

    &:disabled {
      opacity: 0.6;
    }
  }
}
</style>