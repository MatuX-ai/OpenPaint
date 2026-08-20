// ============================================================
// Canvas type definitions
//
// Wire format from Rust (`src-tauri/src/tools/canvas_commands.rs`)
// uses snake_case fields (`offset_x, offset_y, blend_mode`).
// The frontend uses camelCase via the adapter in `api/index.ts`.
// ============================================================

/** Tool type */
export type ToolType = 'select' | 'brush' | 'eraser' | 'move' | 'transform' | 'rect-select';

/** Blend mode */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

/** Frontend-friendly layer metadata. */
export interface Layer {
  id: string;
  name: string;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  locked: boolean;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  isActive?: boolean;
}

/** Wire-format layer metadata from Rust (`LayerMeta`). */
export interface LayerMetaWire {
  id: string;
  name: string;
  opacity: number;
  blend_mode: string;
  visible: boolean;
  locked: boolean;
  width: number;
  height: number;
  offset_x: number;
  offset_y: number;
  is_active: boolean;
}

/** Selection rectangle. */
export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Wire-format canvas summary returned by `get_canvas_summary`. */
export interface CanvasSummary {
  width: number;
  height: number;
  activeLayerId: string;
  layers: LayerMetaWire[];
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/** Paint stroke payload sent to backend (`StrokeArgs`). */
export interface StrokeArgs {
  layer_id: string;
  points: Array<[number, number]>;
  radius: number;
  color: string; // hex
}
