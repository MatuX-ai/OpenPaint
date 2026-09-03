// ============================================================
// 全局通用类型
// ============================================================

/** Tauri 命令返回结果包装 */
export type TauriResult<T> = Promise<T>;

/** 主题 */
export type Theme = 'light' | 'dark';

/** 右栏模式（W14+ 统一画布架构：OpenPencil 移至中央，右侧仅保留图库/折叠）。 */
export type RightPanelMode = 'gallery' | 'none';
