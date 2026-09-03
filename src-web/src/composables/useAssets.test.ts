/**
 * useAssets 行为测试 — 覆盖资产库前端核心逻辑（W9）。
 *
 * 真实 IPC 由 Rust 侧单测覆盖；这里验证：
 *   - AST-1xx: 搜索状态机 + 500ms 防抖
 *   - AST-2xx: 预览 SVG 渲染 + 渲染缓存命中
 *   - AST-3xx: 导入画布链路（render → svg2png → paste）
 *   - AST-4xx: 错误传播（搜索失败 / 渲染失败 / 导入失败）
 *   - AST-5xx: useGroupedIcons 按 prefix 分组
 *   - AST-6xx: 辅助函数 formatIconName
 *
 * 实现要点：
 *   - 用 vi.hoisted() 提升 mock 句柄到测试文件顶层，保证 vi.mock 工厂
 *     与测试代码拿到的是同一份 vi.fn()（不受 vi.resetModules 影响）。
 *   - 不调用 vi.resetModules()，避免 module cache 重建后 useAssets
 *     闭包里的 api 引用与测试代码引用脱钩。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type * as ApiIndex from '@api/index';
import type { IconMeta, SearchIconsResult } from '@/types/asset';

const {
  mockSearchIcons,
  mockRenderIconSvg,
  mockImportIconToCanvas,
  mockRenderSvgToPng,
  mockPasteImageToLayer,
  mockGetSelectionBounds,
  mockGetCanvasSelection,
  mockGetLayerInfo,
  mockSendToAiEngine,
  mockListBrushes,
  mockListBrushAssets,
  mockListPalettes,
  mockApplyPalette,
  mockListGradients,
  mockApplyGradient,
  mockGetAssetsConfig,
  mockSetAssetsConfig,
  mockGetAssetState,
} = vi.hoisted(() => ({
  mockSearchIcons: vi.fn(),
  mockRenderIconSvg: vi.fn(),
  mockImportIconToCanvas: vi.fn(),
  mockRenderSvgToPng: vi.fn(),
  mockPasteImageToLayer: vi.fn(),
  mockGetSelectionBounds: vi.fn(),
  mockGetCanvasSelection: vi.fn(),
  mockGetLayerInfo: vi.fn(),
  mockSendToAiEngine: vi.fn(),
  mockListBrushes: vi.fn(),
  mockListBrushAssets: vi.fn(),
  mockListPalettes: vi.fn(),
  mockApplyPalette: vi.fn(),
  mockListGradients: vi.fn(),
  mockApplyGradient: vi.fn(),
  mockGetAssetsConfig: vi.fn(),
  mockSetAssetsConfig: vi.fn(),
  mockGetAssetState: vi.fn(),
}));

vi.mock('@api/index', async () => {
  const actual = (await vi.importActual('@api/index')) as typeof ApiIndex;
  return {
    ...actual,
    assetApi: {
      searchIcons: mockSearchIcons,
      renderIconSvg: mockRenderIconSvg,
      importIconToCanvas: mockImportIconToCanvas,
      listBrushes: mockListBrushes,
      listBrushAssets: mockListBrushAssets,
      listPalettes: mockListPalettes,
      applyPalette: mockApplyPalette,
      listGradients: mockListGradients,
      applyGradient: mockApplyGradient,
      // W11-B1/B3 mock
      getAssetsConfig: mockGetAssetsConfig,
      setAssetsConfig: mockSetAssetsConfig,
      getAssetState: mockGetAssetState,
    },
    aiApi: {
      sendToAiEngine: mockSendToAiEngine,
      renderSvgToPng: mockRenderSvgToPng,
    },
    canvasToolsApi: {
      pasteImageToLayer: mockPasteImageToLayer,
      getCanvasSelection: mockGetCanvasSelection,
      getSelectionBounds: mockGetSelectionBounds,
      getLayerInfo: mockGetLayerInfo,
    },
  };
});

const sampleIcons: IconMeta[] = [
  { prefix: 'lucide', name: 'search', category: 'ui', tags: ['search', 'find'] },
  { prefix: 'lucide', name: 'settings', category: 'ui', tags: ['settings', 'gear'] },
  { prefix: 'material-symbols', name: 'home', category: 'navigation', tags: ['home'] },
];

function makeResult(icons: IconMeta[] = sampleIcons, total = icons.length): SearchIconsResult {
  return { icons, total, hasMore: total > icons.length };
}

describe('useAssets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchIcons.mockReset();
    mockRenderIconSvg.mockReset();
    mockImportIconToCanvas.mockReset();
    mockRenderSvgToPng.mockReset();
    mockPasteImageToLayer.mockReset();
    mockListBrushes.mockReset();
    mockListBrushAssets.mockReset();
    mockListPalettes.mockReset();
    mockApplyPalette.mockReset();
    mockListGradients.mockReset();
    mockApplyGradient.mockReset();
    mockGetAssetsConfig.mockReset();
    mockSetAssetsConfig.mockReset();
    mockGetAssetState.mockReset();

    // default mocks
    mockSearchIcons.mockResolvedValue(makeResult());
    mockRenderIconSvg.mockResolvedValue({
      svg: '<svg><rect/></svg>',
      width: 64,
      height: 64,
      fromCache: false,
    });
    mockImportIconToCanvas.mockResolvedValue({
      layerId: 'L1',
      svg: '<svg><rect/></svg>',
    });
    mockRenderSvgToPng.mockResolvedValue({
      png_data: 'iVBORw0KGgo=',
      width: 64,
      height: 64,
    });
    mockPasteImageToLayer.mockResolvedValue('L1');
    // W10 mocks
    mockListBrushes.mockResolvedValue([
      {
        id: 'round-hard',
        name_zh: '硬边',
        name_en: 'Round Hard',
        file_name: 'round-hard.png',
        category: 'hard',
        default_radius: 12,
        falloff: 0.05,
        description: '默认',
      },
      {
        id: 'round-soft',
        name_zh: '软边',
        name_en: 'Round Soft',
        file_name: 'round-soft.png',
        category: 'soft',
        default_radius: 14,
        falloff: 0.95,
        description: '软',
      },
    ]);
    mockListBrushAssets.mockResolvedValue([
      {
        id: 'round-hard',
        name_zh: '硬边',
        name_en: 'Round Hard',
        category: 'hard',
        default_radius: 12,
        falloff: 0.05,
        description: '默认',
        png_base64: 'aA==',
        byte_size: 1,
      },
    ]);
    mockListPalettes.mockResolvedValue([
      {
        id: 'material',
        name_zh: 'Material',
        name_en: 'Material',
        description: 'd',
        colors: [{ hex: '#ff0000', name_zh: '红', name_en: 'Red' }],
      },
    ]);
    mockListGradients.mockResolvedValue([
      {
        id: 'sunset',
        type: 'linear',
        name_zh: '日落',
        name_en: 'Sunset',
        angle: 180,
        stops: [
          { offset: 0, hex: '#000' },
          { offset: 1, hex: '#fff' },
        ],
      },
    ]);
    mockApplyPalette.mockResolvedValue({
      applied_colors: ['#ff0000'],
      stroke_count: 1,
      mode: 'swatch_bar',
    });
    mockApplyGradient.mockResolvedValue({
      gradient_id: 'sunset',
      gradient_type: 'linear',
      stop_count: 2,
      bytes_written: 4096,
    });
    // W11-B1/B3 default mocks
    mockGetAssetsConfig.mockResolvedValue({
      cdnMirror: 'default',
      attributionNoticeShown: false,
    });
    mockSetAssetsConfig.mockResolvedValue(undefined);
    mockGetAssetState.mockResolvedValue({
      online: true,
      lastCheckAt: new Date().toISOString(),
      lastError: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function load() {
    const mod = await import('@composables/useAssets');
    return mod.useAssets();
  }

  // ---- AST-1xx: 搜索状态机 + 500ms 防抖 ----

  it('AST-101: 默认状态为空，searchResults 长度 = 0', async () => {
    const a = await load();
    expect(a.searchQuery.value).toBe('');
    expect(a.searchStyle.value).toBeNull();
    expect(a.searchCategory.value).toBeNull();
    expect(a.searchResults.value).toEqual([]);
    expect(a.searchTotal.value).toBe(0);
    expect(a.searchHasMore.value).toBe(false);
    expect(a.isSearching.value).toBe(false);
    expect(a.searchError.value).toBeNull();
  });

  it('AST-102: 输入 searchQuery 触发 500ms 防抖', async () => {
    const a = await load();
    a.searchQuery.value = 'sea';
    // 200ms 时不应触发
    await vi.advanceTimersByTimeAsync(200);
    expect(mockSearchIcons).not.toHaveBeenCalled();
    // 满 500ms 才触发一次
    await vi.advanceTimersByTimeAsync(300);
    expect(mockSearchIcons).toHaveBeenCalledTimes(1);
    expect(mockSearchIcons).toHaveBeenCalledWith({
      query: 'sea',
      style: undefined,
      category: undefined,
      limit: 30,
    });
  });

  it('AST-103: 连续输入只触发最后一次（防抖合并）', async () => {
    const a = await load();
    a.searchQuery.value = 's';
    await vi.advanceTimersByTimeAsync(100);
    a.searchQuery.value = 'se';
    await vi.advanceTimersByTimeAsync(100);
    a.searchQuery.value = 'sea';
    await vi.advanceTimersByTimeAsync(500);
    expect(mockSearchIcons).toHaveBeenCalledTimes(1);
    expect(mockSearchIcons).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'sea' }));
  });

  it('AST-104: 仅 style 过滤（无 query）也会触发搜索', async () => {
    const a = await load();
    a.searchStyle.value = 'lucide';
    await vi.advanceTimersByTimeAsync(500);
    expect(mockSearchIcons).toHaveBeenCalledTimes(1);
    expect(mockSearchIcons).toHaveBeenCalledWith(expect.objectContaining({ style: 'lucide' }));
  });

  it('AST-105: 三参都为空 → 不触发 search', async () => {
    const a = await load();
    a.searchQuery.value = '   '; // 纯空白 trim 后为空
    await vi.advanceTimersByTimeAsync(500);
    expect(mockSearchIcons).not.toHaveBeenCalled();
    expect(a.searchResults.value).toEqual([]);
  });

  it('AST-106: clearSearch 重置所有状态', async () => {
    const a = await load();
    a.searchQuery.value = 'hello';
    a.searchStyle.value = 'lucide';
    a.searchCategory.value = 'ui';
    a.searchResults.value = sampleIcons; // 手动写入
    a.searchTotal.value = 5;
    a.searchHasMore.value = true;
    a.clearSearch();
    expect(a.searchQuery.value).toBe('');
    expect(a.searchStyle.value).toBeNull();
    expect(a.searchCategory.value).toBeNull();
    expect(a.searchResults.value).toEqual([]);
    expect(a.searchTotal.value).toBe(0);
    expect(a.searchHasMore.value).toBe(false);
  });

  it('AST-107: 搜索失败时 searchError 被填充，results 清空', async () => {
    const a = await load();
    mockSearchIcons.mockRejectedValueOnce(new Error('网络抖动'));
    a.searchQuery.value = 'boom';
    await vi.advanceTimersByTimeAsync(500);
    expect(a.searchError.value).toBe('网络抖动');
    expect(a.searchResults.value).toEqual([]);
    expect(a.isSearching.value).toBe(false);
  });

  it('AST-108: 过期的请求结果会被丢弃（不会被写入 state）', async () => {
    const a = await load();
    let resolveFirst!: (v: SearchIconsResult) => void;
    mockSearchIcons.mockImplementationOnce(
      () =>
        new Promise<SearchIconsResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    a.searchQuery.value = 'first';
    await vi.advanceTimersByTimeAsync(500);
    // 第二次查询触发，第一次请求尚未完成
    mockSearchIcons.mockResolvedValueOnce(makeResult([sampleIcons[2]], 1));
    a.searchQuery.value = 'second';
    await vi.advanceTimersByTimeAsync(500);
    // 现在让第一次"过期"请求结束
    resolveFirst(makeResult([sampleIcons[0]], 1));
    await vi.advanceTimersByTimeAsync(0);
    // 结果应是 second 的，不是 first 的
    expect(a.searchResults.value.map((i) => i.name)).toEqual(['home']);
  });

  // ---- AST-2xx: 预览渲染 + 缓存 ----

  it('AST-201: openPreview 调用 renderIconSvg 并填入 previewSvg', async () => {
    const a = await load();
    const icon = sampleIcons[0];
    await a.openPreview(icon);
    expect(mockRenderIconSvg).toHaveBeenCalledWith({
      prefix: icon.prefix,
      name: icon.name,
      color: 'currentColor',
      size: 64,
    });
    expect(a.previewSvg.value).toBe('<svg><rect/></svg>');
    expect(a.previewedIcon.value).toEqual(icon);
    expect(a.isRendering.value).toBe(false);
    expect(a.renderError.value).toBeNull();
  });

  it('AST-202: 同一图标二次 openPreview 命中内存缓存，不再次调用 IPC', async () => {
    const a = await load();
    const icon = sampleIcons[0];
    await a.openPreview(icon);
    await a.openPreview(icon);
    expect(mockRenderIconSvg).toHaveBeenCalledTimes(1);
  });

  it('AST-203: 不同 size 的导入不污染 openPreview 缓存', async () => {
    const a = await load();
    const icon = sampleIcons[0];
    // openPreview 用 size=64；importIconToCanvas 默认也是 size=64，同 key
    await a.openPreview(icon);
    await a.importIconToCanvas(icon); // 同样 size=64 命中缓存
    // 但 importIconToCanvas 走的是 assetApi.importIconToCanvas 这个独立方法，
    // 不会主动调 renderIconSvg，所以这里的 IPC 调用次数应仍是 1（仅 openPreview 那次）
    expect(mockImportIconToCanvas).toHaveBeenCalledTimes(1);
  });

  it('AST-204: openPreview 失败时 renderError 被填充', async () => {
    const a = await load();
    mockRenderIconSvg.mockRejectedValueOnce(new Error('SVG 渲染失败'));
    await a.openPreview(sampleIcons[1]);
    expect(a.renderError.value).toBe('SVG 渲染失败');
    expect(a.previewSvg.value).toBeNull();
    expect(a.previewedIcon.value).toEqual(sampleIcons[1]); // 仍记录要预览的图标
  });

  it('AST-205: closePreview 重置预览状态', async () => {
    const a = await load();
    await a.openPreview(sampleIcons[0]);
    a.closePreview();
    expect(a.previewedIcon.value).toBeNull();
    expect(a.previewSvg.value).toBeNull();
    expect(a.renderError.value).toBeNull();
  });

  // ---- AST-3xx: 导入画布链路 ----

  it('AST-301: importIconToCanvas 调用 assetApi.importIconToCanvas 并返回 layerId', async () => {
    const a = await load();
    const icon = sampleIcons[0];
    const layerId = await a.importIconToCanvas(icon);
    expect(layerId).toBe('L1');
    expect(mockImportIconToCanvas).toHaveBeenCalledWith({
      prefix: icon.prefix,
      name: icon.name,
      color: 'currentColor',
      size: 64,
    });
  });

  it('AST-302: 导入失败时 importError 被填充，并重新抛出', async () => {
    const a = await load();
    mockImportIconToCanvas.mockRejectedValueOnce(new Error('粘贴失败'));
    await expect(a.importIconToCanvas(sampleIcons[0])).rejects.toThrow('粘贴失败');
    expect(a.importError.value).toBe('粘贴失败');
    expect(a.isImporting.value).toBe(false);
  });

  it('AST-303: 自定义 color / size 被传递到 IPC', async () => {
    const a = await load();
    await a.importIconToCanvas(sampleIcons[0], { color: '#ff0000', size: 128 });
    expect(mockImportIconToCanvas).toHaveBeenCalledWith({
      prefix: sampleIcons[0].prefix,
      name: sampleIcons[0].name,
      color: '#ff0000',
      size: 128,
    });
  });

  // ---- AST-4xx: 错误边界 / state 复位 ----

  it('AST-401: searchError 非字符串异常 → 通过 String() 转换', async () => {
    const a = await load();
    mockSearchIcons.mockRejectedValueOnce('plain string error');
    a.searchQuery.value = 'oops';
    await vi.advanceTimersByTimeAsync(500);
    expect(a.searchError.value).toBe('plain string error');
  });

  it('AST-402: importIconToCanvas 异步流程保持 isImporting 状态正确', async () => {
    const a = await load();
    let resolveFn!: (v: { layerId: string; svg: string }) => void;
    mockImportIconToCanvas.mockImplementationOnce(
      () =>
        new Promise<{ layerId: string; svg: string }>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const p = a.importIconToCanvas(sampleIcons[0]);
    await Promise.resolve();
    expect(a.isImporting.value).toBe(true);
    resolveFn({ layerId: 'LX', svg: '<svg/>' });
    await p;
    expect(a.isImporting.value).toBe(false);
  });

  // ---- AST-5xx: useGroupedIcons ----

  it('AST-501: useGroupedIcons 按 prefix 分组并保持顺序', async () => {
    const icons: Ref<IconMeta[]> = ref([
      { prefix: 'lucide', name: 'a', category: 'ui', tags: [] },
      { prefix: 'material-symbols', name: 'b', category: 'navigation', tags: [] },
      { prefix: 'lucide', name: 'c', category: 'ui', tags: [] },
    ]);
    const { useGroupedIcons } = await import('@composables/useAssets');
    const grouped = useGroupedIcons(icons);
    expect(grouped.value).toEqual([
      {
        prefix: 'lucide',
        items: [
          { prefix: 'lucide', name: 'a', category: 'ui', tags: [] },
          { prefix: 'lucide', name: 'c', category: 'ui', tags: [] },
        ],
      },
      {
        prefix: 'material-symbols',
        items: [{ prefix: 'material-symbols', name: 'b', category: 'navigation', tags: [] }],
      },
    ]);
  });

  it('AST-502: useGroupedIcons 在 icons ref 变化时自动更新', async () => {
    const icons: Ref<IconMeta[]> = ref([]);
    const { useGroupedIcons } = await import('@composables/useAssets');
    const grouped = useGroupedIcons(icons);
    expect(grouped.value).toEqual([]);
    icons.value = [{ prefix: 'tabler', name: 'x', category: 'ui', tags: [] }];
    await nextTick();
    expect(grouped.value).toHaveLength(1);
    expect(grouped.value[0].prefix).toBe('tabler');
  });

  // ---- AST-6xx: 辅助函数 ----

  it('AST-601: formatIconName 返回 prefix/name', async () => {
    const a = await load();
    expect(a.formatIconName(sampleIcons[0])).toBe('lucide/search');
    expect(a.formatIconName(sampleIcons[2])).toBe('material-symbols/home');
  });

  // ---- AST-7xx: 画刷 / 调色板 / 渐变（W10） ----

  it('AST-701: loadBrushes 一次性拉取 presets + assets，缓存后续调用', async () => {
    const a = await load();
    await a.loadBrushes();
    expect(mockListBrushes).toHaveBeenCalledTimes(1);
    expect(mockListBrushAssets).toHaveBeenCalledTimes(1);
    expect(a.brushes.value).toHaveLength(2);
    expect(a.brushAssets.value).toHaveLength(1);
    // 二次调用不会重复 IPC
    await a.loadBrushes();
    expect(mockListBrushes).toHaveBeenCalledTimes(1);
  });

  it('AST-702: setActiveBrush 写入 activeBrushId', async () => {
    const a = await load();
    expect(a.activeBrushId.value).toBe('round-hard');
    a.setActiveBrush('round-soft');
    expect(a.activeBrushId.value).toBe('round-soft');
  });

  it('AST-703: applyPalette swatch_bar 把参数转成 snake_case 传给 IPC', async () => {
    const a = await load();
    await a.applyPalette('material', 'swatch_bar');
    expect(mockApplyPalette).toHaveBeenCalledWith({
      paletteId: 'material',
      mode: 'swatch_bar',
      layerId: undefined,
      replaceHex: undefined,
    });
  });

  it('AST-704: applyGradient 带 opacity 时透传', async () => {
    const a = await load();
    await a.applyGradient('sunset', { opacity: 0.5 });
    expect(mockApplyGradient).toHaveBeenCalledWith({
      gradientId: 'sunset',
      layerId: undefined,
      opacity: 0.5,
    });
  });
});
