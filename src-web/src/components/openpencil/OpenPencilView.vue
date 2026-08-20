<!--
  OpenPencil embedded editor (right panel).
  MVP: renders a placeholder iframe that speaks the postMessage
  protocol; the real OpenPencil web app can be swapped in later.
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useOpenPencil } from '@composables/useOpenPencil';
import { useUIStore } from '@stores/uiStore';
import { aiApi, canvasApi } from '@api/index';
import OpenPencilToolbar from './OpenPencilToolbar.vue';
import MCPStatus from './MCPStatus.vue';

const uiStore = useUIStore();
const { iframeRef, status, sendImageToAI, exportSVG, onResult, onStatusChange } = useOpenPencil();

const lastResult = ref<{ svg?: string; png?: string } | null>(null);
const srcDoc = ref('');
let cleanup: (() => void) | null = null;

onMounted(() => {
  // The placeholder page speaks the same postMessage protocol.
  srcDoc.value = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;font-family:system-ui;background:#f5f5f7;color:#333">
  <div style="padding:16px;text-align:center">
    <h3 style="margin:0 0 8px">OpenPencil 嵌入占位</h3>
    <p style="font-size:13px;color:#666">MVP: 通过 postMessage 协议通信</p>
    <button id="gen" style="padding:6px 12px;margin-top:8px">生成一张示例图</button>
    <script>
      const send = (type, payload) => window.parent.postMessage({ _prefix: 'openpaint:', type, payload }, '*');
      window.addEventListener('message', (e) => {
        const d = e.data || {};
        if (d._prefix !== 'openpaint:') return;
        if (d.type === 'OPENPENCIL_AI_GENERATE') {
          send('OPENPENCIL_RESULT', { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#6c5ce7"/><circle cx="128" cy="128" r="64" fill="#fff" opacity="0.8"/></svg>' });
        }
        if (d.type === 'OPENPENCIL_EXPORT_SVG') {
          send('OPENPENCIL_RESULT', { svg: lastSvg || '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' });
        }
      });
      let lastSvg = null;
      document.getElementById('gen').onclick = () => {
        lastSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#a29bfe"/><rect x="64" y="64" width="128" height="128" fill="#fff"/></svg>';
        send('OPENPENCIL_RESULT', { svg: lastSvg });
      };
      send('OPENPENCIL_READY');
    </scr${'/'}ipt>
  </div>
</body></html>`;

  const unsubResult = onResult((r) => {
    lastResult.value = r;
  });
  const unsubStatus = onStatusChange(() => {
    /* status updates are surfaced via MCPStatus */
  });
  cleanup = () => {
    unsubResult();
    unsubStatus();
  };
});

onBeforeUnmount(() => {
  cleanup?.();
  cleanup = null;
});

async function handleOK() {
  // Export the current SVG from the editor.
  exportSVG();
  // Wait briefly for the result, then render into the canvas.
  await new Promise((r) => setTimeout(r, 300));
  if (lastResult.value?.png) {
    await canvasApi.pasteImage(lastResult.value.png);
  } else if (lastResult.value?.svg) {
    try {
      const res = await aiApi.renderSvgToPng(lastResult.value.svg, 512, 512);
      await canvasApi.pasteImage(res.png_data);
    } catch (e) {
      console.error('[OpenPencilView] render failed:', e);
    }
  }
  uiStore.closePreview();
}

function handleCancel() {
  uiStore.closePreview();
  lastResult.value = null;
}

defineExpose({ status, lastResult, sendImageToAI, exportSVG, handleOK, handleCancel });
</script>

<template>
  <div class="openpencil-view">
    <OpenPencilToolbar @ok="handleOK" @cancel="handleCancel" />
    <div class="openpencil-view__body">
      <iframe
        ref="iframeRef"
        class="openpencil-view__frame"
        :srcdoc="srcDoc"
        sandbox="allow-scripts allow-same-origin"
        title="OpenPencil"
      />
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

  &__body {
    flex: 1;
    min-height: 0;
  }

  &__frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #f5f5f7;
  }
}
</style>
