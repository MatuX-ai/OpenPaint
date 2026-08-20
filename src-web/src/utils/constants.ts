/**
 * Application constants.
 */

import type { PresetConfig } from '@/types/config';

/** Preset export sizes (mirrors `assets/default_config.yaml`). */
export const PRESET_SIZES: PresetConfig = {
  web: [16, 32, 48, 180, 192, 512],
  ios: [20, 29, 40, 60, 76, 83.5, 1024],
  android: [48, 72, 96, 144, 192, 512],
  favicon: [16, 32, 64],
};

/** Default AI models per provider. */
export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  ollama: 'qwen2.5:7b',
} as const;

/** OpenPencil web app URL (placeholder). */
export const OPENPENCIL_WEB_URL = 'https://openpencil.dev/app';

/** MCP protocol version. */
export const MCP_PROTOCOL_VERSION = '2024-11-05';
