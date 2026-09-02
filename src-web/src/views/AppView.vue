<!--
  OpenPaint 应用主体视图。
  - 加载主布局（菜单栏 + 标题栏 + 三栏画布 + 状态栏）
  - 挂载所有 dialog / 浮窗 / Toast
  - 注册全局菜单 actions 与快捷键
  - 监听 Tauri 窗口关闭请求，必要时弹"未保存"确认
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import MainLayout from '@/components/layout/MainLayout.vue';
import AIAssistant from '@/components/assistant/AIAssistant.vue';
// W12 VDP-WEB-01：Web 端顶部横幅（推荐桌面版）。组件内部用 isTauri() 自决渲染，
// 这里无需 v-if 包裹。
// W12 VDP-UI-01/02：拆分 SettingsModal → QuickPreferences（齿轮入口）
// + AdvancedSettings（菜单深处）。两种面板都通过 uiStore 控制显示。
import QuickPreferences from '@/components/settings/QuickPreferences.vue';
import AdvancedSettings from '@/components/settings/AdvancedSettings.vue';
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue';
import ToastContainer from '@/components/common/ToastContainer.vue';
import NewCanvasDialog from '@/components/canvas/NewCanvasDialog.vue';
import ExportDialog from '@/components/canvas/ExportDialog.vue';
import BatchExportDialog from '@/components/canvas/BatchExportDialog.vue';
import UnsavedConfirmDialog from '@/components/common/UnsavedConfirmDialog.vue';
import KeyboardCheatsheet from '@/components/help/KeyboardCheatsheet.vue';
import { isTauri } from '@api/runtime';
import { useOnboarding } from '@composables/useOnboarding';
import { useMenuActions } from '@composables/useMenuActions';
import { useFileActions } from '@composables/useFileActions';
import { useDocumentState } from '@composables/useDocumentState';
import { useUIStore } from '@stores/uiStore';
import { useCanvasStore } from '@stores/canvasStore';
import { useChatStore } from '@stores/chatStore';
import { useShortcuts } from '@composables/useShortcuts';
import { useToast } from '@composables/useToast';
import { rgbaToPngBase64 } from '@utils/imageConvert';
import { llmApi, canvasApi } from '@api/index';
import { mockChatReply } from '@composables/mockChatReply';
import { uuid } from '@utils/helpers';
import WebPreviewBanner from '@/components/web/WebPreviewBanner.vue';

const runningInTauri = isTauri();
const onboarding = useOnboarding();
const menu = useMenuActions();
const files = useFileActions();
const doc = useDocumentState();
const uiStore = useUIStore();
const canvasStore = useCanvasStore();
const chatStore = useChatStore();
const shortcuts = useShortcuts();
const toast = useToast();

// ---- Dialog state ----
const newCanvasOpen = ref(false);
const exportOpen = ref(false);
const batchExportOpen = ref(false);
const unsavedOpen = ref(false);
const cheatsheetOpen = ref(false);

// Onboarding 引导：4 选项触发后调哪个 action
function onOnboardingNew() {
  newCanvasOpen.value = true;
}
function onOnboardingOpen() {
  void files.openImage();
}
function onOnboardingAi() {
  uiStore.assistantVisible = true;
  toast.info('在右下角 AI 助理中描述你想要的设计');
}

// W12 VDP-MOCK-04：先用模拟模式按钮 handler。
// 真正切换 Provider 到 mock，刷新 useLlmConfig，并在 AI 助理面板
// 推送一条欢迎消息，让首启用户立即感受到对话体验。
async function onOnboardingAiFree() {
  uiStore.assistantVisible = true;
  try {
    await llmApi.setProvider('mock');
    toast.success('已切换到模拟模式');
  } catch (e) {
    console.warn('[onOnboardingAiFree] setProvider failed:', e);
    toast.error('切换模拟模式失败：' + String(e));
    return;
  }
  // 刷新 useLlmConfig，让 isMock / isReady 重新计算。
  try {
    const { useLlmConfig } = await import('@composables/useLlmConfig');
    await useLlmConfig().refresh();
  } catch (e) {
    console.warn('[onOnboardingAiFree] refresh llm config failed:', e);
  }
  // 推送欢迎消息到对话区。
  chatStore.appendMessage({
    id: uuid(),
    timestamp: Date.now(),
    role: 'assistant',
    content: mockChatReply('你好'),
  });
}

// ---- Menu actions registration ----
const unregisters: Array<() => void> = [];

function registerOnce() {
  // File
  unregisters.push(menu.register('file.new', () => { newCanvasOpen.value = true; }));
  unregisters.push(menu.register('file.open', () => { void files.openImage(); }));
  unregisters.push(menu.register('file.save', () => { void files.saveToGallery([]); }));
  unregisters.push(menu.register('file.saveAs', () => { exportOpen.value = true; }));
  unregisters.push(menu.register('file.export.png', () => { exportOpen.value = true; }));
  unregisters.push(menu.register('file.export.jpg', () => { exportOpen.value = true; }));
  unregisters.push(menu.register('file.export.webp', () => { exportOpen.value = true; }));
  unregisters.push(menu.register('file.batchExport', () => { batchExportOpen.value = true; }));
  unregisters.push(menu.register('file.recent', () => { /* TODO: W8+ */ }));
  unregisters.push(menu.register('file.quit', () => {
    if (!runningInTauri) {
      toast.info('在桌面版按 Alt+F4 或关闭窗口');
      return;
    }
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    })();
  }));

  // Edit
  unregisters.push(menu.register('edit.undo', () => { void files.undo(); }));
  unregisters.push(menu.register('edit.redo', () => { void files.redo(); }));
  unregisters.push(menu.register('edit.selectAll', async () => {
    try {
      const b = await canvasStore; // ensure store
      void b;
    } catch { /* ignore */ }
  }));
  unregisters.push(menu.register('edit.clearSelection', async () => {
    try {
      const { canvasApi } = await import('@api/index');
      await canvasApi.clearSelection();
    } catch (e) {
      toast.error(`取消选区失败：${String((e as Error).message ?? e)}`);
    }
  }));
  unregisters.push(menu.register('edit.copy', async () => {
    if (!runningInTauri) {
      toast.info('复制：web preview 未启用系统剪贴板');
      return;
    }
    try {
      const res = await canvasApi.renderCanvasImage({ format: 'png', quality: 100, targetLongEdge: 0 });
      const dataUrl = `data:${res.mime};base64,${res.bytesBase64}`;
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeImage(dataUrl);
      toast.success('已复制到剪贴板');
    } catch (e) {
      toast.error(`复制失败：${String((e as Error).message ?? e)}`);
    }
  }));
  unregisters.push(menu.register('edit.paste', async () => {
    if (!runningInTauri) {
      toast.info('粘贴：web preview 未启用系统剪贴板');
      return;
    }
    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
      const img = await readImage();
      const [rgba, size] = await Promise.all([img.rgba(), img.size()]);
      const png = await rgbaToPngBase64(rgba, size.width, size.height);
      await canvasApi.pasteImage(png);
      doc.markDirty();
      toast.success('已粘贴到画布');
    } catch (e) {
      toast.error(`粘贴失败：${String((e as Error).message ?? e)}`);
    }
  }));

  // View
  unregisters.push(menu.register('view.zoom.100', () => canvasStore.setZoom(1)));
  unregisters.push(menu.register('view.zoom.fit', () => canvasStore.resetView()));
  unregisters.push(menu.register('view.zoom.in', () => canvasStore.setZoom(canvasStore.zoom * 1.2)));
  unregisters.push(menu.register('view.zoom.out', () => canvasStore.setZoom(canvasStore.zoom / 1.2)));
  unregisters.push(menu.register('view.rightPanel.openpencil', () => uiStore.switchRightPanel('openpencil')));
  unregisters.push(menu.register('view.rightPanel.gallery', () => uiStore.switchRightPanel('gallery')));
  unregisters.push(menu.register('view.rightPanel.none', () => uiStore.switchRightPanel('none')));
  unregisters.push(menu.register('view.theme', () => uiStore.toggleTheme()));
  unregisters.push(menu.register('view.fullscreen', async () => {
    if (!runningInTauri) {
      toast.info('全屏：桌面版可用（按 F11）');
      return;
    }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      const isFs = await w.isFullscreen();
      await w.setFullscreen(!isFs);
    } catch (e) {
      toast.error(`全屏切换失败：${String((e as Error).message ?? e)}`);
    }
  }));

  // Help
  unregisters.push(menu.register('help.cheatsheet', () => { cheatsheetOpen.value = true; }));
  unregisters.push(menu.register('help.onboarding', () => { onboarding.reset(); onboarding.consumeForceShow(); }));
  unregisters.push(menu.register('help.about', () => {
    toast.info('OpenPaint · MVP · 开源 · MIT');
  }));
  unregisters.push(menu.register('help.issues', () => {
    if (typeof window !== 'undefined') {
      window.open('https://github.com/MatuX-ai/OpenPaint/issues', '_blank', 'noopener');
    }
  }));
  unregisters.push(menu.register('help.docs', () => {
    if (typeof window !== 'undefined') {
      window.open('https://github.com/MatuX-ai/OpenPaint', '_blank', 'noopener');
    }
  }));
}

// ---- NewCanvasDialog.confirm → useFileActions.newCanvas ----
async function onNewCanvasConfirm(payload: {
  width: number;
  height: number;
  unit: 'px' | 'mm';
  dpi: 72 | 144 | 300;
  handleLayers: 'crop' | 'discard' | 'cancel';
}) {
  newCanvasOpen.value = false;
  await files.newCanvas(payload);
}

// ---- ExportDialog.confirm ----
async function onExportConfirm(payload: { format: 'png' | 'jpg' | 'webp'; quality: number }) {
  exportOpen.value = false;
  await files.exportImage(payload.format, payload.quality);
}

// ---- BatchExportDialog.confirm ----
async function onBatchExportConfirm(payload: { sizes: number[]; saveToGallery: boolean; tags: string[] }) {
  batchExportOpen.value = false;
  await files.batchExport(payload.sizes, payload.saveToGallery, payload.tags);
}

// ---- Unsaved confirm dialog result ----
async function onUnsavedDecide(intent: 'save' | 'discard' | 'cancel') {
  if (intent === 'cancel') return;
  if (intent === 'save') {
    const ok = await files.saveToGallery([]);
    if (!ok) {
      // 保存失败就不关闭
      toast.warn('保存未完成，已取消关闭');
      return;
    }
  }
  // discard / 保存成功：执行关闭
  try {
    if (runningInTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      // unlisten 防回环：直接 destroy
      await getCurrentWindow().destroy();
    } else {
      // web preview: 路由回 landing（如果可）
      toast.info('已丢弃改动（web preview 无窗口可关）');
      doc.resetForNew();
    }
  } catch {
    /* ignore */
  }
}

// ---- Tauri close request interception ----
let unlistenClose: (() => void) | null = null;

async function installCloseGuard() {
  if (!runningInTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      if (!doc.isDirty.value) return;
      event.preventDefault();
      unsavedOpen.value = true;
    });
  } catch (e) {
    // 拦截不可用就静默放弃
    // eslint-disable-next-line no-console
    console.warn('[AppView] install close guard failed:', e);
  }
}

onMounted(async () => {
  if (!runningInTauri) {
    document.documentElement.dataset.runtime = 'web-preview';
  }

  // 1. 快捷键（install + register）
  shortcuts.install();
  for (const binding of shortcuts.defaultBindings()) {
    shortcuts.register(binding);
  }

  // 2. 菜单 actions
  registerOnce();

  // 3. 关闭拦截
  await installCloseGuard();

  // 4. 启动时如有画布数据，记录引导卡已显示（节流 24h）
  if (onboarding.shouldShowMainCard.value) {
    onboarding.recordShown();
  }
});

onBeforeUnmount(() => {
  for (const off of unregisters) off();
  unregisters.length = 0;
  if (unlistenClose) {
    unlistenClose();
    unlistenClose = null;
  }
  shortcuts.uninstall();
  menu.clear();
});
</script>

<template>
  <!--
    W12 VDP-WEB-01：Web 端顶部横幅（推荐桌面版）。组件内部检测 isTauri()，
    Tauri 桌面环境下自动不显示，普通浏览器 SPA / Vercel 预览会显示。
  -->
  <WebPreviewBanner />

  <div class="app-view">
    <MainLayout />
    <OnboardingCard
      v-show="onboarding.shouldShowMainCard.value"
      @new="onOnboardingNew"
      @open="onOnboardingOpen"
      @ai="onOnboardingAi"
      @ai-free="onOnboardingAiFree"
    />
  </div>

  <AIAssistant />
  <QuickPreferences v-show="uiStore.quickPreferencesVisible" />
  <AdvancedSettings v-show="uiStore.advancedSettingsVisible" />
  <ToastContainer />

  <NewCanvasDialog v-show="newCanvasOpen" :open="newCanvasOpen" @update:open="newCanvasOpen = $event" @confirm="onNewCanvasConfirm" />
  <ExportDialog v-show="exportOpen" :open="exportOpen" @update:open="exportOpen = $event" @confirm="onExportConfirm" />
  <BatchExportDialog
    v-show="batchExportOpen"
    :open="batchExportOpen"
    @update:open="batchExportOpen = $event"
    @confirm="onBatchExportConfirm"
  />
  <UnsavedConfirmDialog
    v-show="unsavedOpen"
    :open="unsavedOpen"
    @update:open="unsavedOpen = $event"
    @decide="onUnsavedDecide"
  />
  <KeyboardCheatsheet v-show="cheatsheetOpen" :open="cheatsheetOpen" @update:open="cheatsheetOpen = $event" />
</template>

<style lang="scss">
.app-view {
  position: relative;
  width: 100%;
  height: 100%;
}

/*
 * W12 VDP-WEB-01：Web 端为横幅预留高度（横幅自身高度 + 8px 缓冲）。
 * 桌面端不需此 padding。
 */
:root[data-runtime='web-preview'] #app {
  padding-top: 56px;
}
</style>
