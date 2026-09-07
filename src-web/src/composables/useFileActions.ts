/**
 * useFileActions — 高层"文件 IO"动作（保存到图库 / 打开 / 导出 / 批量导出）。
 *
 * W14+：打开 / 导入 / 导出 / 撤销走 OpenPencil 中央画布；
 * 仅图库落盘与本地写文件仍经 Tauri FS / galleryApi。
 *
 * 关联需求：docs/ux-onboarding-requirements.md §3.3、US-3 / US-4 / US-5 / US-9 / US-6。
 */

import { galleryApi } from '@api/index';
import { useDocumentState } from './useDocumentState';
import { useToast } from './useToast';
import { useCanvasStore } from '@stores/canvasStore';
import { isTauri, WebPreviewUnsupportedError } from '@api/runtime';
import { getOpenPencilBridge, syncOpenPencilStateToCanvasStore } from './useOpenPencil';

const SUPPORTED_OPEN_EXT = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

async function importTauriDialogOpen(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: '图片', extensions: SUPPORTED_OPEN_EXT }],
  });
  if (typeof selected === 'string') return selected;
  return null;
}

async function importTauriDialogSave(opts: {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  return await save({
    defaultPath: opts.defaultPath,
    filters: opts.filters,
  });
}

async function tauriWriteFile(path: string, data: string): Promise<void> {
  const { writeTextFile, writeFile } = await import('@tauri-apps/plugin-fs');
  // data: URL → 二进制
  if (data.startsWith('data:')) {
    const comma = data.indexOf(',');
    const meta = data.slice(5, comma);
    const b64 = data.slice(comma + 1);
    if (!meta.includes('base64')) {
      await writeTextFile(path, data);
      return;
    }
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    await writeFile(path, arr);
  } else {
    await writeTextFile(path, data);
  }
}

function mimeFromExt(ext: string): string {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/png';
}

export function useFileActions() {
  const doc = useDocumentState();
  const toast = useToast();
  const canvasStore = useCanvasStore();
  const bridge = getOpenPencilBridge();

  async function importFromDataUrl(dataUrl: string, extHint?: string): Promise<boolean> {
    try {
      const name = `import.${extHint || 'png'}`;
      await bridge.placeDataUrl(dataUrl, name);
      doc.markDirty();
      toast.success(`已导入到画布${extHint ? ` (${extHint})` : ''}`);
      return true;
    } catch (e) {
      toast.error(`导入失败：${String((e as Error).message ?? e)}`);
      return false;
    }
  }

  /**
   * 从拖拽事件 / input.files 拿到 File 列表，直接 placeFiles 到 OpenPencil。
   * 非图像文件被拒绝；超 50MB 的文件拒绝（避免 webview 内存炸）。
   */
  async function importFromFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) return;
    const accepted: File[] = [];
    let rejected = 0;
    for (const f of list) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_OPEN_EXT.includes(ext)) {
        toast.warn(`${f.name}：暂不支持 .${ext} 格式`);
        rejected++;
        continue;
      }
      if (f.size > 50 * 1024 * 1024) {
        toast.warn(`${f.name}：超过 50MB，请压缩后再试`);
        rejected++;
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    try {
      await bridge.placeFiles(accepted);
      doc.markDirty();
      toast.success(accepted.length === 1 ? '已导入到画布' : `已导入 ${accepted.length} 张`);
      if (rejected > 0) {
        toast.info(`已导入 ${accepted.length} 张，跳过 ${rejected} 个`);
      }
    } catch (e) {
      toast.error(`导入失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function openImage(): Promise<void> {
    if (!isTauri()) {
      toast.warn('打开本地图片仅在桌面版可用');
      return;
    }
    try {
      const path = await importTauriDialogOpen();
      if (!path) return;
      const base = path.split(/[/\\]/).pop() ?? 'image.png';
      const ext = base.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_OPEN_EXT.includes(ext)) {
        toast.error(`暂不支持 .${ext} 格式，可转 PNG / JPG / WebP / SVG 后再试`);
        return;
      }
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      await bridge.placeBytes(bytes, base, mimeFromExt(ext));
      doc.markDirty();
      toast.success('已导入到画布');
    } catch (e) {
      toast.error(`打开失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function saveToGallery(tags: string[] = []): Promise<boolean> {
    if (!isTauri()) {
      toast.warn('保存到图库仅在桌面版可用');
      return false;
    }
    doc.markSaving();
    try {
      const exported = await bridge.exportRaster('png');
      if (!exported) {
        toast.error('画布为空或渲染失败');
        doc.markDirty();
        return false;
      }
      const res = await galleryApi.save({
        imageData: exported.dataUrl,
        tags,
        source: 'imported',
      });
      doc.markSaved(`gallery:${res.id}`);
      toast.success('已保存到图库');
      return true;
    } catch (e) {
      if (e instanceof WebPreviewUnsupportedError) {
        toast.warn('保存到图库仅在桌面版可用');
      } else {
        toast.error(`保存失败：${String((e as Error).message ?? e)}`);
      }
      doc.markDirty();
      return false;
    }
  }

  async function exportImage(format: 'png' | 'jpg' | 'webp', quality: number): Promise<void> {
    if (!isTauri()) {
      toast.warn('导出本地文件仅在桌面版可用');
      return;
    }
    try {
      const path = await importTauriDialogSave({
        defaultPath: `openpaint-${Date.now()}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (!path) return;
      const res = await bridge.exportRaster(format, quality);
      if (!res) {
        toast.error('画布为空或渲染失败');
        return;
      }
      await tauriWriteFile(path, res.dataUrl);
      doc.markExported();
      const sizeLabel = res.width > 0 && res.height > 0 ? `${res.width}×${res.height} ` : '';
      toast.success(`已导出 ${sizeLabel}(${format.toUpperCase()})`);
    } catch (e) {
      toast.error(`导出失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function batchExport(
    sizes: number[],
    saveToGalleryFlag: boolean,
    tags: string[],
  ): Promise<void> {
    if (!isTauri()) {
      toast.warn('批量导出仅在桌面版可用');
      return;
    }
    if (sizes.length === 0) return;
    let dirPath: string | null = null;
    try {
      const { open: openDir } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDir({ directory: true, multiple: false });
      dirPath = typeof selected === 'string' ? selected : null;
    } catch {
      dirPath = null;
    }
    if (!dirPath) return;

    doc.markSaving();
    let success = 0;
    try {
      // 先导出整页 PNG，再在前端按长边缩放各尺寸（避免重复走 CanvasKit）。
      const base = await bridge.exportRaster('png');
      if (!base) {
        toast.error('画布为空或渲染失败');
        doc.markDirty();
        return;
      }
      for (let i = 0; i < sizes.length; i++) {
        const s = sizes[i];
        const filePath = `${dirPath.replace(/[\\/]+$/, '')}/icon-${s}x${s}.png`;
        try {
          const dataUrl = await resizeDataUrlToLongEdge(base.dataUrl, s);
          await tauriWriteFile(filePath, dataUrl);
          success++;
          if (saveToGalleryFlag) {
            await galleryApi.save({
              imageData: dataUrl,
              tags: [...tags, `${s}x${s}`],
              source: 'imported',
            });
          }
          toast.info(`(${i + 1}/${sizes.length}) ${s}×${s} 已导出`);
        } catch (e) {
          toast.warn(`${s}×${s} 导出失败：${String((e as Error).message ?? e)}`);
        }
      }
      doc.markSaved(`batch:${Date.now()}`);
      toast.success(`批量导出完成：${success}/${sizes.length}`);
    } catch (e) {
      doc.markDirty();
      toast.error(`批量导出失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function newCanvas(args: {
    width: number;
    height: number;
    unit: 'px' | 'mm';
    dpi: 72 | 144 | 300;
    handleLayers: 'keep' | 'discard' | 'cancel';
  }): Promise<void> {
    if (args.handleLayers === 'cancel') return;
    const w = args.unit === 'mm' ? Math.round((args.width / 25.4) * args.dpi) : args.width;
    const h = args.unit === 'mm' ? Math.round((args.height / 25.4) * args.dpi) : args.height;
    try {
      // OpenPencil 文档通过清空选区并重置视口表示"新建"；保留当前图时仅更新尺寸元数据。
      if (args.handleLayers === 'discard') {
        bridge.editor.selectAll();
        bridge.editor.deleteSelected();
      }
      canvasStore.canvasWidth = w;
      canvasStore.canvasHeight = h;
      canvasStore.resetView();
      bridge.editor.zoomToFit();
      syncOpenPencilStateToCanvasStore(bridge.editor);
      doc.resetForNew();
      toast.success(`已创建 ${w}×${h} 画布`);
    } catch (e) {
      toast.error(`新建画布失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function undo(): Promise<void> {
    try {
      bridge.undo();
      doc.markDirty();
    } catch (e) {
      toast.error(`撤销失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function redo(): Promise<void> {
    try {
      bridge.redo();
      doc.markDirty();
    } catch (e) {
      toast.error(`重做失败：${String((e as Error).message ?? e)}`);
    }
  }

  return {
    openImage,
    saveToGallery,
    exportImage,
    batchExport,
    newCanvas,
    undo,
    redo,
    importFromDataUrl,
    importFromFiles,
  };
}

/** 用浏览器 Canvas 把 data URL 缩放到指定长边（保持比例，输出正方形画布居中）。 */
async function resizeDataUrlToLongEdge(dataUrl: string, longEdge: number): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('resizeDataUrlToLongEdge requires a browser environment');
  }
  const img = await loadImage(dataUrl);
  const srcLong = Math.max(img.width, img.height) || 1;
  const scale = longEdge / srcLong;
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = longEdge;
  canvas.height = longEdge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.clearRect(0, 0, longEdge, longEdge);
  ctx.drawImage(img, Math.floor((longEdge - dw) / 2), Math.floor((longEdge - dh) / 2), dw, dh);
  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image for resize'));
    img.src = src;
  });
}
