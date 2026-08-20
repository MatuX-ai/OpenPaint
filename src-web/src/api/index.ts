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
