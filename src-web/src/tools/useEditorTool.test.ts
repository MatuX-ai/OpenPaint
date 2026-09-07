/**
 * useEditorTool — activate + sync Pinia ↔ OpenPencil.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCanvasStore } from '@stores/canvasStore';

const setTool = vi.fn();

vi.mock('@composables/useOpenPencil', () => ({
  getOpenPencilBridge: () => ({
    editor: {
      setTool,
      state: { activeTool: 'SELECT' },
    },
    status: { value: 'ready' },
  }),
}));

import { activateTool, syncToolFromOpenPencil } from './useEditorTool';

describe('activateTool', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setTool.mockReset();
  });

  it('maps pen to OpenPencil PEN', () => {
    const r = activateTool('pen');
    expect(r.ok).toBe(true);
    expect(useCanvasStore().activeTool).toBe('pen');
    expect(setTool).toHaveBeenCalledWith('PEN');
  });

  it('keeps OpenPencil on SELECT for eraser / bucket', () => {
    expect(activateTool('eraser').ok).toBe(true);
    expect(useCanvasStore().activeTool).toBe('eraser');
    expect(setTool).toHaveBeenCalledWith('SELECT');

    setTool.mockClear();
    expect(activateTool('bucket').ok).toBe(true);
    expect(useCanvasStore().activeTool).toBe('bucket');
    expect(setTool).toHaveBeenCalledWith('SELECT');
  });

  it('rejects comingSoon tools', () => {
    const r = activateTool('gradient');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('comingSoon');
    expect(useCanvasStore().activeTool).not.toBe('gradient');
  });

  it('rejects pixel brush as comingSoon', () => {
    const r = activateTool('brush');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('comingSoon');
    expect(r.message).toMatch(/画笔/);
    expect(useCanvasStore().activeTool).not.toBe('brush');
  });
});

describe('syncToolFromOpenPencil', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setTool.mockReset();
  });

  it('ignores SELECT echo while raster tool is active', () => {
    const store = useCanvasStore();
    store.setActiveTool('eraser');
    syncToolFromOpenPencil('SELECT');
    expect(store.activeTool).toBe('eraser');
  });

  it('leaves raster when OpenPencil switches to another tool', () => {
    const store = useCanvasStore();
    store.setActiveTool('bucket');
    syncToolFromOpenPencil('PEN');
    expect(store.activeTool).toBe('pen');
  });

  it('syncs SELECT → select when not in raster mode', () => {
    const store = useCanvasStore();
    store.setActiveTool('pen');
    syncToolFromOpenPencil('SELECT');
    expect(store.activeTool).toBe('select');
  });
});
