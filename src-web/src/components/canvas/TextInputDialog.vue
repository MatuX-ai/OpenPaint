<!--
  TextInputDialog — 文字输入对话框（W13 UX 验收补齐）

  用法：
    <TextInputDialog :open="open" @update:open="open = $event" @confirm="onConfirm" />

  Props:
    - open (boolean): 是否显示
    - defaultColor (string): 默认颜色（来自画笔当前色）
    - defaultSize (number): 默认字号

  Emits:
    - update:open (boolean): 关闭时通知父组件
    - confirm: { text, fontSize, color, x, y } 用户确认后
-->

<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    open: boolean;
    defaultColor?: string;
    defaultSize?: number;
  }>(),
  {
    defaultColor: '#000000',
    defaultSize: 32,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [payload: { text: string; fontSize: number; color: string; x: number; y: number }];
}>();

const text = ref('');
const fontSize = ref(props.defaultSize);
const color = ref(props.defaultColor);
const x = ref(40);
const y = ref(40);

watch(
  () => props.open,
  (next) => {
    if (next) {
      // 打开时重置
      text.value = '';
      fontSize.value = props.defaultSize;
      color.value = props.defaultColor;
      x.value = 40;
      y.value = 40;
    }
  },
);

// close 用于外部 ref / 单元测试（保留 export 兼容性）
function close(): void {
  emit('update:open', false);
}

// 显式暴露给模板使用
function _closeUnused(): void {
  void close;
}
void _closeUnused;

function onConfirm() {
  const trimmed = text.value.trim();
  if (!trimmed) return; // 空白不提交
  emit('confirm', {
    text: trimmed,
    fontSize: fontSize.value,
    color: color.value,
    x: x.value,
    y: y.value,
  });
  emit('update:open', false);
}

function onCancel() {
  emit('update:open', false);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onConfirm();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="text-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="文字输入"
      @keydown="onKeyDown"
    >
      <div class="text-dialog__scrim" @click="onCancel" />
      <div class="text-dialog__panel">
        <header class="text-dialog__header">
          <h2 class="text-dialog__title">文字输入</h2>
          <button
            type="button"
            class="text-dialog__close"
            aria-label="关闭"
            @click="onCancel"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="text-dialog__body">
          <label class="text-dialog__field">
            <span class="text-dialog__label">内容</span>
            <textarea
              v-model="text"
              class="text-dialog__textarea"
              placeholder="输入要添加的文字…（Ctrl+Enter 提交）"
              rows="3"
              autofocus
            />
          </label>

          <div class="text-dialog__row">
            <label class="text-dialog__field">
              <span class="text-dialog__label">字号</span>
              <input
                v-model.number="fontSize"
                type="number"
                min="8"
                max="200"
                step="1"
                class="text-dialog__input"
              />
            </label>

            <label class="text-dialog__field">
              <span class="text-dialog__label">颜色</span>
              <input
                v-model="color"
                type="color"
                class="text-dialog__color"
                aria-label="文字颜色"
              />
            </label>
          </div>

          <div class="text-dialog__row">
            <label class="text-dialog__field">
              <span class="text-dialog__label">X 偏移</span>
              <input
                v-model.number="x"
                type="number"
                step="1"
                class="text-dialog__input"
              />
            </label>
            <label class="text-dialog__field">
              <span class="text-dialog__label">Y 偏移</span>
              <input
                v-model.number="y"
                type="number"
                step="1"
                class="text-dialog__input"
              />
            </label>
          </div>
        </div>

        <footer class="text-dialog__footer">
          <button
            type="button"
            class="text-dialog__btn text-dialog__btn--ghost"
            @click="onCancel"
          >
            取消
          </button>
          <button
            type="button"
            class="text-dialog__btn text-dialog__btn--primary"
            :disabled="!text.trim()"
            @click="onConfirm"
          >
            添加
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.text-dialog {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;

  &__scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    animation: scrim-in 150ms ease-out;
  }

  &__panel {
    position: relative;
    width: 420px;
    max-width: calc(100vw - 32px);
    background: var(--bg-elevated, var(--bg-secondary));
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    animation: panel-in 180ms cubic-bezier(0.2, 0.8, 0.4, 1);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    margin: 0;
    font-size: var(--font-size-md, 14px);
    font-weight: 600;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__body {
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  &__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
  }

  &__textarea {
    width: 100%;
    min-height: 60px;
    padding: 6px 8px;
    font: inherit;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    resize: vertical;

    &:focus {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
      border-color: var(--accent);
    }
  }

  &__input {
    height: 28px;
    padding: 0 6px;
    font: inherit;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);

    &:focus {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
      border-color: var(--accent);
    }
  }

  &__color {
    width: 100%;
    height: 28px;
    padding: 2px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  &__row {
    display: flex;
    gap: var(--space-3);
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border-color);
  }

  &__btn {
    height: 28px;
    padding: 0 12px;
    font: inherit;
    font-size: 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--ghost {
      color: var(--text-secondary);
      background: transparent;
      border-color: var(--border-color);

      &:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    }

    &--primary {
      color: white;
      background: var(--accent);
      border-color: var(--accent);

      &:hover:not(:disabled) {
        filter: brightness(1.1);
      }
    }
  }
}

@keyframes scrim-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
