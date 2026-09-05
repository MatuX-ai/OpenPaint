/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

// 浏览器端空白模块：用于别名 @open-pencil/core / canvaskit-wasm 中只在 Node
// 分支使用的 Node.js 内置（被 IS_BROWSER / typeof process 检查守护）。
const nodeBuiltinShim = resolvePath(
  fileURLToPath(new URL('./src/shims/empty-node-module.js', import.meta.url)),
);
// 浏览器端 no-op SourceMapGenerator：替换 source-map-js/lib/source-map-generator.js。
// css-tree 会 import 这个深路径，但走 Vite dev server 的 /@fs/ 路线时，
// Bable cannot treat CJS as ESM named export，必须重定向到 ESM stub。
const sourceMapShim = resolvePath(
  fileURLToPath(new URL('./src/shims/source-map-generator.js', import.meta.url)),
);

// OpenPencil 的字体资源（BUNDLED_FONTS）：dev 阶段通过中间件从 jsdelivr 拉取并
// 内存缓存，build 阶段由 `copy-openpencil-fonts` 插件写入 dist/。列表必须与
// `@open-pencil/core/dist/text/fonts.js` 里的 BUNDLED_FONTS 完全一致。
const OPENPENCIL_FONTS: Record<string, string> = {
  '/Inter-Regular.ttf':
    'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Regular.ttf',
  '/Inter-Medium.ttf':
    'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Medium.ttf',
  '/Inter-SemiBold.ttf':
    'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-SemiBold.ttf',
  '/Inter-Bold.ttf': 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Bold.ttf',
  '/Inter-ExtraBold.ttf':
    'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-ExtraBold.ttf',
  '/NotoNaskhArabic-Regular.ttf':
    'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoNaskhArabic/hinted/ttf/NotoNaskhArabic-Regular.ttf',
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 修包名插入：@open-pencil/core 里有几处 new Worker(new URL(".../*.ts", ...))
    // 引用了一个只存在于发行 .js 但运行时请求 .ts 的脚本（見 export.js / read.js）。
    // Rollup 的 commonjs--resolver 不会丢下这个请求，会报「Could not resolve
    // entry module ...*.ts」。这里把这类 URL 重写成同一个目录下的 .js，让
    // Vite 的 worker 插件可以正常打包。
    {
      name: 'open-pencil-fix-worker-url',
      enforce: 'pre',
      transform(code: string, id: string) {
        if (!id.includes('@open-pencil/core/dist/')) return null;
        const out = code.replace(/new URL\(["'](\.\.?\/[^"']+?)\.ts["']/g, 'new URL("$1.js"');
        if (out === code) return null;
        return {
          code: out,
          map: { mappings: '' },
        };
      },
    },
    // SDK init 补丁：@open-pencil/vue 的 useCanvasKitLoader.init() 在
    // `setCanvasKit(await getCanvasKit())` 之后会用
    //   await new Promise((resolve) => { requestAnimationFrame(resolve); });
    // 等待一帧再 createSurface。在以下场景这会**永远不 resolve**：
    //   - WebView2 / 嵌入式浏览器 visibilityState=hidden（requestAnimationFrame
    //     被节流到 0）。
    //   - Tauri 桌面窗口最小化 / 后台状态。
    //   - 某些 Chromium 版本对后台标签 rAF 直接不发。
    // 改为 setTimeout(resolve, 0) 之后 createSurface 不依赖 rAF，能在所有
    // 环境下推进 createSurface。setTimeout(0) ≈ macrotask，足够让 Vue 把
    // canvas DOM 节点 layout/attach 完成。
    //
    // 注意：Vite 的 transform 钩子不作用于 optimizeDeps 预打包阶段，
    // 这里必须用 esbuild plugin 才能把 patch 写进 @open-pencil_vue.js chunk。
    {
      name: 'open-pencil-fix-raf-hang-esbuild',
      enforce: 'pre',
      transform(code: string, id: string) {
        // 宽松匹配：既兼容开发期原始模块路径，也兼容 optimizeDeps 预打包的
        // @open-pencil_vue.js 聚合 chunk（id 可能为任何包含 canvas/CanvasRoot
        // 的绝对路径，包括 windows 反斜杠与 .pnpm 中转哈希）。
        if (!/canvas[/\\]CanvasRoot\.js/.test(id)) return null;
        const out = code.replace(
          /await new Promise\(\(resolve\) => \{\s*requestAnimationFrame\(resolve\);\s*\}\);/g,
          'await new Promise((resolve) => { setTimeout(resolve, 0); });',
        );
        if (out === code) return null;
        return { code: out, map: { mappings: '' } };
      },
    },
    // canvaskit-wasm 的 WASM 二进制需要从 @open-pencil/core 内部被运行时
    // 按 `/canvaskit.wasm` URL 拉取（IS_BROWSER 走 ${'/' + file} 分支）。构
    // 建后复制 canvaskit.wasm 到 dist 根目录，让生产环境与 vite preview 都
    // 能提供这个 6.7MB 的文件。
    {
      name: 'copy-canvaskit-wasm',
      apply: 'build',
      async closeBundle() {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const srcCandidates = [
          // 顺序很关键：与 vite pre-bundle 实际选用的 canvaskit-wasm
          // 版本对齐。@open-pencil/core 的 dep 声明是
          // "canvaskit-wasm": "^0.40.0"，所以 vite 在 optimizeDeps 阶段会把
          // 0.40.0 的 JS 预打包到 .vite/deps 里；运行时 defaultLocate 会
          // 请求 /canvaskit.wasm。如果这里先返回了 0.39.1 的 wasm，就会
          // 出现 JS ABI 与 wasm 内部函数表对不上的问题（表现为
          // `RuntimeError: null function` 在 wasm-function[…]:0x…）。
          // 必须把 0.40.0 放在 0.39.1 之前。
          path.resolve(
            fileURLToPath(
              new URL(
                '../node_modules/.pnpm/canvaskit-wasm@0.40.0/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
                import.meta.url,
              ),
            ),
          ),
          path.resolve(
            fileURLToPath(
              new URL(
                '../node_modules/.pnpm/canvaskit-wasm@0.39.1/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
                import.meta.url,
              ),
            ),
          ),
        ];
        const dest = path.resolve(fileURLToPath(new URL('./dist/canvaskit.wasm', import.meta.url)));
        let copied = false;
        for (const src of srcCandidates) {
          try {
            await fs.access(src);
            await fs.copyFile(src, dest);
            copied = true;
            break;
          } catch {
            // 继续下一个
          }
        }
        if (!copied) {
          throw new Error('canvaskit.wasm 未找到：请确认 pnpm install 完整');
        }
      },
    },
    // 生产构建同步下载 OpenPencil BUNDLED_FONTS 到 dist/ 根目录，让 tauri
    // 打包 / vite preview 能直接 serve。fetch 失败时跳过该字体（OpenPencil
    // 的 fonts.js 会回退到 warn + null，不会阻塞主路径）。
    {
      name: 'copy-openpencil-fonts',
      apply: 'build',
      async closeBundle() {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dist = path.resolve(fileURLToPath(new URL('./dist', import.meta.url)));
        await fs.mkdir(dist, { recursive: true });
        await Promise.all(
          Object.entries(OPENPENCIL_FONTS).map(async ([relPath, url]) => {
            const dest = path.join(dist, relPath.replace(/^\//, ''));
            try {
              const res = await fetch(url);
              if (!res.ok) {
                console.warn(`[copy-openpencil-fonts] ${relPath} HTTP ${res.status} — skip`);
                return;
              }
              const buf = Buffer.from(await res.arrayBuffer());
              await fs.writeFile(dest, buf);
              console.log(`[copy-openpencil-fonts] ${relPath} -> ${buf.length} bytes`);
            } catch (err) {
              console.warn(
                `[copy-openpencil-fonts] ${relPath} fetch failed: ${String((err as Error)?.message ?? err)} — skip`,
              );
            }
          }),
        );
      },
    },
    // 开发服务器上也从 node_modules 提供 canvaskit.wasm（不走构建产物路径）。
    {
      name: 'serve-canvaskit-wasm-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/canvaskit.wasm', async (req, res) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const srcCandidates = [
            // 与 `copy-canvaskit-wasm` 保持完全一致的顺序：0.40.0 先。
            path.resolve(
              fileURLToPath(
                new URL(
                  '../node_modules/.pnpm/canvaskit-wasm@0.40.0/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
                  import.meta.url,
                ),
              ),
            ),
            path.resolve(
              fileURLToPath(
                new URL(
                  '../node_modules/.pnpm/canvaskit-wasm@0.39.1/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
                  import.meta.url,
                ),
              ),
            ),
          ];
          for (const src of srcCandidates) {
            try {
              await fs.access(src);
              const buf = await fs.readFile(src);
              // 完整 headers：WebAssembly.instantiateStreaming 需要
              // Content-Type=application/wasm 且无 Content-Encoding 干扰。
              // 显式带 cache-control 防止多并发请求时被 vite 中间件阻塞。
              res.setHeader('Content-Type', 'application/wasm');
              res.setHeader('Content-Length', String(buf.length));
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
              res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
              res.statusCode = 200;
              res.end(buf);
              return;
            } catch {
              // try next
            }
          }
          res.statusCode = 404;
          res.end('canvaskit.wasm not found');
        });
      },
    },
    // 开发服务器提供 OpenPencil BUNDLED_FONTS：从 jsdelivr 拉取并内存缓存。
    // 第一次访问某字体时发起 HTTP GET（jsdelivr 永久缓存），后续请求直接
    // 返回内存 buffer。CDN 失败返回 404，由 OpenPencil 字体加载逻辑兜底。
    {
      name: 'serve-openpencil-fonts-dev',
      apply: 'serve',
      configureServer(server: {
        middlewares: {
          use: (handler: (req: { url?: string }, res: any, next: () => void) => void) => void;
        };
      }) {
        const cache = new Map<string, Buffer>();
        const inflight = new Map<string, Promise<Buffer | null>>();
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '';
          if (!OPENPENCIL_FONTS[url]) {
            next();
            return;
          }
          const cached = cache.get(url);
          if (cached) {
            res.setHeader('Content-Type', 'font/ttf');
            res.setHeader('Content-Length', String(cached.length));
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.statusCode = 200;
            res.end(cached);
            return;
          }
          let pending = inflight.get(url);
          if (!pending) {
            pending = (async () => {
              try {
                const upstream = await fetch(OPENPENCIL_FONTS[url]);
                if (!upstream.ok) return null;
                const ab = await upstream.arrayBuffer();
                const buf = Buffer.from(ab);
                cache.set(url, buf);
                return buf;
              } catch {
                return null;
              } finally {
                inflight.delete(url);
              }
            })();
            inflight.set(url, pending);
          }
          const buf = await pending;
          if (!buf) {
            res.statusCode = 404;
            res.end('font not found');
            return;
          }
          res.setHeader('Content-Type', 'font/ttf');
          res.setHeader('Content-Length', String(buf.length));
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.statusCode = 200;
          res.end(buf);
        });
      },
    },
  ],

  // 路径别名（与 tsconfig.json 保持一致）
  resolve: {
    alias: [
      // 业务路径别名
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      {
        find: '@components',
        replacement: fileURLToPath(new URL('./src/components', import.meta.url)),
      },
      {
        find: '@composables',
        replacement: fileURLToPath(new URL('./src/composables', import.meta.url)),
      },
      { find: '@stores', replacement: fileURLToPath(new URL('./src/stores', import.meta.url)) },
      { find: '@api', replacement: fileURLToPath(new URL('./src/api', import.meta.url)) },
      { find: '@types', replacement: fileURLToPath(new URL('./src/types', import.meta.url)) },
      { find: '@utils', replacement: fileURLToPath(new URL('./src/utils', import.meta.url)) },
      { find: '@assets', replacement: fileURLToPath(new URL('./src/assets', import.meta.url)) },
      // Node 内置别名：上游包在动态 import / CJS require / undici 依赖里引用
      // node:* 或裸 fs/path 等。全部由 IS_BROWSER / typeof process 检查守护，
      // 浏览器永不会执行，但 Vite/Rollup 的静态分析仍要求有解析结果。不能
      // 使用过于宽松的正则（如 /^[a-z]+$/）会误伤其他单单词 npm 包名
      // （fflate 等），这里列举 Node 内置名单。
      { find: /^node:.+$/, replacement: nodeBuiltinShim },
      {
        find: /^(fs|fs\/promises|path|path\/posix|url|os|crypto|stream|util|buffer|events|http|https|http2|net|dns|tls|child_process|cluster|worker_threads|perf_hooks|async_hooks|assert|assert\/strict|querystring|zlib|string_decoder|tty|readline|repl|vm|v8|inspector|module|console|diagnostics_channel|trace_events|punycode|wasi|sqlite|systeminformation)$/,
        replacement: nodeBuiltinShim,
      },
      // source-map-js/lib/*.js 是 CJS 深路径，css-tree （被 @open-pencil/core
      // 间接引入）会以 require('source-map-js/lib/source-map-generator.js') 加载
      // 它。Vite 的 deps optimizer 会优化顶级入口，但深路径走 /@fs/ 以原始 CJS
      // 形式返回，ESM named import 拿不到 SourceMapGenerator，模块图报错。全部
      // 重定向到 ESM no-op stub——我们不需要 CSS 源码映射。
      { find: /^source-map-js\/lib\/[^/]+\.js$/, replacement: sourceMapShim },
      // 上游包 export.js 里 new Worker(new URL("./export-worker.ts", ...)) 引用
      // 了一个 .ts 扩展名但实际发行的是 .js；Rollup 的 commonjs--resolver 在
      // 尝试加载这个 entry module 时报错。下面这个手写插件直接改造出口代码。
      // （resolve.alias 因为要匹配到的绝对路径包含 .pnpm/@open-pencil+core@
      // 0.14.0 中转哈希，过于脘口。）
    ],
  },

  // 开发服务器配置（与 Tauri tauri.conf.json 中的 devUrl 一致）
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    // 强制让浏览器的 WebAssembly.instantiateStreaming 工作正常：需要
    // Cross-Origin-Opener-Policy: same-origin 与
    // Cross-Origin-Embedder-Policy: require-corp 双开。注意 canvaskit.wasm
    // 的中间件单独再加一遍，避免 dev middleware 顺序问题。
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  // 构建配置
  build: {
    // es2022：@open-pencil/core 在模块顶层使用了 `await loadYoga()` 这种
    // Top-level await（wrapAssembly(await loadYoga())），需要 ES2022 才能编译
    // 通过。Tauri WebView2 / WebKitGTK / wry 均原生支持。
    target: 'es2022',
    sourcemap: true,
    // canvaskit-wasm 是 UMD 包（含 `if (typeof process === 'object') require('fs')` 分支）。
    // 让 Rollup 的 CommonJS 插件处理 UMD 包裹层，并把 node:fs/path 等条件 require
    // 外部化为空模块。
    commonjsOptions: {
      include: [/\/canvaskit-wasm\//, /\/node_modules\//],
      requireReturnsDefault: 'auto',
      transformMixedEsModules: true,
      ignoreTryCatch: true,
    },
    rollupOptions: {
      // 把 canvaskit-wasm 与上游对它的引用捆到一个独立 chunk，便于
      // CanvasKit wasm 走 dynamic import 而不是被 esbuild 预构建。
      output: {
        manualChunks(id) {
          if (id.includes('@tauri-apps/api')) return 'vendor-tauri';
          if (id.includes('lucide-vue-next')) return 'vendor-icons';
          if (id.includes('@open-pencil/') || id.includes('canvaskit-wasm')) {
            return 'vendor-openpencil';
          }
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/pinia/') ||
            id.includes('node_modules/@vue/')
          ) {
            return 'vendor-vue';
          }
          return undefined;
        },
      },
    },
  },

  // OpenPencil pulls in CanvasKit (Skia compiled to WebAssembly). 把
  // canvaskit-wasm 与 @open-pencil/core 排除出 esbuild 预构建，让 wasm
  // 通过其自己的 locateFile 机制在运行时按 URL 加载，而不是被 esbuild 复
  // 制到 .vite/deps/ 丢失路径。
  optimizeDeps: {
    // canvaskit-wasm 是 CJS/UMD 包（“if (typeof process === 'object') require('fs')”），
    // 被排除出 esbuild 预构建后会被 Vite dev server 以原始 UMD 文件
    // （/@fs/.../canvaskit.js）送出，而代码侧使用 ESM `import CanvasKit
    // from 'canvaskit-wasm'`，产生 “does not provide an export named
    // 'default'” 挂掉整个模块图。必须让 esbuild 生成 ESM wrapper。
    // 预优化后的 ESM wrapper 在运行时还是通过 locatedFile('/canvaskit.wasm')
    // 去加载 .wasm，前 public/canvaskit.wasm 提供文件不冲突。
    include: [
      '@open-pencil/core',
      '@open-pencil/vue',
      'canvaskit-wasm',
      'css-tree',
      'source-map-js',
    ],
    // esbuild 默认目标 es2020 + chrome87 等，不支持 Top-level await；
    // @open-pencil/yoga-layout 在模块顶层 `await loadYoga()`，
    // 必须提升到 esnext。Tauri WebView2 / WebKitGTK / wry 均原生支持。
    esbuildOptions: {
      target: 'esnext',
      supported: { 'top-level-await': true },
      // 把 open-pencil-fix-raf-hang-esbuild 的逻辑也注入到 esbuild 预打包
      // 阶段，esbuild plugin 在 onLoad 阶段按文件路径对 SDK CanvasRoot.js
      // 应用 patch。
      plugins: [
        {
          name: 'open-pencil-fix-raf-hang-esbuild-deps',
          setup(build) {
            const filter = /[\\/]canvas[\\/]CanvasRoot\.js$/;
            build.onLoad({ filter: /\.js$/ }, async (args) => {
              if (!filter.test(args.path)) return null;
              const fs = await import('node:fs/promises');
              const src = await fs.readFile(args.path, 'utf8');
              const patched = src.replace(
                /await new Promise\(\(resolve\) => \{\s*requestAnimationFrame\(resolve\);\s*\}\);/g,
                'await new Promise((resolve) => { setTimeout(resolve, 0); });',
              );
              if (patched === src) return null;
              return { contents: patched, loader: 'js' };
            });
          },
        },
      ],
    },
  },

  // CSS 配置
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/assets/styles/variables" as *;`,
        api: 'modern-compiler',
      },
    },
  },

  // Vitest 配置
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,vue}'],
  },
});
