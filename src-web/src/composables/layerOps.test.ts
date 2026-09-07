/**
 * layerOps unit tests — OpenPencil-backed layer CRUD / merge / reorder.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Editor } from '@open-pencil/core/editor';
import * as layerOps from './layerOps';

const graph = {
  getNode: vi.fn((id: string) => {
    const node = nodes.get(id);
    return node ?? null;
  }),
};

const nodes = new Map<string, { id: string; name: string; parentId: string; visible?: boolean }>();

function seed(ids: string[]) {
  nodes.clear();
  for (const id of ids) {
    nodes.set(id, { id, name: id, parentId: 'page-1', visible: true });
  }
}

function makeEditor() {
  const selected: string[] = [];
  return {
    state: { currentPageId: 'page-1', panX: 0, panY: 0, zoom: 1 },
    graph,
    select: vi.fn((ids: string[]) => {
      selected.splice(0, selected.length, ...ids);
    }),
    deleteSelected: vi.fn(() => {
      for (const id of selected) nodes.delete(id);
    }),
    duplicateSelected: vi.fn(() => {
      const src = selected[0];
      if (!src) return;
      const copyId = `${src}-copy`;
      nodes.set(copyId, { id: copyId, name: `${src} copy`, parentId: 'page-1' });
    }),
    renameNode: vi.fn((id: string, name: string) => {
      const n = nodes.get(id);
      if (n) n.name = name;
    }),
    createShape: vi.fn((_t, _x, _y, _w, _h, _p, name: string) => {
      const id = `new-${nodes.size + 1}`;
      nodes.set(id, { id, name, parentId: 'page-1' });
      return id;
    }),
    updateNodeWithUndo: vi.fn(),
    rotateNodes: vi.fn(),
    reorderChildWithUndo: vi.fn(),
    groupSelected: vi.fn(() => {
      const id = 'group-1';
      for (const sid of selected) nodes.delete(sid);
      nodes.set(id, { id, name: 'group', parentId: 'page-1' });
      return id;
    }),
    flattenSelected: vi.fn(() => {
      const id = 'flat-1';
      for (const sid of selected) nodes.delete(sid);
      nodes.set(id, { id, name: 'flat', parentId: 'page-1' });
      return id;
    }),
    getLayerTree: vi.fn(() => [...nodes.values()].map((n) => ({ depth: 0, node: { ...n } }))),
    requestRepaint: vi.fn(),
  } as unknown as Editor;
}

vi.mock('@composables/useOpenPencil', () => ({
  syncOpenPencilStateToCanvasStore: vi.fn(),
}));

describe('layerOps', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seed(['a', 'b', 'c']);
  });

  it('deleteLayer refuses last layer', () => {
    seed(['only']);
    const editor = makeEditor();
    const r = layerOps.deleteLayer(editor, 'only');
    expect(r.ok).toBe(false);
    expect(editor.deleteSelected).not.toHaveBeenCalled();
  });

  it('deleteLayer removes selected node', () => {
    const editor = makeEditor();
    const r = layerOps.deleteLayer(editor, 'b');
    expect(r.ok).toBe(true);
    expect(editor.select).toHaveBeenCalledWith(['b']);
    expect(editor.deleteSelected).toHaveBeenCalled();
  });

  it('duplicateLayer selects then duplicates', () => {
    const editor = makeEditor();
    const r = layerOps.duplicateLayer(editor, 'a');
    expect(r.ok).toBe(true);
    expect(editor.select).toHaveBeenCalledWith(['a']);
    expect(editor.duplicateSelected).toHaveBeenCalled();
  });

  it('renameLayer trims and rejects empty', () => {
    const editor = makeEditor();
    expect(layerOps.renameLayer(editor, 'a', '  ').ok).toBe(false);
    expect(layerOps.renameLayer(editor, 'a', ' 背景 ').ok).toBe(true);
    expect(editor.renameNode).toHaveBeenCalledWith('a', '背景');
  });

  it('mergeDown groups with lower neighbor', () => {
    const editor = makeEditor();
    // bottom→top: a,b,c — merge c down onto b
    const r = layerOps.mergeDown(editor, 'c');
    expect(r.ok).toBe(true);
    expect(editor.select).toHaveBeenCalledWith(['c', 'b']);
    expect(editor.groupSelected).toHaveBeenCalled();
  });

  it('mergeDown fails on bottom layer', () => {
    const editor = makeEditor();
    expect(layerOps.mergeDown(editor, 'a').ok).toBe(false);
  });

  it('mergeVisible requires 2+ visible', () => {
    seed(['a']);
    const editor = makeEditor();
    expect(layerOps.mergeVisible(editor).ok).toBe(false);
  });

  it('reorderLayer maps display index to child index', () => {
    const editor = makeEditor();
    // bottom→top a,b,c → display c,b,a. Move c to index 2 (bottom of UI).
    const r = layerOps.reorderLayer(editor, 'c', 2);
    expect(r.ok).toBe(true);
    expect(editor.reorderChildWithUndo).toHaveBeenCalledWith('c', 'page-1', 0);
  });

  it('addLayer creates FRAME and selects it', () => {
    const editor = makeEditor();
    const r = layerOps.addLayer(editor, '新图层');
    expect(r.ok).toBe(true);
    expect(editor.createShape).toHaveBeenCalled();
    expect(r.id).toBeTruthy();
  });
});
