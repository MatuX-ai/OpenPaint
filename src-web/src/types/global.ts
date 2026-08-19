// ============================================================
// 全局通用类型
// ============================================================

/** Tauri 命令返回结果包装 */
export type TauriResult<T> = Promise<T>;

/** 主题 */
export type Theme = 'light' | 'dark';

/** 右栏模式 */
export type RightPanelMode = 'openpencil' | 'gallery' | 'none';