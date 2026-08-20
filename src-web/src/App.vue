<!--
  OpenPaint root component.
  - loads the main layout
  - mounts the AI assistant floating panel
  - global background + font styles
-->

<script setup lang="ts">
import { onMounted } from 'vue';
import MainLayout from '@/components/layout/MainLayout.vue';
import AIAssistant from '@/components/assistant/AIAssistant.vue';
import { isTauri } from '@api/runtime';

const runningInTauri = isTauri();

/**
 * In the web preview build we tag the document so the global banner
 * CSS can show a one-line "this is the demo, not the desktop app"
 * notice. On the desktop build the banner element is not rendered
 * at all (no layout shift, no DOM weight).
 */
onMounted(() => {
  if (runningInTauri) return;
  document.documentElement.dataset.runtime = 'web-preview';
});
</script>

<template>
  <div v-if="!runningInTauri" class="web-preview-banner" role="status">
    OpenPaint Web Preview · interactive demo of the desktop app ·
    <a href="https://github.com/MatuX-ai/OpenPaint/releases" target="_blank" rel="noopener">
      Download desktop
    </a>
  </div>
  <MainLayout />
  <AIAssistant />
</template>

<style lang="scss">
/* Banner is only rendered when running outside Tauri (see template). */
.web-preview-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 6px 12px;
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
  color: #1f2937;
  background: linear-gradient(90deg, #fef3c7 0%, #fde68a 100%);
  border-bottom: 1px solid #f59e0b;

  a {
    color: #92400e;
    font-weight: 600;
    text-decoration: underline;
    margin-left: 4px;
  }
}

/* When the banner is visible, push the app body down so the toolbar
 * isn't covered. Desktop builds never render the banner so this rule
 * has no effect there. */
:root[data-runtime='web-preview'] #app {
  padding-top: 28px;
}
</style>

<style lang="scss">
/* Root styles apply only to :root, avoid polluting child components. */
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    system-ui,
    sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-primary);
}
</style>
