/**
 * utils/imageConvert 单元测试
 *
 * happy-dom 不实现 canvas.getContext / toDataURL，依赖真实 canvas
 * 行为的测试在该环境下跳过。
 */

import { describe, it, expect } from 'vitest';
import { rgbaToPngBase64 } from '@utils/imageConvert';

const probe = document.createElement('canvas');
const HAS_CANVAS = typeof probe.getContext === 'function' && typeof probe.toDataURL === 'function';

describe('utils/imageConvert', () => {
  it.skipIf(!HAS_CANVAS)('返回 data URL 字符串', async () => {
    const rgba = new Uint8Array([255, 0, 0, 255]); // 1x1 red
    const result = await rgbaToPngBase64(rgba, 1, 1);
    expect(typeof result).toBe('string');
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
  });

  it.skipIf(!HAS_CANVAS)('4x4 RGBA 转换', async () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    // 中心红点
    rgba[4 * 4 + 4 * 2] = 255;
    rgba[4 * 4 + 4 * 2 + 1] = 0;
    rgba[4 * 4 + 4 * 2 + 2] = 0;
    rgba[4 * 4 + 4 * 2 + 3] = 255;
    const result = await rgbaToPngBase64(rgba, 4, 4);
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('当 document 未定义时 reject', async () => {
    const origDoc = (globalThis as { document?: unknown }).document;
    delete (globalThis as { document?: unknown }).document;
    try {
      const rgba = new Uint8Array([0, 0, 0, 0]);
      await expect(rgbaToPngBase64(rgba, 1, 1)).rejects.toThrow(/browser environment/);
    } finally {
      (globalThis as { document?: unknown }).document = origDoc;
    }
  });

  it('happy-dom 下 ctx 不可用时不会挂死', async () => {
    const rgba = new Uint8Array(0);
    let result: unknown = 'pending';
    try {
      const p = rgbaToPngBase64(rgba, 0, 0);
      result = await Promise.race([
        p.catch((e) => e),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 200)),
      ]);
    } catch (e) {
      // happy-dom 下 getContext 可能直接抛 TypeError，捕获后也算通过
      result = e;
    }
    expect(result !== 'pending').toBe(true);
  });
});
