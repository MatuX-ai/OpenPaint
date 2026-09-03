/**
 * BatchExportDialog 组件测试 — 覆盖 ONB-308。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BatchExportDialog from './BatchExportDialog.vue';
import { setupComponentTest, bodyText } from '@/test/setup';

setupComponentTest();

describe('BatchExportDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders 4 preset chips and custom toggle', async () => {
    mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const t = bodyText();
    expect(t).toContain('iOS 图标');
    expect(t).toContain('Android 图标');
    expect(t).toContain('Web 图标');
    expect(t).toContain('Favicon');
    expect(t).toContain('自定义尺寸');
  });

  it('iOS preset pre-selects 7 sizes', async () => {
    mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const sizes = document.body.querySelectorAll('.batch-export__size.is-active');
    expect(sizes.length).toBe(7);
  });

  it('clicking a size toggles selection', async () => {
    mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const sizeButtons = document.body.querySelectorAll('.batch-export__size');
    const before = document.body.querySelectorAll('.batch-export__size.is-active').length;
    (sizeButtons[0] as HTMLElement).click();
    await nextTick();
    const after = document.body.querySelectorAll('.batch-export__size.is-active').length;
    expect(after).toBe(before - 1);
  });

  it('disabled primary button when no sizes selected', async () => {
    mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const sizes = document.body.querySelectorAll('.batch-export__size');
    for (const s of Array.from(sizes)) {
      (s as HTMLElement).click();
      await nextTick();
    }
    const primary = document.body.querySelectorAll('.app-btn--primary')[0] as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
  });

  it('confirm button emits { sizes, saveToGallery, tags }', async () => {
    const w = mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    (document.body.querySelectorAll('.app-btn--primary')[0] as HTMLElement).click();
    await nextTick();
    const payload = w.emitted('confirm')?.[0]?.[0] as {
      sizes: number[];
      saveToGallery: boolean;
      tags: string[];
    };
    expect(payload.sizes).toEqual([20, 29, 40, 60, 76, 83.5, 1024]);
    expect(payload.saveToGallery).toBe(true);
    expect(payload.tags).toEqual([]);
  });

  it('tags input is parsed into array', async () => {
    const w = mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const input = document.body.querySelector('.batch-export__tags-input') as HTMLInputElement;
    input.value = 'ios, v2.0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    (document.body.querySelectorAll('.app-btn--primary')[0] as HTMLElement).click();
    await nextTick();
    const payload = w.emitted('confirm')?.[0]?.[0] as { tags: string[] };
    expect(payload.tags).toEqual(['ios', 'v2.0']);
  });

  it('saveToGallery toggle hides tags input when unchecked', async () => {
    mount(BatchExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('.batch-export__tags')).toBeTruthy();
    const checkbox = document.body.querySelector(
      '.batch-export__check input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('.batch-export__tags')).toBeNull();
  });
});
