/**
 * OpenPaint 前端入口
 * - 挂载 Vue 应用
 * - 注册 Pinia
 * - 注入全局样式与路由
 * - 全局错误监控：Tauri release 默认不带 DevTools，模块加载失败 / 运行时错误会表现为“打开后空白”，这里把所有未捕获异常渲染到 DOM 上以便诊断（同时也是正式的错误恢复机制）
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

// 样式（必须在 createApp 之前导入，这样全局变量 / 字体被 Vue 的样式系统接管）
import '@/assets/styles/reset.scss';
import '@/assets/styles/global.scss';

/** 把错误详情渲染到 DOM，供桌面端 release 模式（无 DevTools）诊断。 */
function renderErrorToDom(label: string, detail: unknown): void {
  try {
    const host = document.getElementById('app') ?? document.body;
    const pre = document.createElement('pre');
    pre.setAttribute(
      'data-openpaint-fatal',
      'true',
    );
    pre.style.cssText =
      'position:fixed;inset:0;z-index:99999;margin:0;padding:24px;' +
      'background:#1a1a1a;color:#ff6b6b;font:13px/1.5 Consolas,Menlo,monospace;' +
      'white-space:pre-wrap;overflow:auto;';
    const msg = detail instanceof Error ? `${detail.name}: ${detail.message}\n${detail.stack ?? ''}` : String(detail);
    pre.textContent = `[OpenPaint] ${label}\n\n${msg}`;
    host.appendChild(pre);
  } catch {
    // 最后一道防线，避免错误处理器本身出错
  }
}
function formatRejection(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`;
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

window.addEventListener('error', (event) => {
  renderErrorToDom('window.error', `${event.message}\n  at ${event.filename}:${event.lineno}:${event.colno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  renderErrorToDom('unhandledrejection', formatRejection(event.reason));
});

const app = createApp(App);
const pinia = createPinia();

app.config.errorHandler = (err, _instance, info) => {
  renderErrorToDom(`Vue error (${info})`, err);
  console.error('[OpenPaint] Vue error:', err, info);
};

app.use(pinia);
app.use(router);

try {
  app.mount('#app');
} catch (err) {
  renderErrorToDom('mount.mount', err);
  throw err;
}
