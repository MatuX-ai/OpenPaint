<!--
  OpenPaint root component.
  - mounts the vue-router view so the marketing landing page is the default entry
  - keeps global reset / font styles scoped to :root
  - toggles .app--landing on #app so the landing page can scroll independently
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

// Landing 页需要纵向滚动；编辑器页保持 overflow:hidden 防止画布拖拽时页面滚动。
const isLanding = computed(() => route.name === 'Landing');
</script>

<template>
  <router-view :class="{ 'app--landing': isLanding }" />
</template>

<style lang="scss">
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

// Landing 页：允许 #app 自身滚动，同时保持 100% 高度作为最小高度。
#app:has(.app--landing) {
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
