<!--
  Thinking indicator — animated dots while the agent is working.
-->

<script setup lang="ts">
defineProps<{ text?: string }>();
</script>

<template>
  <div class="thinking-indicator">
    <span class="thinking-indicator__dots">
      <i /><i /><i />
    </span>
    <span v-if="text" class="thinking-indicator__text">{{ text }}</span>
  </div>
</template>

<style scoped lang="scss">
.thinking-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-muted);

  &__dots {
    display: inline-flex;
    gap: 3px;

    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent);
      animation: bounce 1.2s infinite ease-in-out;

      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
    }
  }
}

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
</style>