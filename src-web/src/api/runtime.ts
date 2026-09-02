/**
 * Runtime detection + web stubs for Tauri APIs.
 *
 * OpenPaint is a Tauri desktop app, but the same Vue 3 + Vite frontend
 * is also built as a static SPA and deployed to Vercel as a "web preview".
 *
 * On the web preview there is no Tauri host, so the native IPC primitives
 * (`invoke`, `listen`) would throw on first call. Instead of letting the
 * UI crash, we:
 *
 *   - Detect "are we inside a Tauri WebView?" via `isTauri()`.
 *   - Provide typed stubs that:
 *       * return harmless empty defaults for read-only commands
 *         so the UI can still render a meaningful "no data" state;
 *       * reject with a clear WebPreviewUnsupportedError for write /
 *         mutation commands so callers can show a "desktop only" hint;
 *       * log every stubbed call to the browser console under the
 *         `[web-preview]` prefix so it's easy to trace in DevTools.
 *
 * The desktop builds are unaffected: when `__TAURI_INTERNALS__` is
 * defined, we re-export the real `@tauri-apps/api/core` and
 * `@tauri-apps/api/event` modules, so production behavior is identical.
 */

import type { InvokeArgs } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';

// ----------------------------------------------------------------
// Runtime detection
// ----------------------------------------------------------------

/**
 * True when running inside a Tauri WebView (desktop app).
 * False on plain browsers (web preview, Vercel, etc.).
 */
export function isTauri(): boolean {
  // Tauri v2 exposes the IPC bridge on `window.__TAURI_INTERNALS__`.
  // We deliberately avoid `@tauri-apps/api/core`'s helper so this
  // module has zero side effects at import time.
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return typeof w.__TAURI_INTERNALS__ !== 'undefined';
}

// ----------------------------------------------------------------
// Errors
// ----------------------------------------------------------------

/**
 * Thrown by the web preview stubs for write/mutation commands.
 * Callers can `catch` this specifically to show "desktop only" UX
 * without polluting the console with an ugly stack trace.
 */
export class WebPreviewUnsupportedError extends Error {
  public readonly command: string;
  constructor(command: string) {
    super(
      `[web-preview] Command "${command}" is not supported in the web preview build. ` +
        `This feature requires the OpenPaint desktop app.`,
    );
    this.name = 'WebPreviewUnsupportedError';
    this.command = command;
  }
}

// ----------------------------------------------------------------
// Logging helper (web only — no-op on desktop)
// ----------------------------------------------------------------

let warnedOnce = false;
function warnWebOnce(): void {
  if (warnedOnce) return;
  warnedOnce = true;
  // eslint-disable-next-line no-console
  console.info(
    '%c[web-preview]%c Running OpenPaint web preview. ' +
      'Most canvas/AI commands are stubbed. Download the desktop app for full functionality.',
    'color:#f59e0b;font-weight:bold',
    'color:inherit',
  );
}

function logStubbedCall(command: string, args?: unknown): void {
  warnWebOnce();
  // eslint-disable-next-line no-console
  console.info(`[web-preview] invoke "${command}"`, args ?? {});
}

// ----------------------------------------------------------------
// Stub command table
// ----------------------------------------------------------------
//
// Each entry is a *factory* that returns the value the caller should
// receive. We keep this list explicit so adding a new command forces
// an explicit decision (mock vs reject) instead of silently falling
// through to a generic stub.
// ----------------------------------------------------------------

type StubFactory = (args: unknown) => unknown;

// ----------------------------------------------------------------
// W12 VDP-MOCK-03 fix：web preview 默认 provider 为 mock，让前端默认
// 走本地规则模板（不发起网络调用），与“30 秒上手”路径一致；
// set_provider / set_api_key 在内存中更新，下次 get_provider_config 返回新值。
// 这些 state 必须在 MOCK_COMMANDS 外面定义，否则对象字面量不能包含 let/const。
// ----------------------------------------------------------------
type WebProviderConfig = { provider: string; api_key: string | null; endpoint: string; model: string };
const DEFAULT_WEB_PROVIDER_CONFIG: WebProviderConfig = {
  provider: 'mock',
  api_key: null,
  endpoint: '(本地模板，不发起网络请求)',
  model: 'mock-v1',
};
let webProviderConfig: WebProviderConfig = { ...DEFAULT_WEB_PROVIDER_CONFIG };

/**
 * Commands that are safe to mock with empty/zero defaults so the UI
 * can still render an "empty state" instead of crashing.
 */
const MOCK_COMMANDS: Record<string, StubFactory> = {
  // App / debug
  get_app_info: () => ({
    name: 'OpenPaint (web preview)',
    version: '0.1.0',
    stage: 'web-preview',
  }),
  get_app_version: () => '0.1.0-web-preview',
  hello_world: () => 'Hello from the OpenPaint web preview!',
  echo: (args: unknown) => {
    const a = (args ?? {}) as { payload?: { message?: string } };
    const msg = a.payload?.message ?? '';
    return { received: msg, length: msg.length, timestamp: Date.now() };
  },

  // Canvas (read-only)
  get_canvas_summary: () => ({
    width: 1280,
    height: 720,
    layers: [],
    active_layer_id: null,
    can_undo: false,
    can_redo: false,
  }),
  get_selection_bounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  render_canvas_png: () => '',
  render_canvas_image: () => ({
    format: 'png',
    mime: 'image/png',
    bytes_base64: '',
    width: 0,
    height: 0,
    byte_size: 0,
  }),
  get_canvas_selection: () => '',
  list_tools: () => [],

  // Gallery (read-only)
  list_gallery: () => [],
  search_gallery: () => ({ items: [], total: 0 }),
  get_gallery_image: () => ({ item: null, png_base64: undefined }),

  // LLM / provider (UI-only stubs in web preview)
  // 顺序以国内优先，与后端 list_providers 保持一致：
  // 国内 OpenAI 兼容：DeepSeek / Qwen / Zhipu / Kimi / Doubao / MiniMax
  // 海外：OpenAI / Anthropic；本地压轴：Ollama + mock。
  list_providers: () => [
    { id: 'mock', label: '模拟模式（零配置演示）', default_endpoint: '(本地模板，不发起网络请求)', default_model: 'mock-v1', requires_api_key: false },
    { id: 'deepseek', label: 'DeepSeek', default_endpoint: 'https://api.deepseek.com/v1', default_model: 'deepseek-chat', requires_api_key: true },
    { id: 'qwen', label: '通义千问 (Qwen / 阿里云)', default_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', default_model: 'qwen-plus', requires_api_key: true },
    { id: 'zhipu', label: '智谱 GLM', default_endpoint: 'https://open.bigmodel.cn/api/paas/v4', default_model: 'glm-4-plus', requires_api_key: true },
    { id: 'moonshot', label: '月之暗面 (Kimi)', default_endpoint: 'https://api.moonshot.cn/v1', default_model: 'moonshot-v1-8k', requires_api_key: true },
    { id: 'doubao', label: '豆包 (火山引擎 / 字节)', default_endpoint: 'https://ark.cn-beijing.volces.com/api/v3', default_model: 'doubao-pro-32k', requires_api_key: true },
    { id: 'minimax', label: 'MiniMax (MiniMax)', default_endpoint: 'https://api.minimaxi.chat/v1', default_model: 'MiniMax-Text-01', requires_api_key: true },
    { id: 'openai', label: 'OpenAI', default_endpoint: 'https://api.openai.com/v1', default_model: 'gpt-4o', requires_api_key: true },
    { id: 'anthropic', label: 'Anthropic Claude', default_endpoint: 'https://api.anthropic.com/v1', default_model: 'claude-3-5-sonnet-20241022', requires_api_key: true },
    { id: 'ollama', label: 'Ollama (本地)', default_endpoint: 'http://localhost:11434', default_model: 'llama3.1', requires_api_key: false },
  ],
  get_provider_config: () => ({ ...webProviderConfig }),
  // 注意：前端 api/index.ts 调用 set_provider 时传的是 `{ provider }`（不是嵌套 args）。
  set_provider: (args: unknown) => {
    const a = (args ?? {}) as { provider?: string };
    if (typeof a.provider === 'string' && a.provider.length > 0) {
      webProviderConfig = { ...webProviderConfig, provider: a.provider };
    }
    return undefined;
  },
  // set_api_key 调用传的是 `{ provider, apiKey }`。
  set_api_key: (args: unknown) => {
    const a = (args ?? {}) as { provider?: string; apiKey?: string | null };
    if (typeof a.provider === 'string' && a.provider.length > 0) {
      webProviderConfig = { ...webProviderConfig, provider: a.provider };
    }
    webProviderConfig = { ...webProviderConfig, api_key: a.apiKey ?? null };
    return undefined;
  },

  // Asset library (W9) — Iconify icons. In the web preview we return a tiny
  // curated stub so the IconPanel still has something to render.
  search_icons: (args: unknown) => {
    const a = (args as { args?: { query?: string; style?: string; category?: string; limit?: number } }).args ?? {};
    const query = (a.query ?? '').toLowerCase();
    const limit = Math.min(Math.max(a.limit ?? 30, 1), 50);
    const stubIcons = [
      { prefix: 'lucide', name: 'search', category: 'ui', tags: ['search', 'find', '查找', '搜索'] },
      { prefix: 'lucide', name: 'settings', category: 'ui', tags: ['settings', 'gear', '设置'] },
      { prefix: 'lucide', name: 'home', category: 'navigation', tags: ['home', 'house', '主页'] },
      { prefix: 'lucide', name: 'user', category: 'ui', tags: ['user', 'person', '用户'] },
      { prefix: 'lucide', name: 'heart', category: 'ui', tags: ['heart', 'favorite', '心'] },
      { prefix: 'lucide', name: 'star', category: 'ui', tags: ['star', 'favorite', '星'] },
      { prefix: 'lucide', name: 'plus', category: 'ui', tags: ['plus', 'add', '加号'] },
      { prefix: 'lucide', name: 'check', category: 'ui', tags: ['check', 'tick', '确认'] },
      { prefix: 'lucide', name: 'trash', category: 'ui', tags: ['trash', 'delete', '删除'] },
      { prefix: 'lucide', name: 'edit', category: 'ui', tags: ['edit', 'pencil', '编辑'] },
    ];
    const filtered = stubIcons.filter((i) => {
      if (a.style && i.prefix !== a.style) return false;
      if (a.category && i.category !== a.category) return false;
      if (!query) return true;
      const blob = (i.name + ' ' + i.tags.join(' ')).toLowerCase();
      return blob.includes(query);
    });
    return {
      icons: filtered.slice(0, limit),
      total: filtered.length,
      has_more: filtered.length > limit,
    };
  },
  render_icon_svg: (args: unknown) => {
    const a = (args as { args?: { prefix?: string; name?: string; color?: string; size?: number } }).args ?? {};
    const size = a.size ?? 64;
    const color = a.color || 'currentColor';
    // 返回一个合法的占位 SVG（便于预览面板渲染），不是真实 Iconify 图标。
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="${color}" stroke-width="2"/><text x="12" y="16" font-size="6" text-anchor="middle" fill="${color}">${(a.prefix ?? '?').slice(0, 2)}</text></svg>`;
    return { svg, width: size, height: size, from_cache: false };
  },

  // W10 + W11 资产库
  list_brushes: () => [],
  list_brush_assets: () => [],
  get_brush_asset: () => ({
    id: 'round-hard',
    name_zh: '硬圆',
    name_en: 'Round Hard',
    category: 'hard',
    default_radius: 12,
    falloff: 0,
    description: '',
    png_base64: '',
    byte_size: 0,
  }),
  list_palettes: () => [],
  apply_palette: () => ({ applied_colors: [], stroke_count: 0, mode: 'swatch_bar' }),
  list_gradients: () => [],
  apply_gradient: () => ({ gradient_id: '', gradient_type: 'linear', stop_count: 0, bytes_written: 0 }),
  create_brush_from_prompt: () => ({
    status: 'not_implemented',
    message: 'AI brush generation available in v0.3',
    prompt: '',
    name: null,
  }),
  record_asset_event: () => undefined,
  get_assets_telemetry: () => ({
    search_icons_total: 0,
    search_icons_cache_hits: 0,
    import_icon_total: 0,
    palette_applied_total: 0,
    gradient_applied_total: 0,
    brush_switch_total: 0,
    last_updated_at: '',
  }),
  get_asset_state: () => ({
    online: true,
    last_check_at: new Date().toISOString(),
    last_error: '',
  }),
  get_assets_config: () => ({
    cdn_mirror: 'default',
    attribution_notice_shown: false,
  }),
  set_assets_config: () => undefined,
};

/**
 * Commands we explicitly reject in the web preview. The list mirrors
 * everything in `api/index.ts` that mutates state or depends on the
 * Tauri-only plugins (fs / store / dialog / log).
 *
 * If you add a new Tauri command to `api/index.ts` and forget to add
 * it here, the catch-all in `webInvoke` will throw a clear error
 * rather than silently returning undefined.
 */
const REJECTED_COMMANDS = new Set<string>([
  // Canvas (write)
  'apply_brush_stroke',
  'apply_eraser_stroke',
  'paste_image_to_layer',
  'set_rect_selection',
  'clear_selection',
  'move_layer',
  'fill_layer',
  'undo_canvas',
  'redo_canvas',
  'add_layer',
  'remove_active_layer',
  'set_active_layer',
  'set_layer_visibility',
  'resize_canvas',

  // Gallery (write)
  'save_to_gallery',
  'delete_gallery_item',

  // AI engine
  'agent_chat',
  'agent_command',
  'send_to_ai_engine',
  'render_svg_to_png',
]);

// ----------------------------------------------------------------
// webInvoke — drop-in replacement for `@tauri-apps/api/core::invoke`
// ----------------------------------------------------------------

/**
 * Web preview replacement for Tauri `invoke`.
 *
 * On the desktop it simply re-exports the real invoke; on the web
 * it routes through the mock table above (or rejects for mutations).
 */
async function webInvoke<T = unknown>(command: string, args?: InvokeArgs): Promise<T> {
  if (isTauri()) {
    const real = await import('@tauri-apps/api/core');
    return real.invoke<T>(command, args);
  }

  logStubbedCall(command, args);

  if (Object.prototype.hasOwnProperty.call(MOCK_COMMANDS, command)) {
    return MOCK_COMMANDS[command](args) as T;
  }
  if (REJECTED_COMMANDS.has(command)) {
    throw new WebPreviewUnsupportedError(command);
  }
  // Unknown command — fail loudly so we notice during development.
  throw new Error(
    `[web-preview] Unknown command "${command}". ` +
      `Add it to MOCK_COMMANDS or REJECTED_COMMANDS in src/api/runtime.ts.`,
  );
}

// ----------------------------------------------------------------
// webListen — drop-in replacement for `@tauri-apps/api/event::listen`
// ----------------------------------------------------------------

/**
 * Web preview replacement for Tauri `listen`.
 *
 * On the desktop it forwards to the real `listen`; on the web it
 * returns a no-op unsubscribe function. Event handlers are never
 * invoked because no events are emitted in the web preview.
 */
async function webListen<T>(
  event: string,
  _handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  if (isTauri()) {
    const real = await import('@tauri-apps/api/event');
    return real.listen<T>(event, _handler);
  }
  warnWebOnce();
  // eslint-disable-next-line no-console
  console.info(`[web-preview] listen "${event}" (no-op in web preview)`);
  return () => {
    /* no-op */
  };
}

// Public surface — mirrors the shape of the Tauri APIs we use.
export const invoke = webInvoke;
export const listen = webListen;

// Type re-export so consumers don't need to import from
// `@tauri-apps/api/event` directly.
export type { UnlistenFn };
