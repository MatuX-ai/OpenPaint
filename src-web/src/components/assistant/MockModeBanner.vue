<!--
  MockModeBanner — W12 VDP-MOCK-03。

  当 useLlmConfig.isMock 为 true 时，在 AIAssistant 头部下方显示
  一条半透明横幅，提醒用户：
  1. 当前是零配置模拟模式，无外发
  2. 提供"切换真实大模型"快捷入口
-->

<script setup lang="ts">
import { Sparkles, Settings as SettingsIcon } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { useLlmConfig } from '@composables/useLlmConfig';

const uiStore = useUIStore();
const { isMock } = useLlmConfig();

function openPreferences() {
  uiStore.openQuickPreferences();
}
</script>

<template>
  <div
    v-if="isMock"
    class="mock-banner"
    role="status"
    aria-label="当前为模拟模式提示"
    data-testid="mock-mode-banner"
  >
    <Sparkles :size="14" class="mock-banner__icon" />
    <span class="mock-banner__text">
      <strong>模拟模式</strong>
      · 零配置演示，无外发。要更强能力可切换真实大模型。
    </span>
    <button
      type="button"
      class="mock-banner__action"
      aria-label="打开偏好切换 AI 模型"
      data-testid="mock-banner-open-preferences"
      @click="openPreferences"
    >
      <SettingsIcon :size="12" />
      <span>切换</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.mock-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  background: linear-gradient(
    180deg,
    rgba(214, 158, 46, 0.12) 0%,
    rgba(214, 158, 46, 0.06) 100%
  );
  border-bottom: 1px solid rgba(214, 158, 46, 0.25);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.4;

  &__icon {
    color: #d69e2e;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    color: var(--text-secondary);

    strong {
      color: #b7791f;
      font-weight: 600;
    }
  }

  &__action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 500;
    color: #b7791f;
    background: transparent;
    border: 1px solid rgba(214, 158, 46, 0.4);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &:hover {
      color: #fff;
      background: #d69e2e;
      border-color: #d69e2e;
    }

    &:focus-visible {
      outline: 2px solid #d69e2e;
      outline-offset: 1px;
    }
  }
}
</style>