/**
 * Asset library type definitions (W9 + W10).
 *
 * Mirrors the wire-format from `src-tauri/src/tools/{icon,brush,palette,gradient}_commands.rs`.
 * Rust uses snake_case; the frontend uses camelCase via the adapter in `api/index.ts`.
 */

/** Style metadata (one Iconify collection). */
export interface IconifyStyleMeta {
  prefix: string;
  name: string;
  version?: string;
  total: number;
  license: string;
  url?: string;
}

/** Single icon entry returned by `search_icons`. */
export interface IconMeta {
  prefix: string;
  name: string;
  category: string;
  tags: string[];
}

/** Search arguments for `search_icons`. */
export interface SearchIconsArgs {
  query: string;
  style?: string;
  category?: string;
  limit?: number;
}

/** Wire-format search result (snake_case). */
export interface SearchIconsResultWire {
  icons: IconMeta[];
  total: number;
  has_more: boolean;
}

/** Frontend-friendly search result (camelCase). */
export interface SearchIconsResult {
  icons: IconMeta[];
  total: number;
  hasMore: boolean;
}

/** Render arguments for `render_icon_svg`. */
export interface RenderIconArgs {
  prefix: string;
  name: string;
  color?: string;
  size?: number;
}

/** Wire-format render result. */
export interface RenderIconResultWire {
  svg: string;
  width: number;
  height: number;
  from_cache: boolean;
}

/** Frontend-friendly render result. */
export interface RenderIconResult {
  svg: string;
  width: number;
  height: number;
  fromCache: boolean;
}

/** Iconify index file shape (subset of the full file). */
export interface IconifyIndexWire {
  version: string;
  default_cdn?: string;
  fallback_cdn?: string;
  styles?: IconifyStyleMeta[];
  categories?: string[];
  icons: IconMeta[];
}

/** Categories available for filtering. */
export type IconCategory =
  | 'ui'
  | 'social'
  | 'media'
  | 'file'
  | 'device'
  | 'communication'
  | 'navigation'
  | 'finance'
  | 'weather'
  | 'other';

/** Icon prefixes we ship in the built-in index. */
export type IconPrefix =
  | 'lucide'
  | 'heroicons'
  | 'tabler'
  | 'material-symbols'
  | 'phosphor'
  | 'iconoir';

// ============================================================
// Brush presets (W10-B2)
// ============================================================

export type BrushCategory =
  | 'hard'
  | 'soft'
  | 'texture'
  | 'special'
  | 'mark';

/** Single brush preset (matches Rust `canvas::brush::BrushPreset`). */
export interface BrushPreset {
  id: string;
  nameZh: string;
  nameEn: string;
  fileName: string;
  category: BrushCategory;
  defaultRadius: number;
  falloff: number;
  description: string;
}

/** Wire-format brush preset (snake_case, as returned by Rust). */
export interface BrushPresetWire {
  id: string;
  name_zh: string;
  name_en: string;
  file_name: string;
  category: BrushCategory;
  default_radius: number;
  falloff: number;
  description: string;
}

/** Brush asset with embedded base64 PNG (matches Rust `brush_commands::BrushAsset`). */
export interface BrushAsset {
  id: string;
  nameZh: string;
  nameEn: string;
  category: string;
  defaultRadius: number;
  falloff: number;
  description: string;
  pngBase64: string;
  byteSize: number;
}

export interface BrushAssetWire {
  id: string;
  name_zh: string;
  name_en: string;
  category: string;
  default_radius: number;
  falloff: number;
  description: string;
  png_base64: string;
  byte_size: number;
}

// ============================================================
// Palettes (W10-B3)
// ============================================================

/** Single color in a palette (matches Rust `palette_commands::PaletteColor`). */
export interface PaletteColor {
  hex: string;
  nameZh: string;
  nameEn: string;
  role?: string;
}

/** A complete palette (matches Rust `palette_commands::Palette`). */
export interface Palette {
  id: string;
  nameZh: string;
  nameEn: string;
  description: string;
  colors: PaletteColor[];
}

export interface PaletteColorWire {
  hex: string;
  name_zh: string;
  name_en: string;
  role?: string;
}

export interface PaletteWire {
  id: string;
  name_zh: string;
  name_en: string;
  description: string;
  colors: PaletteColorWire[];
}

/** `apply_palette` arguments. */
export interface ApplyPaletteArgs {
  paletteId: string;
  mode: 'swatch_bar' | 'replace_color';
  layerId?: string;
  replaceHex?: string;
}

/** `apply_palette` result. */
export interface ApplyPaletteResult {
  appliedColors: string[];
  strokeCount: number;
  mode: string;
}

export interface ApplyPaletteResultWire {
  applied_colors: string[];
  stroke_count: number;
  mode: string;
}

// ============================================================
// Gradients (W10-B4)
// ============================================================

export type GradientType = 'linear' | 'radial' | 'conic';

export interface GradientStop {
  offset: number;
  hex: string;
}

export interface GradientPreset {
  id: string;
  type: GradientType;
  nameZh: string;
  nameEn: string;
  angle?: number;
  center?: [number, number];
  stops: GradientStop[];
}

export interface GradientStopWire {
  offset: number;
  hex: string;
}

export interface GradientPresetWire {
  id: string;
  type: GradientType;
  name_zh: string;
  name_en: string;
  angle?: number;
  center?: [number, number];
  stops: GradientStopWire[];
}

/** `apply_gradient` arguments. */
export interface ApplyGradientArgs {
  gradientId: string;
  layerId?: string;
  opacity?: number;
}

/** `apply_gradient` result. */
export interface ApplyGradientResult {
  gradientId: string;
  gradientType: string;
  stopCount: number;
  bytesWritten: number;
}

export interface ApplyGradientResultWire {
  gradient_id: string;
  gradient_type: string;
  stop_count: number;
  bytes_written: number;
}

// ============================================================
// 资产库配置（W11-A1 / W11-B1）
// ============================================================

/** CDN 镜像选项（与 Rust AssetsConfig.cdn_mirror 对齐）。 */
export type CdnMirror = 'default' | 'jsdelivr' | 'fastly';

/** 前端缓存的资产库配置镜像。 */
export interface AssetsConfig {
  cdnMirror: CdnMirror;
  /** 是否已展示过资源署名 toast（防止重复弹） */
  attributionNoticeShown: boolean;
}

/** Rust 返回的 wire 格式（snake_case）。 */
export interface AssetsConfigWire {
  cdn_mirror: string;
  attribution_notice_shown: boolean;
}

/** `get_asset_state` 返回值（与 Rust AssetOnlineState 对齐）。 */
export interface AssetOnlineState {
  online: boolean;
  lastCheckAt: string;
  lastError?: string;
}