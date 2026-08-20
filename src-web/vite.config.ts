import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  // 路径别名（与 tsconfig.json 保持一致）
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@composables': fileURLToPath(new URL('./src/composables', import.meta.url)),
      '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
      '@api': fileURLToPath(new URL('./src/api', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
    },
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
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'pinia'],
          'vendor-tauri': ['@tauri-apps/api'],
          'vendor-icons': ['lucide-vue-next'],
        },
      },
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
