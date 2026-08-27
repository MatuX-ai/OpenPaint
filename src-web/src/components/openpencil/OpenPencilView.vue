<!--
  OpenPencil embedded editor (right panel).

  Real integration of the `@open-pencil/vue` SDK:
    - creates an editor instance via `createEditor`
    - provides it to the subtree with `provideEditor`
    - binds a <canvas> to it through `useCanvas` (rendering + hit-testing)
    - wires `useCanvasInput` for pointer / keyboard input
    - wires `useCanvasDrop` for image file drop
    - renders the official <ToolbarRoot> for tool selection

  AI generation (image + prompt -> SVG) flows through the existing Rust
  backend `send_to_ai_engine` and is dropped back into the editor via
  `editor.pasteFromHTML`. OK exports the SVG via `editor.copySelectionAsSVG`
  and renders it to PNG with the Rust resvg tool before pasting it into the
  central canvas via `canvasApi.pasteImage`.

  The previous iframe + srcdoc placeholder was removed; the right window is
  now backed by a real Skia/CanvasKit-powered editor surface.
-->

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  provideEditor,
  ToolbarRoot,
  useCanvas,
  useCanvasDrop,
  useCanvasInput,
} from '@open-pencil/vue';
import { EDITOR_TOOLS } from '@open-pencil/core/editor';
import { createOpenPencilBridge } from '@composables/useOpenPencil';
import { useUIStore } from '@stores/uiStore';
import { aiApi, canvasApi } from '@api/index';
import OpenPencilToolbar from './OpenPencilToolbar.vue';
import MCPStatus from './MCPStatus.vue';

const uiStore = useUIStore();
const { editor, status, lastResult, exportSVG, sendImageToAI } = createOpenPencilBridge();

provideEditor(editor);

const canvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
  try {
    const canvasCtl = useCanvas(canvasRef, editor, {
      onReady: () => {
        status.value = 'ready';
      },
    });

    // Pointer + keyboard input — the SDK is headless, so consumers wire this
    // explicitly. `useCanvasInput` binds drag/click/keyboard to editor
    // commands for the active tool.
    useCanvasInput(
      canvasRef,
      editor,
      canvasCtl.hitTestSectionTitle,
      canvasCtl.hitTestComponentLabel,
      canvasCtl.hitTestFrameTitle,
    );

    // Drag-and-drop images onto the canvas to embed them.
    useCanvasDrop(canvasRef, editor);
  } catch (err) {
    status.value = 'error';
    console.error('[OpenPencilView] SDK mount failed:', err);
  }
});

async function handleOK() {
  const svg = exportSVG();
  if (!svg) {
    console.warn('[OpenPencilView] exportSVG returned null — nothing to land');
    uiStore.closePreview();
    return;
  }
  try {
    const { png_data } = await aiApi.renderSvgToPng(svg, 512, 512);
    await canvasApi.pasteImage(png_data);
  } catch (err) {
    console.error('[OpenPencilView] render or paste failed:', err);
  }
  uiStore.closePreview();
}

function handleCancel() {
  uiStore.closePreview();
  lastResult.value = null;
}

function handleRefresh() {
  editor.requestRepaint();
}

defineExpose({ status, lastResult, sendImageToAI, exportSVG, handleOK, handleCancel });
</script>

<template>
  <div class="openpencil-view">
    <OpenPencilToolbar @ok="handleOK" @cancel="handleCancel" @refresh="handleRefresh" />
    <ToolbarRoot
      v-if="status === 'ready'"
      :tools="EDITOR_TOOLS"
      class="openpencil-view__tools"
    />
    <div class="openpencil-view__body">
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
}
</style>
