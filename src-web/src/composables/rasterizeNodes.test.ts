/**
 * Tests for vector → pixel conversion helpers and confirm session skip.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetRasterizeConfirmForTests,
  decideRasterizeConfirm,
  needsRasterizeConfirm,
  requestRasterizeConfirm,
  markRasterizeConfirmed,
} from './useRasterizeConfirm';
import { collectVectorIdsForPixelEdit, isPixelEditableNode } from './rasterizeNodes';

describe('isPixelEditableNode', () => {
  it('accepts unrotated IMAGE fills', () => {
    expect(
      isPixelEditableNode({
        rotation: 0,
        fills: [{ type: 'IMAGE', imageHash: 'abc' }],
      }),
    ).toBe(true);
  });

  it('rejects solid fills and rotated images', () => {
    expect(isPixelEditableNode({ fills: [{ type: 'SOLID' }] })).toBe(false);
    expect(
      isPixelEditableNode({
        rotation: 15,
        fills: [{ type: 'IMAGE', imageHash: 'abc' }],
      }),
    ).toBe(false);
  });
});

describe('collectVectorIdsForPixelEdit', () => {
  function fakeEditor(nodes: Record<string, Record<string, unknown>>, selected: string[] = []) {
    return {
      getNode: (id: string) => nodes[id],
      getSelectedNodes: () => selected.map((id) => ({ id, ...(nodes[id] ?? {}) })),
    } as never;
  }

  it('returns hit vector id', () => {
    const editor = fakeEditor({
      v1: { type: 'RECTANGLE', fills: [{ type: 'SOLID' }], rotation: 0 },
    });
    expect(collectVectorIdsForPixelEdit(editor, 'v1')).toEqual(['v1']);
  });

  it('returns empty when hit is already pixel', () => {
    const editor = fakeEditor({
      p1: { type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageHash: 'h' }], rotation: 0 },
    });
    expect(collectVectorIdsForPixelEdit(editor, 'p1')).toEqual([]);
  });

  it('falls back to selected vectors', () => {
    const editor = fakeEditor(
      {
        a: { type: 'ELLIPSE', fills: [{ type: 'SOLID' }] },
        b: { type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageHash: 'h' }], rotation: 0 },
      },
      ['a', 'b'],
    );
    expect(collectVectorIdsForPixelEdit(editor, null)).toEqual(['a']);
  });

  it('blank hit id null still reports selection vectors (menu path; pointer path skips this)', () => {
    const editor = fakeEditor({ a: { type: 'RECTANGLE', fills: [{ type: 'SOLID' }] } }, ['a']);
    expect(collectVectorIdsForPixelEdit(editor, null)).toEqual(['a']);
  });
});

describe('rasterizeCurrentSelection', () => {
  it('rejects empty selection and already-pixel selection', async () => {
    const { rasterizeCurrentSelection } = await import('./rasterizeNodes');
    const empty = {
      getSelectedNodes: () => [],
    } as never;
    await expect(rasterizeCurrentSelection(empty)).rejects.toThrow(/请先选中/);

    const pixelOnly = {
      getSelectedNodes: () => [
        { id: 'p', type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageHash: 'h' }], rotation: 0 },
      ],
    } as never;
    await expect(rasterizeCurrentSelection(pixelOnly)).rejects.toThrow(/已是像素/);
  });

  it('honours confirm cancel', async () => {
    const { rasterizeCurrentSelection } = await import('./rasterizeNodes');
    const editor = {
      getSelectedNodes: () => [
        { id: 'v', type: 'RECTANGLE', fills: [{ type: 'SOLID' }], name: '方块' },
      ],
    } as never;
    const result = await rasterizeCurrentSelection(editor, {
      confirm: async () => false,
    });
    expect(result).toBeNull();
  });
});

describe('useRasterizeConfirm', () => {
  beforeEach(() => {
    __resetRasterizeConfirmForTests();
  });

  it('prompts once per node id in a session', async () => {
    expect(needsRasterizeConfirm(['n1'])).toBe(true);
    const p1 = requestRasterizeConfirm({ nodeIds: ['n1'], label: '方块' });
    decideRasterizeConfirm(true);
    await expect(p1).resolves.toBe(true);
    expect(needsRasterizeConfirm(['n1'])).toBe(false);

    const p2 = requestRasterizeConfirm({ nodeIds: ['n1'], label: '方块' });
    await expect(p2).resolves.toBe(true);
  });

  it('cancel does not mark confirmed', async () => {
    const p = requestRasterizeConfirm({ nodeIds: ['n2'], label: '圆' });
    decideRasterizeConfirm(false);
    await expect(p).resolves.toBe(false);
    expect(needsRasterizeConfirm(['n2'])).toBe(true);
  });

  it('markRasterizeConfirmed skips future prompts', async () => {
    markRasterizeConfirmed(['n3']);
    await expect(requestRasterizeConfirm({ nodeIds: ['n3'], label: 'x' })).resolves.toBe(true);
  });
});
