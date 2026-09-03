/**
 * Web preview addLayer / remove_active / set_active mock — W15 · G3
 *
 * 验证 `src/api/runtime.ts` 的 MOCK_COMMANDS 在 web preview 模式下：
 *  - add_layer: 返回 web-layer-<random> id，活动图层切换到最新；
 *  - remove_active_layer: 仅一个图层时返回 false，多图层时移除并重置活动；
 *  - set_active_layer: 把目标图层标记为活动；
 *  - get_canvas_summary: 反映 webLayers 当前状态（layers 数组 / activeLayerId）；
 *  - set_layer_locked: 修改 webLayer.locked。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { __resetWebLayers } from '@api/runtime';
import { canvasApi } from '@api/index';

describe('web preview addLayer/remove/setActive mock (TC-W15-G3-001)', () => {
  beforeEach(() => {
    __resetWebLayers();
  });

  it('TC-W15-G3-001a: web preview 下点 + → addLayer → get_canvas_summary 反映新增 layer', async () => {
    const id1 = await canvasApi.addLayer('Layer 1');
    expect(id1).toMatch(/^web-layer-/);
    const id2 = await canvasApi.addLayer('Layer 2');
    expect(id2).toMatch(/^web-layer-/);

    const summary = await canvasApi.getCanvasSummary();
    expect(summary.layers).toHaveLength(2);
    expect(summary.layers[0].name).toBe('Layer 1');
    expect(summary.layers[1].name).toBe('Layer 2');
    // 活动图层 = 最新（top-most）
    expect(summary.activeLayerId).toBe(id2);
  });

  it('TC-W15-G3-001b: web preview setLayerLocked → 第二次 get_canvas_summary 反映 locked=true', async () => {
    const id = await canvasApi.addLayer('Locked Layer');
    expect(id).toMatch(/^web-layer-/);

    // setLayerLocked 走 MOCK_COMMANDS
    await canvasApi.setLayerLocked(id, true);
    const summary = await canvasApi.getCanvasSummary();
    expect(summary.layers[0].id).toBe(id);
    expect(summary.layers[0].locked).toBe(true);
  });

  it('TC-W15-G3-001c: web preview remove_active_layer 单图层时返回 false，多图层时移除并重置活动', async () => {
    // 单图层时不能移除
    await canvasApi.addLayer('only');
    const r1 = await canvasApi.removeActiveLayer();
    expect(r1).toBe(false);

    // 多图层时移除活动图层
    await canvasApi.addLayer('second');
    const r2 = await canvasApi.removeActiveLayer();
    expect(r2).toBe(true);
    const summary = await canvasApi.getCanvasSummary();
    expect(summary.layers).toHaveLength(1);
    // 活动图层应回到剩下的那一个
    expect(summary.activeLayerId).toBe(summary.layers[0].id);
  });

  it('TC-W15-G3-001d: set_active_layer 切换活动图层', async () => {
    const id1 = await canvasApi.addLayer('A');
    const id2 = await canvasApi.addLayer('B');
    // 默认 B 是活动
    let summary = await canvasApi.getCanvasSummary();
    expect(summary.activeLayerId).toBe(id2);

    await canvasApi.setActiveLayer(id1);
    summary = await canvasApi.getCanvasSummary();
    expect(summary.activeLayerId).toBe(id1);
  });

  it('TC-W15-G3-001e: add_layer 默认 name 是 "Layer N"', async () => {
    const id = await canvasApi.addLayer(undefined as unknown as string);
    // 接收 undefined，mock 应回退到默认 name
    const summary = await canvasApi.getCanvasSummary();
    expect(summary.layers[0].id).toBe(id);
    expect(summary.layers[0].name).toMatch(/^Layer \d+/);
  });
});
