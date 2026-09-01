/**
 * useAssetsConfig — W11 资产库配置 composable
 *
 * 封装 `get_assets_config` / `set_assets_config` IPC，提供 CDN 镜像切换 +
 * 资源署名 toast 状态。`SettingsModal` 在「资源」tab 下拉选 CDN 时调用。
 *
 * 设计取舍：
 *  - 使用模块级 ref（单例）避免 SettingsModal 切换页面时重新加载。
 *  - `cdnMirror` 默认 `default`；前端展示时直接传给 UI。
 *  - `setCdnMirror` 失败时回滚 UI 状态并抛出错误给 toast。
 *
 * 关联需求：docs/asset-library-requirements.md §4.2（W11 镜像切换）。
 */

import { ref } from 'vue';
import { assetApi } from '@api/index';
import type { AssetsConfig, CdnMirror } from '@api/index';

const DEFAULT_CONFIG: AssetsConfig = {
  cdnMirror: 'default',
  attributionNoticeShown: false,
};

const config = ref<AssetsConfig>({ ...DEFAULT_CONFIG });
const loaded = ref(false);
const updating = ref(false);
let inflight: Promise<void> | null = null;

/** 把 Rust 返回值规范化（防止 cdn_mirror 出现意外字符串）。 */
function normalize(raw: AssetsConfig): AssetsConfig {
  const cdn: CdnMirror =
    raw.cdnMirror === 'jsdelivr' || raw.cdnMirror === 'fastly' ? raw.cdnMirror : 'default';
  return {
    cdnMirror: cdn,
    attributionNoticeShown: !!raw.attributionNoticeShown,
  };
}

async function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cfg = await assetApi.getAssetsConfig();
      config.value = normalize(cfg);
    } catch (e) {
      console.warn('[useAssetsConfig] refresh failed, use default:', e);
      config.value = { ...DEFAULT_CONFIG };
    } finally {
      loaded.value = true;
      inflight = null;
    }
  })();
  return inflight;
}

export function useAssetsConfig() {
  // 首次消费时触发加载
  if (!loaded.value && !inflight) {
    void refresh();
  }

  async function setCdnMirror(mirror: CdnMirror): Promise<void> {
    if (updating.value) return;
    updating.value = true;
    const previous = config.value.cdnMirror;
    config.value = { ...config.value, cdnMirror: mirror };
    try {
      await assetApi.setAssetsConfig({
        cdnMirror: mirror,
        attributionNoticeShown: config.value.attributionNoticeShown,
      });
    } catch (e) {
      console.error('[useAssetsConfig] setCdnMirror failed:', e);
      // 回滚
      config.value = { ...config.value, cdnMirror: previous };
      throw e;
    } finally {
      updating.value = false;
    }
  }

  async function markAttributionShown(): Promise<void> {
    if (config.value.attributionNoticeShown) return;
    const next: AssetsConfig = { ...config.value, attributionNoticeShown: true };
    config.value = next;
    try {
      await assetApi.setAssetsConfig(next);
    } catch (e) {
      console.warn('[useAssetsConfig] markAttributionShown failed:', e);
    }
  }

  return {
    config,
    loaded,
    updating,
    refresh,
    setCdnMirror,
    markAttributionShown,
  };
}

/** 测试辅助：重置模块状态（仅单测场景）。 */
export function __resetAssetsConfigForTests(): void {
  config.value = { ...DEFAULT_CONFIG };
  loaded.value = false;
  inflight = null;
}
