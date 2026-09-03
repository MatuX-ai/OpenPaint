/**
 * Tauri IPC adapter layer.
 *
 * Each module wraps a set of related backend commands. The Rust side
 * uses snake_case (see `src-tauri/src/gallery/mod.rs` and `tools/canvas_commands.rs`);
 * we either:
 *   1. Use snake_case keys at the call site for structured args
 *      (so JSON deserialization matches Rust structs), and
 *   2. Convert wire-format responses to camelCase in helpers.
 */

import { invoke } from './runtime';
import type {
  GalleryItem,
  GalleryItemWire,
  GalleryImageResponse,
  GallerySearchParamsWire,
  GallerySearchResult,
} from '@/types/gallery';
import type { CanvasSummary, Layer, LayerMetaWire, StrokeArgs } from '@/types/canvas';
import type {
  ApplyGradientArgs,
  ApplyGradientResult,
  ApplyGradientResultWire,
  ApplyPaletteArgs,
  ApplyPaletteResult,
  ApplyPaletteResultWire,
  AssetOnlineState,
  AssetsConfig,
  AssetsConfigWire,
  BrushAsset,
  BrushAssetWire,
  BrushPreset,
  BrushPresetWire,
  CdnMirror,
  GradientPreset,
  GradientPresetWire,
  GradientType,
  Palette,
  PaletteWire,
  RenderIconResult,
  RenderIconResultWire,
  SearchIconsResult,
  SearchIconsResultWire,
} from '@/types/asset';

// ----------------------------------------------------------------
// Adapters
// ----------------------------------------------------------------

function layerFromWire(wire: LayerMetaWire): Layer {
  return {
    id: wire.id,
    name: wire.name,
    opacity: wire.opacity,
    blendMode: (wire.blend_mode as Layer['blendMode']) ?? 'normal',
    visible: wire.visible,
    locked: wire.locked,
    width: wire.width,
    height: wire.height,
    offsetX: wire.offset_x,
    offsetY: wire.offset_y,
    isActive: wire.is_active,
  };
}

function galleryItemFromWire(wire: GalleryItemWire): GalleryItem {
  return {
    id: wire.id,
    groupId: wire.group_id,
    thumbnailPath: wire.thumbnail_path,
    fullSizePath: wire.full_size_path,
    width: wire.width,
    height: wire.height,
    prompt: wire.prompt,
    model: wire.model,
    tags: wire.tags,
    createdAt: wire.created_at,
    source: (wire.source as GalleryItem['source']) ?? 'imported',
  };
}

function gallerySearchResultFromWire(wire: {
  items: GalleryItemWire[];
  total: number;
}): GallerySearchResult {
  return {
    items: wire.items.map(galleryItemFromWire),
    total: wire.total,
  };
}

function galleryImageResponseFromWire(wire: GalleryImageResponse): {
  item: GalleryItem;
  png?: string;
} {
  return {
    item: galleryItemFromWire(wire.item),
    png: wire.png_base64,
  };
}

// ----------------------------------------------------------------
// App / debug commands
// ----------------------------------------------------------------

export interface AppInfo {
  name: string;
  version: string;
  stage: string;
}

export interface EchoResponse {
  received: string;
  length: number;
  timestamp: number;
}

export const appApi = {
  getAppInfo: (): Promise<AppInfo> => invoke('get_app_info'),
  getAppVersion: (): Promise<string> => invoke('get_app_version'),
  helloWorld: (): Promise<string> => invoke('hello_world'),
  echo: (message: string): Promise<EchoResponse> => invoke('echo', { payload: { message } }),
};

// ----------------------------------------------------------------
// Canvas commands (W2-W3)
// ----------------------------------------------------------------

/** Wire-compatible rectangle selection args. */
export interface RectSelectArgs {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const canvasApi = {
  /** Fetch canvas state summary (sizes, layers, undo/redo flags). */
  getCanvasSummary: (): Promise<CanvasSummary> => invoke('get_canvas_summary'),

  /** Render the entire canvas to Base64 PNG. */
  renderCanvasPng: (): Promise<string> => invoke('render_canvas_png'),

  /**
   * Render the canvas as a specific format (png/jpg/webp) with quality and target long edge.
   * Returns { format, mime, bytesBase64, width, height, byteSize }.
   */
  renderCanvasImage: (args: {
    format: 'png' | 'jpg' | 'jpeg' | 'webp';
    quality?: number;
    targetLongEdge?: number;
  }): Promise<{
    format: string;
    mime: string;
    bytesBase64: string;
    width: number;
    height: number;
    byteSize: number;
  }> =>
    invoke<{
      format: string;
      mime: string;
      bytesBase64: string;
      width: number;
      height: number;
      byteSize: number;
    }>('render_canvas_image', { args }),

  /** Get selection bounds (returns full canvas if no selection). */
  getSelectionBounds: (): Promise<RectSelectArgs> => invoke('get_selection_bounds'),

  /** Apply a brush stroke (color is hex). */
  applyBrushStroke: (args: StrokeArgs): Promise<void> => invoke('apply_brush_stroke', { args }),

  /** Paste a Base64 PNG into the active layer. Returns the layer UUID. */
  pasteImage: (imageData: string): Promise<string> => invoke('paste_image_to_layer', { imageData }),

  /** Apply an eraser stroke. */
  applyEraserStroke: (args: StrokeArgs): Promise<void> => invoke('apply_eraser_stroke', { args }),

  /** Set a rectangular selection. */
  setRectSelection: (args: RectSelectArgs): Promise<void> => invoke('set_rect_selection', { args }),

  /** Clear the current selection. */
  clearSelection: (): Promise<void> => invoke('clear_selection'),

  /** Move a layer by (dx, dy). */
  moveLayer: (layerId: string, dx: number, dy: number): Promise<void> =>
    invoke('move_layer', { args: { layer_id: layerId, dx, dy } }),

  /** Fill a layer with a hex color. */
  fillLayer: (layerId: string, color: string): Promise<void> =>
    invoke('fill_layer', { args: { layer_id: layerId, color } }),

  /** Rotate a layer around its center. Positive degrees = clockwise. */
  rotateLayer: (layerId: string, degrees: number): Promise<void> =>
    invoke('rotate_layer', { args: { layer_id: layerId, degrees } }),

  /** Rasterize and paste text into a layer. Returns the rasterized bitmap size. */
  addText: (args: {
    layerId: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    fontFamily?: string;
    fontWeight?: string;
  }): Promise<{ bitmapWidth: number; bitmapHeight: number }> =>
    invoke<{ bitmap_width: number; bitmap_height: number }>('add_text', {
      args: {
        layer_id: args.layerId,
        text: args.text,
        x: args.x,
        y: args.y,
        font_size: args.fontSize,
        color: args.color,
        font_family: args.fontFamily,
        font_weight: args.fontWeight,
      },
    }).then((r) => ({ bitmapWidth: r.bitmap_width, bitmapHeight: r.bitmap_height })),

  /** Paste an already-rasterized RGBA bitmap (base64) into a layer. */
  pasteTextBitmap: (args: {
    layerId: string;
    bitmapBase64: string;
    bitmapWidth: number;
    bitmapHeight: number;
    x: number;
    y: number;
  }): Promise<void> =>
    invoke('paste_text_bitmap', {
      args: {
        layer_id: args.layerId,
        bitmap_base64: args.bitmapBase64,
        bitmap_width: args.bitmapWidth,
        bitmap_height: args.bitmapHeight,
        x: args.x,
        y: args.y,
      },
    }),

  /** Toggle a layer's blend mode (normal/multiply/screen/overlay). */
  setLayerBlendMode: (
    layerId: string,
    mode: 'normal' | 'multiply' | 'screen' | 'overlay',
  ): Promise<void> => invoke('set_layer_blend_mode', { args: { layer_id: layerId, mode } }),

  /** Undo the last canvas operation. Returns true if anything happened. */
  undo: (): Promise<boolean> => invoke('undo_canvas'),

  /** Redo the previously undone operation. */
  redo: (): Promise<boolean> => invoke('redo_canvas'),

  /** Add a new layer above the active one. Returns the new layer's UUID. */
  addLayer: (name: string): Promise<string> => invoke('add_layer', { name }),

  /** Remove the currently active layer. Returns false if it was the last one. */
  removeActiveLayer: (): Promise<boolean> => invoke('remove_active_layer'),

  /** Set the active layer by id. */
  setActiveLayer: (layerId: string): Promise<void> => invoke('set_active_layer', { layerId }),

  /** Toggle a layer's visibility. */
  setLayerVisibility: (layerId: string, visible: boolean): Promise<void> =>
    invoke('set_layer_visibility', { layerId, visible }),

  /** Toggle a layer's locked state. */
  setLayerLocked: (layerId: string, locked: boolean): Promise<void> =>
    invoke('set_layer_locked', { args: { layer_id: layerId, locked } }),

  /** Set a layer's opacity (0.0 - 1.0; values are clamped on the backend). */
  setLayerOpacity: (layerId: string, opacity: number): Promise<void> =>
    invoke('set_layer_opacity', { args: { layer_id: layerId, opacity } }),

  /** Resize the canvas (existing layers are dropped to fit). */
  resizeCanvas: (width: number, height: number): Promise<void> =>
    invoke('resize_canvas', { width, height }),

  /** List available tool names. */
  listTools: (): Promise<string[]> => invoke('list_tools'),
};

// ----------------------------------------------------------------
// Atomic tools (M-08) — exposed to AI agent
// ----------------------------------------------------------------

export const canvasToolsApi = {
  /** Get selection as Base64 PNG (or full canvas if no selection). */
  getCanvasSelection: (): Promise<string> => invoke('get_canvas_selection'),

  /** Get selection bounds struct (Rust returns `{x,y,width,height}`). */
  getSelectionBounds: (): Promise<RectSelectArgs> => invoke('get_selection_bounds'),

  /** Paste a Base64 PNG into the active layer. Returns the layer UUID. */
  pasteImageToLayer: (imageData: string): Promise<string> =>
    invoke('paste_image_to_layer', { imageData }),

  /** Get layer info list (uses `get_canvas_summary` internally). */
  getLayerInfo: (): Promise<Layer[]> =>
    invoke<CanvasSummary>('get_canvas_summary').then((s) => s.layers.map(layerFromWire)),
};

// ----------------------------------------------------------------
// Gallery commands (W3)
// ----------------------------------------------------------------

export interface SaveToGalleryArgs {
  imageData: string;
  prompt?: string;
  model?: string;
  tags: string[];
  groupId?: string;
  source?: 'ai_generated' | 'imported';
}

export const galleryApi = {
  /** Save PNG to gallery. Returns the new record's id, width, height, thumbnail path. */
  save: (
    args: SaveToGalleryArgs,
  ): Promise<{ id: string; width: number; height: number; thumbnail_path: string }> =>
    invoke('save_to_gallery', {
      args: {
        image_data: args.imageData,
        prompt: args.prompt,
        model: args.model,
        tags: args.tags,
        group_id: args.groupId,
        source: args.source,
      },
    }),

  /** List the most recent gallery items. */
  list: (limit = 50, offset = 0): Promise<GalleryItem[]> =>
    invoke<GalleryItemWire[]>('list_gallery', { limit, offset }).then((items) =>
      items.map(galleryItemFromWire),
    ),

  /** Search gallery by text or tag. */
  search: (params: GallerySearchParamsWire): Promise<GallerySearchResult> =>
    invoke<{ items: GalleryItemWire[]; total: number }>('search_gallery', { params }).then(
      gallerySearchResultFromWire,
    ),

  /** Delete a gallery item by id. */
  delete: (recordId: string): Promise<boolean> =>
    invoke<boolean>('delete_gallery_item', { recordId }),

  /** Get full item info plus original PNG (if available). */
  getImage: (recordId: string): Promise<{ item: GalleryItem; png?: string }> =>
    invoke<GalleryImageResponse>('get_gallery_image', { recordId }).then(
      galleryImageResponseFromWire,
    ),
};

// ----------------------------------------------------------------
// AI agent (W4-W5)
// ----------------------------------------------------------------

export interface AgentChatResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status: 'pending' | 'running' | 'success' | 'error';
    result?: string;
    error?: string;
  }>;
}

export const agentApi = {
  /** Send a free-form chat message to the agent. */
  chat: (message: string): Promise<AgentChatResponse> =>
    invoke<AgentChatResponse>('agent_chat', { message }),

  /** Send a structured command. */
  sendCommand: (command: unknown): Promise<AgentChatResponse> =>
    invoke<AgentChatResponse>('agent_command', { command }),
};

// ----------------------------------------------------------------
// AI engine (image generation, SVG rendering)
// ----------------------------------------------------------------

export interface AiEngineResponse {
  svg: string;
  png: string;
  model: string;
}

export interface SvgRenderResponse {
  png_data: string;
  width: number;
  height: number;
}

export const aiApi = {
  /** Send image + prompt to the AI engine. Returns SVG + rendered PNG. */
  sendToAiEngine: (imageData: string, prompt: string): Promise<AiEngineResponse> =>
    invoke<AiEngineResponse>('send_to_ai_engine', { imageData, prompt }),

  /** Render arbitrary SVG to PNG at the requested size. */
  renderSvgToPng: (svg: string, width: number, height: number): Promise<SvgRenderResponse> =>
    invoke<SvgRenderResponse>('render_svg_to_png', { svg, width, height }),
};

// ----------------------------------------------------------------
// LLM provider commands (W6)
// ----------------------------------------------------------------

export type LlmProviderId =
  // W12 VDP-MOCK-01：模拟模式置顶。零配置、零费用、零外发。
  | 'mock'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'ollama'
  | 'qwen'
  | 'zhipu'
  | 'moonshot'
  | 'doubao'
  | 'minimax';

export interface LlmProviderInfo {
  id: LlmProviderId;
  label: string;
  default_endpoint: string;
  default_model: string;
  requires_api_key: boolean;
}

export interface LlmProviderConfig {
  provider: LlmProviderId;
  api_key: string | null;
  endpoint: string;
  model: string;
}

/** True when the current provider is configured and ready to use. */
export function isLlmConfigured(cfg: LlmProviderConfig | null): boolean {
  if (!cfg) return false;
  // Ollama 本地部署 + W12 VDP-MOCK-01 模拟模式均无需 API Key。
  if (cfg.provider === 'ollama' || cfg.provider === 'mock') return true;
  return !!cfg.api_key && cfg.api_key.trim().length > 0;
}

export const llmApi = {
  listProviders: (): Promise<LlmProviderInfo[]> => invoke<LlmProviderInfo[]>('list_providers'),
  getProviderConfig: (): Promise<LlmProviderConfig> =>
    invoke<LlmProviderConfig>('get_provider_config'),
  setProvider: (provider: LlmProviderId): Promise<void> =>
    invoke<void>('set_provider', { provider }),
  setApiKey: (provider: LlmProviderId, apiKey: string): Promise<void> =>
    invoke<void>('set_api_key', { provider, apiKey }),
};

// ----------------------------------------------------------------
// Asset library — Iconify icons (W9)
// ----------------------------------------------------------------

/** Search the built-in Iconify index. */
function searchIconsResultFromWire(wire: SearchIconsResultWire): SearchIconsResult {
  return {
    icons: wire.icons,
    total: wire.total,
    hasMore: wire.has_more,
  };
}

function renderIconResultFromWire(wire: RenderIconResultWire): RenderIconResult {
  return {
    svg: wire.svg,
    width: wire.width,
    height: wire.height,
    fromCache: wire.from_cache,
  };
}

export interface ImportIconArgs extends Record<string, unknown> {
  prefix: string;
  name: string;
  color?: string;
  size?: number;
}

export const assetApi = {
  /**
   * Search the Iconify index by keyword + optional style + category.
   * Keywords may be Chinese, English, or any of the tags in the index.
   */
  searchIcons: (args: {
    query: string;
    style?: string;
    category?: string;
    limit?: number;
  }): Promise<SearchIconsResult> => {
    const params = {
      query: args.query,
      style: args.style,
      category: args.category,
      limit: args.limit,
    };
    return invoke<SearchIconsResultWire>('search_icons', { args: params }).then(
      searchIconsResultFromWire,
    );
  },

  /**
   * Render a single Iconify icon as an SVG string at the requested size / color.
   * Returns the full `<svg>...</svg>` document.
   */
  renderIconSvg: (args: {
    prefix: string;
    name: string;
    color?: string;
    size?: number;
  }): Promise<RenderIconResult> => {
    const params = {
      prefix: args.prefix,
      name: args.name,
      color: args.color,
      size: args.size,
    };
    return invoke<RenderIconResultWire>('render_icon_svg', { args: params }).then(
      renderIconResultFromWire,
    );
  },

  /**
   * One-shot helper: search → pick the first match → render → paste to canvas.
   * Used by both the manual UI ("double-click icon") and the AI flow.
   */
  importIconToCanvas: async (args: ImportIconArgs): Promise<{ layerId: string; svg: string }> => {
    const renderRes = await assetApi.renderIconSvg({
      prefix: args.prefix,
      name: args.name,
      color: args.color,
      size: args.size,
    });
    // For paste_image_to_layer we need PNG, not SVG. Render the SVG to PNG first.
    const svgPng = await aiApi.renderSvgToPng(renderRes.svg, renderRes.width, renderRes.height);
    const layerId = await canvasToolsApi.pasteImageToLayer(svgPng.png_data);
    return { layerId, svg: renderRes.svg };
  },

  // -------- Brushes (W10-B2) --------

  /** List all builtin brush presets (no PNG payload). */
  listBrushes: (): Promise<BrushPreset[]> =>
    invoke<BrushPresetWire[]>('list_brushes').then((items) =>
      items.map((w) => ({
        id: w.id,
        nameZh: w.name_zh,
        nameEn: w.name_en,
        fileName: w.file_name,
        category: w.category,
        defaultRadius: w.default_radius,
        falloff: w.falloff,
        description: w.description,
      })),
    ),

  /** List brushes with embedded base64 PNG stamps. */
  listBrushAssets: (): Promise<BrushAsset[]> =>
    invoke<BrushAssetWire[]>('list_brush_assets').then((items) =>
      items.map((w) => ({
        id: w.id,
        nameZh: w.name_zh,
        nameEn: w.name_en,
        category: w.category,
        defaultRadius: w.default_radius,
        falloff: w.falloff,
        description: w.description,
        pngBase64: w.png_base64,
        byteSize: w.byte_size,
      })),
    ),

  /** Fetch a single brush asset by id. */
  getBrushAsset: (id: string): Promise<BrushAsset> =>
    invoke<BrushAssetWire>('get_brush_asset', { id }).then((w) => ({
      id: w.id,
      nameZh: w.name_zh,
      nameEn: w.name_en,
      category: w.category,
      defaultRadius: w.default_radius,
      falloff: w.falloff,
      description: w.description,
      pngBase64: w.png_base64,
      byteSize: w.byte_size,
    })),

  // -------- Palettes (W10-B3) --------

  /** List all builtin palettes. */
  listPalettes: (): Promise<Palette[]> =>
    invoke<PaletteWire[]>('list_palettes').then((items) =>
      items.map((w) => ({
        id: w.id,
        nameZh: w.name_zh,
        nameEn: w.name_en,
        description: w.description,
        colors: w.colors.map((c) => ({
          hex: c.hex,
          nameZh: c.name_zh,
          nameEn: c.name_en,
          role: c.role,
        })),
      })),
    ),

  /** Apply a palette to a layer (swatch_bar or replace_color). */
  applyPalette: (args: ApplyPaletteArgs): Promise<ApplyPaletteResult> => {
    const params = {
      palette_id: args.paletteId,
      mode: args.mode,
      layer_id: args.layerId,
      replace_hex: args.replaceHex,
    };
    return invoke<ApplyPaletteResultWire>('apply_palette', { args: params }).then((w) => ({
      appliedColors: w.applied_colors,
      strokeCount: w.stroke_count,
      mode: w.mode,
    }));
  },

  // -------- Gradients (W10-B4) --------

  /** List all builtin gradient presets. */
  listGradients: (): Promise<GradientPreset[]> =>
    invoke<GradientPresetWire[]>('list_gradients').then((items) =>
      items.map((w) => ({
        id: w.id,
        type: w.type as GradientType,
        nameZh: w.name_zh,
        nameEn: w.name_en,
        angle: w.angle,
        center: w.center,
        stops: w.stops.map((s) => ({ offset: s.offset, hex: s.hex })),
      })),
    ),

  /** Apply a gradient preset to a layer at the given opacity (0..1). */
  applyGradient: (args: ApplyGradientArgs): Promise<ApplyGradientResult> => {
    const params = {
      gradient_id: args.gradientId,
      layer_id: args.layerId,
      opacity: args.opacity,
    };
    return invoke<ApplyGradientResultWire>('apply_gradient', { args: params }).then((w) => ({
      gradientId: w.gradient_id,
      gradientType: w.gradient_type,
      stopCount: w.stop_count,
      bytesWritten: w.bytes_written,
    }));
  },

  // -------- Assets config (W11-B1) --------

  /** 获取当前资产库配置（CDN 镜像 + 署名提示已显示）。 */
  getAssetsConfig: (): Promise<AssetsConfig> =>
    invoke<AssetsConfigWire>('get_assets_config').then((w) => ({
      cdnMirror: (w.cdn_mirror as CdnMirror) ?? 'default',
      attributionNoticeShown: !!w.attribution_notice_shown,
    })),

  /** 写入新的资产库配置并落盘。 */
  setAssetsConfig: (cfg: AssetsConfig): Promise<void> => {
    const params = {
      cdn_mirror: cfg.cdnMirror,
      attribution_notice_shown: cfg.attributionNoticeShown,
    };
    return invoke<void>('set_assets_config', { cfg: params });
  },

  /** 当前资产库在线状态（HEAD 探测结果，前端用来决定显示“离线模式”）。 */
  getAssetState: (): Promise<AssetOnlineState> => invoke<AssetOnlineState>('get_asset_state'),
};

// Re-export so existing code can keep importing icons from `@/types/asset`.
export type {
  BrushPreset,
  BrushAsset,
  GradientPreset,
  GradientType,
  Palette,
  PaletteColor,
  PaletteWire,
  ApplyPaletteArgs,
  ApplyGradientArgs,
  ApplyGradientResult,
  ApplyPaletteResult,
  IconMeta,
  SearchIconsResult,
  RenderIconResult,
  AssetsConfig,
  AssetsConfigWire,
  AssetOnlineState,
  CdnMirror,
} from '@/types/asset';
