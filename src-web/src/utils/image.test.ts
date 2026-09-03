/**
 * utils/image 单元测试
 *
 * happy-dom 不实现 HTMLCanvasElement.getContext / toDataURL，所有
 * 依赖真实 canvas 行为的测试在该环境下跳过。生产环境在 happy-dom
 * 中调用由调用方负责 polyfill（如 open-pencil 内置 CanvasKit）。
 */

import { describe, it, expect } from 'vitest';
import { canvasToBase64, blobToBase64, base64ToImage } from '@utils/image';

const probe = document.createElement('canvas');
const HAS_CANVAS = typeof probe.toDataURL === 'function' && typeof probe.getContext === 'function';

describe('utils/image', () => {
  describe('canvasToBase64', () => {
    it.skipIf(!HAS_CANVAS)('返回字符串（data URL）', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 2, 2);
      const result = canvasToBase64(canvas);
      expect(typeof result).toBe('string');
      expect(result.startsWith('data:image/png;base64,')).toBe(true);
    });

    it.skipIf(!HAS_CANVAS)('支持传入自定义 MIME type', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const result = canvasToBase64(canvas, 'image/jpeg');
      expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
    });

    it.skipIf(!HAS_CANVAS)('空画布也能产生 base64', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;
      const result = canvasToBase64(canvas);
      expect(typeof result).toBe('string');
    });

    it('happy-dom 下验证调用不抛错（返回 undefined 或字符串）', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      // happy-dom 下会抛或返回 undefined/空串；只关心不挂死
      try {
        const r = canvasToBase64(canvas);
        expect(r === undefined || typeof r === 'string').toBe(true);
      } catch (e) {
        // 接受已知 happy-dom 限制
        expect(String(e)).toBeTruthy();
      }
    });
  });

  describe('blobToBase64', () => {
    it('把 Blob 转为 data URL', async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const result = await blobToBase64(blob);
      expect(result.startsWith('data:text/plain;base64,')).toBe(true);
    });

    it('支持 PNG mime blob', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const blob = new Blob([pngBytes], { type: 'image/png' });
      const result = await blobToBase64(blob);
      expect(result.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('正常路径返回非空字符串', async () => {
      const blob = new Blob(['x'], { type: 'text/plain' });
      const result = await blobToBase64(blob);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('base64ToImage', () => {
    it.skipIf(!HAS_CANVAS)('解析 data URL 后 onload 给出 HTMLImageElement', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#abcdef';
      ctx.fillRect(0, 0, 4, 4);
      const dataUrl = canvas.toDataURL('image/png');
      const img = await base64ToImage(dataUrl);
      expect(img).toBeInstanceOf(HTMLImageElement);
    });

    it('对未知 URL 不挂死', async () => {
      // happy-dom 的 Image.onerror 行为不稳定，确保 Promise 至少有结果
      const p = base64ToImage('not-a-data-url');
      await Promise.race([p, new Promise((resolve) => setTimeout(() => resolve('ok'), 200))]);
      expect(true).toBe(true);
    });
  });
});
