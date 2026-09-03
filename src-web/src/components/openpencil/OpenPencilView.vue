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
} from '@open-pencil/vue';
import { EDITOR_TOOLS } from '@open-pencil/core/editor';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import OpenPencilToolbar from './OpenPencilToolbar.vue';
import MCPStatus from './MCPStatus.vue';

// OpenPencil/CanvasKit 走 `<origin>/canvaskit.wasm`（@open-pencil/core/canvaskit
// 的 defaultLocate 把 file 拼到 base URL 之后）。在桌面端 (tauri://) 与 web 预览
// (http://localhost:5173) 两种模式下都希望预加载这个文件，提前确认资源可达，
// 避免 SDK 内部 fetch 抛错逃逸到 unhandledrejection 而让 status 卡在 loading。
const CANVASKIT_WASM_URL = `${window.location.origin}/canvaskit.wasm`;
const PRELOAD_TIMEOUT_MS = 12_000;

async function preloadCanvasKit(): Promise<void> {
  if (typeof fetch === 'undefined') return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PRELOAD_TIMEOUT_MS);
  try {
    // 用 HEAD 探测 wasm 是否就位：404 / 5xx / 超时都视为加载失败。
    const res = await fetch(CANVASKIT_WASM_URL, {
      method: 'HEAD',
      cache: 'force-cache',
      signal: ctl.signal,
    });
    if (!res.ok) {
      throw new Error(`canvaskit.wasm HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const bridge = getOpenPencilBridge();
const { editor, status, sendImageToAI } = bridge;

provideEditor(editor);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const retryCount = ref(0);
const showSlowHint = ref(false);
const showErrorFallback = ref(false);
const errorMessage = ref<string>('');

let slowTimer: ReturnType<typeof setTimeout> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;
let mounted = true;

// 订阅 editor 事件：不能在 setup 顶层使用 useEditorEvent()，
// 因为 useEditorEvent 内部会同步调用 useEditor() → inject(EDITOR_KEY)，
// 但 Vue 的 inject() 只能读取**祖先组件** provide 的值，本组件
// 不能 inject 自己 provide 的内容，所以这会拋出
// "useEditor() called without an injected editor"。
// 改为直接调用 editor.onEditorEvent() 拿到 unsubscribe 函数，
// 并在 onBeforeUnmount 里统一释放（与原逻辑一致）。
const unsubscribers: Array<() => void> = [
  editor.onEditorEvent('selection:changed', () => {
    // 后续：同步 store.activeLayerId / selection
  }),
  editor.onEditorEvent('tool:changed', () => {
    // 后续：同步 store.activeTool
  }),
  editor.onEditorEvent('viewport:changed', () => {
    // 后续：同步 store.zoom / pan
  }),
  editor.onEditorEvent('graph:replaced', () => {
    // 后续：通知图层、属性面板重建
  }),
];

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

function markError(message: string, fromRetry = false) {
  if (!mounted) return;
  status.value = 'error';
  clearTimers();
  showErrorFallback.value = true;
  showSlowHint.value = false;
  errorMessage.value = message;
  if (fromRetry) retryCount.value += 1;
  console.error('[OpenPencilView]', message);
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
      // 15s 仍未 ready，主动把 status 推到 error 并展示重试按钮，
      // 避免用户面对永远转圈的状态。
      markError('OpenPencil 加载超时（15s 内未就位）');
    }
  }, 15000);
}

// 兜底监听：useCanvas 内部 useCanvasKitLoader.init() 是异步、无 catch。
// 当 canvaskit.wasm 404 / Worker 启动失败 / CSP 拦截 wasm-unsafe-eval 时，
// init() 抛出的 promise rejection 会逃逸到 unhandledrejection。这里把它
// 收敛到 status='error' 并展示 fallback UI，让用户能点「重试」。
const CANVASKIT_ERROR_HINTS = ['canvaskit', 'CanvasKit', 'wasm', 'open-pencil'];

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  if (!mounted) return;
  if (status.value === 'ready' || status.value === 'error') return;
  const reasonText = String(
    (event.reason as Error | undefined)?.message ?? event.reason ?? '',
  );
  if (CANVASKIT_ERROR_HINTS.some((hint) => reasonText.includes(hint))) {
    event.preventDefault();
    markError(`OpenPencil SDK 初始化失败：${reasonText || '未知错误'}`);
  }
}

function handleWindowError(event: ErrorEvent) {
  if (!mounted) return;
  if (status.value === 'ready' || status.value === 'error') return;
  const msg = String(event.message ?? '');
  if (CANVASKIT_ERROR_HINTS.some((hint) => msg.includes(hint))) {
    markError(`OpenPencil 运行时错误：${msg || '未知错误'}`);
  }
}

// 让 MCP 状态条订阅 editor 自身的生命周期/选区/工具变化。
// 订阅逻辑必须在 setup 顶层注册（参见上方的 `useEditorEvent` 数组），
// 后续可在此处把视口、选区、图层状态推送到 Pinia store。

onMounted(async () => {
  startLoadingTimers();
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('error', handleWindowError);

  // 1) 主动预加载 canvaskit.wasm：HEAD 探测失败时直接 error，不再走 SDK。
  try {
    await preloadCanvasKit();
  } catch (err) {
    markError(
      `canvaskit.wasm 资源不可用：${String((err as Error)?.message ?? err)}`,
    );
    return;
  }

  // 2) 预加载通过后再挂 SDK。即便后续 init 内部逃逸错误，
  //    unhandledrejection 监听也会兜底。
  try {
    const canvasCtl = useCanvas(canvasRef, editor, {
      onReady: () => {
        status.value = 'ready';
        clearTimers();
        showSlowHint.value = false;
        showErrorFallback.value = false;
        errorMessage.value = '';
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
    markError(`OpenPencil SDK 挂载失败：${String((err as Error)?.message ?? err)}`);
  }
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimers();
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  window.removeEventListener('error', handleWindowError);
  while (unsubscribers.length) {
    const off = unsubscribers.pop();
    try {
      off?.();
    } catch {
      /* ignore */
    }
  }
});

async function handleRefresh() {
  showSlowHint.value = false;
  showErrorFallback.value = false;
  errorMessage.value = '';
  retryCount.value += 1;
  status.value = 'loading';
  startLoadingTimers();

  // 重试时同步重跑预加载；如果资源仍不可达，立即回到 error。
  try {
    await preloadCanvasKit();
  } catch (err) {
    markError(
      `canvaskit.wasm 重试仍不可用：${String((err as Error)?.message ?? err)}`,
      true,
    );
    return;
  }
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
          已重试 {{ retryCount }} 次仍未能初始化。可能原因：canvaskit.wasm 资源不可用、Worker 被 CSP 拦截，或 WebView2 版本过旧。
        </p>
        <p v-if="errorMessage" class="openpencil-view__fallback-detail" data-testid="openpencil-error-detail">
          {{ errorMessage }}
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

  &__fallback-detail {
    margin: 0;
    max-width: 360px;
    padding: 6px 10px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    word-break: break-all;
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
