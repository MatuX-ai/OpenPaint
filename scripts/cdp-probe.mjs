#!/usr/bin/env node
// Tauri WebView2 CDP 探针：订阅 console/exception/Runtime 事件，并把结果实时输出
// 兼容 Node 22+ 内置 WebSocket。
//
// 用法：
//   node scripts/cdp-probe.mjs [--port 9222] [--repro-paste]
//   --repro-paste  启动后自动在 WebView 内执行 invoke('paste_image_to_layer', ...)

import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(
  (process.argv.find((a, i) => process.argv[i - 1] === '--port') ?? '9222')
);
const REPRO_PASTE = process.argv.includes('--repro-paste');
const REPRO_PATH = (() => {
  const idx = process.argv.indexOf('--repro-path');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const LOG_PATH = path.resolve(
  'i:/OpenPaint/.audit-logs/cdp-probe-20260905.jsonl',
);

await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
const logFd = await fs.open(LOG_PATH, 'a');
const log = async (obj) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  await logFd.write(line + '\n');
  if (obj.kind === 'console' || obj.kind === 'exception' || obj.kind === 'summary') {
    process.stdout.write(
      `[${obj.kind}] ${obj.method ?? ''} ${obj.text ?? obj.exceptionDescription ?? ''}\n`,
    );
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  if (!res.ok) throw new Error(`listTargets failed: ${res.status}`);
  return res.json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(null), { once: true });
    ws.addEventListener('error', (e) => reject(new Error(String(e))), { once: true });
  });
  return ws;
}

let nextId = 1;
const pending = new Map();
function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

const summary = {
  consoleCount: 0,
  exceptionCount: 0,
  errors: [],
  pasteResult: null,
};

async function main() {
  await log({ kind: 'info', msg: `探针启动，端口 ${PORT}，等待目标...` });
  let target = null;
  for (let i = 0; i < 30; i++) {
    try {
      const list = await listTargets();
      const page = list.find(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          /openpaint|tauri|localhost:5173|index\.html/i.test(t.url ?? ''),
      );
      if (page) {
        target = page;
        break;
      }
      // 没有特定目标就拿第一个 page
      const anyPage = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (anyPage && i > 5) {
        target = anyPage;
        break;
      }
    } catch (e) {
      // 端口还没开，继续等
    }
    await sleep(500);
  }
  if (!target) {
    await log({ kind: 'error', msg: '找不到 WebView CDP 目标' });
    process.exit(2);
  }

  await log({ kind: 'info', msg: `连接 ${target.url}` });

  const ws = await connect(target.webSocketDebuggerUrl);

  ws.addEventListener('message', async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.unserializableValue ?? JSON.stringify(a))
        .join(' ');
      summary.consoleCount++;
      await log({ kind: 'console', level: msg.params.type, text, params: msg.params });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      summary.exceptionCount++;
      const e = msg.params.exceptionDetails;
      summary.errors.push(e);
      await log({
        kind: 'exception',
        exceptionDescription: e.exception?.description ?? e.text,
        url: e.url,
        lineNumber: e.lineNumber,
        columnNumber: e.columnNumber,
        stackTrace: e.stackTrace,
      });
    } else if (msg.method === 'Log.entryAdded') {
      await log({ kind: 'log', entry: msg.params.entry });
    } else if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.status >= 400) {
        await log({ kind: 'http', status: r.status, url: r.url });
      }
    }
  });

  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  await send(ws, 'Network.enable');
  await send(ws, 'Page.enable');
  await log({ kind: 'info', msg: '已订阅 Runtime/Log/Network/Page 事件' });

  if (REPRO_PASTE) {
    await sleep(2000);
    // 准备 1x1 PNG（透明）作为最小可用 base64
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const expression = `
      (async () => {
        const start = performance.now();
        let err = null, result = null;
        try {
          const t = window.__TAURI__?.core?.invoke
            ?? window.__TAURI_INTERNALS__?.invoke
            ?? (await import('http://localhost:5173/src/api/index.ts')).default?.pasteImage;
          if (!t) throw new Error('找不到 invoke/pasteImage');
          result = await t('paste_image_to_layer', { imageData: 'data:image/png;base64,${png}' });
        } catch (e) {
          err = { name: e?.name, message: e?.message, stack: e?.stack };
        }
        return { ms: Math.round(performance.now() - start), err, result };
      })()
    `;
    const r = await send(ws, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    summary.pasteResult = r.result?.value ?? r;
    await log({ kind: 'summary', pasteResult: summary.pasteResult });
  }

  await log({ kind: 'summary', summary });
  await logFd.close();

  // 持续监听 30s，给用户留出时间操作 UI
  await sleep(30000);
  ws.close();
  process.exit(0);
}

main().catch(async (e) => {
  await log({ kind: 'error', msg: String(e?.stack ?? e) });
  await logFd.close();
  process.exit(1);
});
