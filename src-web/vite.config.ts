import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

// 浏览器端空白模块：用于别名 @open-pencil/core / canvaskit-wasm 中只在 Node
// 分支使用的 Node.js 内置（被 IS_BROWSER / typeof process 检查守护）。
const nodeBuiltinShim = resolvePath(fileURLToPath(new URL('./src/shims/empty-node-module.js', import.meta.url)));
// 浏览器端 no-op SourceMapGenerator：替换 source-map-js/lib/source-map-generator.js。
// css-tree 会 import 这个深路径，但走 Vite dev server 的 /@fs/ 路线时，
// Bable cannot treat CJS as ESM named export，必须重定向到 ESM stub。
const sourceMapShim = resolvePath(fileURLToPath(new URL('./src/shims/source-map-generator.js', import.meta.url)));

// https://vitejs.dev/config/
export default defineConfig(async () => ({
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
      transform(code, id) {
        if (!id.includes('@open-pencil/core/dist/')) return null;
        const out = code.replace(
          /new URL\(["'](\.\.?\/[^"']+?)\.ts["']/g,
          'new URL("$1.js"',
        );
        if (out === code) return null;
        return {
          code: out,
          map: { mappings: '' },
        };
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
          path.resolve(fileURLToPath(new URL('../node_modules/.pnpm/canvaskit-wasm@0.39.1/node_modules/canvaskit-wasm/bin/canvaskit.wasm', import.meta.url))),
          path.resolve(fileURLToPath(new URL('../node_modules/.pnpm/canvaskit-wasm@0.40.0/node_modules/canvaskit-wasm/bin/canvaskit.wasm', import.meta.url))),
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
    // 开发服务器上也从 node_modules 提供 canvaskit.wasm（不走构建产物路径）。
    {
      name: 'serve-canvaskit-wasm-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/canvaskit.wasm', async (req, res) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const srcCandidates = [
            path.resolve(fileURLToPath(new URL('../node_modules/.pnpm/canvaskit-wasm@0.39.1/node_modules/canvaskit-wasm/bin/canvaskit.wasm', import.meta.url))),
            path.resolve(fileURLToPath(new URL('../node_modules/.pnpm/canvaskit-wasm@0.40.0/node_modules/canvaskit-wasm/bin/canvaskit.wasm', import.meta.url))),
          ];
          for (const src of srcCandidates) {
            try {
              await fs.access(src);
              const buf = await fs.readFile(src);
              res.setHeader('Content-Type', 'application/wasm');
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
  ],

  // 路径别名（与 tsconfig.json 保持一致）
  resolve: {
    alias: [
      // 业务路径别名
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@components', replacement: fileURLToPath(new URL('./src/components', import.meta.url)) },
      { find: '@composables', replacement: fileURLToPath(new URL('./src/composables', import.meta.url)) },
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
      { find: /^(fs|fs\/promises|path|path\/posix|url|os|crypto|stream|util|buffer|events|http|https|http2|net|dns|tls|child_process|cluster|worker_threads|perf_hooks|async_hooks|assert|assert\/strict|querystring|zlib|string_decoder|tty|readline|repl|vm|v8|inspector|module|console|diagnostics_channel|trace_events|punycode|wasi|sqlite|systeminformation)$/,
        replacement: nodeBuiltinShim },
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
          if (id.includes('node_modules/vue/') || id.includes('node_modules/pinia/') || id.includes('node_modules/@vue/')) {
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
    include: ['src/**/*.{test,spec}.ts'],
  },
}));
