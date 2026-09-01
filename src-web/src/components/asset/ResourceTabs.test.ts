/**
 * ResourceTabs unit tests (W10-D3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('@/components/asset/IconPanel.vue', () => ({
  default: {
    name: 'IconPanelStub',
    emits: ['icon-imported', 'error'],
    template: '<div class="icon-stub" />',
  },
}));
vi.mock('@/components/asset/BrushPanel.vue', () => ({
  default: {
    name: 'BrushPanelStub',
    emits: ['brush-changed', 'error'],
    template: '<div class="brush-stub" />',
  },
}));
vi.mock('@/components/asset/PalettePanel.vue', () => ({
  default: {
    name: 'PalettePanelStub',
    emits: ['palette-applied', 'gradient-applied', 'error'],
    template: '<div class="palette-stub" />',
  },
}));

import ResourceTabs from '@/components/asset/ResourceTabs.vue';

describe('ResourceTabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('RES-101: default tab is icons', () => {
    const w = mount(ResourceTabs);
    const chips = w.findAll('.resource-tabs__chip');
    expect(chips).toHaveLength(3);
    expect(chips[0].classes()).toContain('is-active');
    expect(w.find('.icon-stub').exists()).toBe(true);
  });

  it('RES-102: clicking chip switches pane', async () => {
    const w = mount(ResourceTabs);
    const chips = w.findAll('.resource-tabs__chip');
    await chips[1].trigger('click');
    await nextTick();
    expect(chips[1].classes()).toContain('is-active');
    expect(w.find('.brush-stub').exists()).toBe(true);
    await chips[2].trigger('click');
    await nextTick();
    expect(w.find('.palette-stub').exists()).toBe(true);
  });

  it('RES-103: current tab persists to localStorage', async () => {
    const w = mount(ResourceTabs);
    const chips = w.findAll('.resource-tabs__chip');
    await chips[2].trigger('click');
    expect(window.localStorage.getItem('openpaint:resource-tab-mode')).toBe('palette');
  });

  it('RES-104: restores tab from localStorage on mount', () => {
    window.localStorage.setItem('openpaint:resource-tab-mode', 'brushes');
    const w = mount(ResourceTabs);
    const chips = w.findAll('.resource-tabs__chip');
    expect(chips[1].classes()).toContain('is-active');
  });

  it('RES-105: child events bubble up', async () => {
    const w = mount(ResourceTabs);
    const stubIcon = w.findComponent({ name: 'IconPanelStub' });
    await stubIcon.vm.$emit('icon-imported', { icon: 'x', layerId: 'L1' });
    await stubIcon.vm.$emit('error', 'bad');
    const chips = w.findAll('.resource-tabs__chip');
    await chips[1].trigger('click');
    await nextTick();
    await w.findComponent({ name: 'BrushPanelStub' }).vm.$emit('brush-changed', 'round-hard');
    await chips[2].trigger('click');
    await nextTick();
    await w
      .findComponent({ name: 'PalettePanelStub' })
      .vm.$emit('palette-applied', { paletteId: 'material', mode: 'swatch_bar' });
    await w
      .findComponent({ name: 'PalettePanelStub' })
      .vm.$emit('gradient-applied', { gradientId: 'sunset' });
    expect(w.emitted('icon-imported')).toBeTruthy();
    expect(w.emitted('error')).toBeTruthy();
    expect(w.emitted('brush-changed')).toBeTruthy();
    expect(w.emitted('palette-applied')).toBeTruthy();
    expect(w.emitted('gradient-applied')).toBeTruthy();
  });
});