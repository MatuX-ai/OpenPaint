/**
 * ExportDialog 组件测试 — 覆盖 ONB-303 / ONB-406。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ExportDialog from './ExportDialog.vue';
import { setupComponentTest } from '@/test/setup';

setupComponentTest();

describe('ExportDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows three format buttons', async () => {
    mount(ExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const buttons = document.body.querySelectorAll('.export-dialog__format');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent?.trim()).toBe('PNG');
    expect(buttons[1].textContent?.trim()).toBe('JPG');
    expect(buttons[2].textContent?.trim()).toBe('WEBP');
  });

  it('PNG default hides quality slider', async () => {
    mount(ExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('input[type="range"]')).toBeNull();
  });

  it('switching to JPG reveals quality slider at 90', async () => {
    mount(ExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    (document.body.querySelectorAll('.export-dialog__format')[1] as HTMLElement).click();
    await nextTick();
    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.value).toBe('90');
  });

  it('confirm emits { format, quality }', async () => {
    const w = mount(ExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    (document.body.querySelectorAll('.export-dialog__format')[2] as HTMLElement).click();
    await nextTick();
    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '75';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    (document.body.querySelectorAll('.app-btn--primary')[0] as HTMLElement).click();
    await nextTick();
    const payload = w.emitted('confirm')?.[0]?.[0] as { format: string; quality: number };
    expect(payload.format).toBe('webp');
    expect(payload.quality).toBe(75);
  });

  it('reopens resets format=PNG + quality=90', async () => {
    const w = mount(ExportDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();
    (document.body.querySelectorAll('.export-dialog__format')[1] as HTMLElement).click();
    await nextTick();
    await w.setProps({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    expect(document.body.querySelector('input[type="range"]')).toBeNull();
    expect(
      document.body.querySelectorAll('.export-dialog__format')[0].classList.contains('is-active'),
    ).toBe(true);
  });
});
