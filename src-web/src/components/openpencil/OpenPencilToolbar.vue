<!--
  OpenPencil toolbar — OK / cancel / refresh actions.
-->

<script setup lang="ts">
import { Check, X, RefreshCw } from 'lucide-vue-next';
import { ref } from 'vue';

const emit = defineEmits<{
  ok: [];
  cancel: [];
  refresh: [];
}>();

const busy = ref(false);

async function onOK() {
  busy.value = true;
  try {
    emit('ok');
  } finally {
    setTimeout(() => (busy.value = false), 300);
  }
}
</script>

<template>
  <div class="openpencil-toolbar">
    <span class="openpencil-toolbar__title">OpenPencil</span>
    <div class="openpencil-toolbar__actions">
      <button
        class="openpencil-toolbar__btn openpencil-toolbar__btn--primary"
        type="button"
        :disabled="busy"
        title="OK — 将结果落回画布"
        @click="onOK"
      >
        <Check :size="14" />
        <span>OK</span>
      </button>
      <button class="openpencil-toolbar__btn" type="button" title="取消" @click="emit('cancel')">
        <X :size="14" />
      </button>
      <button class="openpencil-toolbar__btn" type="button" title="刷新" @click="emit('refresh')">
        <RefreshCw :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.openpencil-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  &__title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  &__actions {
    display: inline-flex;
    gap: var(--space-1);
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: var(--font-size-xs);
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

    &--primary {
      color: #fff;
      background: var(--accent);

      &:hover:not(:disabled) {
        background: var(--accent-hover);
        color: #fff;
      }
    }
  }
}
</style>
