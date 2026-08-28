/**
 * imageConvert — 浏览器端 RGBA → PNG base64。
 *
 * 用 HTML5 Canvas（happy-dom 测试环境也提供基础 Canvas）。
 * 用于编辑菜单"粘贴"：从 OS 剪贴板拿到 RGBA bytes 后转 PNG 再喂给
 * `canvasApi.pasteImage`（后端只接受 data URL）。
 */

/**
 * @param rgba Uint8Array of RGBA pixels, length = w * h * 4
 * @param w width in pixels
 * @param h height in pixels
 */
export function rgbaToPngBase64(rgba: Uint8Array, w: number, h: number): Promise<string> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('rgbaToPngBase64 requires a browser environment'));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('2D canvas context unavailable'));
  }
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  return new Promise<string>((resolve, reject) => {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
