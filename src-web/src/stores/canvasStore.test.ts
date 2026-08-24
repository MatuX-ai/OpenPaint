/**
 * canvasStore 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCanvasStore } from '@/stores/canvasStore';
import type { Layer } from '@/types/canvas';

describe('canvasStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const store = useCanvasStore();

      expect(store.activeTool).toBe('select');
      expect(store.zoom).toBe(1.0);
      expect(store.panX).toBe(0);
      expect(store.panY).toBe(0);
      expect(store.brushColor).toBe('#6c5ce7');
      expect(store.brushRadius).toBe(8);
      expect(store.layerList).toEqual([]);
      expect(store.activeLayerId).toBeNull();
      expect(store.canvasWidth).toBe(1920);
      expect(store.canvasHeight).toBe(1080);
      expect(store.selection).toBeNull();
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });
  });

  describe('setActiveTool', () => {
    it('should change active tool', () => {
      const store = useCanvasStore();

      store.setActiveTool('brush');
      expect(store.activeTool).toBe('brush');

      store.setActiveTool('eraser');
      expect(store.activeTool).toBe('eraser');

      store.setActiveTool('select');
      expect(store.activeTool).toBe('select');
    });

    it('should accept all valid tool types', () => {
      const store = useCanvasStore();
      const tools: Array<'select' | 'brush' | 'eraser' | 'move' | 'transform' | 'rect-select'> = [
        'select',
        'brush',
        'eraser',
        'move',
        'transform',
        'rect-select',
      ];

      tools.forEach((tool) => {
        store.setActiveTool(tool);
        expect(store.activeTool).toBe(tool);
      });
    });
  });

  describe('setZoom', () => {
    it('should set zoom within valid range', () => {
      const store = useCanvasStore();

      store.setZoom(2.0);
      expect(store.zoom).toBe(2.0);

      store.setZoom(0.5);
      expect(store.zoom).toBe(0.5);
    });

    it('should clamp zoom to minimum 0.1', () => {
      const store = useCanvasStore();

      store.setZoom(0.01);
      expect(store.zoom).toBe(0.1);

      store.setZoom(-1);
      expect(store.zoom).toBe(0.1);
    });

    it('should clamp zoom to maximum 10.0', () => {
      const store = useCanvasStore();

      store.setZoom(15);
      expect(store.zoom).toBe(10.0);

      store.setZoom(100);
      expect(store.zoom).toBe(10.0);
    });
  });

  describe('resetView', () => {
    it('should reset zoom and pan to defaults', () => {
      const store = useCanvasStore();

      // Change values first
      store.setZoom(3.0);
      store.panX = 100;
      store.panY = 200;

      store.resetView();

      expect(store.zoom).toBe(1.0);
      expect(store.panX).toBe(0);
      expect(store.panY).toBe(0);
    });
  });

  describe('setBrushColor', () => {
    it('should update brush color', () => {
      const store = useCanvasStore();

      store.setBrushColor('#ff0000');
      expect(store.brushColor).toBe('#ff0000');

      store.setBrushColor('rgb(0, 255, 0)');
      expect(store.brushColor).toBe('rgb(0, 255, 0)');
    });
  });

  describe('setBrushRadius', () => {
    it('should set brush radius within valid range', () => {
      const store = useCanvasStore();

      store.setBrushRadius(10);
      expect(store.brushRadius).toBe(10);

      store.setBrushRadius(50);
      expect(store.brushRadius).toBe(50);
    });

    it('should clamp brush radius to minimum 1', () => {
      const store = useCanvasStore();

      store.setBrushRadius(0);
      expect(store.brushRadius).toBe(1);

      store.setBrushRadius(-5);
      expect(store.brushRadius).toBe(1);
    });

    it('should clamp brush radius to maximum 200', () => {
      const store = useCanvasStore();

      store.setBrushRadius(250);
      expect(store.brushRadius).toBe(200);

      store.setBrushRadius(1000);
      expect(store.brushRadius).toBe(200);
    });
  });

  describe('activeLayer computed', () => {
    it('should return null when no layers exist', () => {
      const store = useCanvasStore();
      expect(store.activeLayer).toBeNull();
    });

    it('should return null when activeLayerId does not match any layer', () => {
      const store = useCanvasStore();
      store.activeLayerId = 'non-existent-id';
      expect(store.activeLayer).toBeNull();
    });

    it('should return the matching layer', () => {
      const store = useCanvasStore();
      const mockLayer: Layer = {
        id: 'layer-1',
        name: 'Test Layer',
        opacity: 1.0,
        blendMode: 'normal',
        visible: true,
        locked: false,
        width: 100,
        height: 100,
        offsetX: 0,
        offsetY: 0,
      };

      store.layerList = [mockLayer];
      store.activeLayerId = 'layer-1';

      expect(store.activeLayer).toEqual(mockLayer);
    });

    it('should update when activeLayerId changes', () => {
      const store = useCanvasStore();
      const layer1: Layer = {
        id: 'layer-1',
        name: 'Layer 1',
        opacity: 1.0,
        blendMode: 'normal',
        visible: true,
        locked: false,
        width: 100,
        height: 100,
        offsetX: 0,
        offsetY: 0,
      };
      const layer2: Layer = {
        id: 'layer-2',
        name: 'Layer 2',
        opacity: 0.8,
        blendMode: 'multiply',
        visible: true,
        locked: false,
        width: 200,
        height: 200,
        offsetX: 10,
        offsetY: 10,
      };

      store.layerList = [layer1, layer2];

      store.activeLayerId = 'layer-1';
      expect(store.activeLayer?.name).toBe('Layer 1');

      store.activeLayerId = 'layer-2';
      expect(store.activeLayer?.name).toBe('Layer 2');
    });
  });

  describe('layer list management', () => {
    it('should allow setting layer list', () => {
      const store = useCanvasStore();
      const layers: Layer[] = [
        {
          id: 'l1',
          name: 'Background',
          opacity: 1.0,
          blendMode: 'normal',
          visible: true,
          locked: false,
          width: 1920,
          height: 1080,
          offsetX: 0,
          offsetY: 0,
        },
        {
          id: 'l2',
          name: 'Foreground',
          opacity: 0.9,
          blendMode: 'overlay',
          visible: true,
          locked: false,
          width: 1920,
          height: 1080,
          offsetX: 0,
          offsetY: 0,
        },
      ];

      store.layerList = layers;
      expect(store.layerList).toHaveLength(2);
      expect(store.layerList[0].name).toBe('Background');
      expect(store.layerList[1].name).toBe('Foreground');
    });
  });

  describe('selection state', () => {
    it('should allow setting selection', () => {
      const store = useCanvasStore();

      store.selection = { x: 10, y: 20, width: 100, height: 50 };
      expect(store.selection).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it('should allow clearing selection', () => {
      const store = useCanvasStore();

      store.selection = { x: 10, y: 20, width: 100, height: 50 };
      store.selection = null;
      expect(store.selection).toBeNull();
    });
  });

  describe('history state', () => {
    it('should allow setting undo/redo flags', () => {
      const store = useCanvasStore();

      store.canUndo = true;
      store.canRedo = true;

      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(true);
    });
  });
});
