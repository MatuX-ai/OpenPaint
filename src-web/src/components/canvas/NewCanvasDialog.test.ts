/**
 * NewCanvasDialog 组件测试 — 覆盖 US-2 / ONB-201 ~ ONB-202。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NewCanvasDialog from './NewCanvasDialog.vue';
import { setupComponentTest, bodyText } from '@/test/setup';

setupComponentTest();

function makeWrapper(open = true) {
  return mount(NewCanvasDialog, {
    props: { open },
    attachTo: document.body,
  });
}

describe('NewCanvasDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders 4 presets + custom toggle', () => {
    makeWrapper();
    const t = bodyText();
    expect(t).toContain('新建画布');
    expect(t).toContain('1080×1080');
    expect(t).toContain('1920×1080');
    expect(t).toContain('A4');
    expect(t).toContain('iOS App Icon');
    expect(t).toContain('自定义尺寸');
  });

  it('default selection emits 1080×1080 px', async () => {
    const w = makeWrapper();
    await nextTick();
    const primary = document.body.querySelectorAll('.app-btn--primary')[0] as HTMLElement;
    primary.click();
    await nextTick();
    const confirm = w.emitted('confirm')?.[0]?.[0] as Record<string, unknown>;
    expect(confirm).toBeTruthy();
    expect(confirm.width).toBe(1080);
    expect(confirm.height).toBe(1080);
    expect(confirm.unit).toBe('px');
  });

  it('selecting a different preset updates the preview', async () => {
    makeWrapper();
    await nextTick();
    const presets = document.body.querySelectorAll('.new-canvas__preset');
    expect(presets.length).toBeGreaterThanOrEqual(4);
    (presets[3] as HTMLElement).click();
    await nextTick();
    expect(bodyText()).toContain('1024 × 1024 px');
  });

  it('toggling custom mode reveals custom fields', async () => {
    makeWrapper();
    await nextTick();
    expect(document.body.querySelector('.new-canvas__custom')).toBeNull();
    const toggle = document.body.querySelector('.new-canvas__custom-toggle') as HTMLElement;
    toggle.click();
    await nextTick();
    expect(document.body.querySelector('.new-canvas__custom')).toBeTruthy();
  });

  it('cancel button emits update:open=false', async () => {
    const w = makeWrapper();
    await nextTick();
    const ghost = document.body.querySelectorAll('.app-btn--ghost')[0] as HTMLElement;
    ghost.click();
    await nextTick();
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
  });

  it('update:open false closes the modal', async () => {
    const w = makeWrapper(true);
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    await w.setProps({ open: false });
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    w.unmount();
  });
});
