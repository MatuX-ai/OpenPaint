<!--
  Tool call card — shows which tool the agent invoked and its state.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-vue-next';
import type { ToolCall } from '@/types/agent';

const props = defineProps<{ call: ToolCall }>();

const icon = computed(() => {
  switch (props.call.status) {
    case 'success': return CheckCircle2;
    case 'error': return XCircle;
    case 'running':
    case 'pending': return Loader2;
    default: return Loader2;
  }
});

const statusLabel = computed(() => {
  switch (props.call.status) {
    case 'success': return '完成';
    case 'error': return '失败';
    case 'running': return '执行中…';
    default: return '等待中';
  }
});
</script>

<template>
  <div class="tool-call-card" :class="`tool-call-card--${call.status}`">
    <div class="tool-call-card__header">
      <component :is="icon" :size="12" :class="{ 'is-spinning': call.status === 'running' || call.status === 'pending' }" />
      <code class="tool-call-card__name">{{ call.name }}</code>
      <span class="tool-call-card__status">{{ statusLabel }}</span>
    </div>
    <pre v-if="call.arguments && Object.keys(call.arguments).length" class="tool-call-card__args">
{{ JSON.stringify(call.arguments, null, 2) }}</pre>
    <div v-if="call.error" class="tool-call-card__error">{{ call.error }}</div>
    <div v-if="call.result" class="tool-call-card__result">{{ call.result }}</div>
  </div>
</template>

<style scoped lang="scss">
.tool-call-card {
  padding: var(--space-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  font-size: var(--font-size-xs);

  &__header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-secondary);
  }

  &__name {
    font-family: var(--font-family-mono);
    color: var(--accent);
  }

  &__status {
    margin-left: auto;
    color: var(--text-muted);
  }

  &__args {
    margin: var(--space-1) 0 0;
    padding: var(--space-1);
    overflow: auto;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: var(--font-family-mono);
    font-size: 11px;
  }

  &__error {
    margin-top: var(--space-1);
    color: var(--error);
  }

  &__result {
    margin-top: var(--space-1);
    color: var(--success);
  }

  &--error {
    border-color: var(--error);
  }
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>