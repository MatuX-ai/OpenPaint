/**
 * Asset library composable (W9 + W10).
 *
 * Wraps `assetApi` (and `aiApi` for SVG→PNG conversion) with:
 *  - in-memory cache keyed by `${prefix}/${name}` so repeated views don't refetch
 *  - debounced search to avoid hammering the backend on every keystroke
 *  - reactive refs for use in Vue templates without re-creating each call
 *  - brushes / palettes / gradients preloaded once on first call (W10)
 */

import { computed, ref, watch, type Ref } from 'vue';
import { assetApi } from '@/api';
import type {
  BrushAsset,
  BrushPreset,
  GradientPreset,
  IconMeta,
  Palette,
  RenderIconResult,
} from '@/types/asset';

/** Cached SVG body + metadata. */
interface CachedIcon {
  svg: string;
  width: number;
  height: number;
  fromCache: boolean;
}

/** 来源标识：用于 ToolCallCard 区分是 agent 还是用户触发。 */
export type AssetAttribution = 'agent' | 'user';

export interface UseAssetsApi {
  // ---- search ----
  searchQuery: Ref<string>;
  searchStyle: Ref<string | null>;
  searchCategory: Ref<string | null>;
  searchResults: Ref<IconMeta[]>;
  searchTotal: Ref<number>;
  searchHasMore: Ref<boolean>;
  isSearching: Ref<boolean>;
  searchError: Ref<string | null>;
  /** Run a search immediately (called by debounce watcher and on user submit). */
  runSearch: () => Promise<void>;
  clearSearch: () => void;

  // ---- preview ----
  previewedIcon: Ref<IconMeta | null>;
  isRendering: Ref<boolean>;
  renderError: Ref<string | null>;
  previewSvg: Ref<string | null>;
  openPreview: (icon: IconMeta) => Promise<void>;
  closePreview: () => void;

  // ---- canvas import ----
  isImporting: Ref<boolean>;
  importError: Ref<string | null>;
  importIconToCanvas: (
    icon: IconMeta,
    opts?: { color?: string; size?: number; attribution?: AssetAttribution },
  ) => Promise<string>;

  // ---- brushes (W10) ----
  brushes: Ref<BrushPreset[]>;
  brushAssets: Ref<BrushAsset[]>;
  brushLoading: Ref<boolean>;
  brushError: Ref<string | null>;
  activeBrushId: Ref<string>;
  setActiveBrush: (id: string) => void;
  loadBrushes: () => Promise<void>;

  // ---- palettes (W10) ----
  palettes: Ref<Palette[]>;
  palettesLoading: Ref<boolean>;
  palettesError: Ref<string | null>;
  loadPalettes: () => Promise<void>;
  applyPalette: (
    paletteId: string,
    mode: 'swatch_bar' | 'replace_color',
    opts?: { layerId?: string; replaceHex?: string },
  ) => Promise<void>;

  // ---- gradients (W10) ----
  gradients: Ref<GradientPreset[]>;
  gradientsLoading: Ref<boolean>;
  gradientsError: Ref<string | null>;
  loadGradients: () => Promise<void>;
  applyGradient: (
    gradientId: string,
    opts?: { layerId?: string; opacity?: number },
  ) => Promise<void>;

  // ---- helpers ----
  /** Format display name for an icon, e.g. `lucide/search`. */
  formatIconName: (icon: IconMeta) => string;

  // ---- online state (W11-B3) ----
  /** 是否在线（HEAD 探测 + 阈值 30s）。 */
  isOnline: Ref<boolean>;
  /** 最近一次探测时间戳（ISO 8601 字符串）。 */
  lastOnlineCheckAt: Ref<string>;
  /** 最近一次离线错误信息。 */
  lastOnlineError: Ref<string>;
  /** 手动触发一次 HEAD 探测（刷新“在线 / 离线”状态）。 */
  refreshOnlineState: () => Promise<void>;

  // ---- telemetry (W11-B3) ----
  /**
   * 上报一次资产事件（brush_switch / apply_palette / apply_gradient / ...）。
   * 内部调用 IPC `record_asset_event`，不入 telemetry.json 也会写入。
   */
  recordAssetEvent: (event: string) => Promise<void>;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_SIZE = 64;
const DEFAULT_COLOR = 'currentColor';
const DEFAULT_BRUSH_ID = 'round-hard';

export function useAssets(): UseAssetsApi {
  // ---- search state ----
  const searchQuery = ref('');
  const searchStyle = ref<string | null>(null);
  const searchCategory = ref<string | null>(null);
  const searchResults = ref<IconMeta[]>([]);
  const searchTotal = ref(0);
  const searchHasMore = ref(false);
  const isSearching = ref(false);
  const searchError = ref<string | null>(null);

  let lastSearchToken = 0;

  async function runSearch(): Promise<void> {
    const q = searchQuery.value.trim();
    if (!q && !searchStyle.value && !searchCategory.value) {
      // 空查询 + 无过滤 → 不主动搜索（避免空结果闪屏）
      searchResults.value = [];
      searchTotal.value = 0;
      searchHasMore.value = false;
      return;
    }
    const token = ++lastSearchToken;
    isSearching.value = true;
    searchError.value = null;
    try {
      const res = await assetApi.searchIcons({
        query: q,
        style: searchStyle.value ?? undefined,
        category: searchCategory.value ?? undefined,
        limit: DEFAULT_LIMIT,
      });
      if (token !== lastSearchToken) return; // stale
      searchResults.value = res.icons;
      searchTotal.value = res.total;
      searchHasMore.value = res.hasMore;
    } catch (err) {
      if (token !== lastSearchToken) return;
      searchError.value = err instanceof Error ? err.message : String(err);
      searchResults.value = [];
      searchTotal.value = 0;
      searchHasMore.value = false;
    } finally {
      if (token === lastSearchToken) isSearching.value = false;
    }
  }

  function clearSearch(): void {
    searchQuery.value = '';
    searchStyle.value = null;
    searchCategory.value = null;
    searchResults.value = [];
    searchTotal.value = 0;
    searchHasMore.value = false;
    searchError.value = null;
  }

  // 500ms 防抖：用户停下手 0.5s 后才触发搜索。
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  watch(
    [searchQuery, searchStyle, searchCategory],
    () => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        void runSearch();
      }, 500);
    },
  );

  // ---- preview state ----
  const previewedIcon = ref<IconMeta | null>(null);
  const isRendering = ref(false);
  const renderError = ref<string | null>(null);
  const previewSvg = ref<string | null>(null);

  const renderCache = new Map<string, CachedIcon>();

  async function openPreview(icon: IconMeta): Promise<void> {
    previewedIcon.value = icon;
    renderError.value = null;
    const cacheKey = `${icon.prefix}/${icon.name}/${DEFAULT_COLOR}/${DEFAULT_SIZE}`;
    const cached = renderCache.get(cacheKey);
    if (cached) {
      previewSvg.value = cached.svg;
      return;
    }
    isRendering.value = true;
    try {
      const res: RenderIconResult = await assetApi.renderIconSvg({
        prefix: icon.prefix,
        name: icon.name,
        color: DEFAULT_COLOR,
        size: DEFAULT_SIZE,
      });
      renderCache.set(cacheKey, {
        svg: res.svg,
        width: res.width,
        height: res.height,
        fromCache: res.fromCache,
      });
      if (previewedIcon.value?.prefix === icon.prefix && previewedIcon.value?.name === icon.name) {
        previewSvg.value = res.svg;
      }
    } catch (err) {
      renderError.value = err instanceof Error ? err.message : String(err);
      previewSvg.value = null;
    } finally {
      isRendering.value = false;
    }
  }

  function closePreview(): void {
    previewedIcon.value = null;
    previewSvg.value = null;
    renderError.value = null;
  }

  // ---- canvas import ----
  const isImporting = ref(false);
  const importError = ref<string | null>(null);

  async function importIconToCanvas(
    icon: IconMeta,
    opts?: { color?: string; size?: number; attribution?: AssetAttribution },
  ): Promise<string> {
    isImporting.value = true;
    importError.value = null;
    try {
      const result = await assetApi.importIconToCanvas({
        prefix: icon.prefix,
        name: icon.name,
        color: opts?.color ?? DEFAULT_COLOR,
        size: opts?.size ?? DEFAULT_SIZE,
      });
      // attribution === 'agent' 时在 chat 流上挂 ToolCallCard（仅占位）
      if (opts?.attribution === 'agent') {
        try {
          const chat = (window as unknown as {
            __openpaint_chat?: {
              recordToolCall?: (toolName: string, args: Record<string, unknown>, result: string) => void;
            };
          }).__openpaint_chat;
          chat?.recordToolCall?.(
            'import_icon',
            { prefix: icon.prefix, name: icon.name },
            `已导入 ${icon.prefix}/${icon.name}`,
          );
        } catch {
          // 静默失败，避免阻塞 UI
        }
      }
      return result.layerId;
    } catch (err) {
      importError.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isImporting.value = false;
    }
  }

  // ---- brushes (W10) ----
  const brushes = ref<BrushPreset[]>([]);
  const brushAssets = ref<BrushAsset[]>([]);
  const brushLoading = ref(false);
  const brushError = ref<string | null>(null);
  const activeBrushId = ref(DEFAULT_BRUSH_ID);

  function setActiveBrush(id: string): void {
    activeBrushId.value = id;
  }

  let brushesLoaded = false;
  async function loadBrushes(): Promise<void> {
    if (brushesLoaded || brushLoading.value) return;
    brushLoading.value = true;
    brushError.value = null;
    try {
      const [presets, assets] = await Promise.all([
        assetApi.listBrushes(),
        assetApi.listBrushAssets(),
      ]);
      brushes.value = presets;
      brushAssets.value = assets;
      brushesLoaded = true;
    } catch (err) {
      brushError.value = err instanceof Error ? err.message : String(err);
    } finally {
      brushLoading.value = false;
    }
  }

  // ---- palettes (W10) ----
  const palettes = ref<Palette[]>([]);
  const palettesLoading = ref(false);
  const palettesError = ref<string | null>(null);

  let palettesLoaded = false;
  async function loadPalettes(): Promise<void> {
    if (palettesLoaded || palettesLoading.value) return;
    palettesLoading.value = true;
    palettesError.value = null;
    try {
      palettes.value = await assetApi.listPalettes();
      palettesLoaded = true;
    } catch (err) {
      palettesError.value = err instanceof Error ? err.message : String(err);
    } finally {
      palettesLoading.value = false;
    }
  }

  async function applyPalette(
    paletteId: string,
    mode: 'swatch_bar' | 'replace_color',
    opts?: { layerId?: string; replaceHex?: string },
  ): Promise<void> {
    await assetApi.applyPalette({
      paletteId,
      mode,
      layerId: opts?.layerId,
      replaceHex: opts?.replaceHex,
    });
  }

  // ---- gradients (W10) ----
  const gradients = ref<GradientPreset[]>([]);
  const gradientsLoading = ref(false);
  const gradientsError = ref<string | null>(null);

  let gradientsLoaded = false;
  async function loadGradients(): Promise<void> {
    if (gradientsLoaded || gradientsLoading.value) return;
    gradientsLoading.value = true;
    gradientsError.value = null;
    try {
      gradients.value = await assetApi.listGradients();
      gradientsLoaded = true;
    } catch (err) {
      gradientsError.value = err instanceof Error ? err.message : String(err);
    } finally {
      gradientsLoading.value = false;
    }
  }

  async function applyGradient(
    gradientId: string,
    opts?: { layerId?: string; opacity?: number },
  ): Promise<void> {
    await assetApi.applyGradient({
      gradientId,
      layerId: opts?.layerId,
      opacity: opts?.opacity,
    });
  }

  // ---- helpers ----
  function formatIconName(icon: IconMeta): string {
    return `${icon.prefix}/${icon.name}`;
  }

  // ---- online state (W11-B3) ----
  const isOnline = ref(true);
  const lastOnlineCheckAt = ref('');
  const lastOnlineError = ref('');

  async function refreshOnlineState(): Promise<void> {
    try {
      const state = await assetApi.getAssetState();
      isOnline.value = !!state.online;
      lastOnlineCheckAt.value = state.lastCheckAt ?? '';
      lastOnlineError.value = state.lastError ?? '';
    } catch (e) {
      // 探测失败时不反转 UI 状态：保持上次缓存值。
      console.warn('[useAssets] refreshOnlineState failed:', e);
    }
  }

  // 首次创建时拉一次 online state
  void refreshOnlineState();

  // ---- telemetry (W11-B3) ----
  async function recordAssetEvent(event: string): Promise<void> {
    try {
      const { invoke } = await import('@/api/runtime');
      await invoke('record_asset_event', { event });
    } catch (e) {
      // 遥测失败不影响主路径
      console.debug('[useAssets] recordAssetEvent failed:', e);
    }
  }

  return {
    searchQuery,
    searchStyle,
    searchCategory,
    searchResults,
    searchTotal,
    searchHasMore,
    isSearching,
    searchError,
    runSearch,
    clearSearch,

    previewedIcon,
    isRendering,
    renderError,
    previewSvg,
    openPreview,
    closePreview,

    isImporting,
    importError,
    importIconToCanvas,

    brushes,
    brushAssets,
    brushLoading,
    brushError,
    activeBrushId,
    setActiveBrush,
    loadBrushes,

    palettes,
    palettesLoading,
    palettesError,
    loadPalettes,
    applyPalette,

    gradients,
    gradientsLoading,
    gradientsError,
    loadGradients,
    applyGradient,

    formatIconName,

    isOnline,
    lastOnlineCheckAt,
    lastOnlineError,
    refreshOnlineState,
    recordAssetEvent,
  };
}

/**
 * Reactive helper: group an icon array by their `prefix` field.
 * Used by `IconPanel` to render grouped result sections.
 */
export function useGroupedIcons(icons: Ref<IconMeta[]>): Ref<Array<{ prefix: string; items: IconMeta[] }>> {
  return computed(() => {
    const map = new Map<string, IconMeta[]>();
    for (const icon of icons.value) {
      const list = map.get(icon.prefix) ?? [];
      list.push(icon);
      map.set(icon.prefix, list);
    }
    return Array.from(map.entries()).map(([prefix, items]) => ({ prefix, items }));
  });
}