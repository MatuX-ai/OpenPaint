/**
 * OpenPaint 前端入口
 * - 挂载 Vue 应用
 * - 注册 Pinia
 * - 注入全局样式
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';

// 样式
import '@/assets/styles/reset.scss';
import '@/assets/styles/global.scss';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
