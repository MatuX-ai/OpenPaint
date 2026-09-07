/**
 * Pixel eraser + paint bucket on OpenPencil IMAGE-fill rectangles.
 *
 * When activeTool is eraser/bucket, capture-phase pointer handlers take over
 * the canvas so OpenPencil's SELECT tool does not move nodes.
 */

import { onBeforeUnmount, watch, type Ref } from 'vue';
import type { Editor } from '@open-pencil/core/editor';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { isRasterTool } from '@/tools/editorTools';
import {
  collectVectorIdsForPixelEdit,
  rasterizeNodeIds,
} from '@composables/rasterizeNodes';
import { requestRasterizeConfirm } from '@composables/useRasterizeConfirm';
import {
  createTransparentPng,
  decodeImageBytes,
  encodeImageDataPng,
  eraseCircle,
  floodFill,
  hexToRgba,
  makeStretchImageFill,
  mapNodeUvToImagePixel,
  replaceImageFillHash,
  type ImageScaleMode,
  type ImageTransform2x3,
} from '@utils/rasterPixels';

interface ImageFill {
  type: string;
  imageHash?: string;
  imageScaleMode?: ImageScaleMode;
  imageTransform?: ImageTransform2x3;
  color?: unknown;
  opacity?: number;
  visible?: boolean;
}

interface RasterTarget {
  nodeId: string;
  imageHash: string;
  /** Node rect in canvas space (unrotated). */
  x: number;
  y: number;
  width: number;
  height: number;
  scaleMode: ImageScaleMode;
  imageTransform?: ImageTransform2x3 | null;
}

function getImageFill(node: { fills?: ImageFill[] }): ImageFill | null {
  const fills = node.fills ?? [];
  for (const f of fills) {
    if (f?.type === 'IMAGE' && f.imageHash) return f;
  }
  return null;
}

function toRasterTarget(
  node: { id: string; x: number; y: number; width: number; height: number; rotation?: number },
  fill: ImageFill,
  abs: { x: number; y: number },
): RasterTarget | null {
  if (!fill.imageHash || (node.rotation ?? 0) !== 0) return null;
  return {
    nodeId: node.id,
    imageHash: fill.imageHash,
    x: abs.x,
    y: abs.y,
    width: node.width,
    height: node.height,
    scaleMode: fill.imageScaleMode ?? 'FILL',
    imageTransform: fill.imageTransform ?? null,
  };
}

export function useRasterPixelTools(
  canvasRef: Ref<HTMLCanvasElement | null>,
  editor: Editor,
): { ensureRasterLayer: () => Promise<RasterTarget | null> } {
  const store = useCanvasStore();
  const toast = useToast();

  let strokeActive = false;
  let working: {
    target: RasterTarget;
    image: ImageData;
    dirty: boolean;
    originalFills: ImageFill[];
    previewHash: string | null;
  } | null = null;

  let previewRaf = 0;
  let previewPending = false;
  let previewBusy = false;
  let previewGen = 0;

  function canvasPointFromEvent(event: PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return editor.screenToCanvas(sx, sy);
  }

  function toPixel(target: RasterTarget, cx: number, cy: number, imgW: number, imgH: number) {
    const u = (cx - target.x) / Math.max(1e-6, target.width);
    const v = (cy - target.y) / Math.max(1e-6, target.height);
    return mapNodeUvToImagePixel(
      u,
      v,
      imgW,
      imgH,
      target.width,
      target.height,
      target.scaleMode,
      target.imageTransform,
    );
  }

  function findImageTargetAt(cx: number, cy: number): RasterTarget | null {
    const hit = editor.hitTestAtPoint(cx, cy, true);
    if (hit) {
      const fill = getImageFill(hit as { fills?: ImageFill[] });
      if (fill) {
        const abs = editor.graph.getAbsolutePosition?.(hit.id) ?? { x: hit.x, y: hit.y };
        const t = toRasterTarget(hit, fill, abs);
        if (t) return t;
      }
    }

    for (const n of editor.getSelectedNodes()) {
      const fill = getImageFill(n as { fills?: ImageFill[] });
      if (fill) {
        const abs = editor.graph.getAbsolutePosition?.(n.id) ?? { x: n.x, y: n.y };
        const t = toRasterTarget(n, fill, abs);
        if (t) return t;
      }
    }
    return null;
  }

  async function ensureRasterLayer(): Promise<RasterTarget | null> {
    for (const n of editor.getSelectedNodes()) {
      const fill = getImageFill(n as { fills?: ImageFill[] });
      if (fill) {
        const abs = editor.graph.getAbsolutePosition?.(n.id) ?? { x: n.x, y: n.y };
        const t = toRasterTarget(n, fill, abs);
        if (t) return t;
      }
    }

    const vw = canvasRef.value?.clientWidth ?? 800;
    const vh = canvasRef.value?.clientHeight ?? 600;
    const w = Math.min(1280, Math.max(512, Math.round(vw)));
    const h = Math.min(1280, Math.max(512, Math.round(vh)));
    const png = await createTransparentPng(w, h);
    const hash = editor.storeImage(png);
    const center = editor.screenToCanvas(vw / 2, vh / 2);
    const x = center.x - w / 2;
    const y = center.y - h / 2;
    const id = editor.createShape('RECTANGLE', x, y, w, h, undefined, '像素图层');
    const fill = makeStretchImageFill(hash);
    editor.updateNodeWithUndo(
      id,
      {
        name: '像素图层',
        fills: [fill],
        strokes: [],
      } as never,
      '新建像素图层',
    );
    editor.select([id]);
    toast.info('已新建透明像素图层，可开始擦除 / 填充');
    const abs = editor.graph.getAbsolutePosition?.(id) ?? { x, y };
    return {
      nodeId: id,
      imageHash: hash,
      x: abs.x,
      y: abs.y,
      width: w,
      height: h,
      scaleMode: 'CROP',
      imageTransform: fill.imageTransform,
    };
  }

  const imageCache = new Map<string, ImageData>();

  async function loadWorking(target: RasterTarget): Promise<boolean> {
    let image = imageCache.get(target.imageHash);
    if (!image) {
      const bytes = editor.getImage(target.imageHash);
      if (!bytes) {
        toast.error('找不到图层像素数据');
        return false;
      }
      image = await decodeImageBytes(bytes);
      imageCache.set(target.imageHash, image);
    }
    const prev = editor.getNode(target.nodeId);
    const originalFills = (prev?.fills ? [...prev.fills] : []) as ImageFill[];
    const clone = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    working = {
      target,
      image: clone,
      dirty: false,
      originalFills,
      previewHash: null,
    };
    return true;
  }

  function cancelPreviewRaf(): void {
    if (previewRaf) {
      cancelAnimationFrame(previewRaf);
      previewRaf = 0;
    }
    previewPending = false;
    previewGen += 1;
  }

  async function flushPreview(): Promise<void> {
    if (!working?.dirty || previewBusy) return;
    previewBusy = true;
    const gen = ++previewGen;
    const snapshot = working;
    try {
      const { target, image, originalFills } = snapshot;
      // Copy pixels at schedule time so later erase strokes don't race the encode.
      const copy = new ImageData(
        new Uint8ClampedArray(image.data),
        image.width,
        image.height,
      );
      const png = await encodeImageDataPng(copy);
      if (!working || working !== snapshot || gen !== previewGen) return;
      const hash = editor.storeImage(png);
      imageCache.set(hash, copy);
      const nextFills = replaceImageFillHash(
        originalFills as Array<Record<string, unknown>>,
        target.imageHash,
        hash,
        true,
      );
      editor.updateNode(target.nodeId, { fills: nextFills } as never);
      editor.requestRepaint();
      working.previewHash = hash;
    } finally {
      previewBusy = false;
      // Another stroke may have marked dirty while we were encoding.
      if (working?.dirty && gen === previewGen) {
        schedulePreview();
      }
    }
  }

  function schedulePreview(): void {
    if (previewPending) return;
    previewPending = true;
    previewRaf = requestAnimationFrame(() => {
      previewRaf = 0;
      previewPending = false;
      void flushPreview();
    });
  }

  async function commitWorking(label: string): Promise<void> {
    cancelPreviewRaf();
    if (!working?.dirty) {
      working = null;
      return;
    }
    const { target, image, originalFills, previewHash } = working;
    // Restore pre-stroke fills so undo baseline is the original, not a preview.
    if (previewHash) {
      editor.updateNode(target.nodeId, { fills: originalFills } as never);
    }
    const png = await encodeImageDataPng(image);
    const newHash = editor.storeImage(png);
    imageCache.set(newHash, image);
    imageCache.delete(target.imageHash);
    if (previewHash) imageCache.delete(previewHash);
    const nextFills = replaceImageFillHash(
      originalFills as Array<Record<string, unknown>>,
      target.imageHash,
      newHash,
      true,
    );
    editor.updateNodeWithUndo(target.nodeId, { fills: nextFills } as never, label);
    editor.requestRepaint();
    working = null;
  }

  async function resolveRasterTarget(
    cx: number,
    cy: number,
  ): Promise<{ target: RasterTarget; createdBlank: boolean } | null> {
    const existing = findImageTargetAt(cx, cy);
    if (existing) return { target: existing, createdBlank: false };

    const hit = editor.hitTestAtPoint(cx, cy, true);
    // PAGE / empty container under the cursor counts as blank: never rasterize
    // the current selection just because a vector is selected.
    const hitIsDrawable =
      hit && hit.type !== 'PAGE' && hit.type !== 'SECTION' && hit.type !== 'COMPONENT_SET';

    // Only rasterize when the click actually hits a vector. Blank clicks always
    // create a new pixel layer (even if vectors are selected).
    if (hitIsDrawable) {
      const vectorIds = collectVectorIdsForPixelEdit(editor, hit.id);
      if (vectorIds.length > 0) {
        const primary = editor.getNode(vectorIds[0]!);
        const label =
          vectorIds.length === 1
            ? String(primary?.name || primary?.type || '对象')
            : `${vectorIds.length} 个对象`;
        const accepted = await requestRasterizeConfirm({
          nodeIds: vectorIds,
          label,
        });
        if (!accepted) {
          toast.info('已取消。可在空白处点击新建透明像素层，或先栅格化矢量对象。');
          return null;
        }
        try {
          const layer = await rasterizeNodeIds(editor, vectorIds);
          if (!layer) return null;
          toast.success('已转换为像素图，可继续擦除 / 填充');
          return {
            target: {
              ...layer,
              scaleMode: 'CROP',
              imageTransform: makeStretchImageFill(layer.imageHash).imageTransform,
            },
            createdBlank: false,
          };
        } catch (e) {
          toast.error(`栅格化失败：${String((e as Error).message ?? e)}`);
          return null;
        }
      }
      toast.warn('请点在可编辑的像素图层上，或在空白处新建');
      return null;
    }

    const layer = await ensureRasterLayer();
    return layer ? { target: layer, createdBlank: true } : null;
  }

  async function onPointerDown(event: PointerEvent): Promise<void> {
    if (!isRasterTool(store.activeTool)) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const pt = canvasPointFromEvent(event);
    if (!pt) return;

    const resolved = await resolveRasterTarget(pt.x, pt.y);
    if (!resolved) return;
    const { target, createdBlank } = resolved;

    const ok = await loadWorking(target);
    if (!ok || !working) return;

    const { image } = working;
    const { px, py, inside } = toPixel(target, pt.x, pt.y, image.width, image.height);
    if (!inside) {
      // Blank click already created a layer; don't nag — next stroke can paint on it.
      if (!createdBlank) toast.warn('请在像素图层上操作');
      working = null;
      return;
    }

    if (store.activeTool === 'bucket') {
      const fill = hexToRgba(store.brushColor, 255);
      const n = floodFill(
        image.data,
        image.width,
        image.height,
        px,
        py,
        fill,
        store.bucketTolerance ?? 32,
      );
      if (n > 0) {
        working.dirty = true;
        await commitWorking('油漆桶填充');
        toast.success(`已填充 ${n} 像素`);
      } else {
        working = null;
        toast.info('没有可填充的区域（颜色已相同或容差过小）');
      }
      return;
    }

    const radius = Math.max(1, store.brushRadius);
    const scale = image.width / Math.max(1e-6, target.width);
    eraseCircle(image.data, image.width, image.height, px + 0.5, py + 0.5, radius * scale);
    working.dirty = true;
    schedulePreview();

    if (event.buttons === 0) {
      await commitWorking('橡皮擦');
      return;
    }

    strokeActive = true;
    try {
      canvasRef.value?.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!strokeActive || !working || store.activeTool !== 'eraser') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pt = canvasPointFromEvent(event);
    if (!pt) return;
    const { target, image } = working;
    const { px, py, inside } = toPixel(target, pt.x, pt.y, image.width, image.height);
    if (!inside) return;
    const radius = Math.max(1, store.brushRadius);
    const scale = image.width / Math.max(1e-6, target.width);
    eraseCircle(image.data, image.width, image.height, px + 0.5, py + 0.5, radius * scale);
    working.dirty = true;
    schedulePreview();
  }

  async function onPointerUp(event: PointerEvent): Promise<void> {
    if (!strokeActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    strokeActive = false;
    try {
      canvasRef.value?.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    await commitWorking('橡皮擦');
  }

  function attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', onPointerDown as EventListener, true);
    canvas.addEventListener('pointermove', onPointerMove as EventListener, true);
    canvas.addEventListener('pointerup', onPointerUp as EventListener, true);
    canvas.addEventListener('pointercancel', onPointerUp as EventListener, true);
  }

  function detach(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('pointerdown', onPointerDown as EventListener, true);
    canvas.removeEventListener('pointermove', onPointerMove as EventListener, true);
    canvas.removeEventListener('pointerup', onPointerUp as EventListener, true);
    canvas.removeEventListener('pointercancel', onPointerUp as EventListener, true);
  }

  let attached: HTMLCanvasElement | null = null;
  watch(
    canvasRef,
    (el) => {
      if (attached) detach(attached);
      attached = el;
      if (el) attach(el);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    cancelPreviewRaf();
    if (attached) detach(attached);
    attached = null;
  });

  return { ensureRasterLayer };
}
