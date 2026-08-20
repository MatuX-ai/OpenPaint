// ============================================================
// Gallery type definitions
//
// Wire format from Rust (`src-tauri/src/gallery/mod.rs`) uses
// snake_case fields (`group_id, full_size_path, created_at`).
// The frontend uses camelCase via the adapter in `api/index.ts`.
// ============================================================

/** Frontend-friendly gallery item. */
export interface GalleryItem {
  id: string;
  groupId?: string;
  thumbnailPath: string;
  fullSizePath?: string;
  width: number;
  height: number;
  prompt?: string;
  model?: string;
  tags: string[];
  createdAt: number;
  source: 'ai_generated' | 'imported';
}

/** Wire-format item coming from Rust. */
export interface GalleryItemWire {
  id: string;
  group_id?: string;
  thumbnail_path: string;
  full_size_path?: string;
  width: number;
  height: number;
  prompt?: string;
  model?: string;
  tags: string[];
  created_at: number;
  source: 'ai_generated' | 'imported';
}

/** Search parameters sent to Rust (snake_case wire format). */
export interface GallerySearchParamsWire {
  query?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

/** Search result envelope. */
export interface GallerySearchResult {
  items: GalleryItem[];
  total: number;
}

/** Detail endpoint response (wire format). */
export interface GalleryImageResponse {
  item: GalleryItemWire;
  png_base64?: string;
}
