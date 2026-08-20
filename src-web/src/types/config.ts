// ============================================================
// 配置类型定义
// ============================================================

/** LLM Provider */
export type LlmProvider = 'openai' | 'anthropic' | 'deepseek' | 'ollama';

/** 大模型配置 */
export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  localModel?: string;
  localUrl?: string;
}

/** 预设尺寸 */
export interface PresetConfig {
  web: number[];
  ios: number[];
  android: number[];
  favicon: number[];
}

/** 图库配置 */
export interface GalleryConfig {
  maxItems: number;
  thumbnailSize: number;
  storagePath: string;
}

/** 应用主配置（与 Rust 端 AppConfig 对应） */
export interface AppConfig {
  llm: LlmConfig;
  presets: PresetConfig;
  gallery: GalleryConfig;
  mcp: {
    servers: Array<{ name: string; enabled: boolean }>;
  };
}
