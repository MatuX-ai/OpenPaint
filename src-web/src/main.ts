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
import { isTauri } from '@api/runtime';

/** 样式（必须在 createApp 之前导入，这样全局变量 / 字体被 Vue 的样式系统接管） */
import '@/assets/styles/reset.scss';
import '@/assets/styles/global.scss';

/**
 * WebView2 Runtime 检测。
 * Rust 端（lib.rs::check_webview2_runtime）会在 wry 启动 webview 前拦截完全缺失的情况。
 * 这里检查 wry 启动后内部 API 是否可用；不可用时表明 wry 退化路径生效或 WebView2 版本过低。
 */
function ensureWebView2Ready(): { ok: true } | { ok: false; reason: string } {
  const w = window as unknown as {
    chrome?: { webview?: { postMessage?: unknown } };
    navigator?: { userAgent?: string };
  };
  // WebView2 在 window 上注入 `chrome.webview`；普通 Edge / Chrome 没有这个字段。
  // Microsoft Edge 桌面版也没有（除非以 webview2 host 模式运行）。
  if (!w.chrome || !w.chrome.webview) {
    return {
      ok: false,
      reason:
        'window.chrome.webview 未注入：当前 WebView2 Runtime 版本过低或 wry 未正常加载 webview。\n' +
        '请升级 Microsoft Edge 至最新版（>= 109），或在「应用和功能」里修复 / 重装 WebView2 Runtime。',
    };
  }
  return { ok: true };
}

/** 把错误详情渲染到 DOM，供桌面端 release 模式（无 DevTools）诊断。 */
function renderErrorToDom(label: string, detail: unknown): void {
  try {
    const host = document.getElementById('app') ?? document.body;
    const pre = document.createElement('pre');
    pre.setAttribute('data-openpaint-fatal', 'true');
    pre.style.cssText =
      'position:fixed;inset:0;z-index:99999;margin:0;padding:24px;' +
      'background:#1a1a1a;color:#ff6b6b;font:13px/1.5 Consolas,Menlo,monospace;' +
      'white-space:pre-wrap;overflow:auto;';
    const msg =
      detail instanceof Error
        ? `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`
        : String(detail);
    pre.textContent = `[OpenPaint] ${label}\n\n${msg}`;
    host.appendChild(pre);
  } catch {
    // 最后一道防线，避免错误处理器本身出错
  }
}
function formatRejection(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

window.addEventListener('error', (event) => {
  renderErrorToDom(
    'window.error',
    `${event.message}\n  at ${event.filename}:${event.lineno}:${event.colno}`,
  );
});
window.addEventListener('unhandledrejection', (event) => {
  renderErrorToDom('unhandledrejection', formatRejection(event.reason));
});

// wry 已经启动 webview 才会有此 JS 运行——Rust 端已经走过 WebView2 完整性检测。
// 这里再查一遭走兜底：WebView2 < 109 版本或 wry 退化路径生效时，chrome.webview 会缺失。
//
// W12 VDP-WEB-01 fix：在纯浏览器（Web Preview / Vercel）模式下，window.chrome.webview
// 必然不存在，必须软失败（仅 console.warn）而不是 throw / render fatal——否则整个 SPA
// 会白屏，web 端“30 秒上手”的入口直接坏掉。WebView2 完整性检查仅在 Tauri 环境下生效。
const wv2Ready = ensureWebView2Ready();
if (!wv2Ready.ok) {
  if (isTauri()) {
    renderErrorToDom('WebView2 Runtime 异常', wv2Ready.reason);
    throw new Error(wv2Ready.reason);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[OpenPaint] Web Preview 模式：window.chrome.webview 未注入是预期行为，跳过 WebView2 检测。',
    );
  }
}

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
