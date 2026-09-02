<!--
  QuickPreferences — 齿轮入口快速偏好（W12 VDP-UI-01）。
  只暴露 3 个普通用户最常用项：
    1. 主题（深色 / 浅色）
    2. 当前 AI 模型（只读 + 跳到 AdvancedSettings）
    3. 数据存储位置（只读 + 在文件管理器中打开）
  底部按钮"更换 AI 模型…" 调 uiStore.openAdvancedSettings()。
-->

<script setup lang="ts">
import { computed } from 'vue';
import { X, Sun, Moon, Cpu, FolderOpen } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { useLlmConfig } from '@composables/useLlmConfig';
import { useTheme } from '@composables/useTheme';

const uiStore = useUIStore();
const { providerConfig } = useLlmConfig();
const { isDark, toggle } = useTheme();

const visible = computed(() => uiStore.quickPreferencesVisible);

const themeLabel = computed(() => (isDark.value ? '深色' : '浅色'));
const ThemeIcon = computed(() => (isDark.value ? Moon : Sun));

const providerLabel = computed(() => providerConfig.value?.provider ?? '未配置');
const dataDir = '~/.openpaint/';
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="quick-prefs"
      role="dialog"
      aria-label="快速偏好"
      data-testid="quick-prefs"
      @click.self="uiStore.closeQuickPreferences"
    >
      <div class="quick-prefs__panel">
        <header class="quick-prefs__header">
          <span class="quick-prefs__title">偏好</span>
          <button
            type="button"
            class="quick-prefs__close"
            aria-label="关闭"
            @click="uiStore.closeQuickPreferences"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="quick-prefs__body">
          <!-- 1. 主题 -->
          <button
            type="button"
            class="quick-prefs__row"
            data-testid="quick-prefs-theme"
            @click="toggle"
          >
            <span class="quick-prefs__row-icon">
              <component :is="ThemeIcon" :size="16" />
            </span>
            <span class="quick-prefs__row-label">主题</span>
            <span class="quick-prefs__row-value">{{ themeLabel }}</span>
          </button>

          <!-- 2. 当前 AI 模型（只读 + 跳到 AdvancedSettings） -->
          <button
            type="button"
            class="quick-prefs__row quick-prefs__row--link"
            data-testid="quick-prefs-model"
            @click="uiStore.openAdvancedSettings"
          >
            <span class="quick-prefs__row-icon">
              <Cpu :size="16" />
            </span>
            <span class="quick-prefs__row-label">AI 模型</span>
            <span class="quick-prefs__row-value">{{ providerLabel }}</span>
            <span class="quick-prefs__row-arrow">›</span>
          </button>

          <!-- 3. 数据存储位置（只读，普通用户不需要手动打开） -->
          <div
            class="quick-prefs__row quick-prefs__row--readonly"
            data-testid="quick-prefs-data-dir"
          >
            <span class="quick-prefs__row-icon">
              <FolderOpen :size="16" />
            </span>
            <span class="quick-prefs__row-label">数据存储</span>
            <span class="quick-prefs__row-value">{{ dataDir }}</span>
          </div>
        </div>

        <footer class="quick-prefs__footer">
          <button
            type="button"
            class="quick-prefs__btn quick-prefs__btn--primary"
            data-testid="quick-prefs-open-advanced"
            @click="uiStore.openAdvancedSettings"
          >
            更换 AI 模型…
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.quick-prefs {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);

  &__panel {
    display: flex;
    flex-direction: column;
    width: min(440px, 92vw);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    padding: var(--space-2) 0;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    text-align: left;
    color: var(--text-primary);
    background: transparent;
    border: 0;
    transition: background var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
    }

    &--link {
      cursor: pointer;
    }
  }

  &__row-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  &__row-label {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  &__row-value {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-family: var(--font-family-mono);
  }

  &__row-arrow {
    margin-left: 4px;
    color: var(--text-muted);
    font-size: var(--font-size-md);
    line-height: 1;
  }

  &__row--readonly {
    cursor: default;

    &:hover {
      background: transparent;
    }
  }

  &__footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border-color);
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 8px 14px;
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);

    &--primary {
      color: #fff;
      background: var(--accent);

      &:hover {
        background: var(--accent-hover);
      }
    }
  }
}
</style>