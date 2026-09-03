/**
 * useFileActions — 高层"文件 IO"动作（保存到图库 / 打开 / 导出 / 批量导出）。
 *
 * 封装 canvasApi / galleryApi 的调用，串接 useDocumentState / useToast，
 * 让上层（菜单、快捷键、TopBar 按钮）只关心"做什么"，不关心实现。
 *
 * 关联需求：docs/ux-onboarding-requirements.md §3.3、US-3 / US-4 / US-5 / US-9 / US-6。
 */

import { canvasApi, galleryApi } from '@api/index';
import { useDocumentState } from './useDocumentState';
import { useToast } from './useToast';
import { useCanvasStore } from '@stores/canvasStore';
import { isTauri, WebPreviewUnsupportedError } from '@api/runtime';

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('FileReader did not return a string'));
    };
    reader.readAsDataURL(file);
  });
}

export function useFileActions() {
  const doc = useDocumentState();
  const toast = useToast();
  const canvasStore = useCanvasStore();

  async function importFromDataUrl(dataUrl: string, extHint?: string): Promise<boolean> {
    if (!isTauri()) {
      toast.warn('导入图片仅在桌面版可用（web preview 默认不落画布）');
      return false;
    }
    try {
      await canvasApi.pasteImage(dataUrl);
      doc.markDirty();
      toast.success(`已导入到画布${extHint ? ` (${extHint})` : ''}`);
      return true;
    } catch (e) {
      toast.error(`导入失败：${String((e as Error).message ?? e)}`);
      return false;
    }
  }

  /**
   * 从拖拽事件 / input.files 拿到 File 列表，转 dataURL 后逐个 paste 到画布。
   * 非图像文件被拒绝；超 50MB 的文件拒绝（避免 webview 内存炸）。
   */
  async function importFromFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) return;
    let imported = 0;
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
      try {
        const dataUrl = await readFileAsDataUrl(f);
        const ok = await importFromDataUrl(dataUrl, ext);
        if (ok) imported++;
      } catch (e) {
        toast.error(`${f.name}：读取失败（${String((e as Error).message ?? e)}）`);
        rejected++;
      }
    }
    if (imported > 0 && rejected > 0) {
      toast.info(`已导入 ${imported} 张，跳过 ${rejected} 个`);
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
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_OPEN_EXT.includes(ext)) {
        toast.error(`暂不支持 .${ext} 格式，可转 PNG / JPG / WebP / SVG 后再试`);
        return;
      }
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      // 拼 base64
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'svg'
              ? 'image/svg+xml'
              : 'image/png';
      const dataUrl = `data:${mime};base64,${btoa(bin)}`;
      await canvasApi.pasteImage(dataUrl);
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
      const png = await canvasApi.renderCanvasPng();
      if (!png) {
        toast.error('画布为空或渲染失败');
        doc.markDirty();
        return false;
      }
      const res = await galleryApi.save({
        imageData: png,
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
      const res = await canvasApi.renderCanvasImage({
        format,
        quality,
        targetLongEdge: 0,
      });
      const dataUrl = `data:${res.mime};base64,${res.bytesBase64}`;
      await tauriWriteFile(path, dataUrl);
      doc.markExported();
      toast.success(`已导出 ${res.width}×${res.height} (${format.toUpperCase()})`);
    } catch (e) {
      toast.error(`导出失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function batchExport(
    sizes: number[],
    saveToGallery: boolean,
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
      dirPath = await openDir({ directory: true, multiple: false });
    } catch {
      dirPath = null;
    }
    if (!dirPath) return;

    doc.markSaving();
    let success = 0;
    try {
      for (let i = 0; i < sizes.length; i++) {
        const s = sizes[i];
        const filePath = `${dirPath.replace(/[\\/]+$/, '')}/icon-${s}x${s}.png`;
        try {
          const res = await canvasApi.renderCanvasImage({
            format: 'png',
            quality: 100,
            targetLongEdge: s,
          });
          const dataUrl = `data:${res.mime};base64,${res.bytesBase64}`;
          await tauriWriteFile(filePath, dataUrl);
          success++;
          if (saveToGallery) {
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
    handleLayers: 'crop' | 'discard' | 'cancel';
  }): Promise<void> {
    if (args.handleLayers === 'cancel') return;
    if (!isTauri()) {
      toast.warn('新建画布仅在桌面版可用（web 预览默认 1280×720）');
      // 在 web preview 里不报错，只是更新 store
      canvasStore.canvasWidth = args.width;
      canvasStore.canvasHeight = args.height;
      canvasStore.resetView();
      doc.resetForNew();
      return;
    }
    try {
      const w = args.unit === 'mm' ? Math.round((args.width / 25.4) * args.dpi) : args.width;
      const h = args.unit === 'mm' ? Math.round((args.height / 25.4) * args.dpi) : args.height;
      await canvasApi.resizeCanvas(w, h);
      canvasStore.canvasWidth = w;
      canvasStore.canvasHeight = h;
      canvasStore.resetView();
      doc.resetForNew();
      toast.success(`已创建 ${w}×${h} 画布`);
    } catch (e) {
      toast.error(`新建画布失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function undo(): Promise<void> {
    try {
      await canvasApi.undo();
      const summary = await canvasApi.getCanvasSummary();
      canvasStore.canUndo = summary.canUndo;
      canvasStore.canRedo = summary.canRedo;
      doc.markDirty();
    } catch (e) {
      toast.error(`撤销失败：${String((e as Error).message ?? e)}`);
    }
  }

  async function redo(): Promise<void> {
    try {
      await canvasApi.redo();
      const summary = await canvasApi.getCanvasSummary();
      canvasStore.canUndo = summary.canUndo;
      canvasStore.canRedo = summary.canRedo;
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
