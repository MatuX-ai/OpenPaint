<!--
  OpenPencil 中央画布壳（OpenPencilView）。

  这是 OpenPaint 唯一可见的主画布：
    - 在应用级别只创建一个 `createEditor()` 单例（见 `useOpenPencil.ts`）。
    - 通过 `provideEditor` 把编辑器暴露给工具条、图层、属性、快捷键等子树。
    - 渲染 `<ToolbarRoot>` 作为工具条（与 SDK 默认工具集对齐）。
    - 渲染 `<canvas>` 并接 `useCanvas` / `useCanvasInput` / `useCanvasDrop`。
    - 保留慢加载 / 错误降级 UI（W13 VDP-OP-01），但不再包含"OK 落回中央画布"语义。
    - 选区、图层、撤销/重做、缩放全部共享同一个 editor，不再使用 Rust canvasApi。
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  provideEditor,
  ToolbarRoot,
  useCanvas,
  useCanvasDrop,
  useCanvasInput,
  useEditorEvent,
} from '@open-pencil/vue';
import { EDITOR_TOOLS } from '@open-pencil/core/editor';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import OpenPencilToolbar from './OpenPencilToolbar.vue';
import MCPStatus from './MCPStatus.vue';

const bridge = getOpenPencilBridge();
const { editor, status, sendImageToAI } = bridge;

provideEditor(editor);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const retryCount = ref(0);
const showSlowHint = ref(false);
const showErrorFallback = ref(false);

let slowTimer: ReturnType<typeof setTimeout> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;
let mounted = true;
const unsubscribers: Array<() => void> = [];

function clearTimers() {
  if (slowTimer) {
    clearTimeout(slowTimer);
    slowTimer = null;
  }
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
}

function startLoadingTimers() {
  clearTimers();
  slowTimer = setTimeout(() => {
    if (mounted && (status.value === 'loading' || status.value === 'idle')) {
      showSlowHint.value = true;
    }
  }, 8000);
  errorTimer = setTimeout(() => {
    if (mounted && (status.value === 'loading' || status.value === 'idle')) {
      showErrorFallback.value = true;
      showSlowHint.value = false;
    }
  }, 15000);
}

// 让 MCP 状态条订阅 editor 自身的生命周期/选区/工具变化；
// 后续可在此处把视口、选区、图层状态推送到 Pinia store。
function wireEditorEvents() {
  unsubscribers.push(
    useEditorEvent('selection:changed', () => {
      // 后续：同步 store.activeLayerId / selection
    }),
    useEditorEvent('tool:changed', () => {
      // 后续：同步 store.activeTool
    }),
    useEditorEvent('viewport:changed', () => {
      // 后续：同步 store.zoom / pan
    }),
    useEditorEvent('graph:replaced', () => {
      // 后续：通知图层、属性面板重建
    }),
  );
}

onMounted(() => {
  startLoadingTimers();
  wireEditorEvents();
  try {
    const canvasCtl = useCanvas(canvasRef, editor, {
      onReady: () => {
        status.value = 'ready';
        clearTimers();
        showSlowHint.value = false;
        showErrorFallback.value = false;
      },
    });

    useCanvasInput(
      canvasRef,
      editor,
      canvasCtl.hitTestSectionTitle,
      canvasCtl.hitTestComponentLabel,
      canvasCtl.hitTestFrameTitle,
    );

    useCanvasDrop(canvasRef, editor);
  } catch (err) {
    status.value = 'error';
    clearTimers();
    showErrorFallback.value = true;
    console.error('[OpenPencilView] SDK mount failed:', err);
  }
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimers();
  while (unsubscribers.length) {
    const off = unsubscribers.pop();
    try {
      off?.();
    } catch {
      /* ignore */
    }
  }
});

function handleRefresh() {
  showSlowHint.value = false;
  showErrorFallback.value = false;
  retryCount.value += 1;
  startLoadingTimers();
  editor.requestRepaint();
}

defineExpose({ status, sendImageToAI, editor });
</script>

<template>
  <div class="openpencil-view">
    <ToolbarRoot v-if="status === 'ready'" :tools="EDITOR_TOOLS" class="openpencil-view__tools" />
    <OpenPencilToolbar v-else :loading="status === 'loading'" />
    <div class="openpencil-view__body">
      <div
        v-if="showSlowHint && (status === 'loading' || status === 'idle')"
        class="openpencil-view__hint"
      >
        <p>OpenPencil 加载较慢（WASM / Skia 初始化），请稍候…</p>
      </div>

      <div
        v-if="showErrorFallback || status === 'error'"
        class="openpencil-view__fallback"
        role="alert"
      >
        <h3 class="openpencil-view__fallback-title">OpenPencil 加载失败</h3>
        <p class="openpencil-view__fallback-text">
          已重试 {{ retryCount }} 次仍未能初始化。可能原因：WebView2 版本过旧或网络受限。
        </p>
        <div class="openpencil-view__fallback-actions">
          <button
            type="button"
            class="openpencil-view__btn openpencil-view__btn--primary"
            @click="handleRefresh"
          >
            重试
          </button>
        </div>
      </div>

      <canvas ref="canvasRef" class="openpencil-view__frame" />
    </div>
    <MCPStatus :status="status" />
  </div>
</template>

<style scoped lang="scss">
.openpencil-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);

  &__tools {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  &__body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  &__frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #f5f5f7;
    touch-action: none;
  }

  &__hint {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 5;
    padding: 6px 10px;
    background: rgba(253, 203, 110, 0.18);
    color: var(--text-primary);
    border: 1px solid rgba(253, 203, 110, 0.4);
    border-radius: var(--radius-sm);
    font-size: 11px;
    pointer-events: none;

    p {
      margin: 0;
    }
  }

  &__fallback {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    text-align: center;
  }

  &__fallback-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-warn, #fdcb6e);
  }

  &__fallback-text {
    margin: 0;
    max-width: 320px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  &__fallback-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  &__btn {
    height: 28px;
    padding: 0 12px;
    font: inherit;
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }

    &--primary {
      color: white;
      background: var(--accent);
      border-color: var(--accent);

      &:hover {
        filter: brightness(1.1);
      }
    }
  }
}
</style>
