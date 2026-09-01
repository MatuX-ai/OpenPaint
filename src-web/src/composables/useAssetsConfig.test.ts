/**
 * useAssetsConfig — 单元测试
 *
 * 测试覆盖：
 *  - AC-101：refresh 失败时回退默认值 + loaded=true
 *  - AC-102：setCdnMirror 成功时持久化 + 更新本地 ref
 *  - AC-103：setCdnMirror 失败时回滚到 previous
 *  - AC-104：markAttributionShown 幂等（第二次调用不会重发 IPC）
 *  - AC-105：normalize 把非法 cdn_mirror 字符串回退到 default
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetAssetsConfig = vi.fn();
const mockSetAssetsConfig = vi.fn();

vi.mock('@api/index', () => ({
  assetApi: {
    getAssetsConfig: () => mockGetAssetsConfig(),
    setAssetsConfig: (cfg: unknown) => mockSetAssetsConfig(cfg),
  },
}));

import {
  useAssetsConfig,
  __resetAssetsConfigForTests,
} from '@composables/useAssetsConfig';

describe('useAssetsConfig (W11-B1)', () => {
  beforeEach(() => {
    mockGetAssetsConfig.mockReset();
    mockSetAssetsConfig.mockReset();
    __resetAssetsConfigForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-101: refresh falls back to default when IPC fails', async () => {
    mockGetAssetsConfig.mockRejectedValueOnce(new Error('backend down'));
    const { config, loaded, refresh } = useAssetsConfig();
    await refresh();
    expect(loaded.value).toBe(true);
    expect(config.value.cdnMirror).toBe('default');
    expect(config.value.attributionNoticeShown).toBe(false);
  });

  it('AC-102: refresh normalizes cdn_mirror and stores it', async () => {
    mockGetAssetsConfig.mockResolvedValueOnce({
      cdnMirror: 'jsdelivr',
      attributionNoticeShown: true,
    });
    const { config, refresh } = useAssetsConfig();
    await refresh();
    expect(config.value.cdnMirror).toBe('jsdelivr');
    expect(config.value.attributionNoticeShown).toBe(true);
  });

  it('AC-103: normalize routes unknown cdn strings back to default', async () => {
    mockGetAssetsConfig.mockResolvedValueOnce({
      cdnMirror: 'mystery-cdn' as unknown as 'default',
      attributionNoticeShown: false,
    });
    const { config, refresh } = useAssetsConfig();
    await refresh();
    expect(config.value.cdnMirror).toBe('default');
  });

  it('AC-104: setCdnMirror persists and updates local ref', async () => {
    mockGetAssetsConfig.mockResolvedValueOnce({
      cdnMirror: 'default',
      attributionNoticeShown: false,
    });
    mockSetAssetsConfig.mockResolvedValueOnce(undefined);
    const { config, refresh, setCdnMirror } = useAssetsConfig();
    await refresh();
    await setCdnMirror('jsdelivr');
    expect(config.value.cdnMirror).toBe('jsdelivr');
    expect(mockSetAssetsConfig).toHaveBeenCalledWith({
      cdnMirror: 'jsdelivr',
      attributionNoticeShown: false,
    });
  });

  it('AC-105: setCdnMirror rolls back when IPC throws', async () => {
    mockGetAssetsConfig.mockResolvedValueOnce({
      cdnMirror: 'default',
      attributionNoticeShown: false,
    });
    mockSetAssetsConfig.mockRejectedValueOnce(new Error('write failed'));
    const { config, refresh, setCdnMirror } = useAssetsConfig();
    await refresh();
    await expect(setCdnMirror('fastly')).rejects.toThrow('write failed');
    expect(config.value.cdnMirror).toBe('default');
  });

  it('AC-106: markAttributionShown is idempotent', async () => {
    mockGetAssetsConfig.mockResolvedValueOnce({
      cdnMirror: 'default',
      attributionNoticeShown: false,
    });
    mockSetAssetsConfig.mockResolvedValue(undefined);
    const { config, refresh, markAttributionShown } = useAssetsConfig();
    await refresh();
    await markAttributionShown();
    expect(config.value.attributionNoticeShown).toBe(true);
    expect(mockSetAssetsConfig).toHaveBeenCalledTimes(1);
    // 第二次调用：不再触发 IPC
    await markAttributionShown();
    expect(mockSetAssetsConfig).toHaveBeenCalledTimes(1);
  });

  it('AC-107: concurrent refresh calls coalesce', async () => {
    let resolve!: (v: unknown) => void;
    mockGetAssetsConfig.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { refresh } = useAssetsConfig();
    const p1 = refresh();
    const p2 = refresh();
    resolve({ cdnMirror: 'default', attributionNoticeShown: false });
    await Promise.all([p1, p2]);
    // 两个调用共享同一 inflight → 只触发一次 IPC
    expect(mockGetAssetsConfig).toHaveBeenCalledTimes(1);
  });
});
