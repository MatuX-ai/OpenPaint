<!--
  OpenPaint 应用主体视图。
  - 加载主布局与 AI 助理
  - Web 预览构建在顶部显示 demo 提示条
-->

<script setup lang="ts">
import { onMounted } from 'vue';
import MainLayout from '@/components/layout/MainLayout.vue';
import AIAssistant from '@/components/assistant/AIAssistant.vue';
import { isTauri } from '@api/runtime';

const runningInTauri = isTauri();

onMounted(() => {
  if (runningInTauri) return;
  document.documentElement.dataset.runtime = 'web-preview';
});
</script>

<template>
  <div
    v-if="!runningInTauri"
    class="web-preview-banner"
    role="status"
  >
    OpenPaint Web Preview · interactive demo of the desktop app ·
    <a
      href="https://github.com/MatuX-ai/OpenPaint/releases"
      target="_blank"
      rel="noopener"
    >Download desktop</a>
  </div>
  <MainLayout />
  <AIAssistant />
</template>

<style lang="scss">
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

:root[data-runtime='web-preview'] #app {
  padding-top: 28px;
}
</style>
