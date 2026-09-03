/**
 * PalettePanel unit tests (W10-D2).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  loadPalettes: vi.fn(),
  loadGradients: vi.fn(),
  applyPalette: vi.fn(),
  applyGradient: vi.fn(),
  palettes: { value: [] as unknown[] },
  gradients: { value: [] as unknown[] },
  palettesLoading: { value: false },
  palettesError: { value: null as string | null },
  gradientsLoading: { value: false },
  gradientsError: { value: null as string | null },
}));

vi.mock('@/composables/useAssets', () => ({
  useAssets: () => ({
    loadPalettes: mocks.loadPalettes,
    loadGradients: mocks.loadGradients,
    applyPalette: mocks.applyPalette,
    applyGradient: mocks.applyGradient,
    palettes: mocks.palettes,
    gradients: mocks.gradients,
    palettesLoading: mocks.palettesLoading,
    palettesError: mocks.palettesError,
    gradientsLoading: mocks.gradientsLoading,
    gradientsError: mocks.gradientsError,
  }),
}));

import PalettePanel from '@/components/asset/PalettePanel.vue';

interface PaletteFixture {
  id: string;
  nameZh: string;
  nameEn: string;
  description: string;
  colors: Array<{ hex: string; nameZh: string; nameEn: string }>;
}

interface GradientFixture {
  id: string;
  type: 'linear' | 'radial' | 'conic';
  nameZh: string;
  nameEn: string;
  angle?: number;
  center?: [number, number];
  stops: Array<{ offset: number; hex: string }>;
}

function setPalettes(items: PaletteFixture[]): void {
  mocks.palettes.value = items;
  mocks.palettesLoading.value = false;
  mocks.palettesError.value = null;
}

function setGradients(items: GradientFixture[]): void {
  mocks.gradients.value = items;
  mocks.gradientsLoading.value = false;
  mocks.gradientsError.value = null;
}

const samplePalettes: PaletteFixture[] = [
  {
    id: 'material',
    nameZh: 'Material',
    nameEn: 'Material',
    description: 'd',
    colors: [
      { hex: '#ff0000', nameZh: '红', nameEn: 'Red' },
      { hex: '#00ff00', nameZh: '绿', nameEn: 'Green' },
    ],
  },
  {
    id: 'tailwind',
    nameZh: 'Tailwind',
    nameEn: 'Tailwind',
    description: 'd',
    colors: [{ hex: '#3b82f6', nameZh: '蓝', nameEn: 'Blue' }],
  },
  { id: 'pastel', nameZh: 'Pastel', nameEn: 'Pastel', description: 'd', colors: [] },
  { id: 'mono', nameZh: 'Mono', nameEn: 'Mono', description: 'd', colors: [] },
];

const sampleGradients: GradientFixture[] = Array.from({ length: 16 }, (_, k) => ({
  id: `g-${k}`,
  type: (k % 3 === 0 ? 'radial' : k % 3 === 1 ? 'linear' : 'conic') as GradientFixture['type'],
  nameZh: `渐变${k}`,
  nameEn: `Gradient ${k}`,
  angle: 180,
  center: [0.5, 0.5] as [number, number],
  stops: [
    { offset: 0, hex: '#000000' },
    { offset: 1, hex: '#ffffff' },
  ],
}));

describe('PalettePanel', () => {
  beforeEach(() => {
    mocks.loadPalettes.mockReset();
    mocks.loadGradients.mockReset();
    mocks.applyPalette.mockReset();
    mocks.applyGradient.mockReset();
    mocks.palettes.value = [];
    mocks.gradients.value = [];
    mocks.palettesLoading.value = false;
    mocks.palettesError.value = null;
    mocks.gradientsLoading.value = false;
    mocks.gradientsError.value = null;
  });

  it('PAL-101: renders 4 palettes with their swatch grids', async () => {
    setPalettes(samplePalettes);
    const w = mount(PalettePanel);
    await flushPromises();
    expect(w.findAll('.palette-panel__palette')).toHaveLength(4);
    // 2 + 1 + 0 + 0 = 3 swatches total
    expect(w.findAll('.palette-panel__swatch')).toHaveLength(3);
  });

  it('PAL-102: clicking a swatch emits palette-applied (replace_color)', async () => {
    setPalettes([samplePalettes[0]]);
    mocks.applyPalette.mockResolvedValue(undefined);
    const w = mount(PalettePanel);
    await flushPromises();
    const swatches = w.findAll('.palette-panel__swatch');
    await swatches[1].trigger('click');
    expect(mocks.applyPalette).toHaveBeenCalledWith('material', 'replace_color', {
      replaceHex: '#00ff00',
    });
    expect(w.emitted('palette-applied')).toBeTruthy();
    expect(w.emitted('palette-applied')![0]).toEqual([
      { paletteId: 'material', mode: 'replace_color' },
    ]);
  });

  it('PAL-103: apply swatch bar button emits palette-applied (swatch_bar)', async () => {
    setPalettes([samplePalettes[0]]);
    mocks.applyPalette.mockResolvedValue(undefined);
    const w = mount(PalettePanel);
    await flushPromises();
    await w.find('.palette-panel__apply').trigger('click');
    expect(mocks.applyPalette).toHaveBeenCalledWith('material', 'swatch_bar');
    expect(w.emitted('palette-applied')).toBeTruthy();
    expect(w.emitted('palette-applied')![0]).toEqual([
      { paletteId: 'material', mode: 'swatch_bar' },
    ]);
  });

  it('PAL-104: switching to gradient tab renders 16 thumbnails', async () => {
    setGradients(sampleGradients);
    const w = mount(PalettePanel);
    await flushPromises();
    const chips = w.findAll('.palette-panel__chip');
    await chips[1].trigger('click');
    await flushPromises();
    expect(w.findAll('.palette-panel__gradient')).toHaveLength(16);
  });

  it('PAL-105: clicking a gradient emits gradient-applied', async () => {
    setGradients([sampleGradients[0]]);
    mocks.applyGradient.mockResolvedValue(undefined);
    const w = mount(PalettePanel);
    await flushPromises();
    const chips = w.findAll('.palette-panel__chip');
    await chips[1].trigger('click');
    await flushPromises();
    await w.find('.palette-panel__gradient').trigger('click');
    expect(mocks.applyGradient).toHaveBeenCalledWith('g-0', { opacity: 1.0 });
    expect(w.emitted('gradient-applied')).toBeTruthy();
    expect(w.emitted('gradient-applied')![0]).toEqual([{ gradientId: 'g-0' }]);
  });
});
