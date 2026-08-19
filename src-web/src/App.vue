<!--
  OpenPaint root component.
  - loads the main layout
  - mounts the AI assistant floating panel
  - global background + font styles
-->

<script setup lang="ts">
import MainLayout from '@/components/layout/MainLayout.vue';
import AIAssistant from '@/components/assistant/AIAssistant.vue';
</script>

<template>
  <MainLayout />
  <AIAssistant />
</template>

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